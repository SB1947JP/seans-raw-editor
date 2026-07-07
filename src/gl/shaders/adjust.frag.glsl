#version 300 es
precision highp float;

in vec2 vTexCoord;
out vec4 outColor;

uniform sampler2D uImage;
uniform vec2 uTexelSize;

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
uniform float uSaturation;  // -100..100
uniform float uVibrance;    // -100..100
uniform float uSharpen;     // 0..100

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
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
  float factor = 1.0 + amt * 0.6; // <1 compresses (recover), >1 expands (brighten)
  float mask = smoothstep(0.3, 0.7, l);

  float lTarget = mix(l, pivot + (l - pivot) * factor, mask);
  return scaleToLuma(c, l, lTarget);
}

vec3 applyToneRegions(vec3 c, float shadows, float whites, float blacks) {
  float l = luma(c);
  // Partition-of-unity masks (the tone-equalizer approach): Blacks owns the
  // deepest tones and hands over smoothly to Shadows, which peaks in the
  // lower-mids and fades out before Whites picks up the top end. The old
  // masks overlapped heavily (Blacks' 0-0.4 range sat entirely inside
  // Shadows' 0-0.65), so pushing both sliders double-lifted the same pixels
  // and made their combined effect unpredictable.
  float blackMask = 1.0 - smoothstep(0.0, 0.3, l);
  float shadowMask = smoothstep(0.0, 0.3, l) * (1.0 - smoothstep(0.3, 0.65, l));
  float whiteMask = smoothstep(0.6, 1.0, l);

  float lTarget = l
    + softResponse(shadows / 100.0) * shadowMask * 0.4
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
  vec3 color = texture(uImage, vTexCoord).rgb;

  if (uSharpen > 0.0) {
    vec3 n  = texture(uImage, vTexCoord + vec2(0.0, -uTexelSize.y)).rgb;
    vec3 s  = texture(uImage, vTexCoord + vec2(0.0,  uTexelSize.y)).rgb;
    vec3 e  = texture(uImage, vTexCoord + vec2( uTexelSize.x, 0.0)).rgb;
    vec3 w  = texture(uImage, vTexCoord + vec2(-uTexelSize.x, 0.0)).rgb;
    vec3 ne = texture(uImage, vTexCoord + vec2( uTexelSize.x, -uTexelSize.y)).rgb;
    vec3 nw = texture(uImage, vTexCoord + vec2(-uTexelSize.x, -uTexelSize.y)).rgb;
    vec3 se = texture(uImage, vTexCoord + vec2( uTexelSize.x,  uTexelSize.y)).rgb;
    vec3 sw = texture(uImage, vTexCoord + vec2(-uTexelSize.x,  uTexelSize.y)).rgb;

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
    color += shapedDetail * (uSharpen / 100.0) * 4.0;
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
  color = applySaturationVibrance(color, uSaturation, uVibrance);

  // Chroma-compress anything the adjustments pushed out of range back into
  // gamut (hue- and luma-preserving), THEN clamp — the clamp is now just a
  // numerical backstop instead of the thing that mangles saturated colours.
  outColor = vec4(clamp(compressToGamut(color), 0.0, 1.0), 1.0);
}
