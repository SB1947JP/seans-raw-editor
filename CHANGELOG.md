# Changelog

A running history of the important steps taken to build Sean's RAW Editor.

## Foundation

- Built a client-side RAW/DNG editor (Vite + React + TypeScript + Tailwind), decoding RW2/DNG via LibRaw-WASM in a Web Worker, editing via a WebGL2 fragment shader pipeline
- Set up GitHub repo + GitHub Actions deploy to GitHub Pages, live at sb1947jp.github.io/seans-raw-editor

## Core editing bugs fixed

- Portrait double-rotation bug (LibRaw already uprights images; our shader was rotating again)
- Crop aspect-ratio distortion, zoom-not-centering (including a recurring portrait/50%-zoom edge case), zoom-in losing scroll anchor
- Highlights/Blacks sliders had inverted direction
- Rotation corner "smudging" — added auto-crop to the largest rectangle that avoids sampling outside the frame, later fixed to preserve a *locked* aspect ratio while rotating instead of drifting

## Color/tone algorithm overhauls (the deepest recurring work)

- Exposure moved from gamma-space to linear-light multiply (was blowing out highlights too fast)
- Contrast rewritten from a runaway `tan()` curve to a bounded symmetric power curve
- Highlights/Shadows/Whites/Blacks rewritten to scale hue-preserving via linear-light luma ratio (was desaturating via flat additive shifts)
- Highlight rolloff rewritten as a knee-gated log-logistic "shoulder" (darktable sigmoid-style), applied as an RGB ratio on the brightest channel so colors never wash to grey — tuned to be inert at rest (true whites reach 255) and only engage as exposure is pushed
- Fixed the final hard clamp that was twisting hue/collapsing saturation on out-of-gamut colors → replaced with hue-preserving chroma compression to gamut
- White balance rebuilt twice: first moved to linear light, then replaced entirely with a proper **CAT16 chromatic adaptation transform** (LMS cone space, von Kries), matching darktable's color-calibration module — fixed real bugs along the way (temp=0 not being an exact identity, tint over-rotating to clipped colors)
- Tone-region masks rewritten as a non-overlapping partition (Blacks/Shadows/Whites) instead of overlapping ranges that double-lifted pixels
- Added signed-square "soft response" curve to Highlights/Shadows/Whites/Blacks sliders so small moves stay subtle
- Halved the **negative** Highlights strength (0.6 → 0.3, positive side unchanged). Full highlight recovery squeezed the bright range to 40% of its distance from the pivot, which collapsed the *tonal separation* between bright tones rather than desaturating them — pixel readback showed sky luma spread falling 6.3 → 2.6 while saturation actually *rose* (0.084 → 0.101), so every highlight landed on the same flat mid-grey and read as silver. At 0.3 the spread retention goes from ~41% to ~71% and the sky keeps its cloud modelling. Deliberately asymmetric: expanding a range can't collapse it, so the brighten direction keeps 0.6 (verified still lifting +41.8 at +100)
- Halved the Shadows strength (mask coefficient 0.4 → 0.2). The slider keeps its full −100..100 sweep, but the top of its travel was unusable — a flat, milky lift — so the whole range is now useful instead of just the first half. Verified by A/B pixel readback against the old coefficient: the lift at +100 is exactly 50% across every shadow band (deep +39.0→+19.5, shadow +89.1→+44.5, low-mid +33.5→+16.8), with midtones and highlights still measuring 0.0 change in both
- Vibrance given skin-tone protection (feathers the boost in the orange hue band)
- Rewrote Auto Levels to solve against the actual current tone pipeline (it had drifted out of sync and was slamming Contrast to 95)

## UI/UX features

- Undo, double-click-to-reset sliders, zoom controls, double-click-to-recentre image + pan/hand tool
- Interactive crop box overlay with aspect-ratio presets, default now locks to "Original" ratio; the scrim over the discarded area later darkened from 0.6 to 0.8 so the kept crop reads as clearly primary
- Auto Levels button with before/after histogram
- Redesigned histogram to a single toggleable before/after box, later upgraded to per-channel **RGB histogram** with a 0–255 scale
- Japanese-palette color-coded section titles, collapsible sidebar panels
- Responsive/mobile layout pass; fixed iPad/iPhone pull-to-refresh and pinch-zoom fighting the app's own gestures
- Export switched to Web Share API on iOS specifically (was failing silently), gated so desktop browsers keep normal downloads; fixed a "must be handling a user gesture" error
- Fixed the "choose location" dialog silently disappearing on export. A full-res decode takes ~13s, far beyond the browser's ~5s transient user-activation window, so by the time the anchor download fired the tab no longer counted as user-initiated and Chromium reclassified it as an *automatic* download — skipping the save prompt. Measured: 13,508 ms gap with `navigator.userActivation.isActive === false`. Fixed by opening `showSaveFilePicker()` synchronously in the click handler (now 1 ms, activation still valid) and writing the decoded bytes to the chosen handle afterwards. Same root cause as the iOS share failure already documented in that file. Safari/Firefox keep the anchor path, which also stopped revoking the blob URL synchronously after `click()` — that race can cancel a download before the browser has read the blob
- Renamed app to "Sean's RAW Editor"; trimmed base font size

## Crop commit, look previews, resizable panel

- **Return commits the crop**: the viewer drops everything outside the box and renders just the kept frame, and Return again reopens the crop box. A view state only — the crop rect is untouched and export always baked it in regardless. Verified the canvas goes 3012×2008 → 1506×2008 on a 3:4 portrait crop and back. Return is ignored while focus is in a text field, select or button, so it can't steal the key from a control
- **Look presets preview on hover**. This meant replacing the native `<select>`: `<option>` elements can't receive hover events in any browser, so previewing by pointing at a stock is impossible without owning the list. The replacement expands inline rather than floating, which avoids being clipped by the panel's own scroll container
- Previews render through a new `preview` layer in the params store that the canvas composites over the real values. Nothing is committed, no undo step is recorded, and export is unaffected — verified by readback: hovering Kodachrome shifts the render to RGB (178.7, 178.7, 153.7), leaving reverts to (162.9, 168.4, 150.4), and the committed params stay at 0 throughout
- **The editing panel is drag-resizable** from a grip on its inner edge, which follows the panel when it swaps sides. Width is clamped to 240–560px (below 240 the dial mixer's two columns collapse) and persisted; double-clicking the grip resets it. The width lives in a CSS variable so the Tailwind breakpoint still governs whether it applies at all — an inline width would have overridden the full-width mobile layout too

## Film emulation

- Added a "Film emulation" dropdown (renamed from a generic colour dropdown) simulating late-90s stocks — Kodachrome 64, Kodak Gold 200, Portra 400, Fuji Superia 400, Provia 100F/400X, Ektachrome E100, Ektachrome 320T-in-daylight
- Each preset carries real Kelvin balance point (mired-shifted from D65), brand tint, saturation/vibrance character, and tone-curve contrast
- Added then fully removed a film-grain simulation stage (shader noise + slider) per request

## File browser, keywords and GPS map

- Added a **file browser**: pick a whole folder (`webkitdirectory`), pick individual files, or drag a batch in. Chosen over the File System Access API because that one is Chrome/Edge only, and cross-browser support matters here; the trade-off is that the list is session-only, since `File` objects can't survive a reload
- Thumbnails come from each RAW's **embedded JPEG preview** (LibRaw `thumbnailData()`), not a decode — listing a folder would otherwise take minutes and gigabytes. Probes run strictly one file at a time so a large folder can't hold N wasm heaps at once
- Added **keyword tagging** with filter chips (AND across keywords) and a name search. Stored in IndexedDB keyed by file name so tags outlive the reload that the file list doesn't. The RAW files are never modified
- Moved the session slot and keywords behind one shared IndexedDB handle — a single database name can only be open at one version at a time, so separate `indexedDB.open()` calls would deadlock on upgrade. Bumped v1→v2 in place, preserving existing stored sessions
- Added a **GPS map** for geotagged shots. LibRaw does expose `gps_data`, converted here from DMS to signed decimal degrees, strictly: `gpsparsed` separates "no GPS" from a genuine 0°,0°, and a no-fix `'V'` status, missing hemisphere ref or out-of-range value is rejected rather than guessed
- The map is a hand-written slippy map over OpenStreetMap tiles (Web Mercator maths, drag-to-pan, zoom, recentre) rather than Leaflet, avoiding a dependency plus stylesheet and marker assets needing base-path handling for the Pages subdirectory. Carries the required OSM attribution and sends no referrer
- Started as a separate left-hand panel, then folded into the editing panel as an **Edit / Files tab pair** — two panels flanking the photo was more chrome than the interface could carry, and tabbing them reclaimed the width for the image (fit went 18% → 26% on the same window). Replaced `browserOpen` with `sidebarTab`, and dropped the browser's own collapse rail and panel frame in the process
- Removed the header's "Open file" button, now redundant: the browser's Add folder / Add files (and drag-drop) are the way in, and "Delete file" still returns to the dropzone
- Verified against real geotagged RW2 files: thumbnails extracted, coordinates resolved to the correct location, per-photo GPS and altitude differed correctly, tags survived a reload, filtering and dedupe both confirmed

## Interface colour simplification

- The panel had accumulated **eight competing accent colours** — five colour-coded section titles plus separate hues for the file browser, keyword tags, export and the histogram's "before" tab — and the chrome had started competing with the photograph being edited
- Collapsed to a two-colour system expressed by *role* rather than hue, in `UI_COLORS`: one `accent` for anything active/selected/live, and `danger` reserved for destructive actions. Section titles are now neutral
- Consequence, accepted deliberately: dial needles no longer match their section's colour (an earlier request), since the sections no longer have distinct colours. All needles use the single accent
- Removed the now-pointless `SectionColorContext` and the per-section `color` prop threaded through all five sections
- Histogram keeps its R/G/B channel colours — that's data, not decoration
- Verified by scanning every painted `color`/`border`/`background` in the live DOM for non-neutral values: exactly three remain (accent, danger, and the SRE logo's cream), down from eight

## Portrait crops

- Portrait crop ratios were always supported by the crop maths, but effectively undiscoverable: the only way to reach them was an unlabelled "⇄" glyph whose sole affordance was a tooltip, and the dropdown kept showing landscape labels ("4:3") even while a portrait crop was active, so nothing indicated portrait existed
- Replaced the glyph with a labelled **Landscape / Portrait** pair with proportioned rectangle icons, and made the ratio labels follow the orientation — the list now reads 3:4, 2:3, 9:16, 4:5 in portrait. Disabled for Free and 1:1, which have no orientation to choose
- The stored preset deliberately stays in canonical landscape form, so flipping orientation doesn't disturb the dropdown selection; only the label and the resolved aspect change
- Verified on a landscape frame: selecting 4:3 gives a crop of pixel aspect 1.333, switching to Portrait gives exactly 0.750 with the label reading "3:4"

## Security and privacy hardening

- **Self-hosted the Inter webfont** (`@fontsource-variable/inter`) instead of fetching it from Google Fonts. The old `<link>` handed the visitor's IP and User-Agent to a third party on every page load and let an outside origin inject arbitrary CSS; bundling it also makes the app work offline
- **Added a Content-Security-Policy** via meta element (GitHub Pages can't set headers). Notably `connect-src 'self'` — since the app opens private photographs and does everything client-side, this means image data has no external destination even if a dependency were compromised. Each exception is documented inline: `'wasm-unsafe-eval'` for LibRaw, `worker-src blob:` for its Emscripten worker, `img-src blob:` for thumbnails, one entry for OSM tiles, `'unsafe-inline'` styles for React `style={{…}}` props. `frame-ancestors` is header-only by spec, so clickjacking protection isn't available this way
- Verified against a **production** build, not just dev: app renders, `Inter Variable` is the loaded face, and a full RAW decode, blob thumbnail, WebGL render and map tiles all work with zero CSP violations
- Fixed `npm run preview` to pass `--base=/seans-raw-editor/`. `vite.config.ts` only applies that base for `command === 'build'`, and preview runs as `serve`, so it was serving at `/` while the built HTML pointed at `/seans-raw-editor/` — every asset fell through to the SPA fallback and the page came up blank
- Reviewed and found clean: 0 npm advisories, no `dangerouslySetInnerHTML`/`innerHTML`/`eval` anywhere, external links carry `rel="noreferrer noopener"`, thumbnail blobs are MIME-pinned to `image/jpeg` inside `<img>`, and the deploy workflow has minimal scoped permissions with no untrusted input reaching a shell step

## Verification discipline throughout

Every change checked with `tsc` + production build, then functionally verified in-browser via pixel-level `gl.readPixels()` comparisons (saturation ratios, clipping counts, luma) rather than just visual inspection — and only pushed to `main`/deployed when explicitly requested.
