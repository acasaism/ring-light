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
- **Chromium:** `chrome://extensions` → **Developer mode** → **Load unpacked** → pick the repository folder. Click the reload arrow after each change, then reload the call tab.

To test without other people, open `https://meet.google.com/new` to start a meeting of your own, or any `https://meet.jit.si/SomeRoomName` (the screen before joining is enough).

## Project layout

| File | Role |
|------|------|
| `manifest.json` | One manifest for both browsers: `background.scripts` for Firefox, `background.service_worker` for Chromium |
| `light.js` | Shared helpers and defaults, loaded first everywhere, including the table of supported video call apps (`PLATFORMS`). Aliases `chrome` to `browser` on Chromium |
| `content.js` | Runs on the call pages (the sites in `PLATFORMS`): draws the frame, lights Meet's background and tells `background.js` when the camera starts or stops |
| `camera.js` | Runs on the call pages in the page's own world (`world: "MAIN"`, at `document_start`, in every frame): watches the camera tracks from `getUserMedia` and tells `content.js` whether the camera is on (on Teams, also whether a call connection, an `RTCPeerConnection`, is connected). No extension API there |
| `background.js` | Keyboard shortcut, per-tab toolbar icon, and turning the light on and off with the camera for all call tabs |
| `popup.html`, `popup.js` | The settings panel |
| `light.html`, `light-window.js` | The movable light window |
| `_locales/` | Translations (English and Spanish) |
| `test.js` | All tests, using fake browser and DOM objects |
| `scripts/build.sh` | Builds the store zip into `dist/` |
| `scripts/amo-listing.js` | Publishes the texts in `docs/store/listings.md` to addons.mozilla.org |

## Tests

Write the test first and watch it fail, then make it pass. Tests run against fake `browser` and DOM objects, so no browser is needed: `node test.js`.

A test should check what the user sees or what gets saved, through the same entry points the browser uses (events, storage changes, messages).

## Guidelines

- **Both browsers.** Use the `browser` namespace; `light.js` maps it to `chrome` on Chromium. Avoid APIs only one browser supports, or guard them.
- **Translations.** Every visible text lives in `_locales/<language>/messages.json`, and every language has the same keys as `en`. The tests check this. When you add a text, add it to every language (English is fine as a placeholder, and say so in the pull request).
- **Accessibility.** Keep text contrast at 4.5:1 or more and control outlines at 3:1, give every control a label, and keep everything usable with the keyboard.
- **Commits.** Use [Conventional Commits](https://www.conventionalcommits.org/), for example `feat(popup): add a preset` or `fix: keep the frame after leaving full screen`.
- **Scope.** One change per pull request. Discuss large features in an issue first.

## Add a video call app

Each app is one entry in `PLATFORMS` in `light.js`, keyed by hostname:

- `meeting`: a regular expression for the paths of a call (and the screen before joining), never the app's home page or the files it serves. An app served at several hostnames (Zoom: `app.zoom.us` and `zoom.us`) gets one entry per hostname; they can share the same object.
- Or `meeting: "call"`, for apps whose address does not tell a call apart (Microsoft Teams): the page is in a call while one of its `RTCPeerConnection`s is connected, and for 2 seconds after, so a reconnection does not end it. A live microphone or camera does not count (voice messages, device tests in settings), and a call may have neither. Add the hostname to the list at the top of `camera.js` too, which then watches the page's `RTCPeerConnection`s and reports `call` there (only there: elsewhere it watches the camera alone and leaves `RTCPeerConnection` untouched); the tests check that both lists agree. `camera.js` repeats its report every second, and `content.js` takes more than 2.5 seconds of silence as a no (the frame was removed or frozen before saying so).
- `meetBg`: `true` only if **Light up Meet's background** works there. It looks for Meet's dark areas, so new apps start with `false`; there, that option draws the frame when **Frame** is off.

Then:

1. In `manifest.json`, add `https://<hostname>/*` to `host_permissions` and to the `matches` of both content scripts (`content.js` and `camera.js`). The tests check that the manifest and the table agree. `background.js` reads the table to ask every call tab about its camera.
2. In `test.js`, add `isMeeting` cases: a call, the home page and other pages of the app that are not calls.
3. Check it on the real site: the frame appears in a call and not on the home page.
4. Add the app to `README.md` (intro, quick start, known limitations) and its permission to `PRIVACY.md`.

Each new host in `host_permissions` makes people who already have the extension approve it again on update: Chrome disables the updated extension until they accept, and Firefox may install the update without granting the new site. Ship new apps together in one release, so this happens once.

## Translations

The extension is available in English, Spanish, Catalan, Galician, Basque, French, German, Italian, Portuguese (Brazil and Portugal), Japanese and Traditional Chinese. Only the Spanish texts have been reviewed by a native speaker so far, so **corrections from native speakers are very welcome**, especially for Basque, Japanese and Chinese.

To add a language:

1. Copy `_locales/en` to `_locales/<code>` and translate each `message`. Keep `$COUNT$` and the `placeholders` block as they are.
2. Add the code to the language list in `test.js` and run `node test.js`.
3. Open the panel in that language and check that no text overflows.

Use a code from [Chrome's supported locales](https://developer.chrome.com/docs/extensions/reference/api/i18n#locales) when possible. Chrome ignores other codes and shows English instead, while Firefox accepts them; that is why Galician (`gl`) only works in Firefox. The Chrome Web Store does accept Basque (`eu`), although that page does not list it. Chrome also has no plain `pt` or `zh`: use `pt_BR`, `pt_PT`, `zh_CN` or `zh_TW`.

## Releasing

For maintainers. Publishing a GitHub release submits that version to the stores.

1. Bump `version` in `manifest.json` ([semver](https://semver.org/): fixes `1.1.1`, features `1.2.0`) and commit it as `chore(release): X.Y.Z`.
2. Tag and push: `git tag -a vX.Y.Z -m "Ring Light for Google Meet X.Y.Z" && git push origin master vX.Y.Z`.
3. Create the GitHub release for that tag with the release notes: `gh release create vX.Y.Z --title vX.Y.Z --notes-file notes.md`.

The [Release workflow](.github/workflows/release.yml) then runs the tests, checks that the tag matches the manifest version, builds the zip, attaches it to the release and submits it to addons.mozilla.org as a new version, which goes through Mozilla's review. Add the version notes on addons.mozilla.org by hand if you want them shown there.

Before the first release, add two repository secrets with an [addons.mozilla.org API key](https://addons.mozilla.org/developers/addon/api/key/): `AMO_API_KEY` (JWT issuer) and `AMO_API_SECRET` (JWT secret).

Good to know:

- Releases marked as **pre-release** are not submitted.
- GitHub runs the workflow file from the tagged commit, so it only applies to versions released after it was added.
- If the submission fails, fix the cause and re-run the job from the Actions tab. If addons.mozilla.org already accepted that version, bump the version and release again: a version number can only be submitted once.

## Store listing texts

`docs/store/listings.md` holds the name, summary and description in every language. Each release publishes them to addons.mozilla.org right after submitting the version. To publish an edit between releases, merge it into `master` and run the [Store listing workflow](.github/workflows/listing.yml) from the Actions tab (**Store listing** → **Run workflow**). Both use the `AMO_API_KEY` and `AMO_API_SECRET` secrets.

- `node scripts/amo-listing.js --dry-run` prints what would be sent, without credentials.
- addons.mozilla.org does not offer Catalan, Galician or Basque. Catalan and Basque are only used on the Chrome Web Store; Galician is not used by either store for now.
- The Chrome Web Store texts are still pasted by hand.
- A pre-release that is later turned into a full release is neither submitted nor listed: submit it by hand and run **Store listing**.

## Reporting bugs

Open an issue with your browser and its version, your operating system, what you expected and what happened. A screenshot helps.
