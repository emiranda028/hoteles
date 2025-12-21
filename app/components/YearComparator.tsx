"use client";

import React, { useEffect, useMemo, useState } from "react";
import HighlightsCarousel from "./HighlightsCarousel";
import HofExplorer from "./HofExplorer";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

type GlobalHotel = "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

const HOTEL_OPTIONS: { key: GlobalHotel; label: string }[] = [
  { key: "JCR", label: "JCR" },
  { key: "MARRIOTT", label: "MARRIOTT" },
  { key: "SHERATON BCR", label: "SHERATON BCR" },
  { key: "SHERATON MDQ", label: "SHERATON MDQ" },
  { key: "MAITEI", label: "MAITEI" },
];

// ✅ lista de hoteles válidos para Membership (NO incluye MAITEI)
const MEMBERSHIP_ALLOWED_HOTELS = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"] as const;

function chipStyle(active: boolean): React.CSSProperties {
  return {
    borderRadius: 999,
    padding: ".5rem .85rem",
    fontWeight: 900,
    border: "1px solid rgba(0,0,0,.15)",
    background: active ? "black" : "white",
    color: active ? "white" : "black",
    cursor: "pointer",
    userSelect: "none",
    fontSize: ".95rem",
  };
}

export default function YearComparator() {
  // filtros globales
  const [year, setYear] = useState<number>(2025);
  const [baseYear, setBaseYear] = useState<number>(2024);
  const [globalHotel, setGlobalHotel] = useState<GlobalHotel>("JCR");

  // years disponibles
  const years = useMemo(() => [2022, 2023, 2024, 2025, 2026], []);

  // ✅ Membership: MAITEI no aplica. Si globalHotel=MAITEI, mostramos el grupo (JCR)
  const membershipHotelFilter = useMemo(() => {
    if (globalHotel === "MAITEI") return "JCR";
    return globalHotel;
  }, [globalHotel]);

  // H&F: hotel real (incluye MAITEI)
  const hfHotel = globalHotel;

  const comparativeTitle = useMemo(() => {
    const hotelLabel = globalHotel === "JCR" ? "Grupo JCR" : globalHotel;
    return `Comparativa ${hotelLabel} — ${year} vs ${baseYear}`;
  }, [globalHotel, year, baseYear]);

  // Ajuste: si baseYear == year, lo corregimos a year-1
  useEffect(() => {
    if (baseYear === year) setBaseYear(year - 1);
  }, [year, baseYear]);

  return (
    <section className="section" id="comparador">
      {/* ===== Encabezado + filtros globales ===== */}
      <div style={{ display: "grid", gap: ".75rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.35rem", fontWeight: 950 }}>
          Comparador anual — Hoteles
        </div>
        <div className="sectionDesc" style={{ opacity: 0.75 }}>
          Todo usa filtro global de <b>año</b> y <b>hotel</b>. Nacionalidades usa <b>año</b> (archivo Marriott).
        </div>

        {/* filtros */}
        <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: ".35rem", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 900, opacity: 0.8, marginRight: ".35rem" }}>Hotel</span>
            {HOTEL_OPTIONS.map((h) => (
              <div key={h.key} style={chipStyle(globalHotel === h.key)} onClick={() => setGlobalHotel(h.key)}>
                {h.label}
              </div>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontWeight: 900, opacity: 0.8 }}>Año</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={selectStyle}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <span style={{ fontWeight: 900, opacity: 0.8 }}>Base</span>
            <select value={baseYear} onChange={(e) => setBaseYear(Number(e.target.value))} style={selectStyle}>
              {years
                .filter((y) => y !== year)
                .map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* ====== 1) CARROUSEL KPIs (JCR) ====== */}
      <div style={{ marginTop: "1.1rem" }}>
        <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
          <HighlightsCarousel year={year} hotel={"JCR"} filePath={HF_PATH} title="Grupo JCR — KPIs" />
        </div>
      </div>

      {/* ====== 2) CARROUSEL KPIs (MAITEI) ====== */}
      <div style={{ marginTop: ".85rem" }}>
        <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
          <HighlightsCarousel year={year} hotel={"MAITEI"} filePath={HF_PATH} title="Maitei — KPIs" />
        </div>
      </div>

      {/* ====== 3) COMPARATIVA ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Comparativa
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem", opacity: 0.75 }}>
          Texto + lectura general (usa filtro global).
        </div>

        <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 22 }}>
          <div style={{ fontWeight: 950 }}>{comparativeTitle}</div>
          <div style={{ marginTop: ".5rem", opacity: 0.8 }}>
            (Bloque estable — después lo dejamos “lindo” sin romper el deploy.)
          </div>
        </div>
      </div>

      {/* ====== 4) HISTORY & FORECAST ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          History & Forecast
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem", opacity: 0.75 }}>
          Explorer + ranking por mes (History). Usa filtro global de año y hotel.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <HofExplorer year={year} hotel={hfHotel} filePath={HF_PATH} />
        </div>
      </div>

      {/* ====== 5) MEMBERSHIP ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Membership (JCR)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem", opacity: 0.75 }}>
          Cantidades + gráficos. Usa filtro global de año + hotel (JCR/MARRIOTT/SHERATONS). MAITEI no aplica → se mapea a JCR.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <MembershipSummary
            year={year}
            baseYear={baseYear}
            filePath={MEMBERSHIP_PATH}
            title="Membership (JCR)"
            allowedHotels={Array.from(MEMBERSHIP_ALLOWED_HOTELS)}
            hotelFilter={membershipHotelFilter as any}
            compactCharts={true}
          />
        </div>
      </div>

      {/* ====== 6) NACIONALIDADES ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Nacionalidades
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem", opacity: 0.75 }}>
          Ranking por país + distribución por continente. (Archivo Marriott). Usa filtro global de año.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <CountryRanking year={year} filePath={NACIONALIDADES_PATH} />
        </div>
      </div>

      <style jsx>{`
        .section {
          display: grid;
          gap: 0;
        }
        .card {
          background: white;
          border: 1px solid rgba(0, 0, 0, 0.06);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
        }
      `}</style>
    </section>
  );
}

const selectStyle: React.CSSProperties = {
  borderRadius: 12,
  padding: ".45rem .6rem",
  border: "1px solid rgba(0,0,0,.15)",
  fontWeight: 900,
};
