# spotify-ad-skip

A browser extension (Chrome / Edge, Manifest V3) that removes audio ads on the Spotify Web Player.

This is a fork of [tomer8007/spotify-web-ads-remover](https://github.com/tomer8007/spotify-web-ads-remover) by Tomer, with fixes for the player getting stuck after a long pause.

## Install

1. Download or clone this repository.
2. Open `edge://extensions` (or `chrome://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and select the repository folder.
4. Refresh any open Spotify Web Player tab.

To update after pulling new changes, click **Reload** on the extension card and refresh the Spotify tab.

## How ads are removed

Ads are removed by intercepting and then tampering with Spotify's state machine requests/updates on the fly.

The states are modified so that states that represent ads are skipped over (pointing to the state afterwards). This is done in `injected/ads_removal.js`.

## Changes from the original

- **Fixed an infinite loop** when an ad could only be replaced by another ad. It blocked the processing queue, so nothing could be played until the page was refreshed.
- **Added a 10s timeout to the processing queue**, so one stuck request can no longer block every later request and WebSocket message.
- **Fixed the access token refresh.** The extension consumed the response body that Spotify itself needed.
- **Error responses from `/state` are passed through untouched**, so Spotify can recover on its own.
- **The fetch hook never throws.** On an internal error the request is passed through unchanged.
- **The WebSocket hook keeps `WebSocket.OPEN`/`CLOSED`/… and `instanceof` working**, and supports reading `onmessage`.
- **Added debug logging** (`SpotiAds[ws]`, `SpotiAds[fetch]` in the console) for diagnosing playback that stops working after a long pause.

## Privacy

No data is ever transmitted anywhere. No backend, no analytics, no server.

## License

GNU General Public License v3.0, the same as the original project. See [LICENSE](LICENSE).
