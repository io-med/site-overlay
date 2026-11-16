# Chrome Web Store listing

Copy these into the Developer Dashboard. The name and short description come from `_locales/*/messages.json` automatically.

## Package

Upload `dist/site-overlay-<version>.zip` built with `npm run build`.

## Store listing tab

**Category:** Developer Tools
**Language:** English (a Ukrainian translation of the UI is included; you can add a Ukrainian listing later)

**Detailed description:**

```
Site Overlay Compare lays two live websites on top of each other so you can check a redesign, a migration or a new platform against production pixel by pixel.

• Four modes: overlay with adjustable opacity, highlight (changes pulse in a bright colour over the overlay), classic difference, and side by side.
• Tolerance slider hides 1–2 px noise such as slightly shifted edges.
• Two base URLs and one shared route: compare /pricing on both sites without retyping addresses.
• Follow navigation: move to another page in one site and the other follows, SPAs included.
• Synced scrolling by pixels or by page height.
• Mirrored clicks, hover and typing: open a menu or press a button in one site and the same happens in the other, even when the two sites use different markup.
• Breakpoint widths from 320 to 1920 px, fit to window, X/Y offset for the top layer.
• Shareable links: save a comparison as a link in your notes, wiki or Markdown files and open it in one click.
• Settings page: your own breakpoint widths, hide modes and features you don't use, light or dark theme, your own highlight colour.

Privacy: the extension collects nothing and sends nothing anywhere. No analytics, no ads, no remote code. Settings stay in your browser (preferences also sync through Chrome if you turned sync on).

Open source: https://github.com/io-med/site-overlay
```

**Images** (all in `store/images/`):

| Field                      | File                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| Store icon (128×128)       | `icons/icon128.png`                                                                                     |
| Screenshots (1280×800)     | `1-overlay-difference.png`, `2-difference.png`, `3-overlay.png`, `4-side-by-side.png`, `5-settings.png` |
| Small promo tile (440×280) | `promo-tile-440x280.png`                                                                                |

**Additional fields:**

- Official URL: none (it requires a verified domain)
- Homepage URL: `https://github.com/io-med/site-overlay`
- Support URL: `https://github.com/io-med/site-overlay/issues`

## Privacy practices tab

**Single purpose:**

```
Compare two websites visually by overlaying them in one tab, highlighting their differences and keeping scrolling, navigation, clicks and hover in sync between them.
```

**Permission justifications:**

| Permission                   | Justification                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `declarativeNetRequest`      | Removes the X-Frame-Options and Content-Security-Policy response headers only for sub-frames of the extension's own comparison tab (a session rule scoped to that tab ID), so sites that forbid framing can be shown side by side. The rule is removed as soon as the tab leaves the comparison page. No other tab or request is modified.   |
| `storage`                    | Saves the current comparison (addresses, route, width, mode, checkboxes) locally so the comparison tab reopens the same way, and the user's preferences from the settings page (breakpoint widths, enabled modes and features, theme, highlight colour) in Chrome sync storage.                                                              |
| `webRequest`                 | Listens for navigations to https://site-overlay.invalid/ (a reserved domain that never resolves) and opens them as a comparison, so users can save comparisons as ordinary links. No other requests are observed or changed.                                                                                                                 |
| Host permission `<all_urls>` | The user can compare any two websites. The extension needs access to them to load them in the comparison tab, run the sync script inside those frames (scroll, click, hover mirroring) and capture the comparison tab for the difference highlight. The content script exits immediately on pages that are not frames of the comparison tab. |

**Remote code:** No, I am not using remote code.

**Data usage:** check none of the data types. Then confirm all three statements:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** `https://github.com/io-med/site-overlay/blob/main/PRIVACY.md`

## Distribution tab

- Visibility: Public
- Regions: all
- Trader status (account settings): Non-trader
