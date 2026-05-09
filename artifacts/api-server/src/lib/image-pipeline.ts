import sharp from "sharp";
import { randomUUID } from "crypto";
import { objectStorageClient } from "./objectStorage";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 1200;
const WEBP_QUALITY = 80;

export const IMAGE_KINDS = [
  "profile",
  "vehicles",
  "stores",
  "products",
  "services",
  "rentals",
  "posts",
  "receipts",
  "documents",
  "general",
] as const;

export type ImageKind = (typeof IMAGE_KINDS)[number];

export class ImageValidationError extends Error {
  constructor(public readonly code: "INVALID_TYPE" | "FILE_TOO_LARGE" | "PROCESSING_FAILED", message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

export interface ProcessedImage {
  url: string;
  objectPath: string;
  width: number;
  height: number;
  bytes: number;
}

export async function processAndUploadImage(opts: {
  buffer: Buffer;
  contentType: string;
  kind: ImageKind;
  userId: number;
}): Promise<ProcessedImage> {
  const { buffer, contentType, kind, userId } = opts;

  if (!ALLOWED_MIME.has(contentType)) {
    throw new ImageValidationError("INVALID_TYPE", "Solo se aceptan imágenes JPEG, PNG o WebP.");
  }
  if (buffer.length > MAX_INPUT_BYTES) {
    throw new ImageValidationError("FILE_TOO_LARGE", "La imagen excede el máximo de 5 MB.");
  }

  let processed;
  try {
    processed = await sharp(buffer, { failOn: "error" })
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer({ resolveWithObject: true });
  } catch (err: any) {
    throw new ImageValidationError("PROCESSING_FAILED", err?.message ?? "No se pudo procesar la imagen.");
  }

  const id = randomUUID();
  const objectKey = `uploads/${kind}/${userId}/${id}.webp`;

  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${objectKey}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);

  await objectStorageClient
    .bucket(bucketName)
    .file(objectName)
    .save(processed.data, {
      contentType: "image/webp",
      metadata: { cacheControl: "public, max-age=31536000, immutable" },
    });

  return {
    url: `/api/storage/objects/${objectKey}`,
    objectPath: `/objects/${objectKey}`,
    width: processed.info.width,
    height: processed.info.height,
    bytes: processed.info.size,
  };
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const parts = normalized.split("/");
  if (parts.length < 3) throw new Error("Invalid object path");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}
