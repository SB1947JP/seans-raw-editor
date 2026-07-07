# Changelog

A running history of the important steps taken to build Sean's RAW Editor.

## Foundation

- Built a client-side RAW/DNG editor (Vite + React + TypeScript + Tailwind), decoding RW2/DNG via LibRaw-WASM in a Web Worker, editing via a WebGL2 fragment shader pipeline
- Set up GitHub repo + GitHub Actions deploy to GitHub Pages, live at sb1947jp.github.io/lumix-raw-editor

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
- Vibrance given skin-tone protection (feathers the boost in the orange hue band)
- Rewrote Auto Levels to solve against the actual current tone pipeline (it had drifted out of sync and was slamming Contrast to 95)

## UI/UX features

- Undo, double-click-to-reset sliders, zoom controls, double-click-to-recentre image + pan/hand tool
- Interactive crop box overlay with aspect-ratio presets, default now locks to "Original" ratio
- Auto Levels button with before/after histogram
- Redesigned histogram to a single toggleable before/after box, later upgraded to per-channel **RGB histogram** with a 0–255 scale
- Japanese-palette color-coded section titles, collapsible sidebar panels
- Responsive/mobile layout pass; fixed iPad/iPhone pull-to-refresh and pinch-zoom fighting the app's own gestures
- Export switched to Web Share API on iOS specifically (was failing silently), gated so desktop browsers keep normal downloads; fixed a "must be handling a user gesture" error
- Renamed app to "Sean's RAW Editor"; trimmed base font size

## Film emulation

- Added a "Film emulation" dropdown (renamed from a generic colour dropdown) simulating late-90s stocks — Kodachrome 64, Kodak Gold 200, Portra 400, Fuji Superia 400, Provia 100F/400X, Ektachrome E100, Ektachrome 320T-in-daylight
- Each preset carries real Kelvin balance point (mired-shifted from D65), brand tint, saturation/vibrance character, and tone-curve contrast
- Added then fully removed a film-grain simulation stage (shader noise + slider) per request

## Verification discipline throughout

Every change checked with `tsc` + production build, then functionally verified in-browser via pixel-level `gl.readPixels()` comparisons (saturation ratios, clipping counts, luma) rather than just visual inspection — and only pushed to `main`/deployed when explicitly requested.
