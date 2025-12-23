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
  // ===== JCR filtros globales =====
  const [jcrYear, setJcrYear] = useState<number>(2025);
  const [jcrBaseYear, setJcrBaseYear] = useState<number>(2024);
  const [jcrHotel, setJcrHotel] = useState<string>("ALL");

  // ===== Maitei filtros propios =====
  const [maiYear, setMaiYear] = useState<number>(2025);
  const [maiBaseYear, setMaiBaseYear] = useState<number>(2024);

  // Años: si vos ya los calculás desde el CSV, reemplazá esto.
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

        {/* ===== KPIs / Comparativa / H&F (JCR) ===== */}
        <YearComparator
          filePath={HF_PATH}
          year={jcrYear}
          baseYear={jcrBaseYear}
          hotelFilter={jcrHotelFilter} // "" => todos
          // IMPORTANTE: NO mezclar Sheratons, debe filtrar exacto por Empresa
        />

        {/* ===== Membership (JCR) ===== */}
        <MembershipSummary
          year={jcrYear}
          baseYear={jcrBaseYear}
          filePath={MEMBERSHIP_PATH}
          hotelFilter={jcrHotelFilter} // "" => todos (pero sólo JCR)
          allowedHotels={["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"]}
          compactCharts={false}
        />

        {/* ===== Nacionalidades (solo Marriott, usa filtro global de año) ===== */}
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
      </section>

      {/* =========================
          BLOQUE MAITEI (Gotel) — filtros propios
      ========================== */}
      <section style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
        <MaiteiStickyFilters
          year={maiYear}
          baseYear={maiBaseYear}
          onYear={setMaiYear}
          onBaseYear={setMaiBaseYear}
          years={years}
        />

        {/* YearComparator para MAITEI: mismo componente pero hotelFilter fijo */}
        <YearComparator
          filePath={HF_PATH}
          year={maiYear}
          baseYear={maiBaseYear}
          hotelFilter={"MAITEI"}
        />

        {/* Acá va TODO lo de Maitei en el futuro (tablas, KPIs, etc.) */}
        <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
          <div style={{ fontWeight: 950 }}>Maitei (Management Gotel)</div>
          <div style={{ opacity: 0.8, marginTop: ".35rem" }}>
            Bloque separado con sus métricas y visuales propios.
          </div>
        </div>
      </section>
    </main>
  );
}
