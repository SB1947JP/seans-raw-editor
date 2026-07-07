# Sean's RAW Editor

A client-side RAW/DNG photo editor for Panasonic RW2 and DNG files (works with any LibRaw-decodable format). Single-image editor — open one file, adjust it, export it. No backend; everything runs in the browser.

See [CHANGELOG.md](CHANGELOG.md) for the full history of what's been built and fixed.

## Stack

- Vite + React + TypeScript + Tailwind
- `libraw-wasm` (LibRaw compiled to WebAssembly) running in a Web Worker for RAW decoding
- WebGL2 fragment shader for the real-time, non-destructive edit pipeline
- `zustand` for state (edit params with gesture-grouped undo, crop tool state)
- Deployed to GitHub Pages via GitHub Actions on push to `main`. Live at sb1947jp.github.io/lumix-raw-editor

## Architecture

- `src/lib/rawDecoder.ts` — wraps libraw-wasm. `decodePreview()` decodes at half resolution for fast interactive editing; `decodeFull()` decodes full-res, used only on export. Faithful decode settings: camera white balance, camera color matrix, no auto-brightness, highlights clipped not reconstructed.
- `src/gl/renderer.ts` + `src/gl/shaders/adjust.frag.glsl` — the edit pipeline. One shader does exposure, highlight rolloff, white balance, brightness, contrast, highlights/shadows/whites/blacks, saturation/vibrance, sharpen, in that order. `EditCanvas` (interactive) always renders the full frame (`applyCrop={false}`); crop is only baked in at export time.
- `src/lib/whiteBalance.ts` — computes a 3×3 chromatic-adaptation matrix (CAT16/von Kries in LMS cone space) from Temperature/Tint, uploaded to the shader. Not naive per-channel gains — see CHANGELOG for why.
- `src/lib/filmStocks.ts` — "Film emulation" presets (Color section) bundling temperature/tint/saturation/vibrance/contrast to emulate specific film stocks.
- `src/lib/autoCrop.ts` — largest-inscribed-rectangle math for auto-cropping rotated images to avoid edge-clamp smudging; `fitAspectInRect` keeps a locked crop ratio while rotating.
- `src/lib/autoLevels.ts` — Auto Levels solver. Ports the shader's actual tone math into JS and numerically solves for exposure/blacks. **Must be kept in sync with the shader** — this drifted out of sync once already and produced bad results (see CHANGELOG).
- `src/state/editParams.ts` — single source of truth for all slider values, with `beginChange()`/`set()` gesture grouping so a whole drag or a whole preset-apply is one undo step.
- `src/state/cropTool.ts` — crop ratio/orientation UI state, separate from the crop rect itself (which lives in editParams).

## Working conventions (established over this project)

- **Never commit or push without being explicitly asked.** Make changes, verify them, report what changed, and wait. When asked to push, `git add` the specific files touched (not `-A`), write a real commit message explaining *why*, push, then confirm the GitHub Actions deploy succeeded (`gh run watch ... --exit-status`) and that the live bundle hash matches.
- **Verify color/tone changes with pixel readback, not just visual inspection.** Hook `gl.drawArrays` on the live WebGL context to capture `gl.readPixels()` after each render, then assert on saturation ratios, channel-clip counts, luma — this caught real bugs (hue-shifting clamps, oversaturated tint, contrast solving to 95) that a screenshot alone would have missed.
- **Test with the real fixture at `/tmp/rawtest/lx3.rw2`** (and other files in that dir) — copy into `public/`, reload, drag-drop via a synthetic `DragEvent`, wait for `canvas` to appear, then interact. Always clean up (`rm -rf public`) before finishing.
- **Always run `npx tsc -b` and `npm run build` before considering a change done**, then remove build artifacts (`dist`, `vite.config.d.ts`, `vite.config.js`, `*.tsbuildinfo`) since they're gitignored but clutter the working tree if left from a manual build.
- **When the shader's tone pipeline changes, check `autoLevels.ts`** for whether its ported math needs updating too.
