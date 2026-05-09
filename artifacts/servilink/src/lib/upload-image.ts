import { getAuthHeader } from "./api";

export type ImageKind =
  | "profile"
  | "vehicles"
  | "stores"
  | "products"
  | "services"
  | "rentals"
  | "posts"
  | "receipts"
  | "documents"
  | "general";

export interface UploadedImage {
  url: string;
  objectPath: string;
  width: number;
  height: number;
  bytes: number;
}

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

export class ImageUploadError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ImageUploadError";
  }
}

/**
 * Sube una imagen al pipeline del backend.
 * El servidor convierte a WebP, redimensiona a max 1200px, calidad 80, strip EXIF.
 *
 * @example
 *   const { url } = await uploadImage(file, "vehicles");
 *   // url: "/api/storage/objects/uploads/vehicles/37/abc-123.webp"
 */
export async function uploadImage(file: File, kind: ImageKind): Promise<UploadedImage> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new ImageUploadError("INVALID_TYPE", "Solo se aceptan imágenes JPEG, PNG o WebP.");
  }
  if (file.size > MAX_BYTES) {
    throw new ImageUploadError("FILE_TOO_LARGE", "La imagen excede el máximo de 5 MB.");
  }

  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);

  const res = await fetch("/api/storage/upload-image", {
    method: "POST",
    headers: { ...getAuthHeader() },
    body: fd,
    credentials: "include",
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Error subiendo imagen" }));
    throw new ImageUploadError(body.code ?? "UPLOAD_FAILED", body.error ?? "Error subiendo imagen");
  }

  return await res.json();
}
