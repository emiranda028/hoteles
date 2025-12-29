// app/components/DashboardClient.tsx
"use client";

import { useMemo, useState } from "react";
import YearComparator from "./YearComparator";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";
import { JcrStickyFilters, MaiteiStickyFilters } from "./StickyFilterBars";

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

const JCR_HOTELS = [
  { value: "ALL", label: "Todos" },
  { value: "MARRIOTT", label: "Marriott" },
  { value: "SHERATON BCR", label: "Sheraton BCR" },
  { value: "SHERATON MDQ", label: "Sheraton MDQ" },
];

export default function DashboardClient() {
  // ===== JCR filtros globales =====
  const [jcrYear, setJcrYear] = useState<number>(2025);
  const [jcrBaseYear, setJcrBaseYear] = useState<number>(2024);
  const [jcrHotel, setJcrHotel] = useState<string>("ALL");

  // ===== Maitei filtros propios =====
  const [maiYear, setMaiYear] = useState<number>(2025);
  const [maiBaseYear, setMaiBaseYear] = useState<number>(2024);

  // Si ya los calculás desde el CSV, reemplazá esto
  const years = useMemo(() => [2025, 2024, 2023, 2022, 2021, 2020], []);

  const jcrHotelFilter = jcrHotel === "ALL" ? "" : jcrHotel;

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
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
        />

        {/* ===== Membership (JCR) =====
            OJO: si tu MembershipSummary NO acepta allowedHotels/compactCharts,
            borrá esas props para evitar error de types.
        */}
        <MembershipSummary
          year={jcrYear}
          baseYear={jcrBaseYear}
          filePath={MEMBERSHIP_PATH}
          hotelFilter={jcrHotelFilter}
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

        {/* ===== CONTACTO LTELC (pedido) ===== */}
        <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
          <div style={{ fontWeight: 950 }}>LTELC Consultora</div>
          <div style={{ marginTop: ".35rem", opacity: 0.85 }}>
            <div>
              <b>Correo:</b> agencialtelc@gmail.com
            </div>
            <div>
              <b>Web:</b> www.lotengoenlacabeza.com.ar
            </div>
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

        <YearComparator filePath={HF_PATH} year={maiYear} baseYear={maiBaseYear} hotelFilter={"MAITEI"} />

        <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
          <div style={{ fontWeight: 950 }}>Maitei (Management Gotel)</div>
          <div style={{ opacity: 0.8, marginTop: ".35rem" }}>
            Bloque separado con sus métricas y visuales propios.
          </div>
        </div>
      </section>
    </div>
  );
}
