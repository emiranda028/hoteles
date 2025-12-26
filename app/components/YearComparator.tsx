// app/components/YearComparator.tsx
"use client";

import React, { useMemo, useState } from "react";

// OJO: importá los componentes que ya tenés en tu repo.
// Si alguno no existe en tu proyecto actual, comentá SOLO ese import + render.
import HighlightsCarousel from "./HighlightsCarousel";
import HofSummary from "./HofSummary";
import HofExplorer from "./HofExplorer";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

/** ===== Paths (ajustá si tus archivos tienen otro nombre/ruta) ===== */
const HOF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

/** ===== Hoteles ===== */
const JCR_HOTELS = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"] as const;
type JcrHotel = (typeof JCR_HOTELS)[number];

const MAITEI_HOTELS = ["MAITEI"] as const;
type MaiteiHotel = (typeof MAITEI_HOTELS)[number];

function clampYear(y: number) {
  if (!Number.isFinite(y)) return new Date().getFullYear();
  return Math.max(2018, Math.min(2035, Math.round(y)));
}

/** Sticky bar styles (Marriott rojo / Maitei celeste) */
const stickyWrap: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 50,
  backdropFilter: "blur(8px)",
};

function Pill({
  label,
  value,
  onChange,
  theme,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  theme: "jcr" | "maitei";
}) {
  const isJcr = theme === "jcr";
  return (
    <label
      style={{
        display: "grid",
        gap: ".35rem",
        padding: ".65rem .75rem",
        borderRadius: 14,
        border: isJcr ? "1px solid rgba(255,255,255,.22)" : "1px solid rgba(255,255,255,.18)",
        background: isJcr ? "rgba(150,0,0,.82)" : "rgba(0,120,200,.68)",
        color: "white",
        boxShadow: "0 10px 30px rgba(0,0,0,.12)",
        minWidth: 170,
      }}
    >
      <div style={{ fontSize: ".8rem", opacity: 0.9, fontWeight: 700 }}>{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          border: "1px solid rgba(255,255,255,.25)",
          background: "rgba(255,255,255,.12)",
          color: "white",
          padding: ".55rem .6rem",
          borderRadius: 12,
          outline: "none",
          fontWeight: 800,
        }}
      />
    </label>
  );
}

function SelectPill({
  label,
  value,
  onChange,
  options,
  theme,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  theme: "jcr" | "maitei";
}) {
  const isJcr = theme === "jcr";
  return (
    <label
      style={{
        display: "grid",
        gap: ".35rem",
        padding: ".65rem .75rem",
        borderRadius: 14,
        border: isJcr ? "1px solid rgba(255,255,255,.22)" : "1px solid rgba(255,255,255,.18)",
        background: isJcr ? "rgba(150,0,0,.82)" : "rgba(0,120,200,.68)",
        color: "white",
        boxShadow: "0 10px 30px rgba(0,0,0,.12)",
        minWidth: 240,
      }}
    >
      <div style={{ fontSize: ".8rem", opacity: 0.9, fontWeight: 700 }}>{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          border: "1px solid rgba(255,255,255,.25)",
          background: "rgba(255,255,255,.12)",
          color: "white",
          padding: ".55rem .6rem",
          borderRadius: 12,
          outline: "none",
          fontWeight: 900,
        }}
      >
        {options.map((o) => (
          <option key={o} value={o} style={{ color: "black" }}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function YearComparator() {
  /** ======= BLOQUE JCR (Marriott + Sheratons) ======= */
  const nowY = new Date().getFullYear();
  const [jcrYear, setJcrYear] = useState<number>(nowY);
  const [jcrBaseYear, setJcrBaseYear] = useState<number>(nowY - 1);
  const [jcrHotel, setJcrHotel] = useState<JcrHotel>("MARRIOTT");

  /** ======= BLOQUE MAITEI (Gotel) separado ======= */
  const [maiteiYear, setMaiteiYear] = useState<number>(nowY);
  const [maiteiBaseYear, setMaiteiBaseYear] = useState<number>(nowY - 1);
  const [maiteiHotel, setMaiteiHotel] = useState<MaiteiHotel>("MAITEI");

  const jcrHotelList = useMemo(() => [...JCR_HOTELS], []);
  const maiteiHotelList = useMemo(() => [...MAITEI_HOTELS], []);

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      {/* =========================
          BLOQUE JCR (STICKY ROJO)
      ========================== */}
      <div style={stickyWrap as any}>
        <div style={{ padding: ".75rem 0" }}>
          <div
            className="card"
            style={{
              padding: ".75rem",
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,.06)",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem", alignItems: "end" }}>
              <div style={{ marginRight: ".25rem" }}>
                <div style={{ fontWeight: 950, fontSize: "1.15rem" }}>JCR Hotels</div>
                <div style={{ opacity: 0.75, marginTop: ".15rem" }}>
                  Filtros globales (aplican a KPIs, H&amp;F, comparativas, rankings, membership y nacionalidades)
                </div>
              </div>

              <SelectPill
                theme="jcr"
                label="Hotel (JCR)"
                value={jcrHotel}
                options={jcrHotelList}
                onChange={(v) => setJcrHotel(v as JcrHotel)}
              />

              <Pill
                theme="jcr"
                label="Año"
                value={jcrYear}
                onChange={(v) => setJcrYear(clampYear(Number(v)))}
              />

              <Pill
                theme="jcr"
                label="Comparar vs"
                value={jcrBaseYear}
                onChange={(v) => setJcrBaseYear(clampYear(Number(v)))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ===== KPIs / Carrousel (JCR) ===== */}
      <section className="section" style={{ display: "grid", gap: "1rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.35rem", fontWeight: 950 }}>
          Marriott / Sheratons — Overview
        </div>

        {/* Carrousel de Highlights (KPIs) */}
        <div style={{ marginTop: ".25rem" }}>
          <HighlightsCarousel
            {...({
              year: jcrYear,
              baseYear: jcrBaseYear,
              filePath: HOF_PATH,
              hotelFilter: jcrHotel,
            } as any)}
          />
        </div>

        {/* Resumen H&F */}
        <div>
          <HofSummary
            {...({
              year: jcrYear,
              baseYear: jcrBaseYear,
              filePath: HOF_PATH,
              hotelFilter: jcrHotel,
            } as any)}
          />
        </div>

        {/* Explorador/Detalle diario */}
        <div>
          <HofExplorer
            {...({
              year: jcrYear,
              baseYear: jcrBaseYear,
              filePath: HOF_PATH,
              hotelFilter: jcrHotel,
            } as any)}
          />
        </div>

        {/* Membership (solo JCR) */}
        <div style={{ marginTop: ".75rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            Membership (JCR)
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Acumulado {jcrYear} · vs {jcrBaseYear} — filtro global hotel/año.
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <MembershipSummary
              {...({
                year: jcrYear,
                baseYear: jcrBaseYear,
                filePath: MEMBERSHIP_PATH,
                hotelFilter: jcrHotel,
              } as any)}
            />
          </div>
        </div>

        {/* Nacionalidades (Marriott only) */}
        <div style={{ marginTop: "1.25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            Nacionalidades (Marriott)
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Ranking por país + distribución por continente. Usa filtro global de año (hotel fijo Marriott).
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <CountryRanking
              {...({
                year: jcrYear,
                filePath: NACIONALIDADES_PATH,
                // nacionalidades es solo Marriott
                hotelFilter: "MARRIOTT",
              } as any)}
            />
          </div>
        </div>
      </section>

      {/* =========================
          BLOQUE MAITEI (STICKY CELESTE)
      ========================== */}
      <div style={stickyWrap as any}>
        <div style={{ padding: ".75rem 0" }}>
          <div
            className="card"
            style={{
              padding: ".75rem",
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,.06)",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem", alignItems: "end" }}>
              <div style={{ marginRight: ".25rem" }}>
                <div style={{ fontWeight: 950, fontSize: "1.15rem" }}>Maitei (Management Gotel)</div>
                <div style={{ opacity: 0.75, marginTop: ".15rem" }}>
                  Bloque independiente con filtros propios (no mezcla con JCR)
                </div>
              </div>

              <SelectPill
                theme="maitei"
                label="Hotel (Maitei)"
                value={maiteiHotel}
                options={maiteiHotelList}
                onChange={(v) => setMaiteiHotel(v as MaiteiHotel)}
              />

              <Pill
                theme="maitei"
                label="Año"
                value={maiteiYear}
                onChange={(v) => setMaiteiYear(clampYear(Number(v)))}
              />

              <Pill
                theme="maitei"
                label="Comparar vs"
                value={maiteiBaseYear}
                onChange={(v) => setMaiteiBaseYear(clampYear(Number(v)))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ===== Bloque Maitei: usa H&F también pero filtrando Empresa=MAITEI ===== */}
      <section className="section" style={{ display: "grid", gap: "1rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.35rem", fontWeight: 950 }}>
          Maitei — Overview
        </div>

        <div style={{ marginTop: ".25rem" }}>
          <HighlightsCarousel
            {...({
              year: maiteiYear,
              baseYear: maiteiBaseYear,
              filePath: HOF_PATH,
              hotelFilter: maiteiHotel,
            } as any)}
          />
        </div>

        <div>
          <HofSummary
            {...({
              year: maiteiYear,
              baseYear: maiteiBaseYear,
              filePath: HOF_PATH,
              hotelFilter: maiteiHotel,
            } as any)}
          />
        </div>

        <div>
          <HofExplorer
            {...({
              year: maiteiYear,
              baseYear: maiteiBaseYear,
              filePath: HOF_PATH,
              hotelFilter: maiteiHotel,
            } as any)}
          />
        </div>
      </section>
    </div>
  );
}
