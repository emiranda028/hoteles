"use client";

import React, { useMemo, useState } from "react";
import HighlightsCarousel from "./HighlightsCarousel";
import HofSummary from "./HofSummary";
import HofExplorer from "./HofExplorer";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

type GlobalHotel = "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

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
        borderRadius: 14,
        padding: ".45rem .75rem",
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

export default function YearComparator() {
  // ====== BLOQUE JCR ======
  const [year, setYear] = useState<number>(2025);
  const [baseYear, setBaseYear] = useState<number>(2024);
  const [globalHotel, setGlobalHotel] = useState<GlobalHotel>("MARRIOTT");

  // ====== BLOQUE MAITEI (separado) ======
  const [maiteiYear, setMaiteiYear] = useState<number>(2025);
  const [maiteiBaseYear, setMaiteiBaseYear] = useState<number>(2024);

  const jcrHotels: GlobalHotel[] = useMemo(() => ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"], []);
  const showJcr = useMemo(() => globalHotel !== "MAITEI", [globalHotel]);

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      {/* =======================
          BLOQUE JCR (grupo)
      ======================= */}
      <section className="section" id="grupo-jcr" style={{ display: "grid", gap: "1rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.45rem", fontWeight: 950 }}>
          Grupo JCR — KPIs {year} (vs {baseYear})
        </div>

        {/* Sticky filtros JCR */}
        <div
          style={{
            position: "sticky",
            top: 10,
            zIndex: 20,
            display: "flex",
            justifyContent: "flex-start",
          }}
        >
          <Pill bg="#b2002d" fg="#fff">
            <span style={{ fontWeight: 950 }}>Hotel</span>
            <select
              value={globalHotel}
              onChange={(e) => setGlobalHotel(e.target.value as GlobalHotel)}
              style={{
                borderRadius: 12,
                padding: ".35rem .5rem",
                border: "1px solid rgba(255,255,255,0.35)",
                background: "rgba(255,255,255,0.10)",
                color: "#fff",
                outline: "none",
              }}
            >
              {jcrHotels.map((h) => (
                <option key={h} value={h} style={{ color: "#000" }}>
                  {h}
                </option>
              ))}
              <option value="MAITEI" style={{ color: "#000" }}>
                MAITEI (ver bloque abajo)
              </option>
            </select>

            <span style={{ fontWeight: 950, marginLeft: ".25rem" }}>Año</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{
                borderRadius: 12,
                padding: ".35rem .5rem",
                border: "1px solid rgba(255,255,255,0.35)",
                background: "rgba(255,255,255,0.10)",
                color: "#fff",
                outline: "none",
              }}
            >
              {[2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018].map((y) => (
                <option key={y} value={y} style={{ color: "#000" }}>
                  {y}
                </option>
              ))}
            </select>

            <span style={{ fontWeight: 950, marginLeft: ".25rem" }}>Base</span>
            <select
              value={baseYear}
              onChange={(e) => setBaseYear(Number(e.target.value))}
              style={{
                borderRadius: 12,
                padding: ".35rem .5rem",
                border: "1px solid rgba(255,255,255,0.35)",
                background: "rgba(255,255,255,0.10)",
                color: "#fff",
                outline: "none",
              }}
            >
              {[2024, 2023, 2022, 2021, 2020, 2019, 2018].map((y) => (
                <option key={y} value={y} style={{ color: "#000" }}>
                  {y}
                </option>
              ))}
            </select>

            <span style={{ opacity: 0.85, marginLeft: ".25rem" }}>
              (aplica a todo el bloque JCR)
            </span>
          </Pill>
        </div>

        {/* Si el usuario selecciona MAITEI arriba, le avisamos */}
        {!showJcr ? (
          <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
            Estás viendo MAITEI. Bajá al bloque <b>Management Gotel (MAITEI)</b> para sus filtros y KPIs.
          </div>
        ) : (
          <>
            {/* ====== 1) Carruseles KPI ====== */}
            <div style={{ marginTop: ".35rem" }}>
              <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
                Highlights (carruseles)
              </div>
              <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
                KPIs calculados desde H&amp;F — hotel/año global.
              </div>
              <div style={{ marginTop: ".75rem" }}>
                <HighlightsCarousel year={year} hotel={globalHotel} filePath={HF_PATH} />
              </div>
            </div>

            {/* ====== 2) KPIs principales ====== */}
            <div style={{ marginTop: "1.15rem" }}>
              <HofSummary
                year={year}
                baseYear={baseYear}
                hotel={globalHotel}
                filePath={HF_PATH}
                title={`H&F — KPIs ${year} (vs ${baseYear}) · ${globalHotel}`}
              />
            </div>

            {/* ====== 3) Detalle H&F ====== */}
            <div style={{ marginTop: "1.15rem" }}>
              <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
                History &amp; Forecast — Detalle
              </div>
              <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
                Tabla diaria del H&amp;F con filtros por mes y HoF (History / hoy / Forecast).
              </div>
              <HofExplorer year={year} hotel={globalHotel} filePath={HF_PATH} />
            </div>

            {/* ====== 4) Membership (JCR) ====== */}
            <div style={{ marginTop: "1.25rem" }}>
              <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
                Membership (JCR)
              </div>
              <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
                Año + hotel global (MARRIOTT / SHERATON BCR / SHERATON MDQ).
              </div>

<div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
  {`Membership (JCR) — Acumulado ${year} · vs ${baseYear}`}
</div>

<div style={{ marginTop: ".85rem" }}>
  <MembershipSummary
    year={year}
    baseYear={baseYear}
    filePath={MEMBERSHIP_PATH}
    allowedHotels={["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"]}
    hotelFilter={globalHotel}
    compactCharts={true}
  />
</div>


            {/* ====== 5) Nacionalidades (solo Marriott) ====== */}
            <div style={{ marginTop: "1.25rem" }}>
              <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
                Nacionalidades
              </div>
              <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
                Ranking por país + distribución por continente. (Archivo Marriott). Usa filtro global de año.
              </div>

              <div style={{ marginTop: ".85rem" }}>
                <CountryRanking year={year} filePath={NACIONALIDADES_PATH} />
              </div>
            </div>
          </>
        )}
      </section>

      {/* =======================
          BLOQUE MAITEI (separado)
      ======================= */}
      <section className="section" id="maitei" style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.45rem", fontWeight: 950 }}>
          Management Gotel (MAITEI) — KPIs {maiteiYear} (vs {maiteiBaseYear})
        </div>

        <div style={{ position: "sticky", top: 10, zIndex: 20, display: "flex", justifyContent: "flex-start" }}>
          <Pill bg="#0077b6" fg="#fff">
            <span style={{ fontWeight: 950 }}>Hotel</span>
            <span style={{ fontWeight: 950, opacity: 0.95 }}>MAITEI</span>

            <span style={{ fontWeight: 950, marginLeft: ".25rem" }}>Año</span>
            <select
              value={maiteiYear}
              onChange={(e) => setMaiteiYear(Number(e.target.value))}
              style={{
                borderRadius: 12,
                padding: ".35rem .5rem",
                border: "1px solid rgba(255,255,255,0.35)",
                background: "rgba(255,255,255,0.10)",
                color: "#fff",
                outline: "none",
              }}
            >
              {[2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018].map((y) => (
                <option key={y} value={y} style={{ color: "#000" }}>
                  {y}
                </option>
              ))}
            </select>

            <span style={{ fontWeight: 950, marginLeft: ".25rem" }}>Base</span>
            <select
              value={maiteiBaseYear}
              onChange={(e) => setMaiteiBaseYear(Number(e.target.value))}
              style={{
                borderRadius: 12,
                padding: ".35rem .5rem",
                border: "1px solid rgba(255,255,255,0.35)",
                background: "rgba(255,255,255,0.10)",
                color: "#fff",
                outline: "none",
              }}
            >
              {[2024, 2023, 2022, 2021, 2020, 2019, 2018].map((y) => (
                <option key={y} value={y} style={{ color: "#000" }}>
                  {y}
                </option>
              ))}
            </select>
          </Pill>
        </div>

        <div style={{ marginTop: ".35rem" }}>
          <HighlightsCarousel year={maiteiYear} hotel="MAITEI" filePath={HF_PATH} />
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <HofSummary
            year={maiteiYear}
            baseYear={maiteiBaseYear}
            hotel="MAITEI"
            filePath={HF_PATH}
            title={`H&F — KPIs ${maiteiYear} (vs ${maiteiBaseYear}) · MAITEI`}
          />
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            History &amp; Forecast — Detalle (MAITEI)
          </div>
          <HofExplorer year={maiteiYear} hotel="MAITEI" filePath={HF_PATH} />
        </div>
      </section>
    </div>
  );
}

