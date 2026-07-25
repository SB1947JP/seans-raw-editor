import vertSrc from './shaders/basic.vert.glsl?raw';
import fragSrc from './shaders/adjust.frag.glsl?raw';
import { DecodedImage, EditParams } from '../types';
import { getEffectiveDimensions } from '../lib/geometry';
import { computeWbMatrix } from '../lib/whiteBalance';
import { buildCurveLut, isIdentityCurve } from '../lib/curve';
import { AGX_PIPE_TO_RENDERING_MATRIX, AGX_RENDERING_TO_PIPE_MATRIX } from '../lib/agx';
import { MAX_DUST_SPOTS } from '../lib/dustSpots';
import { CurvePoint } from '../types';

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vert);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, frag);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

/**
 * Fallback path: 16-bit source truncated to 8 bits per channel. Only used if a
 * driver refuses the half-float texture below — see uploadHalfFloat().
 */
function toRgba8(image: DecodedImage): Uint8Array {
  const { width, height, data, bitsPerSample } = image;
  const pixelCount = width * height;
  const out = new Uint8Array(pixelCount * 4);
  const shift = bitsPerSample === 16 ? 8 : 0;
  for (let i = 0; i < pixelCount; i++) {
    const srcOffset = i * 3;
    const dstOffset = i * 4;
    out[dstOffset] = data[srcOffset] >> shift;
    out[dstOffset + 1] = data[srcOffset + 1] >> shift;
    out[dstOffset + 2] = data[srcOffset + 2] >> shift;
    out[dstOffset + 3] = 255;
  }
  return out;
}

// --- 16-bit image upload -----------------------------------------------------
// LibRaw decodes at 16 bits per channel (rawDecoder sets `outputBps: 16`), but
// this used to upload an 8-bit texture — throwing half the decoder's precision
// away *before* a single adjustment ran. That loss lands exactly where this
// editor is supposed to be strong: the shader's first move on the sampled pixel
// is srgbToLinear(), which *expands* dark values, so coarse 8-bit steps become
// visibly banded in linear light the moment shadows are lifted; highlight
// reconstruction (spliced in at 16 bits by the decoder) was likewise quantised
// away before Highlights could pull it back; and AgX opens with log2(), which
// quantises hardest in the shadows where its toe lives.
//
// RGBA16F keeps that precision all the way to the GPU. Half-float suits image
// data because its resolution scales with magnitude — shadows, where banding
// shows first, get far finer steps than any uniform integer format would give
// them. It is filterable in core WebGL2, so the sharpen/dust taps still sample
// with LINEAR. None of the adjustment maths changes; the shader still receives
// 0..1 values, just far more finely resolved ones.

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** IEEE 754 binary32 → binary16 bit pattern (round-toward-zero on the mantissa). */
function floatToHalfBits(value: number): number {
  f32[0] = value;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  const exp = (x >>> 23) & 0xff;
  let mant = x & 0x7fffff;
  if (exp === 0xff) return sign | 0x7c00 | (mant ? 0x200 : 0); // Inf / NaN
  const e = exp - 127 + 15;
  if (e >= 0x1f) return sign | 0x7c00; // overflows half's range → Inf
  if (e <= 0) {
    if (e < -10) return sign; // underflows to zero
    mant = (mant | 0x800000) >> (1 - e); // subnormal
    return sign | (mant >>> 13);
  }
  return sign | (e << 10) | (mant >>> 13);
}

/**
 * Maps every possible source sample (0..max) to its normalised half-float bits.
 * Precomputing is what keeps this fast: a 24 MP export converts ~73M channel
 * values, and a table lookup per channel beats a float conversion per channel.
 * The 16-bit table is only 128 KB, and both are built once, on first use.
 */
function buildHalfLut(size: number, max: number): Uint16Array {
  const lut = new Uint16Array(size);
  for (let i = 0; i < size; i++) lut[i] = floatToHalfBits(i / max);
  return lut;
}

let halfLut16: Uint16Array | null = null;
let halfLut8: Uint16Array | null = null;
function halfLutFor(bitsPerSample: 8 | 16): Uint16Array {
  if (bitsPerSample === 16) return (halfLut16 ??= buildHalfLut(65536, 65535));
  return (halfLut8 ??= buildHalfLut(256, 255));
}

/**
 * Rows per texSubImage2D band. Uploading in bands keeps the staging buffer to a
 * few MB: converting a full-res 24 MP frame in one go would mean a ~200 MB
 * typed array on top of the decoded image itself, which is exactly the kind of
 * transient allocation that fails on an iPad.
 */
const UPLOAD_BAND_ROWS = 256;

const UNIFORM_NAMES = [
  'uImage', 'uTexelSize', 'uExposure', 'uBrightness', 'uContrast', 'uHighlights', 'uShadows',
  'uWhites', 'uBlacks', 'uWbMatrix', 'uSaturation', 'uVibrance',
  'uSharpen',
  'uCurveLut', 'uCurveActive',
  'uTonemapMode', 'uAgxPipeToRendering', 'uAgxRenderingToPipe',
  'uCropScale', 'uCropOffset', 'uRotation',
  'uDustCount', 'uDustSpots', 'uDustAspect',
] as const;

export class RawRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private curveTexture: WebGLTexture;
  private lastCurve: CurvePoint[] | null = null;
  private curveActive = false;
  private vao: WebGLVertexArrayObject;
  private uniforms: Partial<Record<(typeof UNIFORM_NAMES)[number], WebGLUniformLocation | null>> = {};
  private imageWidth = 0;
  private imageHeight = 0;
  /** Scratch for the dust uniform array, reused so a render doesn't allocate. */
  private dustBuffer = new Float32Array(MAX_DUST_SPOTS * 3);

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 is not supported in this browser');
    this.gl = gl;
    this.program = createProgram(gl, vertSrc, fragSrc);
    this.texture = gl.createTexture()!;
    this.curveTexture = this.createCurveTexture();
    this.vao = this.setupGeometry();
    this.cacheUniforms();
  }

  /** 256×1 single-channel LUT texture; starts as identity, re-uploaded on change. */
  private createCurveTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    const identity = new Uint8Array(256);
    for (let i = 0; i < 256; i++) identity[i] = i;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, identity);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  /** Rebuild + upload the LUT only when the curve points actually change. */
  private updateCurve(points: CurvePoint[]) {
    if (points === this.lastCurve) return;
    this.lastCurve = points;
    this.curveActive = !isIdentityCurve(points);
    if (this.curveActive) {
      const gl = this.gl;
      // Bind on TEXTURE1, not the currently-active unit — otherwise this would
      // evict the image texture bound on TEXTURE0 and the shader would sample
      // the LUT as the image.
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.curveTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RED, gl.UNSIGNED_BYTE, buildCurveLut(points));
    }
  }

  private setupGeometry(): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    // Fullscreen quad. Texcoord v is paired so that image row 0 (top) lands
    // at the top of the screen with no vertical flip needed at upload time.
    const verts = new Float32Array([
      // x,  y,   u, v
      -1, -1, 0, 1,
      1, -1, 1, 1,
      -1, 1, 0, 0,
      1, 1, 1, 0,
    ]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(this.program, 'aPosition');
    const texLoc = gl.getAttribLocation(this.program, 'aTexCoord');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);
    return vao;
  }

  private cacheUniforms() {
    const gl = this.gl;
    for (const name of UNIFORM_NAMES) {
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    }
  }

  /**
   * Uploads the decoded image as RGBA16F, band by band. Returns false (leaving
   * the texture to be redefined by the 8-bit path) if the driver rejects the
   * format — half-float sampling is core WebGL2, but this renderer has already
   * been bitten once by a mobile driver quietly not doing what the spec says,
   * so the cheap guard earns its place.
   */
  private uploadHalfFloat(image: DecodedImage): boolean {
    const gl = this.gl;
    const { width, height, data, bitsPerSample } = image;
    const lut = halfLutFor(bitsPerSample);

    while (gl.getError() !== gl.NO_ERROR) {
      /* drain any pre-existing error so the checks below are about this upload */
    }

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    if (gl.getError() !== gl.NO_ERROR) return false;

    const bandRows = Math.min(UPLOAD_BAND_ROWS, height);
    const band = new Uint16Array(width * bandRows * 4);
    const opaque = lut[lut.length - 1]; // half bits for 1.0

    for (let y = 0; y < height; y += bandRows) {
      const rows = Math.min(bandRows, height - y);
      let src = y * width * 3;
      let dst = 0;
      for (let i = 0; i < rows * width; i++) {
        band[dst++] = lut[data[src++]];
        band[dst++] = lut[data[src++]];
        band[dst++] = lut[data[src++]];
        band[dst++] = opaque;
      }
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y, width, rows, gl.RGBA, gl.HALF_FLOAT, band);
      if (gl.getError() !== gl.NO_ERROR) return false;
    }
    return true;
  }

  setImage(image: DecodedImage) {
    const gl = this.gl;
    this.imageWidth = image.width;
    this.imageHeight = image.height;

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (!this.uploadHalfFloat(image)) {
      const rgba = toRgba8(image);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, image.width, image.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // LibRaw already outputs upright pixel data (it applies the camera's
    // stored orientation itself), so the canvas just matches image dims.
    this.canvas.width = image.width;
    this.canvas.height = image.height;
  }

  /**
   * @param applyCrop When true (export), the canvas is resized to the crop
   * rect's own aspect ratio and only that region is sampled. When false
   * (interactive editing), the full rotated frame is always shown so the
   * crop-box overlay has room to drag outward — the crop itself is only
   * "baked in" at export time.
   */
  render(params: EditParams, applyCrop = true) {
    const gl = this.gl;
    const crop = applyCrop ? params.crop : null;

    // Size the canvas to the crop's own aspect ratio, not the source image's,
    // otherwise a non-matching crop rect gets stretched to fill the old frame.
    const { width, height } = getEffectiveDimensions(
      { width: this.imageWidth, height: this.imageHeight },
      crop,
    );
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniforms.uImage!, 0);
    gl.uniform2f(this.uniforms.uTexelSize!, 1 / this.imageWidth, 1 / this.imageHeight);

    this.updateCurve(params.lumaCurve);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.curveTexture);
    gl.uniform1i(this.uniforms.uCurveLut!, 1);
    gl.uniform1i(this.uniforms.uCurveActive!, this.curveActive ? 1 : 0);

    gl.uniform1f(this.uniforms.uExposure!, params.exposure);
    gl.uniform1f(this.uniforms.uBrightness!, params.brightness);
    gl.uniform1f(this.uniforms.uContrast!, params.contrast);
    gl.uniform1f(this.uniforms.uHighlights!, params.highlights);
    gl.uniform1f(this.uniforms.uShadows!, params.shadows);
    gl.uniform1f(this.uniforms.uWhites!, params.whites);
    gl.uniform1f(this.uniforms.uBlacks!, params.blacks);
    gl.uniformMatrix3fv(this.uniforms.uWbMatrix!, false, computeWbMatrix(params.temperature, params.tint));
    gl.uniform1f(this.uniforms.uSaturation!, params.saturation);
    gl.uniform1f(this.uniforms.uVibrance!, params.vibrance);
    gl.uniform1f(this.uniforms.uSharpen!, params.sharpen);

    gl.uniform1i(this.uniforms.uTonemapMode!, params.tonemapMode === 'agx' ? 1 : 0);
    gl.uniformMatrix3fv(this.uniforms.uAgxPipeToRendering!, false, AGX_PIPE_TO_RENDERING_MATRIX);
    gl.uniformMatrix3fv(this.uniforms.uAgxRenderingToPipe!, false, AGX_RENDERING_TO_PIPE_MATRIX);

    gl.uniform1f(this.uniforms.uRotation!, (params.rotation * Math.PI) / 180);

    // Dust spots are normalized to the source image, so the same list drives
    // the half-res preview and the full-res export with no rescaling.
    const spots = params.dustSpots ?? [];
    const count = Math.min(spots.length, MAX_DUST_SPOTS);
    gl.uniform1i(this.uniforms.uDustCount!, count);
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        this.dustBuffer[i * 3] = spots[i].x;
        this.dustBuffer[i * 3 + 1] = spots[i].y;
        this.dustBuffer[i * 3 + 2] = spots[i].r;
      }
      gl.uniform3fv(this.uniforms.uDustSpots!, this.dustBuffer.subarray(0, count * 3));
      gl.uniform1f(this.uniforms.uDustAspect!, this.imageHeight / this.imageWidth);
    }

    if (crop) {
      gl.uniform2f(this.uniforms.uCropScale!, crop.width, crop.height);
      gl.uniform2f(this.uniforms.uCropOffset!, crop.x + crop.width / 2, crop.y + crop.height / 2);
    } else {
      gl.uniform2f(this.uniforms.uCropScale!, 1, 1);
      gl.uniform2f(this.uniforms.uCropOffset!, 0.5, 0.5);
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  readPixels(): { data: Uint8Array; width: number; height: number } {
    const gl = this.gl;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const data = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return { data, width, height };
  }

  toDataUrl(type: string, quality?: number): string {
    return this.canvas.toDataURL(type, quality);
  }

  toBlob(type: string, quality?: number): Promise<Blob | null> {
    return new Promise((resolve) => this.canvas.toBlob(resolve, type, quality));
  }

  /**
   * Encode the current render, optionally downscaled so its longer edge is at
   * most `maxEdge` px — the export "size" tiers. `maxEdge` null (or already
   * within it) encodes at full resolution. Downscaling from the full-res render
   * (rather than rendering smaller) keeps the best resampling quality; the
   * offscreen GL canvas is never composited, so its buffer is still readable by
   * drawImage here, exactly as toBlob reads it. Dimensions are the *rendered*
   * ones, so a baked-in crop is measured at its own size, not the source's.
   */
  toBlobAtSize(maxEdge: number | null, type: string, quality?: number): Promise<Blob | null> {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!maxEdge || Math.max(w, h) <= maxEdge) return this.toBlob(type, quality);

    const scale = maxEdge / Math.max(w, h);
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const out = document.createElement('canvas');
    out.width = tw;
    out.height = th;
    const ctx = out.getContext('2d');
    if (!ctx) return this.toBlob(type, quality); // fall back to full size rather than fail
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.canvas, 0, 0, tw, th);
    return new Promise((resolve) => out.toBlob(resolve, type, quality));
  }

  dispose() {
    const gl = this.gl;
    gl.deleteTexture(this.texture);
    gl.deleteTexture(this.curveTexture);
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
  }
}
