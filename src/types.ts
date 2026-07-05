export interface DecodedImage {
  /** Interleaved RGB pixel data, one byte or uint16 per channel per libraw outputBps */
  data: Uint8Array | Uint16Array;
  width: number;
  height: number;
  bitsPerSample: 8 | 16;
}

export interface RawMetadata {
  make?: string;
  model?: string;
  iso?: number;
  shutter?: number;
  aperture?: number;
  focalLength?: number;
  timestamp?: number;
  colors?: number;
}

export interface DecodedRaw {
  preview: DecodedImage;
  full: DecodedImage;
  metadata: RawMetadata;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditParams {
  exposure: number; // stops, -5..5
  contrast: number; // -100..100
  highlights: number; // -100..100
  shadows: number; // -100..100
  whites: number; // -100..100
  blacks: number; // -100..100
  temperature: number; // -100..100 (relative shift from as-shot)
  tint: number; // -100..100
  saturation: number; // -100..100
  vibrance: number; // -100..100
  sharpen: number; // 0..100
  rotation: number; // degrees, 0/90/180/270 plus fine rotation -45..45
  crop: CropRect | null;
}

export const DEFAULT_EDIT_PARAMS: EditParams = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
  sharpen: 0,
  rotation: 0,
  crop: null,
};
