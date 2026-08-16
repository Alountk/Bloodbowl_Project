"use client";

import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { useI18n } from "@/lib/i18n";

/**
 * 1:1 square crop dialog with pan + zoom over the chosen image. The user adjusts
 * the crop, and Guardar passes the cropped area PIXELS back to the caller, which
 * exports the cropped canvas blob (never crop coordinates, per R2). Uses
 * react-easy-crop with aspect 1 so the crop box is always square.
 */
export function CropDialog({
  imageSrc,
  onConfirm,
  onCancel,
  pending = false,
}: {
  imageSrc: string;
  onConfirm: (cropPixels: { x: number; y: number; width: number; height: number }) => void;
  onCancel: () => void;
  pending?: boolean;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState<Area | null>(null);
  const { t } = useI18n();

  return (
    <div
      role="dialog"
      aria-label={t("profile.cropDialogLabel")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
    >
      <div className="w-full max-w-md border border-[#e2e8f0] bg-white p-4">
        <p className="mb-2 font-bold text-[#12225a]">{t("profile.cropTitle")}</p>
        <div className="relative h-72 w-full overflow-hidden bg-black">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="rect"
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_area, areaPixels) => setPixels(areaPixels)}
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <label htmlFor="crop-zoom" className="text-xs text-slate-500">{t("profile.zoom")}</label>
          <input
            id="crop-zoom"
            type="range"
            aria-label={t("profile.zoom")}
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-sm border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:border-[#d11938] hover:text-[#d11938]"
          >
            {t("create.cancel")}
          </button>
          <button
            type="button"
            disabled={pending || !pixels}
            onClick={() => pixels && onConfirm(pixels)}
            className="rounded-sm bg-[#12225a] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t("profile.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
