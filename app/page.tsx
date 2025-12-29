"use client";

import { useMemo, useState } from "react";
import YearComparator from "./components/YearComparator";
import MembershipSummary from "./components/MembershipSummary";
import CountryRanking from "./components/CountryRanking";
import { JcrStickyFilters, MaiteiStickyFilters } from "./components/StickyFilterBars";

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

const JCR_HOTELS = [
  { value: "ALL", label: "Todos" },
  { value: "MARRIOTT", label: "Marriott" },
  { value: "SHERATON BCR", label: "Sheraton BCR" },
  { value: "SHERATON MDQ", label: "Sheraton MDQ" },
];

export default function Page() {
  // ===== JCR filtros =====
  const [jcrYear, setJcrYear] = useState<number>(2025);
  const [jcrBaseYear, setJcrBaseYear] = useState<number>(2024);
  const [jcrHotel, setJcrHotel] = useState<string>("ALL");

  // ===== Maitei filtros =====
  const [maiYear, setMaiYear] = useState<number>(2025);
  const [maiBaseYear, setMaiBaseYear] = useState<number>(2024);

  // Si después querés detectarlos desde CSV, lo cambiamos.
  const years = useMemo(() => [2025, 2024, 2023, 2022, 2021, 2020], []);

  const jcrHotelFilter = jcrHotel === "ALL" ? "" : jcrHotel;

  return (
    <main style={{ padding: "1.25rem", display: "grid", gap: "1.25rem" }}>
      {/* =========================
          BLOQUE JCR (hasta Nacionalidades)
      ========================== */}
      <section style={{ display: "grid", gap: "1rem" }}>
        <JcrStickyFilters
          year={jcrYear}
          baseYear={jcrBaseYear}
          onYear={setJcrYear}
          onBaseYear={setJcrBaseYear}
          hotel={jcrHotel}
          onHotel={setJcrHotel}
          years={years}
          hotels={JCR_HOTELS}
        />

        {/* KPI / Comparativa / H&F / Rankings (JCR) */}
        <YearComparator filePath={HF_PATH} year={jcrYear} baseYear={jcrBaseYear} hotelFilter={jcrHotelFilter} />

        {/* Membership (JCR) */}
        <MembershipSummary
          year={jcrYear}
          baseYear={jcrBaseYear}
          filePath={MEMBERSHIP_PATH}
          hotelFilter={jcrHotelFilter}
          compactCharts={false}
        />

        {/* Nacionalidades (Marriott file) */}
        <div style={{ marginTop: ".25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
            Nacionalidades
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Ranking por país + distribución por continente. (Archivo Marriott). Usa filtro global de año.
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <CountryRanking year={jcrYear} filePath={NACIONALIDADES_PATH} />
          </div>
        </div>

        {/* Contacto LTELC */}
        <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
          <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>LTELC Consultora</div>
          <div style={{ opacity: 0.85, marginTop: ".25rem" }}>Gestión de datos · Tableros · Inteligencia hotelera</div>
          <div style={{ marginTop: ".6rem", display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            <span
              style={{
                padding: ".25rem .55rem",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                fontSize: 12,
              }}
            >
              Correo: agencialtelc@gmail.com
            </span>
            <span
              style={{
                padding: ".25rem .55rem",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                fontSize: 12,
              }}
            >
              Web: www.lotengoenlacabeza.com.ar
            </span>
          </div>
        </div>
      </section>

      {/* =========================
          BLOQUE MAITEI (Gotel) — separado abajo de todo
      ========================== */}
      <section style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
        <MaiteiStickyFilters year={maiYear} baseYear={maiBaseYear} onYear={setMaiYear} onBaseYear={setMaiBaseYear} years={years} />

        <YearComparator filePath={HF_PATH} year={maiYear} baseYear={maiBaseYear} hotelFilter={"MAITEI"} />

        <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
          <div style={{ fontWeight: 950 }}>Maitei (Management Gotel)</div>
          <div style={{ opacity: 0.8, marginTop: ".35rem" }}>
            Bloque separado con sus métricas y visuales propios (carrouseles + comparativa + ranking por mes).
          </div>
        </div>
      </section>
    </main>
  );
}
