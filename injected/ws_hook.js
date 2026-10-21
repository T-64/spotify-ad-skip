// wsHook - WebSocket Interception
	// based on https://github.com/skepticfx/wshook

	var wsHook = {};

	(function() 
	{
		var before = wsHook.before = function(data, url) 
		{
			return new Promise(function(resolve, reject)
    		{
				resolve(data);
			});
		};
		var after = wsHook.after = function(e, url) 
		{
			return e;
		};
		wsHook.resetHooks = function() 
		{
			wsHook.before = before;
			wsHook.after = after;
		}

		var _WS = WebSocket;
		WebSocket = function(url, protocols) 
		{
			var WSObject;
			this.url = url;
			this.protocols = protocols;
			if (!this.protocols)
			WSObject = new _WS(url);
			else
			WSObject = new _WS(url, protocols);

			var _send = WSObject.send;
			var _wsobject = this;
			wsHook._send = WSObject.send = function(data) 
			{
				//data = wsHook.before(data, WSObject.url) || data;
				new wsHook.before(data, WSObject.url).then(function (newData)
				{
					if (newData != null)
						_send.apply(WSObject, [newData]);
					
				}).catch(function(e)
				{
					console.error(e);
					_send.apply(WSObject, [data]);
				});
			}

			// Events needs to be proxied and bubbled down.
			var onmessageFunction;
			Object.defineProperty(WSObject, 'onmessage', {
				configurable: true,
				get: function() { return onmessageFunction || null; },
				set: function(func) { onmessageFunction = wsHook.onMessage = func; }
			});
			// Debug logging for the "can't start a new song after a long pause" bug.
			console.log("SpotiAds[ws]: opening " + String(url).split("?")[0] + " at " + new Date().toLocaleTimeString());
			WSObject.addEventListener('open', function()
			{
				console.log("SpotiAds[ws]: open at " + new Date().toLocaleTimeString());
			});
			WSObject.addEventListener('close', function(event)
			{
				console.warn("SpotiAds[ws]: closed at " + new Date().toLocaleTimeString() + ", code " + event.code + ", reason '" + event.reason + "'");
			});
			WSObject.addEventListener('error', function()
			{
				console.warn("SpotiAds[ws]: error at " + new Date().toLocaleTimeString());
			});

			WSObject.addEventListener('message', function(event)
			{
				if (!onmessageFunction)
				{
					console.log("warning: no onmessageFunction");
					return;
				}

				var receivedAt = Date.now();
				wsHook.after(new MutableMessageEvent(event), this.url).then(function(modifiedEvent)
				{
					var delay = Date.now() - receivedAt;
					if (delay > 1000)
						console.warn("SpotiAds[ws]: message was held for " + delay + "ms before reaching Spotify");

					if (modifiedEvent != null)
						onmessageFunction.apply(this, [modifiedEvent]);
					
				}).catch(function(e)
				{
					console.error(e);
					onmessageFunction.apply(this, [event]);
				});
				
				//e = new MessageEvent(e.type, e);
			});

			return WSObject;
		}

		// Keep WebSocket.OPEN/CLOSED/... and instanceof working for Spotify's reconnect logic.
		Object.setPrototypeOf(WebSocket, _WS);
		WebSocket.prototype = _WS.prototype;
	})();

	// Mutable MessageEvent.
	// Subclasses MessageEvent and makes data, origin and other MessageEvent properites mutatble.
	function MutableMessageEvent(o) 
	{
		this.bubbles = o.bubbles || false;
		this.cancelBubble = o.cancelBubble || false;
		this.cancelable = o.cancelable || false;
		this.currentTarget = o.currentTarget || null;
		this.data = o.data || null;
		this.defaultPrevented = o.defaultPrevented || false;
		this.eventPhase = o.eventPhase || 0;
		this.lastEventId = o.lastEventId || "";
		this.origin = o.origin || "";
		this.path = o.path || new Array(0);
		this.ports = o.parts || new Array(0);
		this.returnValue = o.returnValue || true;
		this.source = o.source || null;
		this.srcElement = o.srcElement || null;
		this.target = o.target || null;
		this.timeStamp = o.timeStamp || null;
		this.type = o.type || "message";
		this.__proto__ = o.__proto__ || MessageEvent.__proto__;
	}