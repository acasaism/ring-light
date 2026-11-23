# Contributing

Thanks for helping. Bug reports, ideas and pull requests are all welcome.

## Quick path

1. Fork the repository and create a branch from `master`.
2. Make your change, with a test (see [Tests](#tests)).
3. Run `node test.js`. It must print `all tests passed`.
4. Try it in Firefox and in a Chromium browser (see [Load the extension](#load-the-extension)).
5. Open a pull request describing what changed and how you checked it.

## Requirements

- [Node.js](https://nodejs.org/) 18 or later, only to run the tests. The extension itself has no build step and no dependencies.
- Firefox 128+ and a Chromium browser (Chrome, Edge, Opera or Brave) 121+.

## Load the extension

- **Firefox:** `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick `manifest.json`. Click **Reload** after each change.
- **Chromium:** `chrome://extensions` → **Developer mode** → **Load unpacked** → pick the repository folder. Click the reload arrow after each change, then reload the Meet tab.

To test without other people, open `https://meet.google.com/new` to start a meeting of your own.

## Project layout

| File | Role |
|------|------|
| `manifest.json` | One manifest for both browsers: `background.scripts` for Firefox, `background.service_worker` for Chromium |
| `light.js` | Shared helpers and defaults, loaded first everywhere. Aliases `chrome` to `browser` on Chromium |
| `content.js` | Runs on Meet: draws the frame and lights Meet's background |
| `background.js` | Keyboard shortcut and per-tab toolbar icon |
| `popup.html`, `popup.js` | The settings panel |
| `light.html`, `light-window.js` | The movable light window |
| `_locales/` | Translations (English and Spanish) |
| `test.js` | All tests, using fake browser and DOM objects |
| `scripts/build.sh` | Builds the store zip into `dist/` |

## Tests

Write the test first and watch it fail, then make it pass. Tests run against fake `browser` and DOM objects, so no browser is needed: `node test.js`.

A test should check what the user sees or what gets saved, through the same entry points the browser uses (events, storage changes, messages).

## Guidelines

- **Both browsers.** Use the `browser` namespace; `light.js` maps it to `chrome` on Chromium. Avoid APIs only one browser supports, or guard them.
- **Translations.** Every visible text lives in `_locales/en` and `_locales/es`, with the same keys. The tests check this.
- **Accessibility.** Keep text contrast at 4.5:1 or more and control outlines at 3:1, give every control a label, and keep everything usable with the keyboard.
- **Commits.** Use [Conventional Commits](https://www.conventionalcommits.org/), for example `feat(popup): add a preset` or `fix: keep the frame after leaving full screen`.
- **Scope.** One change per pull request. Discuss large features in an issue first.

## Reporting bugs

Open an issue with your browser and its version, your operating system, what you expected and what happened. A screenshot helps.
