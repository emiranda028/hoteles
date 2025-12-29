"use client";

import { useMemo, useState } from "react";
import YearComparator from "./components/YearComparator";
import MembershipSummary from "./components/MembershipSummary";
import CountryRanking from "./components/CountryRanking";

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

type JcrHotel = "ALL" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ";
type MaiHotel = "MAITEI";

const JCR_HOTELS: { value: JcrHotel; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "MARRIOTT", label: "Marriott" },
  { value: "SHERATON BCR", label: "Sheraton BCR" },
  { value: "SHERATON MDQ", label: "Sheraton MDQ" },
];

function cardStyle(radius = 18): React.CSSProperties {
  return {
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.12)",
    borderRadius: radius,
    padding: "1rem",
    backdropFilter: "blur(6px)",
  };
}

function pillStyle(bg: string): React.CSSProperties {
  return {
    background: bg,
    border: "1px solid rgba(255,255,255,.18)",
    borderRadius: 14,
    padding: ".55rem .75rem",
    display: "flex",
    gap: ".5rem",
    alignItems: "center",
    flexWrap: "wrap",
  };
}

function labelStyle(): React.CSSProperties {
  return { fontSize: ".85rem", opacity: 0.9, fontWeight: 800 };
}

function selectStyle(): React.CSSProperties {
  return {
    padding: ".45rem .6rem",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,.18)",
    background: "rgba(0,0,0,.25)",
    color: "white",
    outline: "none",
  };
}

export default function Page() {
  // ===== defaults (pediste 2025) =====
  const [jcrYear, setJcrYear] = useState<number>(2025);
  const [jcrBaseYear, setJcrBaseYear] = useState<number>(2024);
  const [jcrHotel, setJcrHotel] = useState<JcrHotel>("ALL");

  const [maiYear, setMaiYear] = useState<number>(2025);
  const [maiBaseYear, setMaiBaseYear] = useState<number>(2024);

  // Si querés, después lo calculamos desde CSV. Por ahora fijo y ordenado:
  const years = useMemo(() => [2025, 2024, 2023, 2022, 2021, 2020], []);

  const jcrHotelFilter = jcrHotel === "ALL" ? "" : jcrHotel;

  return (
    <main style={{ padding: "1.25rem", display: "grid", gap: "1.25rem" }}>
      {/* =========================
          PRESENTACIÓN (LTELC)
      ========================== */}
      <section style={cardStyle(22)}>
        <div style={{ display: "grid", gap: ".35rem" }}>
          <div style={{ fontSize: "1.35rem", fontWeight: 950 }}>
            Informe de gestión — LTELC Consultora
          </div>
          <div style={{ opacity: 0.85 }}>
            Gestión hotelera: grupo JCR + Management Gotel (Maitei).
          </div>

          <div style={{ marginTop: ".65rem", display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
            <div style={{ opacity: 0.9 }}>
              <b>Correo:</b> agencialtelc@gmail.com
            </div>
            <div style={{ opacity: 0.9 }}>
              <b>Web:</b> www.lotengoenlacabeza.com.ar
            </div>
          </div>
        </div>
      </section>

      {/* =========================
          BLOQUE JCR
      ========================== */}
      <section style={{ display: "grid", gap: "1rem" }}>
        <div style={cardStyle(22)}>
          <div style={{ display: "grid", gap: ".75rem" }}>
            <div style={{ fontSize: "1.15rem", fontWeight: 950 }}>
              Grupo JCR (Marriott + Sheraton BCR + Sheraton MDQ)
            </div>

            {/* Filtros JCR (NO sticky) */}
            <div style={pillStyle("rgba(180,0,0,.28)")}>
              <span style={labelStyle()}>Año</span>
              <select
                style={selectStyle()}
                value={jcrYear}
                onChange={(e) => setJcrYear(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <span style={{ width: 10 }} />

              <span style={labelStyle()}>Comparar vs</span>
              <select
                style={selectStyle()}
                value={jcrBaseYear}
                onChange={(e) => setJcrBaseYear(Number(e.target.value))}
              >
                {years
                  .filter((y) => y !== jcrYear)
                  .map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
              </select>

              <span style={{ width: 10 }} />

              <span style={labelStyle()}>Hotel</span>
              <select
                style={selectStyle()}
                value={jcrHotel}
                onChange={(e) => setJcrHotel(e.target.value as JcrHotel)}
              >
                {JCR_HOTELS.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ opacity: 0.8, fontSize: ".92rem" }}>
              El filtro aplica a todo el bloque JCR (KPI + comparativa + H&F + rankings + membership).
            </div>
          </div>
        </div>

        {/* KPI / Comparativa / H&F (JCR) */}
        <YearComparator
          filePath={HF_PATH}
          year={jcrYear}
          baseYear={jcrBaseYear}
          hotelFilter={jcrHotelFilter} // "" => todos
        />

        {/* Membership (JCR) */}
        <MembershipSummary
          year={jcrYear}
          baseYear={jcrBaseYear}
          filePath={MEMBERSHIP_PATH}
          hotelFilter={jcrHotelFilter} // "" => todos
          allowedHotels={["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"]}
          compactCharts={false}
        />

        {/* Nacionalidades (Marriott) */}
        <div style={cardStyle(22)}>
          <div style={{ display: "grid", gap: ".35rem" }}>
            <div style={{ fontSize: "1.2rem", fontWeight: 950 }}>Nacionalidades</div>
            <div style={{ opacity: 0.8 }}>
              Ranking por país + distribución por continente (Marriott). Usa el año del bloque JCR.
            </div>
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <CountryRanking year={jcrYear} filePath={NACIONALIDADES_PATH} />
          </div>
        </div>
      </section>

      {/* =========================
          BLOQUE MAITEI (Gotel)
      ========================== */}
      <section style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
        <div style={cardStyle(22)}>
          <div style={{ display: "grid", gap: ".75rem" }}>
            <div style={{ fontSize: "1.15rem", fontWeight: 950 }}>
              Grupo Gotel — Maitei (bloque independiente)
            </div>

            {/* Filtros MAITEI (NO sticky) */}
            <div style={pillStyle("rgba(0,160,255,.22)")}>
              <span style={labelStyle()}>Año</span>
              <select
                style={selectStyle()}
                value={maiYear}
                onChange={(e) => setMaiYear(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <span style={{ width: 10 }} />

              <span style={labelStyle()}>Comparar vs</span>
              <select
                style={selectStyle()}
                value={maiBaseYear}
                onChange={(e) => setMaiBaseYear(Number(e.target.value))}
              >
                {years
                  .filter((y) => y !== maiYear)
                  .map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
              </select>

              <span style={{ width: 10 }} />

              <span style={{ ...labelStyle(), opacity: 0.75 }}>Hotel</span>
              <span style={{ fontWeight: 900, opacity: 0.95 }}>Maitei</span>
            </div>

            <div style={{ opacity: 0.8, fontSize: ".92rem" }}>
              Este filtro solo afecta al bloque Maitei.
            </div>
          </div>
        </div>

        <YearComparator filePath={HF_PATH} year={maiYear} baseYear={maiBaseYear} hotelFilter={"MAITEI"} />

        <div style={cardStyle(22)}>
          <div style={{ fontWeight: 950 }}>Próximo paso</div>
          <div style={{ opacity: 0.8, marginTop: ".35rem" }}>
            Acá vamos a sumar: carrouseles propios, comparativa y rankings del grupo Gotel.
          </div>
        </div>
      </section>
    </main>
  );
}
