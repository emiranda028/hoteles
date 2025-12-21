"use client";

import React, { useEffect, useMemo, useState } from "react";
import HighlightsCarousel from "./HighlightsCarousel";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";
import { readCsvFromPublic, CsvRow } from "./csvClient";

type GlobalHotel = "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

// BaseYear default: year - 1
function defaultBaseYear(y: number) {
  return y - 1;
}

function norm(s: any) {
  return String(s ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

function parseDateAny(v: any): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;

  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const d = Number(m1[1]);
    const mo = Number(m1[2]) - 1;
    const y = Number(m1[3]);
    const dt = new Date(y, mo, d);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m2) {
    const d = Number(m2[1]);
    const mo = Number(m2[2]) - 1;
    let y = Number(m2[3]);
    if (y < 100) y = 2000 + y;
    const dt = new Date(y, mo, d);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  const dt = new Date(s);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function parsePercent(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const cleaned = s.replace("%", "").replace(/\./g, "").replace(/,/g, ".").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? n / 100 : n;
}

function parseMoney(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const cleaned = s.replace(/\./g, "").replace(/,/g, ".").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function canonicalHotel(empresaRaw: string): GlobalHotel | "" {
  const e = norm(empresaRaw);
  if (!e) return "";

  if (e.includes("MAITEI")) return "MAITEI";
  if (e.includes("MARRIOTT")) return "MARRIOTT";
  if (e.includes("BARILOCHE") || e.includes("BRC") || e.includes("BCR")) return "SHERATON BCR";
  if (e.includes("MAR DEL PLATA") || e.includes("MDQ") || e.includes("MDP")) return "SHERATON MDQ";

  if (e === "SHERATON BCR") return "SHERATON BCR";
  if (e === "SHERATON MDQ") return "SHERATON MDQ";

  return "";
}

function fmt(n: number, digits = 0) {
  try {
    return new Intl.NumberFormat("es-AR", { maximumFractionDigits: digits }).format(n);
  } catch {
    return String(n.toFixed(digits));
  }
}

function Pill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "1px solid rgba(0,0,0,.2)",
        padding: ".45rem .7rem",
        borderRadius: 999,
        background: active ? "rgba(0,0,0,.08)" : "white",
        fontWeight: active ? 950 : 750,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

export default function YearComparator() {
  const nowY = new Date().getFullYear();
  const [year, setYear] = useState<number>(nowY);
  const [baseYear, setBaseYear] = useState<number>(defaultBaseYear(nowY));
  const [globalHotel, setGlobalHotel] = useState<GlobalHotel>("JCR");

  // Carga CSV una vez para comparativa y tabla (carrousel lo carga su componente)
  const [hfRows, setHfRows] = useState<CsvRow[]>([]);
  const [loadingHf, setLoadingHf] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoadingHf(true);

    (async () => {
      try {
        const data = await readCsvFromPublic(HF_PATH);
        if (alive) {
          setHfRows(data || []);
          setLoadingHf(false);
        }
      } catch {
        if (alive) {
          setHfRows([]);
          setLoadingHf(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Cuando cambia year, actualizo baseYear si quedó igual o inválido
  useEffect(() => {
    if (!baseYear || baseYear >= year) setBaseYear(defaultBaseYear(year));
  }, [year]);

  const hfFilteredYear = useMemo(() => {
    const out: {
      dt: Date;
      hotel: GlobalHotel | "";
      hof: string;
      occ: number;
      adr: number;
      roomRev: number;
    }[] = [];

    for (let i = 0; i < hfRows.length; i++) {
      const r = hfRows[i];
      const keys = Object.keys(r);
      const get = (contains: string) => {
        const k = keys.find((x) => norm(x).includes(norm(contains)));
        return k ? r[k] : "";
      };

      const empresa = canonicalHotel(get("Empresa"));
      const dt = parseDateAny(get("Fecha") || get("Date"));
      if (!dt) continue;
      if (dt.getFullYear() !== year) continue;

      // filtro hotel
      if (globalHotel === "JCR") {
        if (!(empresa === "MARRIOTT" || empresa === "SHERATON BCR" || empresa === "SHERATON MDQ")) continue;
      } else {
        if (empresa !== globalHotel) continue;
      }

      out.push({
        dt,
        hotel: empresa,
        hof: String(get("HoF") || "").trim(),
        occ: parsePercent(get("Occ.%") || get("Occ")),
        adr: parseMoney(get("Average Rate") || get("ADR") || get("Average")),
        roomRev: parseMoney(get("Room Revenue") || get("Room Reven")),
      });
    }

    // ordenar por fecha
    out.sort((a, b) => a.dt.getTime() - b.dt.getTime());
    return out;
  }, [hfRows, year, globalHotel]);

  const hfFilteredBase = useMemo(() => {
    const out: {
      dt: Date;
      hotel: GlobalHotel | "";
      hof: string;
      occ: number;
      adr: number;
      roomRev: number;
    }[] = [];

    for (let i = 0; i < hfRows.length; i++) {
      const r = hfRows[i];
      const keys = Object.keys(r);
      const get = (contains: string) => {
        const k = keys.find((x) => norm(x).includes(norm(contains)));
        return k ? r[k] : "";
      };

      const empresa = canonicalHotel(get("Empresa"));
      const dt = parseDateAny(get("Fecha") || get("Date"));
      if (!dt) continue;
      if (dt.getFullYear() !== baseYear) continue;

      if (globalHotel === "JCR") {
        if (!(empresa === "MARRIOTT" || empresa === "SHERATON BCR" || empresa === "SHERATON MDQ")) continue;
      } else {
        if (empresa !== globalHotel) continue;
      }

      out.push({
        dt,
        hotel: empresa,
        hof: String(get("HoF") || "").trim(),
        occ: parsePercent(get("Occ.%") || get("Occ")),
        adr: parseMoney(get("Average Rate") || get("ADR") || get("Average")),
        roomRev: parseMoney(get("Room Revenue") || get("Room Reven")),
      });
    }

    out.sort((a, b) => a.dt.getTime() - b.dt.getTime());
    return out;
  }, [hfRows, baseYear, globalHotel]);

  const comparative = useMemo(() => {
    const calc = (arr: any[]) => {
      if (!arr.length) return { occ: 0, adr: 0, roomRev: 0, days: 0 };
      let occSum = 0;
      let adrSum = 0;
      let roomRevSum = 0;
      for (let i = 0; i < arr.length; i++) {
        occSum += arr[i].occ || 0;
        adrSum += arr[i].adr || 0;
        roomRevSum += arr[i].roomRev || 0;
      }
      return {
        occ: occSum / arr.length,
        adr: adrSum / arr.length,
        roomRev: roomRevSum,
        days: arr.length,
      };
    };

    const cur = calc(hfFilteredYear);
    const base = calc(hfFilteredBase);

    const delta = (a: number, b: number) => (b === 0 ? null : (a - b) / b);

    return {
      cur,
      base,
      dOcc: delta(cur.occ, base.occ),
      dAdr: delta(cur.adr, base.adr),
      dRev: delta(cur.roomRev, base.roomRev),
    };
  }, [hfFilteredYear, hfFilteredBase]);

  // Membership: MAITEI no aplica => lo mando a JCR
  const membershipHotelFilter: "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" =
    globalHotel === "MAITEI" ? "JCR" : globalHotel;

  return (
    <section className="section" id="comparador" style={{ marginTop: "1rem" }}>
      {/* ===== Encabezado + filtros globales ===== */}
      <div style={{ display: "grid", gap: ".75rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.35rem", fontWeight: 950 }}>
          Year Comparator
        </div>
        <div className="sectionDesc" style={{ opacity: 0.8 }}>
          Filtros globales (Año + Hotel) para KPIs, H&F, Comparativa y Membership.
        </div>

        {/* Filtros */}
        <div
          className="card"
          style={{
            padding: "1rem",
            borderRadius: 22,
            display: "flex",
            gap: "1rem",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Año */}
          <div style={{ display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900 }}>Año</div>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value || nowY))}
              style={{
                width: 110,
                padding: ".45rem .6rem",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,.2)",
              }}
            />
            <div style={{ fontWeight: 800, opacity: 0.7 }}>vs</div>
            <input
              type="number"
              value={baseYear}
              onChange={(e) => setBaseYear(Number(e.target.value || defaultBaseYear(year)))}
              style={{
                width: 110,
                padding: ".45rem .6rem",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,.2)",
              }}
            />
          </div>

          {/* Hotel */}
          <div style={{ display: "flex", gap: ".35rem", flexWrap: "wrap" }}>
            <Pill active={globalHotel === "JCR"} label="JCR" onClick={() => setGlobalHotel("JCR")} />
            <Pill active={globalHotel === "MARRIOTT"} label="MARRIOTT" onClick={() => setGlobalHotel("MARRIOTT")} />
            <Pill active={globalHotel === "SHERATON BCR"} label="SHERATON BCR" onClick={() => setGlobalHotel("SHERATON BCR")} />
            <Pill active={globalHotel === "SHERATON MDQ"} label="SHERATON MDQ" onClick={() => setGlobalHotel("SHERATON MDQ")} />
            <Pill active={globalHotel === "MAITEI"} label="MAITEI" onClick={() => setGlobalHotel("MAITEI")} />
          </div>
        </div>
      </div>

      {/* ===== 1) KPIs (carrousel) ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <HighlightsCarousel year={year} globalHotel={globalHotel} filePath={HF_PATH} />
      </div>

      {/* ===== 2) Comparativa ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Comparativa {year} vs {baseYear}
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem", opacity: 0.8 }}>
          Promedios y sumas (según CSV H&F) filtrado por hotel.
        </div>

        <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 22 }}>
          {loadingHf ? (
            <div>Cargando comparativa…</div>
          ) : (
            <div style={{ display: "grid", gap: ".75rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "1rem" }}>
                <div className="card" style={{ padding: "1rem", borderRadius: 18, background: "rgba(0,0,0,.03)" }}>
                  <div style={{ fontWeight: 850, opacity: 0.8 }}>Ocupación</div>
                  <div style={{ fontWeight: 950, fontSize: "1.6rem", marginTop: ".25rem" }}>
                    {fmt(comparative.cur.occ * 100, 1)}%
                  </div>
                  <div style={{ marginTop: ".15rem", opacity: 0.75 }}>
                    {baseYear}: {fmt(comparative.base.occ * 100, 1)}%{" "}
                    {comparative.dOcc == null ? "" : `(${comparative.dOcc >= 0 ? "+" : ""}${fmt(comparative.dOcc * 100, 1)}%)`}
                  </div>
                </div>

                <div className="card" style={{ padding: "1rem", borderRadius: 18, background: "rgba(0,0,0,.03)" }}>
                  <div style={{ fontWeight: 850, opacity: 0.8 }}>ADR</div>
                  <div style={{ fontWeight: 950, fontSize: "1.6rem", marginTop: ".25rem" }}>
                    $ {fmt(comparative.cur.adr, 0)}
                  </div>
                  <div style={{ marginTop: ".15rem", opacity: 0.75 }}>
                    {baseYear}: $ {fmt(comparative.base.adr, 0)}{" "}
                    {comparative.dAdr == null ? "" : `(${comparative.dAdr >= 0 ? "+" : ""}${fmt(comparative.dAdr * 100, 1)}%)`}
                  </div>
                </div>

                <div className="card" style={{ padding: "1rem", borderRadius: 18, background: "rgba(0,0,0,.03)" }}>
                  <div style={{ fontWeight: 850, opacity: 0.8 }}>Room Revenue (suma)</div>
                  <div style={{ fontWeight: 950, fontSize: "1.6rem", marginTop: ".25rem" }}>
                    $ {fmt(comparative.cur.roomRev, 0)}
                  </div>
                  <div style={{ marginTop: ".15rem", opacity: 0.75 }}>
                    {baseYear}: $ {fmt(comparative.base.roomRev, 0)}{" "}
                    {comparative.dRev == null ? "" : `(${comparative.dRev >= 0 ? "+" : ""}${fmt(comparative.dRev * 100, 1)}%)`}
                  </div>
                </div>
              </div>

              {/* helper */}
              <div style={{ opacity: 0.7, fontSize: ".9rem" }}>
                Días con registros: {year} = <b>{comparative.cur.days}</b> · {baseYear} = <b>{comparative.base.days}</b>
              </div>

              <style jsx>{`
                @media (max-width: 900px) {
                  div[style*="repeat(3"] {
                    grid-template-columns: 1fr !important;
                  }
                }
              `}</style>
            </div>
          )}
        </div>
      </div>

      {/* ===== 3) H&F detalle (tabla simple) ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          History & Forecast — detalle ({year})
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem", opacity: 0.8 }}>
          Muestra las últimas filas del CSV filtradas por año + hotel.
        </div>

        <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 22, overflowX: "auto" }}>
          {loadingHf ? (
            <div>Cargando H&F…</div>
          ) : hfFilteredYear.length === 0 ? (
            <div style={{ opacity: 0.85 }}>
              Sin filas H&F para el filtro actual. (Chequeá valores reales en columna Empresa del CSV)
              <div style={{ marginTop: ".35rem", fontSize: ".9rem", opacity: 0.7 }}>Archivo: {HF_PATH}</div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(0,0,0,.15)" }}>
                  <th style={{ padding: ".5rem" }}>Fecha</th>
                  <th style={{ padding: ".5rem" }}>HoF</th>
                  <th style={{ padding: ".5rem" }}>Hotel</th>
                  <th style={{ padding: ".5rem" }}>Occ%</th>
                  <th style={{ padding: ".5rem" }}>ADR</th>
                  <th style={{ padding: ".5rem" }}>Room Rev</th>
                </tr>
              </thead>
              <tbody>
                {hfFilteredYear.slice(Math.max(0, hfFilteredYear.length - 25)).map((r, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid rgba(0,0,0,.07)" }}>
                    <td style={{ padding: ".5rem", whiteSpace: "nowrap" }}>{r.dt.toLocaleDateString("es-AR")}</td>
                    <td style={{ padding: ".5rem" }}>{r.hof || "—"}</td>
                    <td style={{ padding: ".5rem", fontWeight: 850 }}>{r.hotel || "—"}</td>
                    <td style={{ padding: ".5rem" }}>{fmt(r.occ * 100, 1)}%</td>
                    <td style={{ padding: ".5rem" }}>$ {fmt(r.adr, 0)}</td>
                    <td style={{ padding: ".5rem" }}>$ {fmt(r.roomRev, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ===== 4) MEMBERSHIP ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Membership (JCR)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Cantidades + gráficos (desde Excel). Usa filtro global de año + hotel (JCR/MARRIOTT/SHERATONS).
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <MembershipSummary
            year={year}
            baseYear={baseYear}
            filePath={MEMBERSHIP_PATH}
            hotelFilter={membershipHotelFilter}
            compactCharts={true}
          />
        </div>
      </div>

      {/* ===== 5) NACIONALIDADES ===== */}
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
    </section>
  );
}
