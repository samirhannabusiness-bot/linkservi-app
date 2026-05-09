/**
 * imageUtils.ts — Client-side image compression via Canvas API
 *
 * Reduces large camera photos (8–12 MB) to ≈ 200–600 KB before uploading,
 * keeping enough quality for human review of payment proofs and KYC docs.
 */

const DEFAULT_MAX_DIM = 1280;
const DEFAULT_QUALITY = 0.80;

/**
 * Compress + resize an image File/Blob and return a new Blob (for GCS uploads).
 * Skips non-image files (e.g. PDFs) and returns them unchanged.
 */
export function compressImageBlob(
  file: File,
  maxDim = DEFAULT_MAX_DIM,
  quality = DEFAULT_QUALITY,
): Promise<Blob> {
  if (!file.type.startsWith("image/")) return Promise.resolve(file);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round(height * maxDim / width);
            width  = maxDim;
          } else {
            width  = Math.round(width * maxDim / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob failed")),
          "image/jpeg",
          quality,
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Compress + resize an image File and return a base64 data-URL string
 * (for endpoints that receive images in the JSON body, e.g. KYC).
 * Skips non-image files and returns the original data-URL.
 */
export function compressImageBase64(
  file: File,
  maxDim = DEFAULT_MAX_DIM,
  quality = DEFAULT_QUALITY,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round(height * maxDim / width);
            width  = maxDim;
          } else {
            width  = Math.round(width * maxDim / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
