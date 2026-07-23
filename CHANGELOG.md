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

## 1-bit interface skin

- Added a **Retro** toggle beside the histogram that redraws it as a 1984 Macintosh graphic: classic window chrome (striped title bar with the title knocked out, close box), 1-bit black on white, `shapeRendering="crispEdges"` so nothing is antialiased away
- The original screen had no greys, so shading is a real 50% ordered dither — a checkerboard of individual blocks rather than a CSS pattern, which would resample into flat mush at this size. The data is quantised onto a 48×16 grid first; that stepped silhouette is the whole point, since a smooth curve would just be a modern chart drawn in black
- Colour didn't exist either, so R/G/B are told apart by solid/dashed/dotted staircases with a pattern key underneath — how charts of that era actually distinguished series
- The dither fills the **per-bucket envelope of R/G/B**, not luma. Everything is normalised to the brightest channel and luma sits well under it, so filling from luma quantised to 16 rows rounded most of the chart to zero and left a nearly empty box
- Extended Retro to reskin the **entire interface**: white panels, black square-cornered controls, inverted selection (a 1-bit screen's only highlight), square slider thumbs, and the classic 50% checkerboard desktop pattern behind the photo. Thumbnails and map tiles are thresholded to true 1-bit with `grayscale(1) contrast(1000%)` — every pixel forced to pure black or white, the same thing a Mac did to a scanned image
- **The photograph itself is exempt**, along with the crop overlay. Reskinning the tool is the point; misrepresenting the image being edited is not
- Built as one CSS layer keyed off `[data-retro]` on the root, with two region hooks (`data-retro-chrome`, `data-retro-desktop`), rather than conditionals threaded through twenty components — where every new component would then have to remember to opt in. `!important` is needed because the palette arrives via inline style props, so it's scoped to the chrome regions where it can't leak onto the image
- The slider track and centre tick are bare `div`s, so the blanket "no backgrounds" rule erased them; both carry explicit hooks that restore them as black rules
- The Retro button itself is drawn 1-bit *in the normal dark interface too* — a white box with bold black text. It's a swatch of the mode it turns on, so it's easy to find and says what it does before you press it; as muted grey text it read as just another disabled-looking label. This is the one deliberate exception to the `UI_COLORS` rule, since the palette is a set of muted accents and has no true black/white pair — which is exactly what this control has to demonstrate
- The button is labelled with its destination rather than its state: **1-Bit** takes you there, **Colour** brings you back. `aria-pressed` was dropped with it, since the accessible name now changes to describe the action and a toggle state on top would contradict it
- Named for the palette rather than the era. It started as "Retro", but on a photo editor that reads as something done to the *photograph* — faded film, sepia, grain — which is the one thing this mode refuses to touch. "Colour" replaced "Modern" for the way back on the same logic, and because the Tone mapper dropdown already had a "Modern (AgX)" a few hundred pixels away. The store and the CSS hooks are still named `retro`; renaming those would touch every rule in the layer for nothing the user can see
- Section headings run as **inverted bars** — white type knocked out of solid black, the full width of the panel. On a screen with no second colour and no type sizes to spare, inversion was how a heading was made to outrank the controls beneath it, and it puts the panel's titles in the same visual language as the histogram window's. The bar is the whole header row, not just the word: inverting the text alone reads as a highlighted selection rather than a title. The chevron paints `stroke` from an attribute, so it needed the override too, and lost its 60% opacity with it — a dithered grey arrow on black isn't something that screen could do
- The toggle lives in the header beside full screen, not in the sidebar where it started: the skin is a property of the interface rather than of the open photograph, so it belongs with the other view controls and stays reachable with no file loaded. The histogram's own row lost its "Histogram" heading in the process — the chart sits directly beneath it and the button beside it now reads simply HIDE, with the noun kept in an `aria-label` for screen readers

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

## One-click dust removal

- Added a **Dust Removal** button that scans the decoded photo for sensor dust and heals each spot from the pixels around it. Nothing is baked in: the spots are an ordinary edit parameter, so the result undoes, persists, exports and reverts with everything else, and the RAW file is never touched
- Detection is deliberately conservative, because the failure modes are not symmetric — a missed spot is a spot the user can still see, but a false positive silently smears away a bird, a mole or an eye. A candidate has to be small, round, faint, sitting on a bright *and* smooth background, and **neutral**: dust dims R, G and B by the same proportion, since a mote sits millimetres in front of the photosites and blocks light rather than colouring it. That physical test is what rejects foliage and coloured detail that passes every geometric filter
- The first version had none of those upper bounds and found **32 spots on a photo with a clean sensor** — before/after magnification showed it smearing grass tufts, a bird in flight and wisps of cloud. Adding the contrast ceiling, the neutrality test, a tighter roundness requirement and a smaller maximum radius took the same photo to zero, with the button reporting "No dust spots found" rather than looking dead
- Healing runs in the shader: each spot is rebuilt from a ring of pixels just outside it, blending the ring's mean (at the centre, where no direction is meaningful) into the tap directly outward along each fragment's own radius (at the edge, which carries any gradient running across the spot), then feathering the outermost 15% back to the real pixels. The sharpen taps read through the same healed sampler, or sharpening would measure the removed edge and draw a ring back around every patch
- Spot coordinates are normalized to the image, so the half-res interactive preview and the full-res export heal identically with no rescaling; radii are measured in width-fractions and aspect-corrected in the shader, or a round mote would be healed as a stretched oval
- Verified both ways: on a synthetic frame carrying five true motes plus four decoy classes (a dark bird, a coloured leaf, a soft cloud wisp, dark tufts in textured grass) it finds 5/5 and rejects all four; on the real photo it now finds nothing, where the same code path previously altered 0.43% of all pixels
- Moved Auto Levels and Dust Removal into a new **Auto** section above Basic — both inspect the photograph and write a result into the controls below, which makes them a different kind of thing from the sliders they were sitting among

## Editing panel structure

- Split the editing panel with two horizontal rules and no more: one under the camera/exposure line, dividing what the file *is* from what you can do to it, and one above Undo / Reset all, which act on the whole edit rather than adjusting part of it. Deliberately not repeated between every section — the spaced small-caps headings already delimit those, and a rule above each would compete with them rather than add anything, turning a meaningful boundary into ruled paper
- `DIAL MIXER` set in sentence case as `Dial Mixer`. It's a switch, not a section heading, and the uppercase styling had it shouting alongside the headings it sits between

## Colour removed from the chrome entirely

- Supersedes *Interface colour simplification* above. The two-colour system it landed on — one teal-green accent plus a red for destructive actions — was still one colour too many. The accent painted fifteen controls, and the loudest of them (Export JPEG, the Dial Mixer toggle) put a saturated green next to a photograph that already had colour of its own to say
- `accent` is now a **brightness, not a hue** (`#e4e4e7`). Active and selected states are signalled the way a black-and-white print signals emphasis — contrast and weight — leaving the photograph as the only thing in the window carrying colour
- Deliberately restrained rather than merely desaturated. A first pass at pure white read as a highlight shouting for attention, which is the same mistake the eight accents made, just in monochrome. Three separate strengths now do the work: `accent` for text (one step above a resting label, no more), `ACCENT_BORDER` at 40% for outlines (separates from the inactive border without ringing), `ACCENT_WASH` at 7% for the fill behind a live control
- The Dial Mixer knob had to invert with its track: a pale knob on a pale track vanishes at exactly the moment the control is meant to read as active, so a lit track now carries a dark knob, and the track itself sits at `heading` rather than the near-white accent
- **Delete file** dropped its red too, and is now drawn identically to Export JPEG beside it. Defensible because the action isn't destructive in the way the red implied — it forgets the *loaded* file and its saved session, and never touches the RAW on disk. Worth recording that it has no confirmation step, which the red was implicitly standing in for
- `danger` stays in the vocabulary for exactly one thing: the map pin, where red is cartographic convention rather than a warning
- What colour is left in the window: the photograph, the logo, the map pin, and the histogram's R/G/B channels — which are data, not decoration

## Keywords travel with the exported JPEG

- Tags were being left behind on export: the canvas encoder emits a bare image with no metadata, so a file's keywords lived only in this browser and never reached the picture. Now they're embedded on the way out
- Written as two standard blocks so they're read wherever the photos land: **XMP `dc:subject`** (APP1 — Lightroom, Bridge, Capture One, digiKam, OS indexers) and **IPTC `2:25` Keywords** (APP13 — Photo Mechanic and older tools, still read by all of the above). The IPTC block carries a `1:90` UTF-8 declaration so non-ASCII tags survive
- Hand-assembled in `lib/jpegMetadata.ts` rather than adding a metadata dependency, in keeping with the hand-rolled map. The segments are inserted right after SOI and the image data is left byte-for-byte untouched; the RAW on disk is never involved
- Export reads the tags straight from IndexedDB (`loadKeywordsFor`), not the in-memory library map — that map only hydrates once the Files tab is opened, so a file tagged in an earlier session and restored straight into the editor would otherwise have exported blank
- Verified end to end: a real canvas-encoded JPEG run through the module and read back by `exiftool` shows both Keywords and Subject populated (including a non-ASCII "café münchen"), `-validate` returns OK, the image still decodes at full size, and empty-keyword / non-JPEG inputs pass through unchanged

## The slider thumbs stopped feeling sticky

- Dragging a slider recomputed the histogram every frame, and the histogram is a full-canvas `gl.readPixels` (a GPU→CPU stall) plus a per-pixel JS pass — ~150ms each on the 6MP preview. A controlled range input's thumb can only move as fast as the main thread frees up, so it stuttered in 150ms steps
- The image itself is still redrawn every frame (that draw is cheap); only the histogram readback is now debounced to fire once, ~140ms after the values settle. During a continuous drag the timer keeps resetting and never runs. The readback re-renders the final frame first, because with no `preserveDrawingBuffer` the buffer the drag left behind has been composited away to zeros by then
- Measured on a 30-step drag: histogram readbacks during the drag dropped from ~one per frame to **0**, per-change main-thread cost from up to ~150ms to a **median 3.5ms**, and one readback fires on settle

## Sharpen strength and control-toggle labels

- Raised the Sharpen strength scalar 4.0 → 5.0 (25% stronger across the slider's whole range); it read as too gentle even at 100. The tone pipeline is unchanged, so `autoLevels` needed no resync
- The slider/dial toggle names its destination rather than its state: it reads **Dials** while sliders are showing and **Sliders** while the dials are, each with a matching icon — the same "label is where the button takes you" pattern the 1-Bit/Colour button already uses

## Panel-side toggle moved to the top bar

- The button that flips the editing panel to the left or right of the window moved out of the panel and up into the header, next to Full screen. Which side the panel sits on is a property of the whole interface layout — like the skin and fullscreen controls that already live there — not of any one section inside the panel
- It's a self-contained `PanelSideButton` mirroring `FullscreenButton`'s size, border and icon, and because the header carries `data-retro-chrome` it inherits the 1-Bit skin for free. Desktop only (`hidden sm:flex`): on the mobile layout the panel stacks below the photo, where left/right has no meaning. With it gone, the panel's "Hide/Show All" button reclaims the full row width

## Verification discipline throughout

Every change checked with `tsc` + production build, then functionally verified in-browser via pixel-level `gl.readPixels()` comparisons (saturation ratios, clipping counts, luma) rather than just visual inspection — and only pushed to `main`/deployed when explicitly requested.
