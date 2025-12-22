"use client";

import React, { useEffect, useMemo, useState } from "react";
import HighlightsCarousel from "./HighlightsCarousel";
import HofSummary from "./HofSummary";
import HofExplorer from "./HofExplorer";

// Si tus otros componentes ya existen y funcionan, los importás acá también:
// import MembershipSummary from "./MembershipSummary";
// import CountryRanking from "./CountryRanking";

type GlobalHotel = "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

const HOF_CSV_PATH = "/data/hf_diario.csv"; // <- AJUSTÁ si tu CSV está en otro path en /public
// const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
// const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

function hotelLabel(h: GlobalHotel) {
  if (h === "JCR") return "Grupo JCR";
  if (h === "SHERATON BCR") return "Sheraton BCR";
  if (h === "SHERATON MDQ") return "Sheraton MDQ";
  if (h === "MAITEI") return "Maitei (Gotel)";
  return "Marriott";
}

export default function YearComparator() {
  const [year, setYear] = useState<number>(2025);
  const [baseYear, setBaseYear] = useState<number>(2024);
  const [globalHotel, setGlobalHotel] = useState<GlobalHotel>("JCR");

  // Si querés que el baseYear se ajuste automáticamente:
  useEffect(() => {
    if (baseYear >= year) setBaseYear(year - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const hotelOptions: GlobalHotel[] = useMemo(
    () => ["JCR", "MARRIOTT", "SHERATON BCR", "SHERATON MDQ", "MAITEI"],
    []
  );

  const yearOptions = useMemo(() => {
    // Podés ampliar; ideal sería leer dinámico del CSV, pero hoy lo dejamos fijo y estable.
    return [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];
  }, []);

  return (
    <section className="section" id="comparador" style={{ padding: "1rem 0" }}>
      {/* ===== Encabezado + filtros globales ===== */}
      <div style={{ display: "grid", gap: ".75rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.35rem", fontWeight: 950 }}>
          Comparador anual — History &amp; Forecast
        </div>

        <div
          className="card"
          style={{
            padding: "1rem",
            borderRadius: 18,
            display: "grid",
            gap: ".9rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            alignItems: "end",
          }}
        >
          <div>
            <div style={{ fontSize: ".9rem", opacity: 0.85, fontWeight: 900 }}>Año</div>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{
                width: "100%",
                marginTop: ".35rem",
                padding: ".6rem .75rem",
                borderRadius: 12,
                background: "rgba(255,255,255,.06)",
                border: "1px solid rgba(255,255,255,.10)",
              }}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: ".9rem", opacity: 0.85, fontWeight: 900 }}>Base (comparativa)</div>
            <select
              value={baseYear}
              onChange={(e) => setBaseYear(Number(e.target.value))}
              style={{
                width: "100%",
                marginTop: ".35rem",
                padding: ".6rem .75rem",
                borderRadius: 12,
                background: "rgba(255,255,255,.06)",
                border: "1px solid rgba(255,255,255,.10)",
              }}
            >
              {yearOptions
                .filter((y) => y < year)
                .map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: ".9rem", opacity: 0.85, fontWeight: 900 }}>Hotel (filtro global)</div>
            <select
              value={globalHotel}
              onChange={(e) => setGlobalHotel(e.target.value as GlobalHotel)}
              style={{
                width: "100%",
                marginTop: ".35rem",
                padding: ".6rem .75rem",
                borderRadius: 12,
                background: "rgba(255,255,255,.06)",
                border: "1px solid rgba(255,255,255,.10)",
              }}
            >
              {hotelOptions.map((h) => (
                <option key={h} value={h}>
                  {hotelLabel(h)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ===== 1) CAROUSEL KPIs (AÑO SELECCIONADO) ===== */}
      <div style={{ marginTop: "1.1rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
          KPIs {year} — {hotelLabel(globalHotel)}
        </div>
        <div className="sectionDesc" style={{ marginTop: ".25rem" }}>
          KPIs calculados correctamente (sin sumar porcentajes).
        </div>

        <div style={{ marginTop: ".8rem" }}>
          <HighlightsCarousel filePath={HOF_CSV_PATH} year={year} hotel={globalHotel} />
        </div>
      </div>

      {/* ===== 2) RESUMEN H&F (GRID KPIs + CONTROLES) ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
          Resumen H&amp;F — {year}
        </div>
        <div className="sectionDesc" style={{ marginTop: ".25rem" }}>
          Revenue / ADR / Ocupación / RevPAR + totales.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <HofSummary filePath={HOF_CSV_PATH} year={year} hotel={globalHotel} />
        </div>
      </div>

      {/* ===== 3) DETALLE DIARIO ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
          Detalle diario — {year}
        </div>
        <div className="sectionDesc" style={{ marginTop: ".25rem" }}>
          Últimas filas del año filtrado.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <HofExplorer filePath={HOF_CSV_PATH} year={year} hotel={globalHotel} limit={90} />
        </div>
      </div>

      {/* ===== 4) COMPARATIVA (AÑO vs BASE) ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
          Comparativa — {year} vs {baseYear}
        </div>
        <div className="sectionDesc" style={{ marginTop: ".25rem" }}>
          Esta sección es el “antes y después” para {hotelLabel(globalHotel)}.
        </div>

        {/* Para no meter otro archivo hoy: reusamos HofSummary dos veces y se ve súper claro */}
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".9rem", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <div>
            <div style={{ fontWeight: 950, marginBottom: ".5rem" }}>{year}</div>
            <HofSummary filePath={HOF_CSV_PATH} year={year} hotel={globalHotel} />
          </div>
          <div>
            <div style={{ fontWeight: 950, marginBottom: ".5rem" }}>{baseYear}</div>
            <HofSummary filePath={HOF_CSV_PATH} year={baseYear} hotel={globalHotel} />
          </div>
        </div>
      </div>

      {/* ===== 5) MEMBERSHIP y NACIONALIDADES ===== */}
      {/* 
        Te lo dejo comentado para que NO se rompa si hoy están en proceso.
        Vos ya dijiste que membership y nacionalidades funcionan, así que si ya los tenés:
        
        <MembershipSummary year={year} baseYear={baseYear} allowedHotels={...} filePath={MEMBERSHIP_PATH} hotelFilter={...} compactCharts />
        <CountryRanking year={year} filePath={NACIONALIDADES_PATH} />

        Nota: Nacionalidades NO necesita filtro hotel (es solo Marriott).
      */}
    </section>
  );
}
