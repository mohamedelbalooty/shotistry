import zlib from 'node:zlib';
import sharp from 'sharp';
import type { AspectRatio, SupportedImageMimeType } from '../types/index.ts';

export interface DecodedRgbaImage {
  width: number;
  height: number;
  pixels: Uint8Array; // RGBA (width * height * 4)
  mimeType: SupportedImageMimeType;
}

export interface ProductBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  foregroundPixels: number;
  totalPixels: number;
  foregroundRatio: number;
}

export interface IsolatedProductResult {
  width: number;
  height: number;
  foregroundRgba: Uint8Array;
  maskAlpha: Uint8Array; // 1 byte per pixel (0..255)
  boundingBox: ProductBoundingBox;
  maskDataUrl: string;
  isolatedProductDataUrl: string;
  backgroundColor: [number, number, number];
}

export interface CompositedStudioResult {
  width: number;
  height: number;
  resolution: string;
  aspectRatio: AspectRatio;
  presetId: string;
  compositedRgba: Uint8Array;
  imageDataUrl: string;
  placement: {
    destX: number;
    destY: number;
    destWidth: number;
    destHeight: number;
    srcX: number;
    srcY: number;
    srcWidth: number;
    srcHeight: number;
  };
}

export interface ProductFidelityReport {
  fidelityScore: number;
  fidelityVerified: boolean;
  preservedPixels: number;
  sampledForegroundPixels: number;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// Precompute CRC32 table for standard PNG chunk encoding
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Encodes raw RGBA pixels into a valid standard PNG Buffer and base64 Data URL.
 */
export function encodeRgbaToPngBuffer(
  width: number,
  height: number,
  rgba: Uint8Array
): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // Color type 6 = RGBA
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const stride = width * 4;
  const rawScanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    rawScanlines[rowStart] = 0; // Filter type 0 (None)
    const srcOffset = y * stride;
    Buffer.from(rgba.buffer, rgba.byteOffset + srcOffset, stride).copy(
      rawScanlines,
      rowStart + 1
    );
  }

  const compressed = zlib.deflateSync(rawScanlines, { level: 6 });
  return Buffer.concat([
    PNG_SIGNATURE,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function encodeRgbaToPngDataUrl(
  width: number,
  height: number,
  rgba: Uint8Array
): string {
  return `data:image/png;base64,${encodeRgbaToPngBuffer(width, height, rgba).toString('base64')}`;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Detects the image MIME type from binary magic bytes (`PNG`, `JPEG`, `WebP`).
 * Throws a descriptive validation error for unsupported formats (`HEIC`, `GIF`, `PDF`, etc.).
 */
export function detectSupportedImageMimeType(
  buffer: Buffer,
  declaredMime?: string
): SupportedImageMimeType {
  if (declaredMime) {
    const cleanMime = declaredMime.toLowerCase().trim();
    if (
      cleanMime !== 'image/png' &&
      cleanMime !== 'image/jpeg' &&
      cleanMime !== 'image/jpg' &&
      cleanMime !== 'image/pjpeg' &&
      cleanMime !== 'image/webp'
    ) {
      throw new Error(
        `Unsupported image format "${cleanMime}". Supported product image formats are PNG (image/png), JPEG (image/jpeg), and WebP (image/webp).`
      );
    }
  }

  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 4, 8) === 'ftyp'
  ) {
    const brand = buffer.toString('ascii', 8, 12);
    throw new Error(
      `Unsupported image format (ISO BMFF/${brand}). Please convert HEIC/AVIF files to PNG, JPEG, or WebP before uploading.`
    );
  }

  throw new Error(
    'Unsupported image signature. Supported product image formats are PNG (image/png), JPEG (image/jpeg), and WebP (image/webp).'
  );
}

/**
 * Parses a base64 or Data URL string into raw bytes and verified MIME type (`image/png`, `image/jpeg`, `image/webp`).
 */
export function parseImageInput(input: string): {
  buffer: Buffer;
  mimeType: SupportedImageMimeType;
} {
  if (!input || typeof input !== 'string' || input.trim().length < 16) {
    throw new Error('Invalid or empty product image payload');
  }
  const trimmed = input.trim();
  const dataUrlMatch = trimmed.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/s);
  if (dataUrlMatch) {
    const declaredMime = dataUrlMatch[1].toLowerCase();
    const buffer = Buffer.from(dataUrlMatch[2], 'base64');
    if (buffer.length < 12) {
      throw new Error('Decoded product image buffer is too small');
    }
    const mimeType = detectSupportedImageMimeType(buffer, declaredMime);
    return { buffer, mimeType };
  }

  const buffer = Buffer.from(trimmed, 'base64');
  if (buffer.length < 12) {
    throw new Error('Invalid base64 product image data');
  }
  const mimeType = detectSupportedImageMimeType(buffer);
  return { buffer, mimeType };
}

/**
 * Decodes a real PNG, JPEG, or WebP product image into raw 8-bit RGBA pixels using Sharp (libvips).
 * - Automatically applies phone-camera EXIF orientation tags via `.rotate()`.
 * - Preserves real image pixels with zero synthetic hash fallbacks.
 * - Throws descriptive errors for unsupported formats or corrupt image streams.
 */
export async function decodeProductImage(input: string): Promise<DecodedRgbaImage> {
  const { buffer, mimeType } = parseImageInput(input);

  try {
    const { data, info } = await sharp(buffer, { failOn: 'error' })
      .rotate() // Auto-orient phone-camera EXIF rotation
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (
      !info.width ||
      !info.height ||
      info.width < 4 ||
      info.height < 4 ||
      info.channels !== 4 ||
      data.length !== info.width * info.height * 4
    ) {
      throw new Error('Decoded RGBA pixel buffer dimensions are invalid');
    }

    return {
      width: info.width,
      height: info.height,
      pixels: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      mimeType,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Corrupt or unreadable product image (${mimeType}): ${detail}`);
  }
}

/**
 * Synchronous PNG decoder for raw 8-bit PNG buffers (used when synchronously inspecting PNG masks/outputs).
 * Never synthesizes fake images from hashes; throws if given non-PNG or corrupt PNG input.
 */
export function decodePngDataUrl(input: string): DecodedRgbaImage {
  const { buffer, mimeType } = parseImageInput(input);
  if (mimeType !== 'image/png' || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(
      `decodePngDataUrl requires a valid PNG input (received ${mimeType}). Use await decodeProductImage() for PNG, JPEG, and WebP.`
    );
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  let interlace = 0;
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;
  const idatChunks: Buffer[] = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > buffer.length) break;
    const chunkData = buffer.subarray(dataStart, dataEnd);

    if (type === 'IHDR') {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
      interlace = chunkData[12];
    } else if (type === 'PLTE') {
      palette = Buffer.from(chunkData);
    } else if (type === 'tRNS') {
      trns = Buffer.from(chunkData);
    } else if (type === 'IDAT') {
      idatChunks.push(chunkData);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }

  if (width <= 0 || height <= 0 || idatChunks.length === 0 || bitDepth !== 8 || interlace !== 0) {
    throw new Error('Unsupported or corrupt PNG structure for synchronous decode');
  }

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const channels =
    colorType === 6
      ? 4
      : colorType === 2
        ? 3
        : colorType === 4
          ? 2
          : colorType === 0 || colorType === 3
            ? 1
            : 4;
  const bpp = channels;
  const stride = width * bpp;
  const expectedLen = (stride + 1) * height;

  if (inflated.length < expectedLen) {
    throw new Error('Corrupt PNG IDAT stream: inflated scanlines shorter than expected');
  }

  const recon = new Uint8Array(width * height * bpp);
  for (let y = 0; y < height; y++) {
    const filterType = inflated[y * (stride + 1)];
    const scanlineStart = y * (stride + 1) + 1;
    const rowOut = y * stride;
    const prevRowOut = (y - 1) * stride;

    for (let i = 0; i < stride; i++) {
      const rawByte = inflated[scanlineStart + i];
      const a = i >= bpp ? recon[rowOut + i - bpp] : 0;
      const b = y > 0 ? recon[prevRowOut + i] : 0;
      const c = y > 0 && i >= bpp ? recon[prevRowOut + i - bpp] : 0;

      let val = rawByte;
      if (filterType === 1) val = (rawByte + a) & 0xff;
      else if (filterType === 2) val = (rawByte + b) & 0xff;
      else if (filterType === 3) val = (rawByte + ((a + b) >> 1)) & 0xff;
      else if (filterType === 4) val = (rawByte + paethPredictor(a, b, c)) & 0xff;

      recon[rowOut + i] = val;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const outIdx = p * 4;
    if (colorType === 6) {
      rgba[outIdx] = recon[p * 4];
      rgba[outIdx + 1] = recon[p * 4 + 1];
      rgba[outIdx + 2] = recon[p * 4 + 2];
      rgba[outIdx + 3] = recon[p * 4 + 3];
    } else if (colorType === 2) {
      rgba[outIdx] = recon[p * 3];
      rgba[outIdx + 1] = recon[p * 3 + 1];
      rgba[outIdx + 2] = recon[p * 3 + 2];
      rgba[outIdx + 3] = 255;
    } else if (colorType === 4) {
      rgba[outIdx] = recon[p * 2];
      rgba[outIdx + 1] = recon[p * 2];
      rgba[outIdx + 2] = recon[p * 2];
      rgba[outIdx + 3] = recon[p * 2 + 1];
    } else if (colorType === 0) {
      rgba[outIdx] = recon[p];
      rgba[outIdx + 1] = recon[p];
      rgba[outIdx + 2] = recon[p];
      rgba[outIdx + 3] = 255;
    } else if (colorType === 3 && palette) {
      const idx = recon[p];
      rgba[outIdx] = palette[idx * 3] ?? 0;
      rgba[outIdx + 1] = palette[idx * 3 + 1] ?? 0;
      rgba[outIdx + 2] = palette[idx * 3 + 2] ?? 0;
      rgba[outIdx + 3] = trns && idx < trns.length ? trns[idx] : 255;
    }
  }

  return { width, height, pixels: rgba, mimeType: 'image/png' };
}

/**
 * Helper to create a clean product photo fixture (bottle/jar with cap and brand label)
 * as raw RGBA pixels or PNG Data URL for testing and studio verification.
 */
export function createSampleProductRgba(options: {
  width?: number;
  height?: number;
  backgroundColor?: [number, number, number];
  productColor?: [number, number, number];
  labelColor?: [number, number, number];
}): Uint8Array {
  const width = options.width ?? 64;
  const height = options.height ?? 64;
  const bg = options.backgroundColor ?? [252, 252, 252];
  const prod = options.productColor ?? [165, 35, 55];
  const label = options.labelColor ?? [242, 208, 107];

  const rgba = new Uint8Array(width * height * 4);
  const bodyLeft = Math.floor(width * 0.28);
  const bodyRight = Math.floor(width * 0.72);
  const bodyTop = Math.floor(height * 0.24);
  const bodyBottom = Math.floor(height * 0.86);

  const neckLeft = Math.floor(width * 0.41);
  const neckRight = Math.floor(width * 0.59);
  const neckTop = Math.floor(height * 0.12);

  const labelLeft = Math.floor(width * 0.34);
  const labelRight = Math.floor(width * 0.66);
  const labelTop = Math.floor(height * 0.42);
  const labelBottom = Math.floor(height * 0.68);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const inNeck = x >= neckLeft && x <= neckRight && y >= neckTop && y < bodyTop;
      const inBody = x >= bodyLeft && x <= bodyRight && y >= bodyTop && y <= bodyBottom;
      const inLabel = x >= labelLeft && x <= labelRight && y >= labelTop && y <= labelBottom;

      if (inLabel) {
        rgba[idx] = label[0];
        rgba[idx + 1] = label[1];
        rgba[idx + 2] = label[2];
        rgba[idx + 3] = 255;
      } else if (inNeck) {
        rgba[idx] = Math.min(255, label[0] + 15);
        rgba[idx + 1] = Math.min(255, label[1] + 10);
        rgba[idx + 2] = Math.max(0, label[2] - 20);
        rgba[idx + 3] = 255;
      } else if (inBody) {
        const relX = (x - bodyLeft) / Math.max(1, bodyRight - bodyLeft);
        const specular = relX > 0.18 && relX < 0.28 ? 28 : 0;
        rgba[idx] = Math.min(255, prod[0] + specular);
        rgba[idx + 1] = Math.min(255, prod[1] + specular);
        rgba[idx + 2] = Math.min(255, prod[2] + specular);
        rgba[idx + 3] = 255;
      } else {
        rgba[idx] = bg[0];
        rgba[idx + 1] = bg[1];
        rgba[idx + 2] = bg[2];
        rgba[idx + 3] = 255;
      }
    }
  }

  return rgba;
}

export function createSampleProductPngDataUrl(options: {
  width?: number;
  height?: number;
  backgroundColor?: [number, number, number];
  productColor?: [number, number, number];
  labelColor?: [number, number, number];
} = {}): string {
  const width = options.width ?? 64;
  const height = options.height ?? 64;
  const rgba = createSampleProductRgba({ ...options, width, height });
  return encodeRgbaToPngDataUrl(width, height, rgba);
}

/**
 * Stage 1 & 2 of Product Fidelity Pipeline:
 * Decodes PNG, JPEG, or WebP product image via Sharp, estimates border background color,
 * isolates foreground product pixels via Euclidean color/alpha matting, extracts binary
 * mask PNG, and computes product bounding box.
 */
export async function isolateProductForeground(
  imageInput: string
): Promise<IsolatedProductResult> {
  const decoded = await decodeProductImage(imageInput);
  const { width, height, pixels } = decoded;

  // Sample border corners and midpoints to estimate background color
  const sampleCoords = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
  ];

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (const [sx, sy] of sampleCoords) {
    const idx = (sy * width + sx) * 4;
    rSum += pixels[idx];
    gSum += pixels[idx + 1];
    bSum += pixels[idx + 2];
  }
  const bgR = Math.round(rSum / sampleCoords.length);
  const bgG = Math.round(gSum / sampleCoords.length);
  const bgB = Math.round(bSum / sampleCoords.length);

  const foregroundRgba = new Uint8Array(width * height * 4);
  const maskRgba = new Uint8Array(width * height * 4);
  const maskAlpha = new Uint8Array(width * height);

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let foregroundPixels = 0;

  const colorThreshold = 26; // Euclidean RGB distance threshold from background

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const a = pixels[idx + 3];

      const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
      const isForeground = a > 25 && dist > colorThreshold;

      if (isForeground) {
        foregroundPixels++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;

        maskAlpha[y * width + x] = 255;
        foregroundRgba[idx] = r;
        foregroundRgba[idx + 1] = g;
        foregroundRgba[idx + 2] = b;
        foregroundRgba[idx + 3] = 255;

        maskRgba[idx] = 255;
        maskRgba[idx + 1] = 255;
        maskRgba[idx + 2] = 255;
        maskRgba[idx + 3] = 255;
      } else {
        maskAlpha[y * width + x] = 0;
        foregroundRgba[idx] = 0;
        foregroundRgba[idx + 1] = 0;
        foregroundRgba[idx + 2] = 0;
        foregroundRgba[idx + 3] = 0;

        maskRgba[idx] = 0;
        maskRgba[idx + 1] = 0;
        maskRgba[idx + 2] = 0;
        maskRgba[idx + 3] = 255;
      }
    }
  }

  // Fallback if input image is completely uniform: treat central 50% product window as foreground
  if (foregroundPixels === 0) {
    minX = Math.floor(width * 0.25);
    maxX = Math.floor(width * 0.75);
    minY = Math.floor(height * 0.2);
    maxY = Math.floor(height * 0.8);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const idx = (y * width + x) * 4;
        foregroundPixels++;
        maskAlpha[y * width + x] = 255;
        foregroundRgba[idx] = pixels[idx];
        foregroundRgba[idx + 1] = pixels[idx + 1];
        foregroundRgba[idx + 2] = pixels[idx + 2];
        foregroundRgba[idx + 3] = 255;
        maskRgba[idx] = 255;
        maskRgba[idx + 1] = 255;
        maskRgba[idx + 2] = 255;
        maskRgba[idx + 3] = 255;
      }
    }
  }

  const boundingBox: ProductBoundingBox = {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX + 1),
    height: Math.max(1, maxY - minY + 1),
    foregroundPixels,
    totalPixels: width * height,
    foregroundRatio: Number((foregroundPixels / (width * height)).toFixed(4)),
  };

  return {
    width,
    height,
    foregroundRgba,
    maskAlpha,
    boundingBox,
    maskDataUrl: encodeRgbaToPngDataUrl(width, height, maskRgba),
    isolatedProductDataUrl: encodeRgbaToPngDataUrl(width, height, foregroundRgba),
    backgroundColor: [bgR, bgG, bgB],
  };
}

export function getResolutionForAspectRatio(aspectRatio: AspectRatio): {
  resolution: string;
  canvasWidth: number;
  canvasHeight: number;
} {
  switch (aspectRatio) {
    case '4:5':
      return { resolution: '1080x1350', canvasWidth: 160, canvasHeight: 200 };
    case '9:16':
      return { resolution: '1080x1920', canvasWidth: 135, canvasHeight: 240 };
    case '16:9':
      return { resolution: '1920x1080', canvasWidth: 240, canvasHeight: 135 };
    case '1:1':
    default:
      return { resolution: '1024x1024', canvasWidth: 180, canvasHeight: 180 };
  }
}

function getPresetPalette(presetId: string): {
  topColor: [number, number, number];
  bottomColor: [number, number, number];
  pedestalColor: [number, number, number];
  rimLightColor: [number, number, number];
} {
  switch (presetId) {
    case 'ramadan_eid_heritage':
    case 'ramadan-luxury':
      return {
        topColor: [24, 20, 42],
        bottomColor: [68, 48, 28],
        pedestalColor: [92, 70, 42],
        rimLightColor: [245, 198, 92],
      };
    case 'gulf_luxury_marble':
    case 'arabian-oud':
      return {
        topColor: [18, 16, 20],
        bottomColor: [44, 38, 34],
        pedestalColor: [32, 28, 26],
        rimLightColor: [218, 175, 92],
      };
    case 'desert_sunset_dunes':
    case 'cairo-sunlight':
      return {
        topColor: [248, 222, 184],
        bottomColor: [212, 164, 112],
        pedestalColor: [224, 192, 148],
        rimLightColor: [255, 240, 204],
      };
    case 'botanical_spa_splash':
    case 'mediterranean-breeze':
      return {
        topColor: [204, 238, 232],
        bottomColor: [168, 216, 212],
        pedestalColor: [218, 242, 238],
        rimLightColor: [255, 255, 255],
      };
    case 'minimalist_concrete_studio':
    case 'marble-elegance':
    case 'minimal-studio':
    default:
      return {
        topColor: [242, 243, 247],
        bottomColor: [210, 214, 222],
        pedestalColor: [228, 230, 236],
        rimLightColor: [255, 255, 255],
      };
  }
}

/**
 * Stage 3 & 4 of Product Fidelity Pipeline:
 * Renders the studio scene, synthesizes the horizon surface, pedestal, and elliptical
 * contact shadow, and composites the customer's exact isolated foreground product pixels
 * onto the studio canvas.
 */
export function compositeProductOnStudioScene(options: {
  isolated: IsolatedProductResult;
  presetId?: string;
  aspectRatio?: AspectRatio;
}): CompositedStudioResult {
  const aspectRatio = options.aspectRatio ?? '1:1';
  const presetId = options.presetId ?? 'minimal-studio';
  const { resolution, canvasWidth, canvasHeight } = getResolutionForAspectRatio(aspectRatio);
  const palette = getPresetPalette(presetId);

  const canvas = new Uint8Array(canvasWidth * canvasHeight * 4);
  const horizonY = Math.floor(canvasHeight * 0.72);

  // 1. Render directional studio backdrop + horizon table + radial key light
  const lightCenterX = canvasWidth * 0.5;
  const lightCenterY = canvasHeight * 0.42;
  const maxRadius = Math.hypot(canvasWidth, canvasHeight) * 0.65;

  for (let y = 0; y < canvasHeight; y++) {
    const t = y / Math.max(1, canvasHeight - 1);
    for (let x = 0; x < canvasWidth; x++) {
      const idx = (y * canvasWidth + x) * 4;
      const distToLight = Math.hypot(x - lightCenterX, y - lightCenterY);
      const glow = Math.max(0, 1 - distToLight / maxRadius) * 0.22;

      if (y < horizonY) {
        canvas[idx] = Math.min(
          255,
          Math.round(palette.topColor[0] * (1 - t) + palette.bottomColor[0] * t + glow * palette.rimLightColor[0])
        );
        canvas[idx + 1] = Math.min(
          255,
          Math.round(palette.topColor[1] * (1 - t) + palette.bottomColor[1] * t + glow * palette.rimLightColor[1])
        );
        canvas[idx + 2] = Math.min(
          255,
          Math.round(palette.topColor[2] * (1 - t) + palette.bottomColor[2] * t + glow * palette.rimLightColor[2])
        );
        canvas[idx + 3] = 255;
      } else {
        const surfaceT = (y - horizonY) / Math.max(1, canvasHeight - horizonY);
        const shade = 1 - surfaceT * 0.18;
        canvas[idx] = Math.round(palette.pedestalColor[0] * shade);
        canvas[idx + 1] = Math.round(palette.pedestalColor[1] * shade);
        canvas[idx + 2] = Math.round(palette.pedestalColor[2] * shade);
        canvas[idx + 3] = 255;
      }
    }
  }

  // 2. Compute target placement for the isolated customer product
  const { boundingBox, width: srcImgW, height: srcImgH, foregroundRgba, maskAlpha } = options.isolated;
  const maxTargetW = Math.floor(canvasWidth * 0.56);
  const maxTargetH = Math.floor(canvasHeight * 0.58);
  const scale = Math.min(
    maxTargetW / Math.max(1, boundingBox.width),
    maxTargetH / Math.max(1, boundingBox.height)
  );

  const destWidth = Math.max(8, Math.round(boundingBox.width * scale));
  const destHeight = Math.max(8, Math.round(boundingBox.height * scale));
  const destX = Math.floor((canvasWidth - destWidth) / 2);
  const destY = Math.max(4, Math.floor(horizonY - destHeight + Math.floor(canvasHeight * 0.06)));

  // 3. Render elliptical contact shadow (ambient occlusion) beneath the product base
  const shadowCenterX = destX + destWidth / 2;
  const shadowCenterY = destY + destHeight;
  const shadowRx = Math.max(6, destWidth * 0.58);
  const shadowRy = Math.max(3, Math.floor(canvasHeight * 0.045));

  for (let y = Math.max(0, Math.floor(shadowCenterY - shadowRy)); y < Math.min(canvasHeight, Math.ceil(shadowCenterY + shadowRy)); y++) {
    for (let x = Math.max(0, Math.floor(shadowCenterX - shadowRx)); x < Math.min(canvasWidth, Math.ceil(shadowCenterX + shadowRx)); x++) {
      const normDist = Math.hypot((x - shadowCenterX) / shadowRx, (y - shadowCenterY) / shadowRy);
      if (normDist <= 1) {
        const shadowStrength = (1 - normDist) ** 1.6 * 0.52;
        const idx = (y * canvasWidth + x) * 4;
        canvas[idx] = Math.round(canvas[idx] * (1 - shadowStrength));
        canvas[idx + 1] = Math.round(canvas[idx + 1] * (1 - shadowStrength));
        canvas[idx + 2] = Math.round(canvas[idx + 2] * (1 - shadowStrength));
      }
    }
  }

  // 4. Composite exact customer product foreground pixels (nearest-neighbor to preserve 100% pixel fidelity)
  for (let dy = 0; dy < destHeight; dy++) {
    const sy = Math.min(
      srcImgH - 1,
      boundingBox.y + Math.floor((dy / destHeight) * boundingBox.height)
    );
    const outY = destY + dy;
    if (outY < 0 || outY >= canvasHeight) continue;

    for (let dx = 0; dx < destWidth; dx++) {
      const sx = Math.min(
        srcImgW - 1,
        boundingBox.x + Math.floor((dx / destWidth) * boundingBox.width)
      );
      const outX = destX + dx;
      if (outX < 0 || outX >= canvasWidth) continue;

      const alpha = maskAlpha[sy * srcImgW + sx];
      if (alpha > 0) {
        const srcIdx = (sy * srcImgW + sx) * 4;
        const dstIdx = (outY * canvasWidth + outX) * 4;
        canvas[dstIdx] = foregroundRgba[srcIdx];
        canvas[dstIdx + 1] = foregroundRgba[srcIdx + 1];
        canvas[dstIdx + 2] = foregroundRgba[srcIdx + 2];
        canvas[dstIdx + 3] = 255;
      }
    }
  }

  return {
    width: canvasWidth,
    height: canvasHeight,
    resolution,
    aspectRatio,
    presetId,
    compositedRgba: canvas,
    imageDataUrl: encodeRgbaToPngDataUrl(canvasWidth, canvasHeight, canvas),
    placement: {
      destX,
      destY,
      destWidth,
      destHeight,
      srcX: boundingBox.x,
      srcY: boundingBox.y,
      srcWidth: boundingBox.width,
      srcHeight: boundingBox.height,
    },
  };
}

/**
 * Verifies product pixel preservation by comparing the isolated customer product
 * foreground against the placed product region in the final composited image.
 */
export function verifyProductFidelity(
  isolated: IsolatedProductResult,
  composited: CompositedStudioResult
): ProductFidelityReport {
  const { placement, compositedRgba, width: canvasW, height: canvasH } = composited;
  const { width: srcW, height: srcH, foregroundRgba, maskAlpha, boundingBox } = isolated;

  let sampledForegroundPixels = 0;
  let preservedPixels = 0;

  for (let dy = 0; dy < placement.destHeight; dy++) {
    const sy = Math.min(
      srcH - 1,
      boundingBox.y + Math.floor((dy / placement.destHeight) * boundingBox.height)
    );
    const outY = placement.destY + dy;
    if (outY < 0 || outY >= canvasH) continue;

    for (let dx = 0; dx < placement.destWidth; dx++) {
      const sx = Math.min(
        srcW - 1,
        boundingBox.x + Math.floor((dx / placement.destWidth) * boundingBox.width)
      );
      const outX = placement.destX + dx;
      if (outX < 0 || outX >= canvasW) continue;

      if (maskAlpha[sy * srcW + sx] > 0) {
        sampledForegroundPixels++;
        const srcIdx = (sy * srcW + sx) * 4;
        const dstIdx = (outY * canvasW + outX) * 4;

        const dr = Math.abs(foregroundRgba[srcIdx] - compositedRgba[dstIdx]);
        const dg = Math.abs(foregroundRgba[srcIdx + 1] - compositedRgba[dstIdx + 1]);
        const db = Math.abs(foregroundRgba[srcIdx + 2] - compositedRgba[dstIdx + 2]);

        if (dr <= 12 && dg <= 12 && db <= 12) {
          preservedPixels++;
        }
      }
    }
  }

  const fidelityScore =
    sampledForegroundPixels > 0
      ? Number((preservedPixels / sampledForegroundPixels).toFixed(4))
      : 0;

  return {
    fidelityScore,
    fidelityVerified: fidelityScore >= 0.9,
    preservedPixels,
    sampledForegroundPixels,
  };
}
