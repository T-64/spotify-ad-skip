const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'injected/ads_removal.js'), 'utf8');
const hooks = source.slice(source.indexOf('window.fetch ='), source.indexOf('async function manipulateStateMachine('));
const fixture = () => ({
    state_machine: {states: [{state_id: 'song-1', track: 0}], tracks: [{metadata: {uri: 'spotify:track:1'}}]},
    updated_state_ref: {state_index: 0}
});

function harness({transform = async machine => ({...machine, transformed: true}), timeout = 100} = {}) {
    const warnings = [];
    const context = vm.createContext({
        Response, Headers, structuredClone, setTimeout, clearTimeout,
        console: {log() {}, error() {}, warn: message => warnings.push(message)},
        window: {}, wsHook: {}, isFetchInterceptionWorking: false,
        authorizationHeader: '', clientToken: '',
        manipulateStateMachine: transform, describeStateRef: () => '',
        originalFetch: async () => new Response(JSON.stringify(fixture()))
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'injected/utils.js'), 'utf8'), context);
    vm.runInContext(`var statesManipuationQueue = new PromiseQueue(${timeout});`, context);
    vm.runInContext(hooks, context);
    return {context, warnings};
}

for (const reader of ['json', 'text', 'arrayBuffer', 'clone', 'stream']) {
    test(`state transformation reaches the player through ${reader}`, async () => {
        const {context} = harness();
        const original = new Response(JSON.stringify(fixture()), {status: 200, headers: {'x-test': 'kept'}});
        Object.defineProperty(original, 'url', {value: 'https://example.test/state'});
        const result = await context.onStatesFetchResponseReceived('/state', {body: '{}'}, original);
        assert.equal(original.bodyUsed, false);
        assert.equal(result.bodyUsed, false);
        assert.equal(result.url, original.url);
        assert.equal(result.headers.get('x-test'), 'kept');
        let data;
        if (reader === 'json') data = await result.json();
        if (reader === 'text') data = JSON.parse(await result.text());
        if (reader === 'arrayBuffer') data = JSON.parse(new TextDecoder().decode(await result.arrayBuffer()));
        if (reader === 'clone') {
            data = await result.clone().json();
            assert.equal(result.bodyUsed, false);
            assert.deepEqual(await result.json(), data);
        }
        if (reader === 'stream') data = await new Response(result.body).json();
        assert.equal(data.state_machine.transformed, true);
        assert.equal(context.isFetchInterceptionWorking, true);
    });
}

test('fetch completes without waiting for its own queue timeout', async () => {
    const {context, warnings} = harness({timeout: 20});
    const result = await context.window.fetch('https://example.test/state', {
        headers: {}, body: JSON.stringify({state_ref: {state_id: 'song-1'}})
    });
    assert.equal((await result.json()).state_machine.transformed, true);
    assert.deepEqual(warnings, []);
});

test('an outer AdBlock-style fetch hook can clone, read and rebuild the response', async () => {
    const {context} = harness();
    const response = await context.window.fetch('https://example.test/state', {
        headers: {}, body: JSON.stringify({state_ref: {state_id: 'song-1'}})
    });
    const rebuilt = new Response(await response.clone().text(), {status: response.status, headers: response.headers});
    assert.equal((await rebuilt.json()).state_machine.transformed, true);
    assert.equal(response.bodyUsed, false);
});

test('the real ad-removal algorithm survives a response clone and reconstruction', async () => {
    const {context} = harness();
    Object.assign(context, {currentTracks: [], tamperedStatesMap: {}, onAdRemoved() {}});
    vm.runInContext(source.slice(source.indexOf('async function manipulateStateMachine('), source.indexOf('function onMainUIReady(')), context);
    const song = (id, track, next) => ({state_id: id, track, transitions: {advance: next == null ? null : {state_index: next}}, disallow_seeking: false});
    const data = {
        state_machine: {
            state_machine_id: 'machine-1',
            states: [song('filler-0', 0, null), song('filler-1', 0, null), song('song-1', 0, 3), song('ad-1', 1, 4), song('song-2', 2, null)],
            tracks: [
                {metadata: {uri: 'spotify:track:1', name: 'First'}, content_type: 'TRACK'},
                {metadata: {uri: 'spotify:ad:1', name: 'Ad'}, content_type: 'AD'},
                {metadata: {uri: 'spotify:track:2', name: 'Next'}, content_type: 'TRACK'}
            ]
        }, updated_state_ref: {state_index: 2}
    };
    const response = await context.onStatesFetchResponseReceived('/state', {body: '{}'}, new Response(JSON.stringify(data)));
    const parsed = await new Response(await response.clone().text()).json();
    assert.equal(parsed.state_machine.states[3].state_id, 'song-2');
    assert.equal(parsed.state_machine.tracks[parsed.state_machine.states[3].track].metadata.name, 'Next');
    assert.equal(parsed.state_machine.tracks[1], null);
});

test('error and empty responses pass through unchanged', async () => {
    const {context} = harness();
    for (const status of [204, 401, 429, 500]) {
        const response = new Response(status === 204 ? null : 'retry later', {status});
        assert.equal(await context.onStatesFetchResponseReceived('/state', {body: '{}'}, response), response);
        assert.equal(response.bodyUsed, false);
    }
});

test('invalid JSON and manipulation failure leave the original body readable', async () => {
    const {context} = harness({transform: async machine => {
        machine.states.length = 0;
        throw new Error('bad state');
    }});
    for (const body of ['not json', JSON.stringify(fixture())]) {
        const response = new Response(body);
        const result = await context.onStatesFetchResponseReceived('/state', {body: '{}'}, response);
        assert.equal(result, response);
        assert.equal(await result.text(), body);
    }
});

test('timeout fallback cannot be mutated by late transformation work', async () => {
    const {context} = harness({timeout: 10, transform: async machine => {
        machine.states.length = 0;
        await new Promise(resolve => setTimeout(resolve, 30));
        return machine;
    }});
    const result = await context.onStatesFetchResponseReceived('/state', {body: '{}'}, new Response(JSON.stringify(fixture())));
    assert.deepEqual(await result.json(), fixture());
});

test('state conflict commands without state machines remain intact', async () => {
    const {context} = harness();
    const data = {commands: {noop: {type: 'noop'}, replace: {state_machine: fixture().state_machine, state_ref: {state_index: 0}}}};
    const result = await context.onStatesFetchResponseReceived('/state_conflict', {body: '{}'}, new Response(JSON.stringify(data)));
    const parsed = await result.json();
    assert.deepEqual(parsed.commands.noop, {type: 'noop'});
    assert.equal(parsed.commands.replace.state_machine.transformed, true);
});
