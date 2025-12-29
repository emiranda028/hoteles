"use client";

import { useMemo, useState } from "react";
import YearComparator from "./components/YearComparator";
import MembershipSummary from "./components/MembershipSummary";
import CountryRanking from "./components/CountryRanking";
import { JcrStickyFilters, MaiteiStickyFilters } from "./components/StickyFilterBars";
import KpiCarousel from "./components/KpiCarousel";

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
  const [jcrQuarter, setJcrQuarter] = useState<number>(0); // 0=Todos
  const [jcrMonth, setJcrMonth] = useState<number>(0); // 0=Todos

  // ===== Maitei (Gotel) filtros =====
  const [maiYear, setMaiYear] = useState<number>(2025);
  const [maiBaseYear, setMaiBaseYear] = useState<number>(2024);
  const [maiQuarter, setMaiQuarter] = useState<number>(0);
  const [maiMonth, setMaiMonth] = useState<number>(0);

  const years = useMemo(() => [2025, 2024, 2023, 2022, 2021, 2020], []);
  const jcrHotelFilter = jcrHotel === "ALL" ? "" : jcrHotel;

  return (
    <main style={{ padding: "1.25rem", display: "grid", gap: "1.25rem" }}>
      {/* =========================
          BLOQUE JCR
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
          quarter={jcrQuarter}
          onQuarter={(q) => {
            setJcrQuarter(q);
            if (q !== 0) setJcrMonth(0);
          }}
          month={jcrMonth}
          onMonth={setJcrMonth}
        />

        {/* Presentación LTELC */}
        <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
          <div style={{ fontWeight: 950, fontSize: "1.25rem" }}>
            Informe de Gestión Hotelera — Grupo JCR
          </div>
          <div style={{ opacity: 0.85, marginTop: ".35rem", lineHeight: 1.35 }}>
            Reporte de LTELC Consultora sobre performance operativa (History & Forecast),
            comparativa interanual, ranking temporal y perfiles de huéspedes.
          </div>

          <div style={{ marginTop: ".85rem", display: "grid", gap: ".35rem" }}>
            <div style={{ fontWeight: 850 }}>LTELC Consultora</div>
            <div style={{ opacity: 0.9 }}>
              Correo: <b>agencialtelc@gmail.com</b>
            </div>
            <div style={{ opacity: 0.9 }}>
              Web: <b>www.lotengoenlacabeza.com.ar</b>
            </div>
          </div>
        </div>

        {/* Carousel KPI extra (RevPAR + Doble Ocupación + Ocupación, etc.) */}
        <KpiCarousel
          title="KPIs destacados (JCR)"
          accent="jcr"
          filePath={HF_PATH}
          year={jcrYear}
          baseYear={jcrBaseYear}
          hotelFilter={jcrHotelFilter}
          quarter={jcrQuarter}
          month={jcrMonth}
        />

        {/* Comparativa + H&F + Ranking */}
        <YearComparator
          filePath={HF_PATH}
          year={jcrYear}
          baseYear={jcrBaseYear}
          hotelFilter={jcrHotelFilter}
          quarter={jcrQuarter}
          month={jcrMonth}
          accent="jcr"
        />

        {/* Membership (JCR) */}
        <MembershipSummary
          year={jcrYear}
          baseYear={jcrBaseYear}
          filePath={MEMBERSHIP_PATH}
          hotelFilter={jcrHotelFilter}
          allowedHotels={["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"]}
          accent="jcr"
        />

        {/* Nacionalidades */}
        <div style={{ marginTop: ".25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
            Nacionalidades
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Ranking por país + distribución por continente. (Archivo Marriott).
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <CountryRanking year={jcrYear} filePath={NACIONALIDADES_PATH} />
          </div>
        </div>
      </section>

      {/* =========================
          BLOQUE GOTEL (MAITEI)
      ========================== */}
      <section style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
        <MaiteiStickyFilters
          year={maiYear}
          baseYear={maiBaseYear}
          onYear={setMaiYear}
          onBaseYear={setMaiBaseYear}
          years={years}
          quarter={maiQuarter}
          onQuarter={(q) => {
            setMaiQuarter(q);
            if (q !== 0) setMaiMonth(0);
          }}
          month={maiMonth}
          onMonth={setMaiMonth}
        />

        <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
          <div style={{ fontWeight: 950, fontSize: "1.15rem" }}>
            Grupo GOTEL — Maitei (Management Gotel)
          </div>
          <div style={{ opacity: 0.85, marginTop: ".35rem" }}>
            Bloque separado con filtros propios y análisis exclusivo de Maitei.
          </div>
        </div>

        <KpiCarousel
          title="KPIs destacados (Maitei)"
          accent="maitei"
          filePath={HF_PATH}
          year={maiYear}
          baseYear={maiBaseYear}
          hotelFilter={"MAITEI"}
          quarter={maiQuarter}
          month={maiMonth}
        />

        <YearComparator
          filePath={HF_PATH}
          year={maiYear}
          baseYear={maiBaseYear}
          hotelFilter={"MAITEI"}
          quarter={maiQuarter}
          month={maiMonth}
          accent="maitei"
        />
      </section>
    </main>
  );
}
