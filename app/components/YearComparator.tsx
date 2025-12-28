"use client";

import React from "react";
import { HofDataProvider, useHofData } from "./HofDataProvider";

import HighlightsCarousel from "./HighlightsCarousel";
import ComparativeKpis from "./ComparativeKpis";
import MonthRanking from "./MonthRanking";
import WeekdayRanking from "./WeekdayRanking";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

/* =========================
   Header + Contacto (LTELC)
========================= */

function IntroCard() {
  return (
    <section className="card" style={{ padding: "1rem", borderRadius: 22 }}>
      <div style={{ fontSize: "1.35rem", fontWeight: 950 }}>Informe de gestión — LTELC Consultora</div>
      <div style={{ marginTop: ".35rem", opacity: 0.85 }}>
        Reporte de gestión hotelera (H&F / Membership / Nacionalidades) para Grupo JCR + Grupo Gotel.
      </div>

      <div
        style={{
          marginTop: ".85rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: ".75rem",
        }}
      >
        <div className="card" style={{ padding: ".85rem", borderRadius: 16 }}>
          <div style={{ fontWeight: 900 }}>Contacto</div>
          <div style={{ marginTop: ".35rem", opacity: 0.9 }}>
            Correo: <b>agencialtelc@gmail.com</b>
            <br />
            Web: <b>www.lotengoenlacabeza.com.ar</b>
          </div>
        </div>

        <div className="card" style={{ padding: ".85rem", borderRadius: 16 }}>
          <div style={{ fontWeight: 900 }}>Fuente</div>
          <div style={{ marginTop: ".35rem", opacity: 0.9 }}>
            CSV: <b>hf_diario.csv</b>
            <br />
            XLSX: <b>jcr_membership.xlsx</b> / <b>jcr_nacionalidades.xlsx</b>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================
   Sticky Filters
========================= */

function StickyFiltersJcr() {
  const { year, setYear, baseYear, setBaseYear, hof, setHof, jcrHotel, setJcrHotel } = useHofData();

  return (
    <div
      style={{
        position: "sticky",
        top: 12,
        zIndex: 50,
        display: "grid",
        gap: ".5rem",
        padding: ".75rem",
        borderRadius: 18,
        border: "1px solid rgba(210,0,35,.35)",
        background: "rgba(35,0,0,.55)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div style={{ fontWeight: 950 }}>Filtros — Grupo JCR</div>

      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
        <select value={jcrHotel} onChange={(e) => setJcrHotel(e.target.value as any)} style={{ padding: ".4rem .6rem", borderRadius: 12 }}>
          <option value="MARRIOTT">Marriott</option>
          <option value="SHERATON BCR">Sheraton BCR</option>
          <option value="SHERATON MDQ">Sheraton MDQ</option>
        </select>

        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ padding: ".4rem .6rem", borderRadius: 12 }}>
          <option value={2025}>2025</option>
          <option value={2024}>2024</option>
          <option value={2023}>2023</option>
          <option value={2022}>2022</option>
        </select>

        <select value={baseYear} onChange={(e) => setBaseYear(Number(e.target.value))} style={{ padding: ".4rem .6rem", borderRadius: 12 }}>
          <option value={2024}>Base 2024</option>
          <option value={2023}>Base 2023</option>
          <option value={2022}>Base 2022</option>
        </select>

        <select value={hof} onChange={(e) => setHof(e.target.value as any)} style={{ padding: ".4rem .6rem", borderRadius: 12 }}>
          <option value="All">History + Forecast</option>
          <option value="History">History</option>
          <option value="Forecast">Forecast</option>
        </select>

        <div style={{ marginLeft: "auto", opacity: 0.9, fontWeight: 800 }}>
          Color: <span style={{ color: "rgba(255,90,90,.95)" }}>Marriott red</span>
        </div>
      </div>
    </div>
  );
}

function StickyFiltersGotel() {
  const { year, setYear, baseYear, setBaseYear, hof, setHof, maiteiOn, setMaiteiOn } = useHofData();

  return (
    <div
      style={{
        position: "sticky",
        top: 12,
        zIndex: 50,
        display: "grid",
        gap: ".5rem",
        padding: ".75rem",
        borderRadius: 18,
        border: "1px solid rgba(0,160,255,.35)",
        background: "rgba(0,20,35,.55)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div style={{ fontWeight: 950 }}>Filtros — Grupo Gotel (Maitei)</div>

      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={() => setMaiteiOn(true)}
          style={{
            padding: ".4rem .6rem",
            borderRadius: 12,
            border: "1px solid rgba(0,160,255,.35)",
            background: maiteiOn ? "rgba(0,160,255,.25)" : "rgba(255,255,255,.08)",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Maitei (ON)
        </button>

        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ padding: ".4rem .6rem", borderRadius: 12 }}>
          <option value={2025}>2025</option>
          <option value={2024}>2024</option>
          <option value={2023}>2023</option>
          <option value={2022}>2022</option>
        </select>

        <select value={baseYear} onChange={(e) => setBaseYear(Number(e.target.value))} style={{ padding: ".4rem .6rem", borderRadius: 12 }}>
          <option value={2024}>Base 2024</option>
          <option value={2023}>Base 2023</option>
          <option value={2022}>Base 2022</option>
        </select>

        <select value={hof} onChange={(e) => setHof(e.target.value as any)} style={{ padding: ".4rem .6rem", borderRadius: 12 }}>
          <option value="All">History + Forecast</option>
          <option value="History">History</option>
          <option value="Forecast">Forecast</option>
        </select>

        <div style={{ marginLeft: "auto", opacity: 0.9, fontWeight: 800 }}>
          Color: <span style={{ color: "rgba(0,200,255,.95)" }}>Celeste</span>
        </div>
      </div>
    </div>
  );
}

/* =========================
   Body
========================= */

function Body() {
  const { jcrHotel } = useHofData();

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <IntroCard />

      {/* =========================
          BLOQUE JCR
      ========================== */}
      <section className="section">
        <div className="sectionTitle" style={{ fontSize: "1.35rem", fontWeight: 950 }}>
          Grupo JCR — Gestión hotelera
        </div>
        <div style={{ marginTop: ".75rem" }}>
          <StickyFiltersJcr />
        </div>

        <div style={{ marginTop: "1rem", display: "grid", gap: "1.25rem" }}>
          {/* Carrousel KPIs */}
          <HighlightsCarousel group="jcr" />

          {/* Comparativa */}
          <ComparativeKpis group="jcr" />

          {/* Ranking meses */}
          <MonthRanking group="jcr" />

          {/* Ranking día semana */}
          <WeekdayRanking group="jcr" />

          {/* Membership */}
          <MembershipSummary
            theme="jcr"
            title={`Membership — ${jcrHotel}`}
            filePath={MEMBERSHIP_PATH}
            hotelFilter={jcrHotel}
          />

          {/* Nacionalidades */}
          <CountryRanking year={2025} filePath={NACIONALIDADES_PATH} />
        </div>
      </section>

      {/* =========================
          BLOQUE GOTEL / MAITEI
      ========================== */}
      <section className="section" style={{ marginTop: "1rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.35rem", fontWeight: 950 }}>
          Grupo Gotel — Maitei (Management)
        </div>
        <div style={{ marginTop: ".75rem" }}>
          <StickyFiltersGotel />
        </div>

        <div style={{ marginTop: "1rem", display: "grid", gap: "1.25rem" }}>
          <HighlightsCarousel group="gotel" />
          <ComparativeKpis group="gotel" />
          <MonthRanking group="gotel" />
          <WeekdayRanking group="gotel" />
        </div>
      </section>
    </div>
  );
}

/* =========================
   Export default
========================= */

export default function YearComparator() {
  return (
    <HofDataProvider filePath={HF_PATH} defaultYear={2025} defaultBaseYear={2024}>
      <Body />
    </HofDataProvider>
  );
}
