#version 300 es
precision highp float;

in vec2 vTexCoord;
out vec4 outColor;

uniform sampler2D uImage;
uniform vec2 uTexelSize;

uniform sampler2D uCurveLut; // 256×1 luma tone curve LUT (input luma → output luma)
uniform bool uCurveActive;   // false when the curve is the identity line

uniform float uExposure;    // stops
uniform float uBrightness;  // -100..100
uniform float uContrast;    // -100..100
uniform float uHighlights;  // -100..100
uniform float uShadows;     // -100..100
uniform float uWhites;      // -100..100
uniform float uBlacks;      // -100..100
uniform mat3 uWbMatrix;     // linear-sRGB chromatic adaptation (CAT16) matrix,
                            // precomputed on the CPU from the Planckian-locus
                            // temperature/tint model
uniform int uTonemapMode;   // 0 = classic knee/shoulder pipeline, 1 = AgX
uniform mat3 uAgxPipeToRendering; // constant AgX inset matrix (see lib/agx.ts)
uniform mat3 uAgxRenderingToPipe; // constant AgX outset matrix
uniform float uSaturation;  // -100..100
uniform float uVibrance;    // -100..100
uniform float uSharpen;     // 0..100

// Dust removal. Must match MAX_DUST_SPOTS in lib/dustSpots.ts.
const int MAX_DUST = 32;
uniform int uDustCount;
uniform vec3 uDustSpots[MAX_DUST]; // xy = centre in texture uv, z = radius as a fraction of image width
uniform float uDustAspect;         // imageHeight / imageWidth

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// Heals detected dust spots by rebuilding them from the ring of pixels just
// outside each one. Two samples are combined: the mean of eight taps around
// the ring (a robust estimate of "what this area is", used at the centre where
// no direction is meaningful) and the single tap directly outward along this
// fragment's own radius (which carries whatever gradient runs across the spot,
// so a sky that darkens toward the top keeps darkening across the patch). The
// radial tap takes over quadratically toward the edge, where matching the
// immediate neighbourhood is what stops the patch reading as a disc.
//
// Coordinates are aspect-corrected into width-fractions before any distance is
// taken: uv is 0..1 on both axes, so a circle on the sensor is an ellipse in uv
// and an uncorrected radius would heal a stretched oval on non-square images.
//
// textureLod, not texture: this runs inside non-uniform control flow, where
// implicit derivatives (and therefore the LOD an ordinary texture() picks) are
// undefined. The image has no mipmaps, so level 0 is the only correct choice
// and asking for it explicitly is what makes that well-defined.
vec3 healDust(vec2 uv, vec3 original) {
  vec3 color = original;
  for (int i = 0; i < MAX_DUST; i++) {
    if (i >= uDustCount) break;

    vec2 centre = uDustSpots[i].xy;
    float radius = uDustSpots[i].z;
    vec2 delta = uv - centre;
    delta.y *= uDustAspect;
    float dist = length(delta);
    if (dist >= radius) continue;

    float ringRadius = radius * 1.2;
    vec3 ringMean = vec3(0.0);
    for (int k = 0; k < 8; k++) {
      float angle = float(k) * 0.7853981634; // 2π/8
      vec2 offset = vec2(cos(angle), sin(angle)) * ringRadius;
      offset.y /= uDustAspect;
      ringMean += textureLod(uImage, centre + offset, 0.0).rgb;
    }
    ringMean /= 8.0;

    vec2 dir = dist > 1.0e-6 ? delta / dist : vec2(1.0, 0.0);
    vec2 radialOffset = dir * ringRadius;
    radialOffset.y /= uDustAspect;
    vec3 radial = textureLod(uImage, centre + radialOffset, 0.0).rgb;

    float t = dist / radius;
    vec3 filled = mix(ringMean, radial, t * t);
    // Feather the outermost 15% back to the real pixels. The stored radius is
    // padded past the spot's soft edge, so that band is already clean image —
    // blending there hides the seam without giving any of the spot back.
    color = mix(color, filled, 1.0 - smoothstep(0.85, 1.0, t));
  }
  return color;
}

/** The image as everything downstream should see it: dust already healed. */
vec3 sampleImage(vec2 uv) {
  return healDust(uv, textureLod(uImage, uv, 0.0).rgb);
}

// The decoded image is already sRGB gamma-encoded. Exposure stops are a
// linear-light concept (each stop is a literal doubling of light captured),
// so applying `2^ev` directly to the gamma-encoded values is much more
// aggressive than a real stop — gamma encoding compresses highlights, and
// multiplying already-compressed values compounds that compression the
// wrong way, blowing out highlights far faster than expected. Converting to
// linear light, applying the stop there, and converting back gives the
// gentler, camera-like highlight rolloff a gamma curve naturally provides.
float srgbToLinear(float c) {
  return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4);
}
vec3 srgbToLinear(vec3 c) {
  return vec3(srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b));
}
float linearToSrgb(float c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}
vec3 linearToSrgb(vec3 c) {
  return vec3(linearToSrgb(c.r), linearToSrgb(c.g), linearToSrgb(c.b));
}

// Highlight shoulder in linear light, referencing darktable's `sigmoid`
// module (a generalized log-logistic tone curve in its "RGB ratio" /
// preserve-colour mode). Two properties matter:
//
//   1. It runs in LINEAR light, where an exposure stop is a literal doubling,
//      so the rolloff is physically shaped like real film/sensor highlight
//      compression rather than an arbitrary curve on gamma-encoded values.
//   2. It is applied as an RGB *ratio*: the log-logistic curve is evaluated
//      on the single brightest channel and all three channels are scaled by
//      the same factor. darktable does this specifically because running the
//      curve per-channel pulls each channel toward the 1.0 asymptote at a
//      different rate, collapsing the gaps between channels — the exact
//      "bright colours wash out to grey" failure. Uniform scaling holds hue
//      and saturation while the brightest channel rolls off.
//
// Values at/below `knee` pass through untouched; the excess above it is rolled
// off through a Michaelis-Menten shoulder e/(e+ceil) that is C1-continuous at
// the knee (slope 1, no visible "elbow") and asymptotes to the remaining
// headroom `ceil = 1 - knee`, so the mapped brightest channel is mathematically
// guaranteed to stay just below display white (1.0) — it can never hard-clip,
// no matter how many stops are pushed. Because every channel is scaled by the
// same factor derived from that one brightest channel, hue and saturation are
// preserved: highlights keep separating instead of fusing into a flat grey/
// white blob. Raising `knee` toward 1.0 disables the shoulder, which is how
// the imported default (exposure <= 0) stays untouched.
vec3 highlightShoulder(vec3 c, float knee) {
  float m = max(max(c.r, c.g), c.b);
  if (m <= knee) return c;
  float excess = m - knee;
  float ceil = 1.0 - knee;
  float mNew = knee + ceil * excess / (excess + ceil);
  return c * (mNew / m);
}

// --- AgX tone mapper ---------------------------------------------------------
// A faithful port of RapidRAW's AgX implementation (github.com/CyberTimon/
// RapidRAW, src-tauri/src/shaders/shader.wgsl), itself the standard "community
// AgX" construction that traces back to Blender's AgX view transform: convert
// to a working space inset toward a rotated, scaled-down Rec.2020 (so the
// curve below operates in a deliberately narrower gamut — the reason
// extremely bright saturated colours desaturate gracefully toward white
// instead of clipping to a hard magenta/cyan), apply a log2-encoded per-channel
// sigmoid with a toe and shoulder, then transform back out ("outset").
// uAgxPipeToRendering/uAgxRenderingToPipe are the two constant matrices for
// that in/out step, computed once on the CPU (see lib/agx.ts) since they don't
// depend on any slider.
const float AGX_MIN_EV = -15.2;
const float AGX_MAX_EV = 5.0;
const float AGX_RANGE_EV = AGX_MAX_EV - AGX_MIN_EV;
const float AGX_GAMMA = 2.4;
const float AGX_SLOPE = 2.3843;
const float AGX_TOE_POWER = 1.5;
const float AGX_SHOULDER_POWER = 1.5;
const float AGX_TOE_TRANSITION_X = 0.6060606;
const float AGX_TOE_TRANSITION_Y = 0.43446;
const float AGX_SHOULDER_TRANSITION_X = 0.6060606;
const float AGX_SHOULDER_TRANSITION_Y = 0.43446;
const float AGX_INTERCEPT = -1.0112;
const float AGX_TOE_SCALE = -1.0359;
const float AGX_SHOULDER_SCALE = 1.3475;

float agxSigmoid(float x, float power) {
  return x / pow(1.0 + pow(x, power), 1.0 / power);
}
float agxScaledSigmoid(float x, float scale, float slope, float power, float transitionX, float transitionY) {
  return scale * agxSigmoid(slope * (x - transitionX) / scale, power) + transitionY;
}
float agxApplyCurveChannel(float x) {
  float result;
  if (x < AGX_TOE_TRANSITION_X) {
    result = agxScaledSigmoid(x, AGX_TOE_SCALE, AGX_SLOPE, AGX_TOE_POWER, AGX_TOE_TRANSITION_X, AGX_TOE_TRANSITION_Y);
  } else if (x <= AGX_SHOULDER_TRANSITION_X) {
    result = AGX_SLOPE * x + AGX_INTERCEPT;
  } else {
    result = agxScaledSigmoid(x, AGX_SHOULDER_SCALE, AGX_SLOPE, AGX_SHOULDER_POWER, AGX_SHOULDER_TRANSITION_X, AGX_SHOULDER_TRANSITION_Y);
  }
  return clamp(result, 0.0, 1.0);
}
vec3 agxCompressGamut(vec3 c) {
  float minC = min(c.r, min(c.g, c.b));
  if (minC < 0.0) return c - minC;
  return c;
}
vec3 agxTonemap(vec3 c) {
  vec3 xRelative = max(c / 0.18, vec3(1.0e-6));
  vec3 logEncoded = (log2(xRelative) - AGX_MIN_EV) / AGX_RANGE_EV;
  vec3 mapped = clamp(logEncoded, 0.0, 1.0);
  vec3 curved = vec3(agxApplyCurveChannel(mapped.r), agxApplyCurveChannel(mapped.g), agxApplyCurveChannel(mapped.b));
  return pow(max(curved, 0.0), vec3(AGX_GAMMA));
}
vec3 agxFullTransform(vec3 colorIn) {
  vec3 compressed = agxCompressGamut(colorIn);
  vec3 inRenderingSpace = uAgxPipeToRendering * compressed;
  vec3 tonemapped = agxTonemap(inRenderingSpace);
  return uAgxRenderingToPipe * tonemapped;
}

// Softens a slider's response near zero: signed-square keeps the full effect
// available at the ends of the travel but makes the first half of the range
// gentle, so small adjustments stay subtle instead of committing most of the
// correction in the first few ticks.
float softResponse(float amt) {
  return amt * abs(amt);
}

// Brings an out-of-range colour back into [0,1] by reducing its chroma toward
// its own luma — luma and hue stay put, only saturation gives way, and only by
// exactly the amount needed. This replaces relying on the final hard clamp,
// which cuts whichever single channel overflows and thereby *rotates hue and
// collapses saturation* (lift shadows on a saturated red and R clips first,
// turning it orange). Chroma-compress-to-gamut is how darktable/RawTherapee
// finish their pipelines for the same reason.
vec3 compressToGamut(vec3 c) {
  float l = clamp(luma(c), 0.0, 1.0);
  float mx = max(max(c.r, c.g), c.b);
  float mn = min(min(c.r, c.g), c.b);
  float s = 1.0;
  if (mx > 1.0) s = min(s, (1.0 - l) / max(mx - l, 1e-5));
  if (mn < 0.0) s = min(s, l / max(l - mn, 1e-5));
  return vec3(l) + (c - vec3(l)) * s;
}

// Retargets a pixel's luma to `lTarget` (both values perceptual/gamma-encoded)
// while leaving its hue and saturation untouched. This must be done as a
// multiplicative scale of the *linear-light* RGB triplet — scaling every
// channel by the same factor is the one operation that's guaranteed not to
// shift color, because it corresponds to physically changing the amount of
// light without altering its spectral ratios. Doing the equivalent adjustment
// as a flat additive shift on gamma-encoded channels (the old approach) is
// not hue-preserving: gamma compresses channels unevenly, so an equal delta
// added to R/G/B changes their ratios, and is exactly what produced the
// mushy, discolored highlights/shadows.
vec3 scaleToLuma(vec3 c, float l, float lTarget) {
  vec3 linC = srgbToLinear(max(c, 0.0));
  float linL = max(luma(linC), 1e-4);
  float linTarget = srgbToLinear(clamp(lTarget, 0.0, 1.0));
  return linearToSrgb(linC * (linTarget / linL));
}

// Highlights: negative values recover detail by compressing the bright range
// toward a pivot (pulling near-white pixels down more than moderately bright
// ones, which is what actually reveals lost gradation instead of just
// dimming everything by a flat amount); positive values expand/brighten the
// same range.
vec3 applyHighlights(vec3 c, float highlights) {
  float l = luma(c);
  float pivot = 0.5;
  float amt = softResponse(clamp(highlights / 100.0, -1.0, 1.0));
  // Asymmetric on purpose. Recovery (amt < 0) at the old shared 0.6 squeezed
  // the bright range to 40% of its distance from the pivot, collapsing the
  // *tonal separation* between bright tones — measured spread across the sky
  // fell from 6.3 to 2.6 — so every highlight landed on the same flat mid-grey
  // and the image read as silver. Saturation was never the problem (it rises,
  // via the chroma lift below); the range simply had nowhere left to breathe.
  // Halving the recovery side to 0.3 retains ~71% of the spread instead of
  // ~41%, making the whole of the negative travel usable. The positive
  // (brighten) side keeps 0.6, since expanding a range can't collapse it and
  // that direction was never the complaint.
  float strength = amt < 0.0 ? 0.3 : 0.6;
  float factor = 1.0 + amt * strength; // <1 compresses (recover), >1 expands (brighten)
  float mask = smoothstep(0.3, 0.7, l);

  float lTarget = mix(l, pivot + (l - pivot) * factor, mask);
  vec3 result = scaleToLuma(c, l, lTarget);

  // Recovering highlights (amt < 0) pulls their luminance down, and the eye
  // reads a darker colour as less saturated even when its RGB ratios are
  // unchanged (the Hunt effect) — so a recovered bright sky/cloud *looks* grey
  // despite `scaleToLuma` holding its chromaticity exactly. Couple a chroma
  // lift to the recovery, scaled by how hard the highlight is pulled down, so
  // recovered highlights stay vivid and reveal their colour the way Lightroom's
  // highlight recovery does. It only amplifies colour that is actually present
  // — a near-neutral (or clipped-to-white) highlight has ~0 chroma, so no false
  // colour is invented — and any overshoot is caught by compressToGamut later.
  // Keep this gentle: it *extrapolates* chroma (mix factor > 1), so a large
  // coefficient over-saturates and pushes recovered highlights out of gamut,
  // which reads as garish, hue-shifted colour once compressToGamut clips it
  // back — worst past strong negative Highlights where softResponse ramps up.
  float recover = max(-amt, 0.0) * mask;
  float satFactor = 1.0 + recover * 0.2;
  result = mix(vec3(luma(result)), result, satFactor);
  return result;
}

vec3 applyToneRegions(vec3 c, float shadows, float whites, float blacks) {
  float l = luma(c);
  // Masks (the tone-equalizer approach): Blacks owns the deepest tones and
  // hands over smoothly to Shadows, which peaks in the lower-mids. Shadows
  // fades out by ~0.45 so pushing it lifts genuine shadows without dragging
  // the pure midtones (0.5+) up with them — the old 0.65 falloff reached well
  // into the midtones, so a strong Shadows push flattened and brightened them.
  // The clear band between Shadows and Whites is deliberate: mid-grey is left
  // to Exposure/Contrast/Curve, not the shadow/highlight recovery sliders.
  float blackMask = 1.0 - smoothstep(0.0, 0.3, l);
  float shadowMask = smoothstep(0.0, 0.28, l) * (1.0 - smoothstep(0.25, 0.5, l));
  float whiteMask = smoothstep(0.6, 1.0, l);

  // Shadows is deliberately the gentlest of the three: at 0.4 the top of its
  // travel was unusable — a flat, milky lift nobody would ship — so the slider
  // keeps its full -100..100 sweep but only spends half the strength across
  // it, making the whole range useful instead of just the first half.
  float lTarget = l
    + softResponse(shadows / 100.0) * shadowMask * 0.2
    + softResponse(whites / 100.0) * whiteMask * 0.5
    + softResponse(blacks / 100.0) * blackMask * 0.5;
  return scaleToLuma(c, l, lTarget);
}

// Contrast as a symmetric power curve pivoted at mid-gray: distance from 0.5
// is raised to a power, so it's naturally bounded (endpoints always map to
// exactly 0 and 1, never overshoot) and smooth everywhere — unlike a
// tan()-based pivot scale, whose slope runs away to near-vertical as the
// slider approaches its extremes, which is what made high Contrast values
// look like a harsh clip instead of a gradual tonal stretch.
//
// The curve is evaluated on luma and the color rescaled to match (via
// scaleToLuma), not applied to each RGB channel independently — running the
// same power curve on R/G/B separately compresses the gap between channels
// as they near 0 or 1, which desaturates bright/dark colors toward grey
// faster than a real contrast adjustment should.
vec3 applyContrast(vec3 c, float contrast) {
  float amt = clamp(contrast, -100.0, 100.0) / 100.0;
  float curveGamma = pow(2.0, -amt * 1.3); // <1 steepens (more contrast), >1 flattens (less)
  float l = luma(c);
  float centered = l - 0.5;
  float lNew = sign(centered) * pow(abs(centered) * 2.0, curveGamma) * 0.5 + 0.5;
  return scaleToLuma(c, l, lNew);
}

vec3 applySaturationVibrance(vec3 c, float saturation, float vibrance) {
  float l = luma(c);
  vec3 grey = vec3(l);
  float satFactor = 1.0 + saturation / 100.0;
  c = mix(grey, c, satFactor);

  float maxChannel = max(c.r, max(c.g, c.b));
  float minChannel = min(c.r, min(c.g, c.b));
  float delta = maxChannel - minChannel;
  float currentSat = delta;

  // Skin-tone protection: vibrance is meant to punch up dull skies and
  // foliage without wrecking people. Compute the pixel's hue and feather the
  // vibrance boost down by up to 70% inside the orange band (~5-60 deg) where
  // skin tones live, so faces stay natural while everything else gains.
  float hueDeg = 0.0;
  if (delta > 1e-4) {
    float h;
    if (c.r >= c.g && c.r >= c.b) h = mod((c.g - c.b) / delta, 6.0);
    else if (c.g >= c.b) h = (c.b - c.r) / delta + 2.0;
    else h = (c.r - c.g) / delta + 4.0;
    hueDeg = h * 60.0;
  }
  float skinWeight = smoothstep(5.0, 15.0, hueDeg) * (1.0 - smoothstep(45.0, 60.0, hueDeg));
  float protection = 1.0 - 0.7 * skinWeight;

  float vibFactor = 1.0 + (vibrance / 100.0) * (1.0 - currentSat) * protection;
  c = mix(vec3(luma(c)), c, vibFactor);
  return c;
}

void main() {
  vec3 color = sampleImage(vTexCoord);

  // Unconditional rather than gated behind `if (uSharpen > 0.0)`: a dynamic
  // branch wrapping this many dependent texture fetches is a known trouble
  // spot for mobile GPU drivers (observed as sharpening silently having no
  // effect at all on iOS Safari) — the branch is a pure optimization anyway,
  // since the contribution below already multiplies out to exactly zero at
  // uSharpen = 0.
  {
    // Healed taps, not raw ones: sharpening a healed pixel against its
    // un-healed neighbours would measure the very edge that was just removed
    // and draw a bright ring back around every patched spot.
    vec3 n  = sampleImage(vTexCoord + vec2(0.0, -uTexelSize.y));
    vec3 s  = sampleImage(vTexCoord + vec2(0.0,  uTexelSize.y));
    vec3 e  = sampleImage(vTexCoord + vec2( uTexelSize.x, 0.0));
    vec3 w  = sampleImage(vTexCoord + vec2(-uTexelSize.x, 0.0));
    vec3 ne = sampleImage(vTexCoord + vec2( uTexelSize.x, -uTexelSize.y));
    vec3 nw = sampleImage(vTexCoord + vec2(-uTexelSize.x, -uTexelSize.y));
    vec3 se = sampleImage(vTexCoord + vec2( uTexelSize.x,  uTexelSize.y));
    vec3 sw = sampleImage(vTexCoord + vec2(-uTexelSize.x,  uTexelSize.y));

    // 3x3 Gaussian-like blur (center 4, edges 2, corners 1, /16) instead of a
    // plain 4-tap box average, for a more accurate detail estimate.
    vec3 blur = (color * 4.0 + (n + s + e + w) * 2.0 + (ne + nw + se + sw)) / 16.0;

    // Boost luma detail only (not each channel independently) so sharpening
    // doesn't introduce colored fringing/halos along edges. A small noise
    // gate (subtract-and-clamp the threshold, matching darktable's sharpen
    // module) zeroes out tiny sensor-noise fluctuations in flat areas while
    // leaving real edges — which have much larger deltas — essentially
    // untouched, so raising Sharpen doesn't also amplify grain.
    float detail = luma(color) - luma(blur);
    float noiseThreshold = 0.006;
    float shapedDetail = sign(detail) * max(abs(detail) - noiseThreshold, 0.0);
    // Trailing scalar is the overall sharpen strength: raised from 4.0 to 5.0
    // (25% stronger across the slider's whole range) because the effect read
    // as too gentle even at 100.
    color += shapedDetail * (uSharpen / 100.0) * 5.0;
  }

  // Clamp to non-negative before the sRGB->linear round trip: pow() with a
  // negative base is undefined in GLSL, and sharpening above can push a
  // handful of dark, noisy pixels slightly below 0.
  vec3 linearColor = srgbToLinear(max(color, 0.0));
  linearColor *= pow(2.0, uExposure);
  // White balance as a chromatic adaptation transform in linear light. The
  // matrix (built on the CPU, see lib/whiteBalance.ts) converts to CAT16 cone
  // space, scales by the target-vs-D65 illuminant ratio the way the eye adapts,
  // and converts back — so neutrals hit the target white while saturated
  // colours shift correctly, rather than being distorted by naive per-channel
  // gains in the sRGB primaries.
  linearColor = uWbMatrix * linearColor;

  if (uTonemapMode == 1) {
    // AgX: a full scene-linear filmic view transform (see agxFullTransform
    // above) replaces the knee/shoulder entirely — it already handles the
    // full tonal range, so there is no separate exposure-gated knee to gate.
    linearColor = agxFullTransform(linearColor);
  } else {
    // Roll off blown highlights with the capped log-logistic shoulder (the
    // shoulder of darktable's sigmoid tone curve) while still in linear light,
    // applied as an RGB ratio so the rolloff holds colour instead of washing to
    // grey. The knee starts at 1.0 (shoulder fully inert) so at rest the decoded
    // image passes through untouched and true white still reaches 255 — no
    // resting compression. As exposure is pushed the knee drops toward 0.65, so
    // the shoulder engages automatically and boosted highlights roll off
    // smoothly to white without any channel ever hard-clipping.
    float exposureAmount = clamp(uExposure / 3.0, 0.0, 1.0);
    float knee = mix(1.0, 0.65, exposureAmount);
    linearColor = highlightShoulder(linearColor, knee);
  }
  color = linearToSrgb(linearColor);

  // Brightness lifts/lowers midtones via a gamma curve on luma (0 and 1 stay
  // fixed), unlike Exposure's uniform multiplicative gain which pushes
  // highlights toward clipping much faster. The curve is applied to luma and
  // the color rescaled to match, rather than to each RGB channel
  // independently — a per-channel gamma curve compresses the gap between
  // channels as they approach 1.0, which is a fast grey-out on bright colors.
  float brightnessGamma = pow(2.0, -uBrightness / 100.0);
  float lBeforeBrightness = luma(clamp(color, 0.0, 1.0));
  float lAfterBrightness = pow(lBeforeBrightness, brightnessGamma);
  color = scaleToLuma(color, lBeforeBrightness, lAfterBrightness);

  color = applyContrast(color, uContrast);

  color = applyHighlights(color, uHighlights);
  color = applyToneRegions(color, uShadows, uWhites, uBlacks);

  // User luma tone curve. Evaluated on luma and rescaled to match (via
  // scaleToLuma) so the curve reshapes tonality without shifting hue — the
  // camera-look presets and hand-drawn curves both stay colour-safe. Sampled
  // from a 256-entry LUT with LINEAR filtering for a smooth mapping.
  if (uCurveActive) {
    float lc = clamp(luma(color), 0.0, 1.0);
    float lcNew = texture(uCurveLut, vec2(lc, 0.5)).r;
    color = scaleToLuma(color, lc, lcNew);
  }

  color = applySaturationVibrance(color, uSaturation, uVibrance);

  // Chroma-compress anything the adjustments pushed out of range back into
  // gamut (hue- and luma-preserving), THEN clamp — the clamp is now just a
  // numerical backstop instead of the thing that mangles saturated colours.
  outColor = vec4(clamp(compressToGamut(color), 0.0, 1.0), 1.0);
}
