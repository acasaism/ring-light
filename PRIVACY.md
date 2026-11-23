# Privacy policy

**Ring Light for Google Meet collects no personal data.** It sends nothing to the developer or to anyone else, makes no network requests and contains no analytics or tracking.

## What the extension stores

Everything is kept in your browser's extension storage, on your own device:

| Data | Why |
|------|-----|
| Your settings (light on/off, turn on with the camera, temperature, intensity, frame, thickness, Meet background) | To keep them between sessions |
| Your saved default settings, if you save them | So **Reset** can return to them |
| Internal IDs of the light windows the extension opened | So the panel can count and close them |

Removing the extension deletes all of it.

## The camera

If you turn on **Turn on with the camera**, the extension checks on the Meet page whether the call's camera is on, so it can switch the light on and off with it. It only looks at whether a camera track is live; it never sees the image or hears the sound, and stores nothing about it. This check runs on every Meet page, but it does nothing unless the option is on. No data leaves your browser.

## Permissions

| Permission | Why it is needed |
|------------|------------------|
| `storage` | To save the settings listed above |
| Access to `https://meet.google.com/*` | To draw the light frame around the call and, if you turn on **Turn on with the camera**, to know whether the camera is on. The extension does not read your meetings, chats or participants |

## Contact

Questions about privacy: open an issue at <https://github.com/acasaism/ring-light/issues>.

Last updated: 24 November 2026.
