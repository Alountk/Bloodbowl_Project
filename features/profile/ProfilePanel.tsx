"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  changePassword,
  getMe,
  getStats,
  patchMe,
  uploadAvatar,
  type CareerStats,
  type Profile,
} from "./api";
import { cropImageToBlob } from "./crop";
import { CropDialog } from "./CropDialog";
import { UserAvatar } from "@/components/UserAvatar";
import { useI18n } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/dictionaries";
import {
  MIN_PASSWORD_LENGTH,
  WRONG_CURRENT_PASSWORD_CODE,
  WEAK_NEW_PASSWORD_CODE,
} from "@/lib/password";

const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: "es", label: "ES" },
  { value: "en", label: "EN" },
];

/**
 * Client profile panel for `/profile` (Spanish copy). Loads the session profile
 * from GET /api/me (a DB avatar read, not the JWT) and the career stats from
 * GET /api/me/stats, shows the current avatar, and lets the user pick an image,
 * adjust a 1:1 crop with pan + zoom, and upload the CROPPED canvas blob (never
 * crop coordinates). Below the avatar card sit the RAU-57 sections: career
 * stats (mobile-first grid) and the self-service change-password form (verify
 * current + confirm the new one, inline error/success).
 */
export function ProfilePanel() {
  const { t, locale, setLocale } = useI18n();
  const loadError = t("profile.loadError");
  const uploadError = t("profile.uploadError");
  const statsLoadError = t("profile.stats.loadError");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [pickerSrc, setPickerSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [localePending, setLocalePending] = useState(false);
  const [localeError, setLocaleError] = useState<string | null>(null);

  const [stats, setStats] = useState<CareerStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    getMe()
      .then((p) => {
        setProfile(p);
        setAvatarSrc(p.avatar);
      })
      .catch(() => setError(loadError));
    getStats()
      .then(setStats)
      .catch(() => setStatsError(statsLoadError));
  }, [loadError, statsLoadError]);

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
      setError(uploadError);
    } finally {
      setPending(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword !== confirmPassword) {
      setPasswordError(t("profile.password.mismatch"));
      return;
    }
    setPasswordPending(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === WRONG_CURRENT_PASSWORD_CODE) {
        setPasswordError(t("profile.password.wrongCurrent"));
      } else if (code === WEAK_NEW_PASSWORD_CODE) {
        setPasswordError(t("profile.password.weak", { min: MIN_PASSWORD_LENGTH }));
      } else {
        setPasswordError(t("profile.password.error"));
      }
    } finally {
      setPasswordPending(false);
    }
  }

  // The selector reflects the ACCOUNT locale (a fresh GET /api/me read), not the
  // per-browser cookie; while the profile loads it falls back to the active
  // provider locale. On change we PATCH the account and flip the provider so the
  // whole page reflects the new language immediately (the provider also writes
  // the cookie, keeping the browser in sync with the account).
  const activeLocale: Locale = profile?.locale ?? locale;

  async function handleLocaleChange(next: Locale) {
    if (!profile || localePending || next === activeLocale) return;
    setLocalePending(true);
    setLocaleError(null);
    try {
      const updated = await patchMe({ locale: next });
      setProfile((prev) => (prev ? { ...prev, locale: updated.locale } : prev));
      setLocale(updated.locale);
    } catch {
      setLocaleError(t("profile.locale.error"));
    } finally {
      setLocalePending(false);
    }
  }

  return (
    <section className="mx-auto max-w-md">
      <h1 className="mb-1 text-2xl font-black text-[#12225a]">{t("nav.profile")}</h1>
      <p className="mb-6 text-sm text-slate-500">
        {t("profile.subtitle")}
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
            {t("profile.upload")}
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
          {profile?.role || profile?.plan ? (
            <p className="text-[11px] text-slate-400">
              {t("profile.rolePlan", { role: profile?.role ?? "user", plan: profile?.plan ?? "free" })}
            </p>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-[#d11938]">{error}</p> : null}

      <div className="mt-6 border border-[#e2e8f0] bg-white p-4">
        <h2 className="text-lg font-black text-[#12225a]">{t("profile.locale.title")}</h2>
        <p className="mb-3 text-sm text-slate-500">{t("profile.locale.hint")}</p>
        <div
          role="group"
          aria-label={t("profile.locale.title")}
          data-testid="profile-locale"
          className="flex items-center gap-1 rounded border border-slate-300 bg-[#f8fafc] p-0.5"
        >
          {LOCALE_OPTIONS.map((option) => {
            const active = activeLocale === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                disabled={!profile || localePending}
                onClick={() => handleLocaleChange(option.value)}
                className={`rounded px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-50 ${
                  active
                    ? "bg-[#12225a] text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-[#12225a]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {localeError ? (
          <p role="alert" className="mt-2 text-sm text-[#d11938]">
            {localeError}
          </p>
        ) : null}
      </div>

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

      <div className="mt-6 border border-[#e2e8f0] bg-white p-4">
        <h2 className="text-lg font-black text-[#12225a]">{t("profile.stats.title")}</h2>
        <p className="mb-3 text-sm text-slate-500">{t("profile.stats.subtitle")}</p>

        {statsError ? (
          <p className="text-sm text-[#d11938]">{statsError}</p>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div data-testid="stat-championships" className="border border-[#e2e8f0] bg-[#f8fafc] p-3">
              <p className="text-2xl font-black text-[#12225a]">{stats.championships}</p>
              <p className="text-sm text-slate-500">{t("profile.stats.championships")}</p>
            </div>
            <div data-testid="stat-teams" className="border border-[#e2e8f0] bg-[#f8fafc] p-3">
              <p className="text-2xl font-black text-[#12225a]">{stats.teams}</p>
              <p className="text-sm text-slate-500">{t("profile.stats.teams")}</p>
            </div>
            <div data-testid="stat-leagues" className="border border-[#e2e8f0] bg-[#f8fafc] p-3">
              <p className="text-2xl font-black text-[#12225a]">{stats.leagues}</p>
              <p className="text-sm text-slate-500">{t("profile.stats.leagues")}</p>
            </div>
            <div data-testid="stat-matches" className="border border-[#e2e8f0] bg-[#f8fafc] p-3">
              <p className="text-2xl font-black text-[#12225a]">{stats.matches}</p>
              <p className="text-sm text-slate-500">{t("profile.stats.matches")}</p>
              <p className="mt-1 text-xs text-slate-500" data-testid="stat-wdl">
                {t("profile.stats.wins")} {stats.wins} · {t("profile.stats.draws")}{" "}
                {stats.draws} · {t("profile.stats.losses")} {stats.losses}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-6 border border-[#e2e8f0] bg-white p-4">
        <h2 className="text-lg font-black text-[#12225a]">{t("profile.password.title")}</h2>
        <form onSubmit={handlePasswordSubmit} className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
            {t("profile.password.current")}
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="rounded-sm border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 focus:border-[#12225a] focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
            {t("profile.password.new")}
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="rounded-sm border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 focus:border-[#12225a] focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
            {t("profile.password.confirm")}
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="rounded-sm border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 focus:border-[#12225a] focus:outline-none"
            />
          </label>
          <p className="text-xs text-slate-500">{t("profile.password.hint", { min: MIN_PASSWORD_LENGTH })}</p>
          {passwordError ? (
            <p role="alert" className="text-sm text-[#d11938]">
              {passwordError}
            </p>
          ) : null}
          {passwordSuccess ? (
            <p role="status" className="text-sm font-semibold text-[#12225a]">
              {t("profile.password.success")}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={passwordPending}
            className="rounded-sm border border-slate-300 px-3 py-2 text-sm font-semibold text-[#12225a] hover:border-[#d11938] hover:text-[#d11938] disabled:opacity-50"
          >
            {t("profile.password.submit")}
          </button>
        </form>
      </div>
    </section>
  );
}
