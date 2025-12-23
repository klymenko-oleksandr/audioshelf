import sharp from "sharp";

export interface OptimizedImage {
  buffer: Buffer;
  width: number;
  height: number;
  format: string;
  size: number;
}

export interface ImageVariants {
  thumbnail: OptimizedImage;
  medium: OptimizedImage;
  large: OptimizedImage;
  original?: OptimizedImage;
}

const IMAGE_SIZES = {
  thumbnail: { width: 320, height: 180 },
  medium: { width: 640, height: 360 },
  large: { width: 1280, height: 720 },
} as const;

const QUALITY = {
  webp: 85,
  jpeg: 85,
} as const;

export async function optimizeImage(
  imageBuffer: Buffer,
  size: keyof typeof IMAGE_SIZES
): Promise<OptimizedImage> {
  const { width, height } = IMAGE_SIZES[size];

  const processed = await sharp(imageBuffer)
    .resize(width, height, {
      fit: "cover",
      position: "center",
    })
    .webp({ quality: QUALITY.webp })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: processed.data,
    width: processed.info.width,
    height: processed.info.height,
    format: processed.info.format,
    size: processed.info.size,
  };
}

export async function generateImageVariants(
  imageBuffer: Buffer
): Promise<ImageVariants> {
  const [thumbnail, medium, large] = await Promise.all([
    optimizeImage(imageBuffer, "thumbnail"),
    optimizeImage(imageBuffer, "medium"),
    optimizeImage(imageBuffer, "large"),
  ]);

  return {
    thumbnail,
    medium,
    large,
  };
}

export function getImageVariantKey(
  baseKey: string,
  variant: keyof ImageVariants
): string {
  const parts = baseKey.split("/");
  const filename = parts[parts.length - 1];
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  const prefix = parts.slice(0, -1).join("/");
  
  return `${prefix}/${nameWithoutExt}-${variant}.webp`;
}

export async function validateImage(buffer: Buffer): Promise<void> {
  try {
    const metadata = await sharp(buffer).metadata();
    
    if (!metadata.width || !metadata.height) {
      throw new Error("Invalid image: missing dimensions");
    }
    
    if (metadata.width < 320 || metadata.height < 180) {
      throw new Error("Image too small: minimum 320x180px required");
    }
    
    const maxSize = 10 * 1024 * 1024;
    if (buffer.length > maxSize) {
      throw new Error("Image too large: maximum 10MB allowed");
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Invalid image file");
  }
}
