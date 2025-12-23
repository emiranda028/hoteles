"use client";

import React, { useMemo, useState } from "react";

import HighlightsCarousel from "./HighlightsCarousel";
import HofSummary from "./HofSummary";
import HofExplorer from "./HofExplorer";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

/* =========================
   Tipos y constantes
========================= */

type GlobalHotel =
  | "MARRIOTT"
  | "SHERATON BCR"
  | "SHERATON MDQ"
  | "MAITEI";

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

/* =========================
   UI helpers
========================= */

function Pill({
  children,
  bg,
  fg,
}: {
  children: React.ReactNode;
  bg: string;
  fg: string;
}) {
  return (
    <div
      style={{
        background: bg,
        color: fg,
        borderRadius: 16,
        padding: ".5rem .75rem",
        display: "flex",
        gap: ".5rem",
        alignItems: "center",
        flexWrap: "wrap",
        boxShadow: "0 10px 25px rgba(0,0,0,.18)",
      }}
    >
      {children}
    </div>
  );
}

/* =========================
   Componente principal
========================= */

export default function YearComparator() {
  /* ===== JCR ===== */
  const [year, setYear] = useState<number>(2025);
  const [baseYear, setBaseYear] = useState<number>(2024);
  const [globalHotel, setGlobalHotel] =
    useState<GlobalHotel>("MARRIOTT");

  /* ===== MAITEI ===== */
  const [maiteiYear, setMaiteiYear] = useState<number>(2025);
  const [maiteiBaseYear, setMaiteiBaseYear] =
    useState<number>(2024);

  const jcrHotels: GlobalHotel[] = useMemo(
    () => ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"],
    []
  );

  const showJcr = globalHotel !== "MAITEI";

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      {/* =====================================================
          BLOQUE JCR
      ====================================================== */}
      <section className="section" id="jcr">
        <div
          className="sectionTitle"
          style={{ fontSize: "1.45rem", fontWeight: 900 }}
        >
          Grupo JCR — KPIs {year} vs {baseYear}
        </div>

        {/* ===== Filtros JCR ===== */}
        <div
          style={{
            position: "sticky",
            top: 12,
            zIndex: 20,
            marginTop: ".75rem",
            marginBottom: ".75rem",
          }}
        >
          <Pill bg="#b2002d" fg="#fff">
            <strong>Hotel</strong>
            <select
              value={globalHotel}
              onChange={(e) =>
                setGlobalHotel(e.target.value as GlobalHotel)
              }
            >
              {jcrHotels.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
              <option value="MAITEI">
                MAITEI (ver bloque inferior)
              </option>
            </select>

            <strong>Año</strong>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {[2025, 2024, 2023, 2022, 2021, 2020].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <strong>Base</strong>
            <select
              value={baseYear}
              onChange={(e) =>
                setBaseYear(Number(e.target.value))
              }
            >
              {[2024, 2023, 2022, 2021, 2020].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </Pill>
        </div>

        {!showJcr ? (
          <div className="card" style={{ padding: "1rem" }}>
            Estás viendo <b>MAITEI</b>. Bajá al bloque inferior
            para ver sus KPIs.
          </div>
        ) : (
          <>
            {/* ===== Carruseles ===== */}
            <HighlightsCarousel
              year={year}
              hotel={globalHotel}
              filePath={HF_PATH}
            />

            {/* ===== KPIs ===== */}
            <HofSummary
              year={year}
              baseYear={baseYear}
              hotel={globalHotel}
              filePath={HF_PATH}
            />

            {/* ===== Detalle H&F ===== */}
            <HofExplorer
              year={year}
              hotel={globalHotel}
              filePath={HF_PATH}
            />

            {/* ===== Membership ===== */}
            <MembershipSummary
              year={year}
              baseYear={baseYear}
              filePath={MEMBERSHIP_PATH}
              allowedHotels={jcrHotels}
              hotelFilter={globalHotel}
              compactCharts={true}
            />

            {/* ===== Nacionalidades (Marriott) ===== */}
            {globalHotel === "MARRIOTT" && (
              <CountryRanking
                year={year}
                filePath={NACIONALIDADES_PATH}
              />
            )}
          </>
        )}
      </section>

      {/* =====================================================
          BLOQUE MAITEI
      ====================================================== */}
      <section className="section" id="maitei">
        <div
          className="sectionTitle"
          style={{ fontSize: "1.45rem", fontWeight: 900 }}
        >
          Management Gotel (MAITEI) — KPIs {maiteiYear} vs{" "}
          {maiteiBaseYear}
        </div>

        {/* ===== Filtros MAITEI ===== */}
        <div
          style={{
            position: "sticky",
            top: 12,
            zIndex: 20,
            marginTop: ".75rem",
            marginBottom: ".75rem",
          }}
        >
          <Pill bg="#0077b6" fg="#fff">
            <strong>MAITEI</strong>

            <strong>Año</strong>
            <select
              value={maiteiYear}
              onChange={(e) =>
                setMaiteiYear(Number(e.target.value))
              }
            >
              {[2025, 2024, 2023, 2022, 2021].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <strong>Base</strong>
            <select
              value={maiteiBaseYear}
              onChange={(e) =>
                setMaiteiBaseYear(Number(e.target.value))
              }
            >
              {[2024, 2023, 2022, 2021].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </Pill>
        </div>

        <HighlightsCarousel
          year={maiteiYear}
          hotel="MAITEI"
          filePath={HF_PATH}
        />

        <HofSummary
          year={maiteiYear}
          baseYear={maiteiBaseYear}
          hotel="MAITEI"
          filePath={HF_PATH}
        />

        <HofExplorer
          year={maiteiYear}
          hotel="MAITEI"
          filePath={HF_PATH}
        />
      </section>
    </div>
  );
}
