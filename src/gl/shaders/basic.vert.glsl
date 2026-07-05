#version 300 es

// Fullscreen quad in clip space. aTexCoord spans 0..1 across the OUTPUT
// frame (i.e. after crop/rotation are undone to find the matching sample
// in the source texture). The source texture is already upright: LibRaw
// applies the camera's stored orientation itself when decoding.
//
// Rotation is applied BEFORE crop so uCropScale/uCropOffset are defined in
// already-rotated display space — that's what lets a simple on-screen
// rectangle (the crop box UI) match crop.x/y/width/height directly, with no
// extra rotation math needed regardless of the current fine-rotation value.
in vec2 aPosition;
in vec2 aTexCoord;

uniform vec2 uCropScale;   // size of the crop rect, normalized to rotated image size
uniform vec2 uCropOffset;  // center of the crop rect, normalized to rotated image size (0.5,0.5 = full image)
uniform float uRotation;   // fine rotation, radians

out vec2 vTexCoord;

void main() {
  vec2 centered = aTexCoord - 0.5;
  vec2 rotatedCoord = centered * uCropScale + (uCropOffset - 0.5);

  float c = cos(-uRotation);
  float s = sin(-uRotation);
  vec2 unrotated = mat2(c, -s, s, c) * rotatedCoord;

  vTexCoord = unrotated + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
