"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useApp } from "@/app/providers/AppProvider";
import { useI18n } from "@/lib/i18n";
import { LocaleSwitcher } from "@/lib/i18n/LocaleSwitcher";
import { AuthModal } from "@/features/auth/AuthModal";

/** Nav links shared by the desktop bar and the mobile drawer (home chrome). */
const NAV_LINKS = [
  { href: "/leagues", label: "Matches" },
  { href: "/", label: "Teams" },
  { href: "/leagues", label: "Leagues" },
] as const;

interface AppNavProps {
  /** True when a session is present: shows the avatar + user menu instead of Sign in. */
  authenticated?: boolean;
  /** Logout handler wired by the shell (signs out, then navigates home). */
  onLogout?: () => void;
  /** Public variant: renders the "Sign in" button that opens the auth modal. */
  showSignIn?: boolean;
  /** App shell only: renders the teams search on "/". */
  showSearch?: boolean;
}

/**
 * Unified landing-style navigation, shared by the landing (public variant) and
 * the app shell. Navy bar with logo + links + a right slot (Sign in → AuthModal,
 * or avatar + name with a Perfil / Cerrar sesión menu). Mobile uses a hamburger
 * that opens the same drawer, which also hosts the auth action and the locale
 * switcher. Owns the drawer + auth modal state.
 */
export function AppNav({
  authenticated = false,
  onLogout,
  showSignIn = false,
  showSearch = false,
}: AppNavProps) {
  const { t } = useI18n();
  const { data: session } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const isDeveloper = session?.user?.role === "developer";
  const links = isDeveloper
    ? [...NAV_LINKS, { href: "/dev/rulesets", label: t("nav.devRulesets") }]
    : NAV_LINKS;
  const displayName = session?.user?.name ?? session?.user?.email ?? "?";

  const openAuth = () => {
    setAuthOpen(true);
    setDrawerOpen(false);
  };

  return (
    <>
      <header className="bg-[#12225a] text-white">
        <div className="flex items-center gap-2 px-4 py-3 sm:gap-3 sm:px-5">
          <button
            type="button"
            aria-label={t("nav.openMenu")}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center bg-white/10 text-[20px] leading-none md:hidden"
          >
            ☰
          </button>

          <Link href="/" className="shrink-0 whitespace-nowrap text-[18px] font-black tracking-[0.02em]">
            <span aria-hidden="true">🏈</span>{" "}
            <span className="hidden sm:inline">Blood Bowl Teams</span>
          </Link>

          <nav aria-label="Main navigation" className="ml-4 hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <Link
                key={`${link.href}:${link.label}`}
                href={link.href}
                className="rounded-none px-2 py-1 text-[13px] text-[#cbd5e1] hover:bg-white/10 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex-1" />

          {showSearch ? <NavSearch /> : null}

          <div className="hidden md:block">
            <LocaleSwitcher />
          </div>

          {authenticated ? (
            <UserMenu displayName={displayName} onLogout={onLogout} />
          ) : showSignIn ? (
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="rounded-none bg-[#d11938] px-3.5 py-1.5 text-[13px] font-extrabold text-white hover:bg-[#e51b40]"
            >
              Sign in
            </button>
          ) : null}
        </div>
      </header>

      {drawerOpen ? (
        <>
          {/* Scrim: renders behind the drawer; click closes. */}
          <button
            type="button"
            aria-label={t("nav.closeMenu")}
            data-testid="drawer-scrim"
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 z-40 bg-slate-900/45 md:hidden"
          />
          <aside
            aria-label="Mobile navigation"
            className="fixed left-0 top-0 bottom-0 z-50 flex w-60 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white p-4 shadow-xl"
          >
            <p className="mb-6 flex items-center gap-2">
              <span className="text-[18px] font-black tracking-tight text-[#12225a]">
                BLOODBOWL
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#d11938]">
                Teams
              </span>
            </p>
            <nav className="flex flex-col gap-1">
              {links.map((link) => (
                <Link
                  key={`${link.href}:${link.label}`}
                  href={link.href}
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-none px-3 py-2 text-sm font-bold text-[#12225a] hover:bg-slate-100"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto flex flex-col gap-3 pt-4">
              {authenticated ? (
                <>
                  <Link
                    href="/profile"
                    onClick={() => setDrawerOpen(false)}
                    className="rounded-none px-3 py-2 text-sm font-bold text-[#12225a] hover:bg-slate-100"
                  >
                    {t("nav.profile")}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      onLogout?.();
                    }}
                    className="rounded-none px-3 py-2 text-left text-sm font-bold text-[#d11938] hover:bg-slate-100"
                  >
                    {t("topbar.logout")}
                  </button>
                </>
              ) : showSignIn ? (
                <button
                  type="button"
                  onClick={openAuth}
                  className="rounded-none bg-[#d11938] px-3 py-2 text-[13px] font-extrabold text-white hover:bg-[#e51b40]"
                >
                  Sign in
                </button>
              ) : null}
              <LocaleSwitcher />
            </div>
          </aside>
        </>
      ) : null}

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}

/** Teams search, rendered on "/" by the app shell (inside AppProvider). */
function NavSearch() {
  const { searchQuery, setSearchQuery } = useApp();
  const pathname = usePathname();
  const { t } = useI18n();
  if (pathname !== "/") return null;
  return (
    <form role="search" className="flex items-center">
      <input
        type="search"
        aria-label={t("topbar.searchLabel")}
        placeholder={t("topbar.searchPlaceholder")}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full max-w-[140px] rounded-none border border-white/40 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-white sm:max-w-none sm:px-3"
      />
    </form>
  );
}

/** Logged-in avatar + coach name pill with a Perfil / Cerrar sesión dropdown. */
function UserMenu({ displayName, onLogout }: { displayName: string; onLogout?: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = (displayName.trim()[0] ?? "?").toUpperCase();

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={t("nav.userMenu")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-none bg-white/10 px-2 py-1.5 hover:bg-white/20"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#d11938] text-[12px] font-black text-white">
          {initial}
        </span>
        <span className="hidden text-[13px] font-bold sm:inline">{displayName}</span>
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-44 border border-slate-200 bg-white text-slate-900 shadow-lg">
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm font-semibold text-[#12225a] hover:bg-slate-100"
          >
            {t("nav.profile")}
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onLogout?.();
            }}
            className="block w-full px-3 py-2 text-left text-sm font-semibold text-[#d11938] hover:bg-slate-100"
          >
            {t("topbar.logout")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
