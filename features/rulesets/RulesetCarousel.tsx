"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

interface CarouselState {
  overflow: boolean;
  canPrev: boolean;
  canNext: boolean;
}

/**
 * RAU-52b horizontally scrollable card row. When the cards overflow the row the
 * left/right chevrons appear and scroll by one card (snap-smooth); they disable
 * at the ends. With few cards (no overflow) the chevrons stay hidden and the
 * cards stretch to fill the row like the original grid.
 */
export function RulesetCarousel({ count, children }: { count: number; children: ReactNode }) {
  const { t } = useI18n();
  const trackRef = useRef<HTMLUListElement>(null);
  const [state, setState] = useState<CarouselState>({
    overflow: false,
    canPrev: false,
    canNext: false,
  });

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth > clientWidth + 1;
    const maxScroll = scrollWidth - clientWidth;
    setState({
      overflow,
      canPrev: overflow && scrollLeft > 2,
      canNext: overflow && scrollLeft < maxScroll - 2,
    });
  }, []);

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update, count]);

  const scrollByCard = (direction: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const firstCard = el.querySelector<HTMLElement>("li");
    const step = (firstCard?.offsetWidth ?? 280) + 12;
    el.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  const chevronClass =
    "shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm font-bold text-[#12225a] transition-colors hover:border-[#12225a] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-300";

  return (
    <div className="flex items-center gap-2">
      {state.overflow ? (
        <button
          type="button"
          aria-label={t("rulesets.carousel.previous")}
          disabled={!state.canPrev}
          onClick={() => scrollByCard(-1)}
          className={chevronClass}
        >
          ←
        </button>
      ) : null}
      <ul
        ref={trackRef}
        onScroll={update}
        aria-label={t("rulesets.carousel.label")}
        className="no-scrollbar flex snap-x gap-3 overflow-x-auto scroll-smooth"
      >
        {children}
      </ul>
      {state.overflow ? (
        <button
          type="button"
          aria-label={t("rulesets.carousel.next")}
          disabled={!state.canNext}
          onClick={() => scrollByCard(1)}
          className={chevronClass}
        >
          →
        </button>
      ) : null}
    </div>
  );
}
