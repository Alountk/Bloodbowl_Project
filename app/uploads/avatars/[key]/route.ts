import { NextResponse } from "next/server";
import { createStorageAdapter } from "@/lib/storage/factory";

/**
 * GET /uploads/avatars/<key>
 * Serves a stored avatar through the storage adapter.
 *
 * Next's static `public/` file server only knows files present at build time;
 * avatars written after build (production standalone output) would 404. This
 * route reads the blob back through the same adapter that wrote it, so runtime
 * uploads are served regardless of deployment shape.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  // Defense: only serve well-formed avatar keys (server-issued
  // `<userId>-<uuid>.webp`), never arbitrary paths or other namespaces.
  if (!/^[a-zA-Z0-9]+-[0-9a-f-]+\.webp$/.test(key)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const adapter = createStorageAdapter();
  const data = await adapter.read(`avatars/${key}`);
  if (!data) {
    return new NextResponse("Not Found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
