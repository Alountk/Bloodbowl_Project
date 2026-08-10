/** A 2D size in pixels. */
export interface PixelSize {
  width: number;
  height: number;
}

/** Largest side allowed on the exported crop canvas (keeps payload ≤2MB wire). */
export const MAX_EXPORT_PIXELS = 1024;

/**
 * Pure: computes the export canvas dimensions for a cropped area.
 *
 * `crop` is the cropped sub-rectangle size in SOURCE pixels (react-easy-crop's
 * `croppedAreaPixels`). The result keeps the aspect ratio and scales so the
 * larger side never exceeds `MAX_EXPORT_PIXELS` (1024), bounding the blob's
 * resolution and keeping the multipart payload inside the server's 2MB cap.
 * Areas already within the cap pass through unchanged; a non-empty area yields
 * at least 1x1.
 */
export function exportCanvasSize(crop: PixelSize, maxDim = MAX_EXPORT_PIXELS): PixelSize {
  const scale = Math.min(1, maxDim / Math.max(crop.width, crop.height));
  return {
    width: Math.max(1, Math.round(crop.width * scale)),
    height: Math.max(1, Math.round(crop.height * scale)),
  };
}

/**
 * Exports a cropped image region to a WebP blob capped at 1024px on the longer
 * side. Draws the source-image sub-rectangle (in source pixels) onto a fresh
 * canvas at the capped output size, then returns `canvas.toBlob()` as a Promise.
 * Errors (e.g. a frame with no image) reject so the caller can show the error.
 */
export function cropImageToBlob(
  image: HTMLImageElement,
  cropPixels: PixelSize & { x: number; y: number },
): Promise<Blob> {
  const output = exportCanvasSize(cropPixels);
  const canvas = document.createElement("canvas");
  canvas.width = output.width;
  canvas.height = output.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return Promise.reject(new Error("Canvas 2D context unavailable"));
  }
  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    output.width,
    output.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to export cropped image"));
      },
      "image/webp",
      0.9,
    );
  });
}
