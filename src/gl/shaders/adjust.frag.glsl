#version 300 es
precision highp float;

in vec2 vTexCoord;
out vec4 outColor;

uniform sampler2D uImage;
uniform vec2 uTexelSize;

uniform float uExposure;    // stops
uniform float uContrast;    // -100..100
uniform float uHighlights;  // -100..100
uniform float uShadows;     // -100..100
uniform float uWhites;      // -100..100
uniform float uBlacks;      // -100..100
uniform float uTemperature; // -100..100
uniform float uTint;        // -100..100
uniform float uSaturation;  // -100..100
uniform float uVibrance;    // -100..100
uniform float uSharpen;     // 0..100

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 applyWhiteBalance(vec3 c, float temp, float tint) {
  vec3 gain = vec3(
    1.0 + temp * 0.004,
    1.0 + tint * 0.003,
    1.0 - temp * 0.004
  );
  return c * gain;
}

vec3 applyToneRegions(vec3 c, float highlights, float shadows, float whites, float blacks) {
  float l = luma(c);
  float highlightMask = smoothstep(0.35, 1.0, l);
  float shadowMask = 1.0 - smoothstep(0.0, 0.65, l);
  float whiteMask = smoothstep(0.6, 1.0, l);
  float blackMask = 1.0 - smoothstep(0.0, 0.4, l);

  c += vec3((highlights / 100.0) * highlightMask * -0.35);
  c += vec3((shadows / 100.0) * shadowMask * 0.35);
  c += vec3((whites / 100.0) * whiteMask * 0.5);
  c += vec3((blacks / 100.0) * blackMask * -0.5);
  return c;
}

vec3 applySaturationVibrance(vec3 c, float saturation, float vibrance) {
  float l = luma(c);
  vec3 grey = vec3(l);
  float satFactor = 1.0 + saturation / 100.0;
  c = mix(grey, c, satFactor);

  float maxChannel = max(c.r, max(c.g, c.b));
  float minChannel = min(c.r, min(c.g, c.b));
  float currentSat = maxChannel - minChannel;
  float vibFactor = 1.0 + (vibrance / 100.0) * (1.0 - currentSat);
  c = mix(vec3(luma(c)), c, vibFactor);
  return c;
}

void main() {
  vec3 color = texture(uImage, vTexCoord).rgb;

  if (uSharpen > 0.0) {
    vec3 n = texture(uImage, vTexCoord + vec2(0.0, -uTexelSize.y)).rgb;
    vec3 s = texture(uImage, vTexCoord + vec2(0.0, uTexelSize.y)).rgb;
    vec3 e = texture(uImage, vTexCoord + vec2(uTexelSize.x, 0.0)).rgb;
    vec3 w = texture(uImage, vTexCoord + vec2(-uTexelSize.x, 0.0)).rgb;
    vec3 blur = (n + s + e + w) * 0.25;
    color += (color - blur) * (uSharpen / 100.0) * 1.5;
  }

  color *= pow(2.0, uExposure);
  color = applyWhiteBalance(color, uTemperature, uTint);

  float contrastFactor = tan((clamp(uContrast, -99.0, 99.0) / 100.0 + 1.0) * 0.78539816);
  color = (color - 0.5) * contrastFactor + 0.5;

  color = applyToneRegions(color, uHighlights, uShadows, uWhites, uBlacks);
  color = applySaturationVibrance(color, uSaturation, uVibrance);

  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
