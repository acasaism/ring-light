# Privacy policy

**Ring Light for Google Meet collects no personal data.** It sends nothing to the developer or to anyone else, makes no network requests and contains no analytics or tracking.

## What the extension stores

Everything is kept in your browser's extension storage, on your own device:

| Data | Why |
|------|-----|
| Your settings (light on/off, turn on with the camera, temperature, intensity, frame, thickness, Meet background) | To keep them between sessions |
| Your saved default settings, if you save them | So **Reset** can return to them |
| Whether a camera is on in a Meet call | So the light goes off when the last camera stops, and closing an unrelated tab does not turn it off |
| Internal IDs of the light windows the extension opened | So the panel can count and close them |

Removing the extension deletes all of it.

## The camera

On the pages of the video call apps listed under [Permissions](#permissions), a small script notes whether the call's camera is on. It only looks at whether a camera track is live; it never sees the image or hears the sound. On Microsoft Teams, whose address does not change during a call, it also notes whether a microphone track is live, to know that a call is going on; again only yes or no, never the sound. It passes that yes or no to the rest of the extension as a message inside the page, which the page's own scripts can also see (but not another site that embeds the call). The extension only acts on it when **Turn on with the camera** is on, and then stores only whether a camera is on. No data leaves your browser.

## Permissions

| Permission | Why it is needed |
|------------|------------------|
| `storage` | To save the settings listed above |
| Access to `https://meet.google.com/*` | To draw the light frame around the call and, if you turn on **Turn on with the camera**, to know whether the camera is on. The extension does not read your meetings, chats or participants |
| Access to `https://meet.jit.si/*` | The same on Jitsi Meet |
| Access to `https://app.zoom.us/*` and `https://zoom.us/*` | The same in the Zoom web client. Zoom serves its web client at both addresses |
| Access to `https://teams.microsoft.com/*`, `https://teams.cloud.microsoft/*` and `https://teams.live.com/*` | The same in Microsoft Teams on the web (experimental): work or school accounts (Microsoft is moving them from the first address to the second) and personal accounts |

## Contact

Questions about privacy: open an issue at <https://github.com/acasaism/ring-light/issues>.

Last updated: 24 November 2026.
