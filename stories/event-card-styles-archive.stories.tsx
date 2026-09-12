import type { ReactNode } from "react";
import styles from "./event-card-styles-archive.module.css";

/**
 * EVENT CARD STYLE ARCHIVE (story-only).
 *
 * The four styles offered in the design round — Franja / Acta / Tablón / Ficha —
 * kept here for recovery. Each renders the MOST COMPLEX card (the casualty: the
 * injury card on the victim side + the derived action card on the causer side)
 * with the real production labels, so the styles stay comparable.
 *
 * The chosen direction is Acta: its real implementation lives in
 * `features/leagues/eventCardActa.tsx` (v4). This file is the archive only.
 */

const HELMET_PATH =
  "M13.5,12A1.5,1.5 0 0,0 12,13.5A1.5,1.5 0 0,0 13.5,15A1.5,1.5 0 0,0 15,13.5A1.5,1.5 0 0,0 13.5,12M13.5,3C18.19,3 22,6.58 22,11C22,12.62 22,14 21.09,16C17,16 16,20 12.5,20C10.32,20 9.27,18.28 9.05,16H9L8.24,16L6.96,20.3C6.81,20.79 6.33,21.08 5.84,21H3A1,1 0 0,1 2,20A1,1 0 0,1 3,19V16A1,1 0 0,1 2,15A1,1 0 0,1 3,14H6.75L7.23,12.39C6.72,12.14 6.13,12 5.5,12H5.07L5,11C5,6.58 8.81,3 13.5,3M5,16V19H5.26L6.15,16H5Z";

function Glyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={HELMET_PATH} fill="currentColor" />
    </svg>
  );
}

function Ack() {
  return (
    <div className={styles.ack}>
      <span className={styles.ack__label}>⏳ Sin cotejar</span>
      <button type="button" className={`${styles.ack__btn} ${styles["ack__btn--ok"]}`}>✓ Correcto</button>
      <button type="button" className={`${styles.ack__btn} ${styles["ack__btn--nok"]}`}>✗ Revisar</button>
    </div>
  );
}

function Block({ num, name, note, children }: { num: string; name: string; note: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-1.5 flex items-baseline gap-2.5 border-b-2 border-border pb-1.5">
        <span className="font-display text-xl font-bold text-red">{num}</span>
        <h2 className="font-display text-lg font-bold text-navy">{name}</h2>
      </div>
      <p className="mb-3.5 text-xs leading-relaxed text-slate">{note}</p>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

export default {
  title: "Event Cards/Archivo · 4 estilos",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Archivo de los 4 estilos ofrecidos en la ronda de diseño (Franja, Acta, Tablón, Ficha), " +
          "cada uno aplicado a la card más compleja (la baja: lesión + acción derivada). " +
          "Se guardan para poder recuperarlos. La dirección elegida es Acta, ya implementada en " +
          "`features/leagues/eventCardActa.tsx` (v4).",
      },
    },
  },
};

export const Archivo = {
  name: "4 estilos (baja)",
  render: () => (
    <div className="mx-auto max-w-3xl bg-background p-6">
      <h1 className="mb-1 font-display text-2xl font-bold text-navy">Event cards — 4 estilos (archivo)</h1>
      <p className="mb-8 text-[13px] leading-relaxed text-slate">
        Card más compleja: la <b className="text-ink">baja</b>, con sus dos tarjetas (lesión del jugador +
        acción derivada del causante). Contenido y etiquetas reales.
      </p>

      {/* 01 · Franja */}
      <Block num="01" name="Franja" note="Barra horizontal editorial: turno + icono + nombre en serif, datos debajo, color del lado como filete.">
        <article className={`${styles.e1} ${styles.away}`}>
          <div className={styles.e1__num}><b>4</b><span>Turno</span></div>
          <span className={styles.e1__icon}><Glyph /></span>
          <div className={styles.e1__body}>
            <div className={styles.e1__line1}>
              <h3 className={styles.e1__name}>Durburz Puño de Hierro</h3>
              <span className={styles.e1__dorsal}>#2</span>
            </div>
            <p className={styles.e1__pos}>Big Un Blocker · Colmillos del Caos</p>
            <div className={styles.e1__event}><Glyph /><span>Baja</span></div>
            <p className={styles.e1__sub}>Se pierde el próximo partido</p>
            <p className={styles.e1__sub}>Tirada 1D16: 9</p>
            <p className={styles.e1__sub}>por <b>Khalid el Impávido</b> (#1) · Bloqueo</p>
          </div>
          <span className={styles.e1__min}>4&apos;</span>
          <div className={styles.e1__ackwrap}><Ack /></div>
        </article>
        <article className={`${styles.e1} ${styles.home}`}>
          <div className={styles.e1__num}><b>4</b><span>Turno</span></div>
          <span className={styles.e1__icon}><Glyph /></span>
          <div className={styles.e1__body}>
            <div className={styles.e1__line1}>
              <h3 className={styles.e1__name}>Khalid el Impávido</h3>
              <span className={styles.e1__dorsal}>#1</span>
            </div>
            <p className={styles.e1__pos}>Blitz-Ra · Águilas de Khemri</p>
            <div className={styles.e1__event}><Glyph /><span>Bloqueo</span><span className={styles.e1__stars}>(★2)</span></div>
            <p className={styles.e1__sub}>Khalid el Impávido hace una herida a Durburz Puño de Hierro</p>
          </div>
          <span className={styles.e1__min}>4&apos;</span>
        </article>
      </Block>

      {/* 02 · Acta */}
      <Block num="02" name="Acta" note="Ficha de datos formal con puntos de guía. La dirección elegida (implementada en v4).">
        <article className={`${styles.e2} ${styles.away}`}>
          <div className={styles.e2__top}><span className={styles.e2__tag}>Baja</span><span className={styles.e2__meta}>Turno 4 · 4&apos;</span></div>
          <h3 className={styles.e2__name}>Durburz Puño de Hierro <span>#2</span></h3>
          <p className={styles.e2__pos}>Big Un Blocker · Colmillos del Caos</p>
          <dl className={styles.e2__data}>
            <div className={styles.e2__row}><dt>Efecto</dt><span className={styles.e2__leader} /><dd><b>Se pierde el próximo partido</b></dd></div>
            <div className={styles.e2__row}><dt>Tirada 1D16</dt><span className={styles.e2__leader} /><dd className={styles.e2__num}><b>9</b></dd></div>
            <div className={styles.e2__row}><dt>Causa</dt><span className={styles.e2__leader} /><dd>por <b>Khalid el Impávido</b> (#1) · <b>Bloqueo</b></dd></div>
          </dl>
          <Ack />
        </article>
        <article className={`${styles.e2} ${styles.home}`}>
          <div className={styles.e2__top}><span className={styles.e2__tag}>Bloqueo · ★2</span><span className={styles.e2__meta}>Turno 4 · 4&apos;</span></div>
          <h3 className={styles.e2__name}>Khalid el Impávido <span>#1</span></h3>
          <p className={styles.e2__pos}>Blitz-Ra · Águilas de Khemri</p>
          <dl className={styles.e2__data}>
            <div className={styles.e2__row}><dt>Acción</dt><span className={styles.e2__leader} /><dd>Herida a <b>Durburz Puño de Hierro</b></dd></div>
          </dl>
        </article>
      </Block>

      {/* 03 · Tablón */}
      <Block num="03" name="Tablón" note="Scoreboard oscuro de alto contraste: bloque de turno, evento en versalitas, datos en crema.">
        <article className={`${styles.e3} ${styles.away}`}>
          <div className={styles.e3__turn}><b>4</b><span>Turno</span></div>
          <div className={styles.e3__main}>
            <div className={styles.e3__event}><Glyph /><b>Baja</b></div>
            <p className={styles.e3__name}>Durburz Puño de Hierro <span className={styles.e3__pos}>#2 · Big Un Blocker</span></p>
            <ul className={styles.e3__lines}>
              <li>Se pierde el próximo partido</li>
              <li>Tirada 1D16: 9</li>
              <li>por <b>Khalid el Impávido</b> (#1) · Bloqueo</li>
            </ul>
            <Ack />
          </div>
          <div className={styles.e3__min}>4&apos;</div>
        </article>
        <article className={`${styles.e3} ${styles.home}`}>
          <div className={styles.e3__turn}><b>4</b><span>Turno</span></div>
          <div className={styles.e3__main}>
            <div className={styles.e3__event}><Glyph /><b>Bloqueo</b><span className={styles.e3__stars}>★2</span></div>
            <p className={styles.e3__name}>Khalid el Impávido <span className={styles.e3__pos}>#1 · Blitz-Ra</span></p>
            <ul className={styles.e3__lines}>
              <li>Khalid el Impávido hace una herida a Durburz Puño de Hierro</li>
            </ul>
          </div>
          <div className={styles.e3__min}>4&apos;</div>
        </article>
      </Block>

      {/* 04 · Ficha */}
      <Block num="04" name="Ficha" note="Tarjeta con banda de cabecera del color del lado, emblema, viñetas y pie de cotejo.">
        <article className={`${styles.e4} ${styles.away}`}>
          <header className={styles.e4__band}>
            <span className={styles.e4__ev}><Glyph /><span>Baja</span></span>
            <span className={styles.e4__meta}>Turno 4 · 4&apos;</span>
          </header>
          <div className={styles.e4__body}>
            <span className={styles.e4__emblem}>D</span>
            <div>
              <h3 className={styles.e4__name}>Durburz Puño de Hierro <small>#2</small></h3>
              <p className={styles.e4__pos}>Big Un Blocker · Colmillos del Caos</p>
            </div>
          </div>
          <ul className={styles.e4__lines}>
            <li>Se pierde el próximo partido</li>
            <li>Tirada 1D16: 9</li>
            <li>por <b>Khalid el Impávido</b> (#1) · Bloqueo</li>
          </ul>
          <div className={styles.e4__ackwrap}><Ack /></div>
        </article>
        <article className={`${styles.e4} ${styles.home}`}>
          <header className={styles.e4__band}>
            <span className={styles.e4__ev}><Glyph /><span>Bloqueo</span><span className={styles.e4__stars}>(★2)</span></span>
            <span className={styles.e4__meta}>Turno 4 · 4&apos;</span>
          </header>
          <div className={styles.e4__body}>
            <span className={styles.e4__emblem}>K</span>
            <div>
              <h3 className={styles.e4__name}>Khalid el Impávido <small>#1</small></h3>
              <p className={styles.e4__pos}>Blitz-Ra · Águilas de Khemri</p>
            </div>
          </div>
          <ul className={styles.e4__lines}>
            <li>Khalid el Impávido hace una herida a Durburz Puño de Hierro</li>
          </ul>
        </article>
      </Block>
    </div>
  ),
};
