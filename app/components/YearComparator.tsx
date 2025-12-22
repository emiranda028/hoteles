"use client";

import React, { useMemo, useState } from "react";
import HighlightsCarousel from "./HighlightsCarousel";
import HofExplorer, { HofHotel } from "./HofExplorer";
import HofSummary from "./HofSummary";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

/**
 * YearComparator — FULL
 * - Filtro global de AÑO
 * - Filtro global de HOTEL (JCR / MARRIOTT / SHERATONS / MAITEI)
 * - Carrouseles (KPIs) correctos (ocupación <= 100)
 * - Comparativa year vs baseYear
 * - H&F detalle mensual + diario
 * - MAITEI separado como sección (Gotel)
 * - Membership usa filtro global (JCR/MARRIOTT/SHERATONS)
 * - Nacionalidades: SOLO Marriott, filtro SOLO año
 * - Responsive (grid auto-fit + tablas con overflowX)
 */

type GlobalHotel = "JCR" | "MARRIOTT" | "SHERATONS" | "MAITEI";

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

const JCR_HOTELS = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"] as const;
type MembershipHotel = (typeof JCR_HOTELS)[number];

function clampYear(y: number) {
  if (!y || !Number.isFinite(y)) return new Date().getFullYear();
  return Math.max(2015, Math.min(2100, Math.round(y)));
}

function mapGlobalHotelToHofHotel(h: GlobalHotel): HofHotel {
  if (h === "JCR") return "JCR";
  if (h === "MARRIOTT") return "MARRIOTT";
  if (h === "MAITEI") return "MAITEI";
  // SHERATONS = JCR sheratons (pero H&F se filtra por empresa real desde expandHotel)
  return "JCR";
}

function membershipAllowedHotels(globalHotel: GlobalHotel): MembershipHotel[] {
  if (globalHotel === "MARRIOTT") return ["MARRIOTT"];
  if (globalHotel === "SHERATONS") return ["SHERATON BCR", "SHERATON MDQ"];
  // JCR incluye los 3
  return ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
}

function membershipHotelFilter(globalHotel: GlobalHotel): "JCR" | MembershipHotel {
  if (globalHotel === "MARRIOTT") return "MARRIOTT";
  if (globalHotel === "SHERATONS") return "JCR"; // se filtra por allowedHotels
  return "JCR";
}

export default function YearComparator() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [baseYear, setBaseYear] = useState<number>(currentYear - 1);
  const [globalHotel, setGlobalHotel] = useState<GlobalHotel>("JCR");

  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = currentYear; y >= currentYear - 8; y--) out.push(y);
    // por si querés manualmente más atrás
    if (out.indexOf(2018) === -1) out.push(2018);
    if (out.indexOf(2019) === -1) out.push(2019);
    out.sort((a, b) => b - a);
    return Array.from(new Set(out));
  }, [currentYear]);

  const hofHotel: HofHotel = useMemo(() => mapGlobalHotelToHofHotel(globalHotel), [globalHotel]);

  const membershipAllowed = useMemo(() => membershipAllowedHotels(globalHotel), [globalHotel]);
  const membershipFilter = useMemo(() => membershipHotelFilter(globalHotel), [globalHotel]);

  const hotelLabel = useMemo(() => {
    if (globalHotel === "JCR") return "Grupo JCR";
    if (globalHotel === "SHERATONS") return "Sheratons (BCR + MDQ)";
    if (globalHotel === "MARRIOTT") return "Marriott";
    return "Maitei (Gotel)";
  }, [globalHotel]);

  return (
    <section className="section" id="comparador">
      {/* ===== Encabezado + filtros globales ===== */}
      <div style={{ display: "grid", gap: ".75rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.35rem", fontWeight: 950 }}>
          Comparador — {hotelLabel}
        </div>

        <div className="sectionDesc" style={{ opacity: 0.9 }}>
          Todo usa filtro global de <b>año</b> y <b>hotel</b>, excepto <b>Nacionalidades</b> (solo Marriott, filtro de año).
        </div>

        <div
          className="card"
          style={{
            padding: "1rem",
            borderRadius: 18,
            display: "grid",
            gap: ".75rem",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: ".75rem",
              alignItems: "end",
            }}
          >
            {/* Hotel */}
            <div>
              <div style={{ fontWeight: 850, opacity: 0.9 }}>Hotel</div>
              <select
                value={globalHotel}
                onChange={(e) => setGlobalHotel(e.target.value as GlobalHotel)}
                style={{
                  width: "100%",
                  marginTop: ".35rem",
                  padding: ".6rem .7rem",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "inherit",
                }}
              >
                <option value="JCR">JCR (3 hoteles)</option>
                <option value="MARRIOTT">MARRIOTT</option>
                <option value="SHERATONS">SHERATONS (BCR + MDQ)</option>
                <option value="MAITEI">MAITEI (Gotel)</option>
              </select>
            </div>

            {/* Año */}
            <div>
              <div style={{ fontWeight: 850, opacity: 0.9 }}>Año</div>
              <select
                value={year}
                onChange={(e) => {
                  const y = clampYear(parseInt(e.target.value, 10));
                  setYear(y);
                  // si quedan iguales, bajamos base
                  if (baseYear === y) setBaseYear(y - 1);
                }}
                style={{
                  width: "100%",
                  marginTop: ".35rem",
                  padding: ".6rem .7rem",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "inherit",
                }}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Base */}
            <div>
              <div style={{ fontWeight: 850, opacity: 0.9 }}>Comparar vs</div>
              <select
                value={baseYear}
                onChange={(e) => setBaseYear(clampYear(parseInt(e.target.value, 10)))}
                style={{
                  width: "100%",
                  marginTop: ".35rem",
                  padding: ".6rem .7rem",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "inherit",
                }}
              >
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

          <div style={{ opacity: 0.8, fontSize: ".92rem" }}>
            Tip: en mobile, todo se adapta; tablas con scroll horizontal (sin romper cards).
          </div>
        </div>
      </div>

      {/* ====== 1) CARROUSELES KPI ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          {globalHotel === "MAITEI" ? "MAITEI — KPIs" : "Grupo — KPIs"}
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          KPIs anuales calculados bien (ocupación real = occ / total rooms).
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <HighlightsCarousel filePath={HF_PATH} year={year} hotel={hofHotel} />
        </div>
      </div>

      {/* ====== 2) COMPARATIVA ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Comparativa — {year} vs {baseYear}
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Tabla mensual + KPIs comparados.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <HofSummary filePath={HF_PATH} year={year} baseYear={baseYear} hotel={hofHotel} />
        </div>
      </div>

      {/* ====== 3) H&F DETALLE ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          History & Forecast — Detalle
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Mensual + diario (limitado) según filtros globales.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <HofExplorer filePath={HF_PATH} year={year} hotel={hofHotel} mode="All" />
        </div>
      </div>

      {/* ====== 4) MEMBERSHIP (JCR) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Membership (JCR) — Cantidades + gráficos
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Usa filtro global de año + hotel (JCR/MARRIOTT/SHERATONS). Gráficos en modo compacto.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <MembershipSummary
            year={year}
            baseYear={baseYear}
            allowedHotels={membershipAllowed as any}
            filePath={MEMBERSHIP_PATH}
            title={`Membership (${globalHotel === "SHERATONS" ? "SHERATONS" : membershipFilter}) — Acumulado ${year} · vs ${baseYear}`}
            hotelFilter={membershipFilter as any}
            compactCharts={true}
          />
        </div>
      </div>

      {/* ====== 5) NACIONALIDADES (solo Marriott) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Nacionalidades (Marriott)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Ranking por país + distribución por continente + ranking por mes. Usa filtro global de año.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <CountryRanking year={year} filePath={NACIONALIDADES_PATH} />
        </div>
      </div>

      {/* ====== 6) MAITEI separado (si globalHotel es JCR o SHERATONS o MARRIOTT, igual lo dejamos visible como sección extra opcional) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          MAITEI (Gotel) — Sección separada
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Siempre disponible para revisar rápido, sin afectar el filtro del resto.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <HighlightsCarousel filePath={HF_PATH} year={year} hotel={"MAITEI"} />
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <HofSummary filePath={HF_PATH} year={year} baseYear={baseYear} hotel={"MAITEI"} />
        </div>
      </div>
    </section>
  );
}
