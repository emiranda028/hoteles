// app/components/YearComparator.tsx
"use client";

import { useMemo, useState } from "react";

// OJO: importá acá exactamente como están tus componentes hoy
import HighlightsCarousel from "./HighlightsCarousel";
import HofSummary from "./HofSummary";
import HofExplorer from "./HofExplorer";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

// Rutas (en /public/data/...)
const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

type JcrHotel = "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ";
type MaiteiHotel = "MAITEI";

export default function YearComparator() {
  // ====== Estado JCR ======
  const [year, setYear] = useState<number>(2024);
  const [baseYear, setBaseYear] = useState<number>(2023);
  const [jcrHotel, setJcrHotel] = useState<JcrHotel>("MARRIOTT");

  // ====== Estado MAITEI (bloque aparte) ======
  const [maiteiYear, setMaiteiYear] = useState<number>(2024);
  const [maiteiBaseYear, setMaiteiBaseYear] = useState<number>(2023);
  const maiteiHotel: MaiteiHotel = "MAITEI";

  const jcrHotels = useMemo<JcrHotel[]>(() => ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"], []);

  // ====== UI Helpers ======
  const pill = (active: boolean, tone: "red" | "blue") => {
    const base: React.CSSProperties = {
      borderRadius: 999,
      padding: ".5rem .85rem",
      fontWeight: 800,
      fontSize: ".95rem",
      cursor: "pointer",
      userSelect: "none",
      border: "1px solid rgba(255,255,255,.22)",
      transition: "transform .04s ease, opacity .12s ease",
    };

    if (tone === "red") {
      return {
        ...base,
        background: active ? "rgba(210, 0, 0, .92)" : "rgba(255,255,255,.10)",
        color: "white",
        boxShadow: active ? "0 10px 22px rgba(210,0,0,.20)" : "none",
      };
    }

    return {
      ...base,
      background: active ? "rgba(0, 140, 255, .92)" : "rgba(255,255,255,.10)",
      color: "white",
      boxShadow: active ? "0 10px 22px rgba(0,140,255,.20)" : "none",
    };
  };

  const selectStyle: React.CSSProperties = {
    width: "100%",
    borderRadius: 14,
    padding: ".65rem .8rem",
    border: "1px solid rgba(255,255,255,.22)",
    background: "rgba(0,0,0,.22)",
    color: "white",
    fontWeight: 800,
    outline: "none",
  };

  const labelStyle: React.CSSProperties = { fontSize: ".85rem", opacity: 0.9, fontWeight: 800 };

  // rangos de años (simple)
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const arr: number[] = [];
    for (let y = now; y >= now - 8; y--) arr.push(y);
    return arr;
  }, []);

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      {/* =======================
          BLOQUE JCR (grupo)
      ======================= */}
      <section className="section" id="jcr" style={{ scrollMarginTop: 90 }}>
        <div className="sectionTitle" style={{ fontSize: "1.35rem", fontWeight: 950 }}>
          Hoteles (JCR)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Filtro global para Marriott / Sheraton BCR / Sheraton MDQ. Se mantiene sticky hasta Nacionalidades.
        </div>

        {/* Sticky filter bar */}
        <div
          style={{
            position: "sticky",
            top: 10,
            zIndex: 50,
            marginTop: ".9rem",
            padding: ".9rem",
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(10,10,12,.72)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div style={{ display: "grid", gap: ".85rem" }}>
            <div style={{ display: "grid", gap: ".45rem" }}>
              <div style={{ fontWeight: 950, letterSpacing: ".2px" }}>Hotel</div>
              <div style={{ display: "flex", gap: ".45rem", flexWrap: "wrap" }}>
                {jcrHotels.map((h) => (
                  <div key={h} style={pill(jcrHotel === h, "red")} onClick={() => setJcrHotel(h)}>
                    {h}
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: ".75rem",
              }}
            >
              <div>
                <div style={labelStyle}>Año</div>
                <select style={selectStyle} value={year} onChange={(e) => setYear(Number(e.target.value))}>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={labelStyle}>Comparar vs</div>
                <select
                  style={selectStyle}
                  value={baseYear}
                  onChange={(e) => setBaseYear(Number(e.target.value))}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ===== 1) KPIs / Highlights (carousel) ===== */}
        <div style={{ marginTop: "1.1rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            KPIs principales
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Ocupación, ADR, RevPAR, Rooms, In-house, etc. (H&amp;F).
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <HighlightsCarousel year={year} baseYear={baseYear} filePath={HF_PATH} hotelFilter={jcrHotel} />
          </div>
        </div>

        {/* ===== 2) Resumen H&F (comparativa) ===== */}
        <div style={{ marginTop: "1.25rem" }} id="comparativa" className="section" />
        <div style={{ marginTop: "1.25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            Comparativa (Acumulado)
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Año seleccionado vs año base, respetando Hotel + Año.
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <HofSummary year={year} baseYear={baseYear} filePath={HF_PATH} hotelFilter={jcrHotel} />
          </div>
        </div>

        {/* ===== 3) Detalle diario / explorador ===== */}
        <div style={{ marginTop: "1.25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            History &amp; Forecast — detalle diario
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Filtra por Año y Hotel. Muestra History/Forecast y métricas por día.
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <HofExplorer year={year} filePath={HF_PATH} hotelFilter={jcrHotel} />
          </div>
        </div>

        {/* ===== 4) Membership (JCR) ===== */}
        <div style={{ marginTop: "1.25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            Membership (JCR)
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Cantidades + gráficos. Filtro global de año + hotel (JCR).
          </div>

          <div style={{ marginTop: ".85rem" }}>
            {/* IMPORTANTE:
               - NO le pases props que no existan (title/allowedHotels) porque te explota en TS.
               - MembershipSummary internamente ya arma títulos y charts.
            */}
            <MembershipSummary year={year} baseYear={baseYear} filePath={MEMBERSHIP_PATH} hotelFilter={jcrHotel} />
          </div>
        </div>

        {/* ===== 5) Nacionalidades ===== */}
        <div style={{ marginTop: "1.25rem" }} id="nacionalidades" className="section" />
        <div style={{ marginTop: "1.25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            Nacionalidades
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Ranking por país + distribución por continente. (Archivo Marriott). Usa filtro global de año.
          </div>

          <div style={{ marginTop: ".85rem" }}>
            {/* CountryRanking hoy NO debe recibir hotelFilter si tu Props no lo tiene */}
            <CountryRanking year={year} filePath={NACIONALIDADES_PATH} />
          </div>
        </div>
      </section>

      {/* =======================
          BLOQUE MAITEI (Gotel)
      ======================= */}
      <section className="section" id="maitei" style={{ scrollMarginTop: 90 }}>
        <div className="sectionTitle" style={{ fontSize: "1.35rem", fontWeight: 950 }}>
          Maitei (Management Gotel)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Bloque independiente, con filtros propios (celeste) y sin mezclarse con JCR.
        </div>

        {/* Filtros MAITEI */}
        <div
          style={{
            position: "sticky",
            top: 10,
            zIndex: 40,
            marginTop: ".9rem",
            padding: ".9rem",
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(10,10,12,.72)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div style={{ display: "grid", gap: ".85rem" }}>
            <div style={{ display: "flex", gap: ".45rem", flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ ...pill(true, "blue"), cursor: "default" }}>{maiteiHotel}</div>
              <div style={{ opacity: 0.9, fontWeight: 800 }}>Filtro independiente</div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: ".75rem",
              }}
            >
              <div>
                <div style={labelStyle}>Año</div>
                <select
                  style={selectStyle}
                  value={maiteiYear}
                  onChange={(e) => setMaiteiYear(Number(e.target.value))}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={labelStyle}>Comparar vs</div>
                <select
                  style={selectStyle}
                  value={maiteiBaseYear}
                  onChange={(e) => setMaiteiBaseYear(Number(e.target.value))}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* KPIs Maitei */}
        <div style={{ marginTop: "1.1rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            KPIs principales (Maitei)
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Mismos cálculos, pero filtrando solo MAITEI.
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <HighlightsCarousel
              year={maiteiYear}
              baseYear={maiteiBaseYear}
              filePath={HF_PATH}
              hotelFilter={maiteiHotel}
            />
          </div>
        </div>

        {/* Resumen Maitei */}
        <div style={{ marginTop: "1.25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            Comparativa (Maitei)
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Acumulado anual vs base, solo MAITEI.
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <HofSummary year={maiteiYear} baseYear={maiteiBaseYear} filePath={HF_PATH} hotelFilter={maiteiHotel} />
          </div>
        </div>

        {/* Detalle Maitei */}
        <div style={{ marginTop: "1.25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            Detalle diario (Maitei)
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            History &amp; Forecast para MAITEI.
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <HofExplorer year={maiteiYear} filePath={HF_PATH} hotelFilter={maiteiHotel} />
          </div>
        </div>
      </section>
    </div>
  );
}
