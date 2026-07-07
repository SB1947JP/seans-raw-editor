function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Blackbody colour at a given temperature as an sRGB triplet in [0,1], using
 * Tanner Helland's curve-fit of the Planckian locus (accurate to a few ΔE over
 * 1000–40000K). This is what makes the Temperature slider track real Kelvin
 * illuminants — candlelight, tungsten, daylight, overcast sky — instead of an
 * ad-hoc opposing R/B gain.
 */
function kelvinToSrgb(kelvin: number): [number, number, number] {
  const k = clamp(kelvin, 1000, 40000) / 100;
  const r = k <= 66 ? 255 : 329.698727446 * Math.pow(k - 60, -0.1332047592);
  const g =
    k <= 66
      ? 99.4708025861 * Math.log(k) - 161.1195681661
      : 288.1221695283 * Math.pow(k - 60, -0.0755148492);
  const b = k >= 66 ? 255 : k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  return [clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(b, 0, 255) / 255];
}

// --- 3×3 linear algebra (row-major) ------------------------------------------
type Mat3 = [number, number, number, number, number, number, number, number, number];
type Vec3 = [number, number, number];

function mul(a: Mat3, b: Mat3): Mat3 {
  const r = [0, 0, 0, 0, 0, 0, 0, 0, 0] as Mat3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += a[i * 3 + k] * b[k * 3 + j];
      r[i * 3 + j] = s;
    }
  return r;
}

function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

// Linear sRGB (D65) ↔ CIE XYZ.
const RGB_TO_XYZ: Mat3 = [
  0.4124564, 0.3575761, 0.1804375,
  0.2126729, 0.7151522, 0.072175,
  0.0193339, 0.119192, 0.9503041,
];
const XYZ_TO_RGB: Mat3 = [
  3.2404542, -1.5371385, -0.4985314,
  -0.969266, 1.8760108, 0.041556,
  0.0556434, -0.2040259, 1.0572252,
];

// CIE XYZ ↔ CAT16 cone responses (LMS). CAT16 (Li et al. 2017) is darktable's
// default adaptation matrix — more robust than Bradford at avoiding imaginary
// colours on saturated cyans/purples.
const XYZ_TO_LMS: Mat3 = [
  0.401288, 0.650173, -0.051461,
  -0.250268, 1.204414, 0.045854,
  -0.002079, 0.048952, 0.953127,
];
const LMS_TO_XYZ: Mat3 = [
  1.8620679, -1.0112547, 0.1491868,
  0.3875265, 0.6214474, -0.0089739,
  -0.0158415, -0.0341229, 1.0499644,
];

/**
 * White-balance transform for the shader, as a 3×3 linear-sRGB matrix
 * implementing a proper **chromatic adaptation transform** (von Kries in CAT16
 * cone space), i.e. darktable's "color calibration" approach rather than naive
 * per-channel RGB gains.
 *
 * The Temperature slider still moves along the Planckian locus in MIREDs
 * (1e6/Kelvin) around D65 (slider 0 = 6500K; +100 warms to ~3900K, -100 cools
 * to ~18600K), so warmth direction and strength are unchanged. What changes is
 * *how* the shift is applied: the image is converted to LMS cone responses and
 * scaled by the ratio of the target illuminant's cone response to D65's — the
 * same operation the human visual system performs when adapting to a new light.
 * A neutral maps to the target white exactly as a per-channel gain would, but
 * saturated colours now shift the way a real illuminant change moves them,
 * instead of being distorted by the sRGB primaries (which skewed saturated
 * blues/cyans and skin under large temperature shifts). Tint remains a
 * green–magenta scale on the medium-wavelength (green) cone, the axis
 * perpendicular to the locus.
 *
 * Returned column-major for direct upload via uniformMatrix3fv.
 */
export function computeWbMatrix(temperature: number, tint: number): Float32Array {
  const MIRED_D65 = 1e6 / 6500;
  const kelvin = 1e6 / (MIRED_D65 + temperature);

  // Source and target illuminant white points in XYZ, both at Y = 1 so the
  // adaptation is purely chromatic and never changes overall brightness. The
  // source uses the SAME Planckian curve-fit evaluated at 6500K rather than
  // exact D65, so at temperature 0 the source and target coincide and the
  // matrix is an exact identity — the curve-fit's approximation error cancels
  // and the neutral default is a true no-op.
  const toXYZ = (kelvinValue: number): Vec3 => {
    const lin = kelvinToSrgb(kelvinValue).map(srgbToLinear) as Vec3;
    const xyz = apply(RGB_TO_XYZ, lin);
    return [xyz[0] / xyz[1], 1, xyz[2] / xyz[1]];
  };
  const srcXYZ = toXYZ(6500);
  const destXYZ = toXYZ(kelvin);

  const srcLMS = apply(XYZ_TO_LMS, srcXYZ);
  const destLMS = apply(XYZ_TO_LMS, destXYZ);

  const gain: Vec3 = [destLMS[0] / srcLMS[0], destLMS[1] / srcLMS[1], destLMS[2] / srcLMS[2]];
  // Green–magenta on the M (green) cone. A gentle linear scale: cone-space
  // gains ripple through the LMS↔RGB conversion, so the old direct-per-channel
  // coefficient (0.003 with a 2.2 power) over-rotated a near-neutral pixel all
  // the way to pure green here; ~0.0013 gives the same usable ±range without
  // clipping a channel.
  gain[1] *= 1 + tint * 0.0013;

  const diag: Mat3 = [gain[0], 0, 0, 0, gain[1], 0, 0, 0, gain[2]];

  // linear sRGB → XYZ → LMS → (von Kries scale) → XYZ → linear sRGB
  let m = mul(XYZ_TO_RGB, mul(LMS_TO_XYZ, mul(diag, mul(XYZ_TO_LMS, RGB_TO_XYZ))));

  // Normalise so a neutral white keeps luminance 1 (tint's cone scale can
  // otherwise nudge overall brightness).
  const white = apply(m, [1, 1, 1]);
  const ly = 0.2126 * white[0] + 0.7152 * white[1] + 0.0722 * white[2];
  if (ly > 1e-5) m = m.map((v) => v / ly) as Mat3;

  // Row-major → column-major for GLSL mat3.
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}
