import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createStorageAdapter } from "@/lib/storage/factory";
import {
  keyFromValue,
  MAX_UPLOAD_BYTES,
  sniffImageBytes,
  toSquareWebp,
} from "@/lib/uploads/image";

/**
 * POST /api/teams/[id]/shield
 * Accepts a multipart `shield` field for the team owner only. Rejects:
 * 401 unauthenticated; 400 when the payload exceeds 2MB or its magic bytes are
 * not JPEG/PNG/WebP (MIME never trusted); 404 when the team does not exist, is
 * owned by another user, or is archived (`findFirst { id, userId,
 * archivedAt: null }` → 404, no existence leak). On success sharp resizes the
 * blob to a 512x512 cover-cropped WebP ONLY, stores it under a server-issued
 * key `shields/<teamId>-<uuid>.webp` via the storage adapter, persists the
 * issued value on `Team.emblem` (old value kept until the new put succeeds),
 * deletes the previous file, and returns 200 `{ emblem: <issued value> }`.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart body" },
      { status: 400 },
    );
  }

  const file = formData.get("shield");
  // Duck-typed Blob/File: undici returns its own File class (not the global
  // `File` in every runtime), so `instanceof File` is unreliable. Require the
  // primitive Blob surface instead.
  if (
    !file ||
    typeof file !== "object" ||
    typeof (file as Blob).arrayBuffer !== "function" ||
    typeof (file as Blob).size !== "number"
  ) {
    return NextResponse.json(
      { error: "Missing shield file field" },
      { status: 400 },
    );
  }

  // Bound the payload with the parsed file size (the multipart body stays in an
  // acceptable range because the client caps its source canvas at 512px).
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Shield exceeds the 2MB limit" },
      { status: 400 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Never trust the multipart-provided MIME/extension — sniff the magic bytes.
  if (sniffImageBytes(bytes) === null) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, or WebP images are allowed" },
      { status: 400 },
    );
  }

  // Owner guard: foreign/missing/archived teams all map to 404 (no existence
  // leak). Mirrors the repo's team DELETE pattern.
  const team = await prisma.team.findFirst({
    where: { id, userId, archivedAt: null },
  });
  if (!team) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const previousKey = team.emblem ? keyFromValue(team.emblem, "shields") : null;

  // Server issues the key; a client-supplied filename/URL is never persisted.
  const key = `shields/${team.id}-${randomUUID()}.webp`;
  const webp = await toSquareWebp(bytes, 512);

  const adapter = createStorageAdapter();
  const value = await adapter.put(key, webp);

  // DB update keeps the old value until the new put succeeded; only then is the
  // previous file deleted (safe delete makes a missing old key a no-op).
  await prisma.team.update({
    where: { id: team.id },
    data: { emblem: value },
  });
  if (previousKey && previousKey !== key) {
    await adapter.delete(previousKey);
  }

  return NextResponse.json({ emblem: value });
}

/**
 * DELETE /api/teams/[id]/shield
 * Owner-only removal of the team shield. Guards mirror the POST (401
 * unauthenticated; 404 foreign/missing/archived via the owner-scoped
 * `findFirst`). With a stored emblem the route deletes the blob (the key is
 * recovered from the issued value; a value with no recoverable `shields/`
 * segment safely skips the delete) and persists `Team.emblem = null`, then
 * returns 200 `{ emblem: null }` (TS-2: the deterministic placeholder renders
 * wherever the emblem was shown). Removing when no shield exists is a
 * successful no-op — 204 with no blob operation and no write.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const team = await prisma.team.findFirst({
    where: { id, userId, archivedAt: null },
  });
  if (!team) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!team.emblem) {
    return new NextResponse(null, { status: 204 });
  }

  const key = keyFromValue(team.emblem, "shields");
  const adapter = createStorageAdapter();
  // Safe delete: a missing/unrecoverable blob is a no-op, never an error.
  if (key) {
    await adapter.delete(key);
  }

  await prisma.team.update({
    where: { id: team.id },
    data: { emblem: null },
  });
  return NextResponse.json({ emblem: null });
}
