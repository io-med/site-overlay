# Privacy policy

_Last updated: November 10, 2026_

Site Overlay Compare does not collect, store on any server, sell or share any personal or browsing data.

## What stays on your device

- **The current comparison** (the two addresses, route, width, mode and checkboxes) is saved with `chrome.storage.local` in your browser so the comparison tab opens the way you left it. It never leaves your device.
- **Preferences** from the settings page (breakpoint widths, which modes and features are on, theme and highlight colour) are saved with `chrome.storage.sync`. If you have turned on Chrome sync, Chrome copies them to your other devices through your Google account, like any extension's synced settings. They contain no addresses or browsing data, and the developer never receives them.
- Both are removed when you uninstall the extension.
- **Screenshots** of the comparison tab are taken only in the "Highlight" mode to compute the highlight. They exist in the tab's memory while it is open and are never saved or sent anywhere.

## What the extension does with web pages

- It loads the two sites you enter into the comparison tab, just as if you opened them yourself. Those sites receive your requests the usual way and their own privacy policies apply.
- For those frames only, it removes the `X-Frame-Options` and `Content-Security-Policy` response headers so the sites can be shown inside the comparison tab. Other tabs are not affected.
- Inside the comparison tab, it reads the page structure to sync scrolling and to repeat your clicks, hover and typing in the other site. Passwords and files are never repeated.
- It catches links to `https://site-overlay.invalid/` and opens them as a comparison. That address never resolves, so nothing is sent over the network.

## No third parties

The extension has no analytics, no ads, no remote code and makes no requests of its own to any server.

## Contact

Questions or concerns: [open an issue](https://github.com/io-med/site-overlay/issues) in the project's GitHub repository.
