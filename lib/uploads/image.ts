import sharp from "sharp";

/** Hard cap on an upload payload; anything larger is rejected (400). */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/**
 * Pure magic-byte sniff for the only image kinds we accept (JPEG/PNG/WebP).
 * The MIME/provided extension is never trusted — only the leading bytes of the
 * blob decide. Returns the detected kind or null when the bytes are not one of
 * the allowed formats (SVG/`data:` payloads and arbitrary data reject here).
 */
export function sniffImageBytes(bytes: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (bytes.length < 8) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
    bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
    bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "png";
  }

  // WebP: "RIFF"...."WEBP"
  const head = new TextDecoder("ascii", { fatal: false }).decode(bytes.subarray(0, 4));
  const tail = new TextDecoder("ascii", { fatal: false }).decode(bytes.subarray(8, 12));
  if (head === "RIFF" && tail === "WEBP") return "webp";

  return null;
}

/**
 * Pure: recover the namespaced storage key from an adapter-issued value.
 *
 * Adapter-issued values are always `${publicBase}/${key}` where `key` starts
 * with the `{namespace}/` folder prefix (local issues `/uploads/avatars/...`,
 * S3 issues `${S3_PUBLIC_URL}/avatars/...`). Extracting everything after the
 * `/{namespace}/` segment rebuilds the key `delete` needs without coupling the
 * route to a driver's public base. Returns null when the value has no
 * `{namespace}/` segment (e.g. a different image kind) — the route then skips
 * the delete. Byte-identical to the former avatar-only form for `"avatars"`.
 */
export function keyFromValue(
  value: string,
  namespace: "avatars" | "shields",
): string | null {
  const idx = value.indexOf(`/${namespace}/`);
  return idx === -1 ? null : value.slice(idx + 1);
}

/**
 * Pipeline: square cover-crop any accepted image to a px×px WebP via sharp.
 * `px` is parameterized so the avatar route (256) and team shields (512) share
 * the same cover-crop pipeline.
 */
export async function toSquareWebp(bytes: Uint8Array, px: number): Promise<Buffer> {
  return sharp(bytes).resize(px, px, { fit: "cover" }).webp().toBuffer();
}
