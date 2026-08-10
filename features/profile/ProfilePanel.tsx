"use client";

import { useEffect, useRef, useState } from "react";
import { getMe, uploadAvatar, type Profile } from "./api";
import { cropImageToBlob } from "./crop";
import { CropDialog } from "./CropDialog";
import { UserAvatar } from "@/components/UserAvatar";

/**
 * Client profile panel for `/profile` (Spanish copy). Loads the session profile
 * from GET /api/me (a DB avatar read, not the JWT), shows the current avatar,
 * and lets the user pick an image, adjust a 1:1 crop with pan + zoom, and upload
 * the CROPPED canvas blob (never crop coordinates). After a successful upload
 * the avatar preview updates from the adapter-issued value.
 */
export function ProfilePanel() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [pickerSrc, setPickerSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    getMe()
      .then((p) => {
        setProfile(p);
        setAvatarSrc(p.avatar);
      })
      .catch(() => setError("No se pudo cargar tu perfil."));
  }, []);

  function handleFileSelected(file: File | undefined) {
    if (!file) return;
    setPickerSrc(URL.createObjectURL(file));
    setCropOpen(true);
    setError(null);
  }

  async function handleConfirmed(cropPixels: { x: number; y: number; width: number; height: number }) {
    const img = imageRef.current;
    if (!img) return;
    setPending(true);
    setError(null);
    try {
      const blob = await cropImageToBlob(img, cropPixels);
      const { avatar } = await uploadAvatar(blob);
      setAvatarSrc(avatar);
      setProfile((prev) => (prev ? { ...prev, avatar } : prev));
      setCropOpen(false);
      setPickerSrc(null);
    } catch {
      setError("No se pudo subir la foto.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mx-auto max-w-md">
      <h1 className="mb-1 text-2xl font-black text-[#12225a]">Mi Perfil</h1>
      <p className="mb-6 text-sm text-slate-500">
        Sube una foto como avatar; se mostrará junto a tu nombre en los partidos.
      </p>

      <div className="flex items-center gap-4 border border-[#e2e8f0] bg-white p-4">
        <UserAvatar src={avatarSrc} />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pending}
            className="rounded-sm border border-slate-300 px-3 py-1.5 text-sm font-semibold text-[#12225a] hover:border-[#d11938] hover:text-[#d11938] disabled:opacity-50"
          >
            Subir foto
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFileSelected(e.target.files?.[0])}
          />
          {profile?.name ? (
            <p className="text-sm font-semibold text-slate-700">{profile.name}</p>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-[#d11938]">{error}</p> : null}

      {pickerSrc && cropOpen ? (
        <>
          {/* Hidden source image used only as the canvas crop source. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={pickerSrc}
            alt=""
            className="hidden"
            crossOrigin="anonymous"
          />
          <CropDialog
            imageSrc={pickerSrc}
            onCancel={() => {
              setCropOpen(false);
              setPickerSrc(null);
            }}
            onConfirm={handleConfirmed}
            pending={pending}
          />
        </>
      ) : null}
    </section>
  );
}
