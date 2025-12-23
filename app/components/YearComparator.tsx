// app/components/YearComparator.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  readCsvFromPublic,
  toNumberSmart,
  toPercent01,
  formatMoney,
  formatInt,
  formatPct01,
  safeDiv,
  CsvRow,
} from "./csvClient";

// Si estos componentes existen en tu repo, perfecto.
// Si alguno no existe, decime el nombre exacto y lo adapto.
import HighlightsCarousel from "./HighlightsCarousel";
import HofSummary from "./HofSummary";
import HofExplorer from "./HofExplorer";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

type GlobalHotelJCR = "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ";
type MaiteiHotel = "MAITEI";

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

const JCR_HOTELS: GlobalHotelJCR[] = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
const MAITEI_HOTELS: MaiteiHotel[] = ["MAITEI"];

const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function pickKey(keys: string[], candidates: string[]): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const keyMap = new Map(keys.map((k) => [norm(k), k]));
  for (const c of candidates) {
    const found = keyMap.get(norm(c));
    if (found) return found;
  }
  return "";
}

function toYear(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") {
    // si viene como Excel serial (ej 46004), NO es un año
    if (v > 3000) return 0;
    return Math.floor(v);
  }
  const s = String(v).trim();
  const y = Number(s);
  if (Number.isFinite(y) && y >= 1990 && y <= 2100) return Math.floor(y);

  // intentar extraer yyyy
  const m = s.match(/(20\d{2}|19\d{2})/);
  if (m) return Number(m[1]);

  return 0;
}

function toMonthIndex(v: any): number {
  // soporta "Mes", "N° Mes", etc.
  if (v === null || v === undefined) return -1;
  if (typeof v === "number") {
    const n = Math.floor(v);
    if (n >= 1 && n <= 12) return n - 1;
  }
  const s = String(v).toLowerCase().trim();
  const map: Record<string, number> = {
    ene: 0,
    enero: 0,
    feb: 1,
    febrero: 1,
    mar: 2,
    marzo: 2,
    abr: 3,
    abril: 3,
    may: 4,
    mayo: 4,
    jun: 5,
    junio: 5,
    jul: 6,
    julio: 6,
    ago: 7,
    agosto: 7,
    sep: 8,
    septiembre: 8,
    setiembre: 8,
    oct: 9,
    octubre: 9,
    nov: 10,
    noviembre: 10,
    dic: 11,
    diciembre: 11,
  };
  for (const k of Object.keys(map)) {
    if (s === k) return map[k];
  }
  return -1;
}

function normalizeHotelName(raw: string): string {
  const s = (raw || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  // Normalizaciones “típicas”
  if (s.includes("SHERATON") && (s.includes("BCR") || s.includes("BARILOCHE"))) return "SHERATON BCR";
  if (s.includes("SHERATON") && (s.includes("MDQ") || s.includes("MAR DEL PLATA"))) return "SHERATON MDQ";
  if (s.includes("MARRIOTT")) return "MARRIOTT";
  if (s.includes("MAITEI") || s.includes("GOTEL")) return "MAITEI";
  return s;
}

type HfRow = {
  year: number;
  month: number; // 0-11
  hof: "History" | "Forecast" | string;
  hotel: string;
  total: number; // Total rooms (o total occ segun archivo; se usa para ponderar)
  arr: number;
  comp: number;
  house: number;
  deductIndiv: number;
  deductGroup: number;
  occPct01: number; // 0-1
  roomRevenue: number;
  adr: number;
  dep: number;
  dayUse: number;
  noShow: number;
  ooo: number;
  adl: number;
};

function kpiAggregate(rows: HfRow[]) {
  const sumRevenue = rows.reduce((a, r) => a + r.roomRevenue, 0);
  const sumTotal = rows.reduce((a, r) => a + (r.total || 0), 0);

  // Ocupación: promedio ponderado por "total" si existe; si no, promedio simple
  const occWeighted = rows.reduce((a, r) => a + r.occPct01 * (r.total || 0), 0);
  const occAvg01 = sumTotal > 0 ? safeDiv(occWeighted, sumTotal) : safeDiv(rows.reduce((a, r) => a + r.occPct01, 0), Math.max(1, rows.length));

  // ADR: promedio ponderado por rooms (total) si existe
  const adrWeighted = rows.reduce((a, r) => a + r.adr * (r.total || 0), 0);
  const adrAvg = sumTotal > 0 ? safeDiv(adrWeighted, sumTotal) : safeDiv(rows.reduce((a, r) => a + r.adr, 0), Math.max(1, rows.length));

  // RevPAR aprox = ADR * Ocupación (no suma)
  const revpar = adrAvg * occAvg01;

  return { sumRevenue, occAvg01, adrAvg, revpar };
}

export default function YearComparator() {
  // ===== filtros JCR (sticky rojo) =====
  const [year, setYear] = useState<number>(2025);
  const [baseYear, setBaseYear] = useState<number>(2024);
  const [globalHotelJcr, setGlobalHotelJcr] = useState<GlobalHotelJCR>("MARRIOTT");

  // ===== filtros MAITEI (sticky celeste) =====
  const [maiteiYear, setMaiteiYear] = useState<number>(2025);
  const [maiteiBaseYear, setMaiteiBaseYear] = useState<number>(2024);
  const [maiteiHotel] = useState<MaiteiHotel>("MAITEI");

  // ===== H&F data =====
  const [hfRows, setHfRows] = useState<HfRow[]>([]);
  const [hfKeys, setHfKeys] = useState<string[]>([]);
  const [hfErr, setHfErr] = useState<string>("");

  useEffect(() => {
    let alive = true;
    setHfErr("");
    readCsvFromPublic(HF_PATH)
      .then((raw) => {
        if (!alive) return;
        const keys = raw[0] ? Object.keys(raw[0]) : [];
        setHfKeys(keys);

        // mapear keys reales
        const kHotel = pickKey(keys, ["Empresa", "Hotel"]);
        const kHof = pickKey(keys, ["HoF", "Hof", "History/Forecast"]);
        const kDate = pickKey(keys, ["Fecha", "Date"]);
        const kTotal = pickKey(keys, ["Total", "Total Occ.", "Total Occ", "Total Rooms"]);
        const kArr = pickKey(keys, ["Arr.", "Arr. Rooms", "Arr Rooms"]);
        const kComp = pickKey(keys, ["Comp.", "Comp. Rooms", "Comp Rooms"]);
        const kHouse = pickKey(keys, ["House", "House Use", "House Use Rooms"]);
        const kDedI = pickKey(keys, ["Deduct Indiv.", "Deduct Indiv", "Deduct"]);
        const kDedG = pickKey(keys, ["Deduct Group", "Deduct Group"]);
        const kOcc = pickKey(keys, ["Occ.%", "Occ%", "Occ. %", "Occ"]);
        const kRev = pickKey(keys, ["Room Revenue", "Room Reven", "Room Revenue "]);
        const kAdr = pickKey(keys, ["Average Rate", "ADR", "AverageRate"]);
        const kDep = pickKey(keys, ["Dep.", "Dep. Rooms", "Dep Rooms"]);
        const kDay = pickKey(keys, ["Day Use", "Day Use Rooms"]);
        const kNoShow = pickKey(keys, ["No Show", "No Show Rooms"]);
        const kOoo = pickKey(keys, ["OOO", "OOO Rooms"]);
        const kAdl = pickKey(keys, ["Adl. & Chl.", "Adl", "Adl & Chl"]);

        const mapped: HfRow[] = raw
          .map((r: CsvRow) => {
            const hotel = normalizeHotelName(String(r[kHotel] ?? ""));
            const hof = String(r[kHof] ?? "").trim() || "History";

            // Año/Mes: lo saco desde Fecha/Date (dd/mm/yyyy o similar)
            const dateStr = String(r[kDate] ?? "").trim();
            let y = 0;
            let m = -1;

            // dd/mm/yyyy
            const parts = dateStr.split(/[\/\-]/g).map((x) => x.trim());
            if (parts.length >= 3) {
              const yy = Number(parts[2]);
              const mm = Number(parts[1]);
              if (Number.isFinite(yy) && yy >= 1990 && yy <= 2100) y = yy;
              if (Number.isFinite(mm) && mm >= 1 && mm <= 12) m = mm - 1;
            }

            const total = toNumberSmart(r[kTotal]);
            const occPct01 = toPercent01(toNumberSmart(r[kOcc]));
            const row: HfRow = {
              year: y,
              month: m,
              hof,
              hotel,
              total,
              arr: toNumberSmart(r[kArr]),
              comp: toNumberSmart(r[kComp]),
              house: toNumberSmart(r[kHouse]),
              deductIndiv: toNumberSmart(r[kDedI]),
              deductGroup: toNumberSmart(r[kDedG]),
              occPct01,
              roomRevenue: toNumberSmart(r[kRev]),
              adr: toNumberSmart(r[kAdr]),
              dep: toNumberSmart(r[kDep]),
              dayUse: toNumberSmart(r[kDay]),
              noShow: toNumberSmart(r[kNoShow]),
              ooo: toNumberSmart(r[kOoo]),
              adl: toNumberSmart(r[kAdl]),
            };
            return row;
          })
          .filter((r) => r.year > 0 && r.month >= 0 && r.month <= 11 && r.hotel);

        setHfRows(mapped);
      })
      .catch((e: any) => {
        if (!alive) return;
        setHfErr(e?.message || "Error leyendo H&F CSV");
      });

    return () => {
      alive = false;
    };
  }, []);

  // ===== dataset filtrado JCR =====
  const hfYearHotel = useMemo(() => {
    const hotel = globalHotelJcr;
    return hfRows.filter((r) => r.year === year && r.hotel === hotel);
  }, [hfRows, year, globalHotelJcr]);

  const hfBaseYearHotel = useMemo(() => {
    const hotel = globalHotelJcr;
    return hfRows.filter((r) => r.year === baseYear && r.hotel === hotel);
  }, [hfRows, baseYear, globalHotelJcr]);

  const kpiY = useMemo(() => kpiAggregate(hfYearHotel), [hfYearHotel]);
  const kpiB = useMemo(() => kpiAggregate(hfBaseYearHotel), [hfBaseYearHotel]);

  // ===== comparativa por mes (Revenue, Occ, ADR, RevPAR) =====
  const monthly = useMemo(() => {
    const build = (rows: HfRow[]) => {
      const byM: Record<number, HfRow[]> = {};
      for (const r of rows) {
        if (!byM[r.month]) byM[r.month] = [];
        byM[r.month].push(r);
      }
      const out = Array.from({ length: 12 }).map((_, idx) => {
        const agg = kpiAggregate(byM[idx] || []);
        return { m: idx, ...agg };
      });
      return out;
    };
    return {
      curr: build(hfYearHotel),
      base: build(hfBaseYearHotel),
    };
  }, [hfYearHotel, hfBaseYearHotel]);

  // ===== ranking por mes (top revenue days dentro del mes) =====
  const rankingPorMes = useMemo(() => {
    const out = Array.from({ length: 12 }).map((_, m) => {
      const rows = hfYearHotel.filter((r) => r.month === m);
      const totalRev = rows.reduce((a, r) => a + r.roomRevenue, 0);
      return { m, totalRev, days: rows.length };
    });
    return out;
  }, [hfYearHotel]);

  // ===== MAITEI data =====
  const hfMaiteiYear = useMemo(() => hfRows.filter((r) => r.year === maiteiYear && r.hotel === maiteiHotel), [hfRows, maiteiYear, maiteiHotel]);
  const hfMaiteiBase = useMemo(() => hfRows.filter((r) => r.year === maiteiBaseYear && r.hotel === maiteiHotel), [hfRows, maiteiBaseYear, maiteiHotel]);

  const kpiMY = useMemo(() => kpiAggregate(hfMaiteiYear), [hfMaiteiYear]);
  const kpiMB = useMemo(() => kpiAggregate(hfMaiteiBase), [hfMaiteiBaseYear, hfRows, maiteiBaseYear, maiteiHotel, hfMaiteiBase]);

  const stickyBarStyle: React.CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 50,
    borderRadius: 16,
    padding: "0.75rem",
    backdropFilter: "blur(6px)",
  };

  const selectStyle: React.CSSProperties = {
    padding: ".55rem .7rem",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,.25)",
    outline: "none",
    fontWeight: 800,
    width: "100%",
    maxWidth: 220,
  };

  const labelStyle: React.CSSProperties = { fontSize: ".85rem", fontWeight: 900, opacity: 0.95, marginBottom: ".25rem" };

  return (
    <div style={{ padding: "1rem 0 3rem 0" }}>
      {/* =======================
          BLOQUE JCR
      ======================= */}
      <section id="jcr" className="section">
        <div className="sectionTitle" style={{ fontSize: "1.5rem", fontWeight: 950 }}>
          Hoteles (JCR)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Filtros globales (Año + Hotel) para KPIs, H&amp;F, comparativa y membership. Nacionalidades usa solo el año (Marriott).
        </div>

        {/* Sticky filtros JCR (rojo estilo Marriott) */}
        <div
          style={{
            ...stickyBarStyle,
            marginTop: "1rem",
            background: "linear-gradient(135deg, rgba(170,0,0,.92), rgba(120,0,0,.92))",
            border: "1px solid rgba(255,255,255,.15)",
          }}
        >
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "end" }}>
            <div style={{ minWidth: 160 }}>
              <div style={{ ...labelStyle, color: "white" }}>Año</div>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                style={{ ...selectStyle, background: "rgba(255,255,255,.14)", color: "white" }}
              >
                {[2022, 2023, 2024, 2025].map((y) => (
                  <option key={y} value={y} style={{ color: "black" }}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ minWidth: 160 }}>
              <div style={{ ...labelStyle, color: "white" }}>Base</div>
              <select
                value={baseYear}
                onChange={(e) => setBaseYear(Number(e.target.value))}
                style={{ ...selectStyle, background: "rgba(255,255,255,.14)", color: "white" }}
              >
                {[2022, 2023, 2024, 2025].map((y) => (
                  <option key={y} value={y} style={{ color: "black" }}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ minWidth: 220 }}>
              <div style={{ ...labelStyle, color: "white" }}>Hotel</div>
              <select
                value={globalHotelJcr}
                onChange={(e) => setGlobalHotelJcr(e.target.value as GlobalHotelJCR)}
                style={{ ...selectStyle, background: "rgba(255,255,255,.14)", color: "white" }}
              >
                {JCR_HOTELS.map((h) => (
                  <option key={h} value={h} style={{ color: "black" }}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1, minWidth: 220, color: "rgba(255,255,255,.9)", fontWeight: 800, fontSize: ".9rem" }}>
              {hfErr ? (
                <span>⚠️ {hfErr}</span>
              ) : (
                <span style={{ opacity: 0.95 }}>
                  CSV H&amp;F: {hfRows.length ? `${hfRows.length.toLocaleString("es-AR")} filas cargadas` : "cargando…"}
                  {hfKeys.length ? <span style={{ opacity: 0.8 }}> · Keys detectadas: {hfKeys.slice(0, 6).join(", ")}…</span> : null}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ====== KPIs principales (H&F) ====== */}
        <div className="card" style={{ marginTop: "1rem", padding: "1rem", borderRadius: 22 }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            KPIs principales (H&amp;F)
          </div>

          {!hfYearHotel.length ? (
            <div style={{ marginTop: ".6rem", opacity: 0.85 }}>
              Sin filas H&amp;F para {globalHotelJcr} en {year}. (Si esto pasa y el CSV sí tiene datos, es por el parseo/keys: me pegás las keys reales.)
            </div>
          ) : (
            <div style={{ marginTop: ".75rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: ".75rem" }}>
              <div className="card" style={{ padding: ".85rem", borderRadius: 18 }}>
                <div style={{ fontWeight: 900, opacity: 0.75 }}>Room Revenue (YTD)</div>
                <div style={{ fontSize: "1.35rem", fontWeight: 950, marginTop: ".25rem" }}>{formatMoney(kpiY.sumRevenue)}</div>
                <div style={{ marginTop: ".25rem", opacity: 0.8 }}>Base {baseYear}: {formatMoney(kpiB.sumRevenue)}</div>
              </div>

              <div className="card" style={{ padding: ".85rem", borderRadius: 18 }}>
                <div style={{ fontWeight: 900, opacity: 0.75 }}>Ocupación (prom.)</div>
                <div style={{ fontSize: "1.35rem", fontWeight: 950, marginTop: ".25rem" }}>{formatPct01(kpiY.occAvg01)}</div>
                <div style={{ marginTop: ".25rem", opacity: 0.8 }}>Base {baseYear}: {formatPct01(kpiB.occAvg01)}</div>
              </div>

              <div className="card" style={{ padding: ".85rem", borderRadius: 18 }}>
                <div style={{ fontWeight: 900, opacity: 0.75 }}>ADR (prom.)</div>
                <div style={{ fontSize: "1.35rem", fontWeight: 950, marginTop: ".25rem" }}>{formatMoney(kpiY.adrAvg)}</div>
                <div style={{ marginTop: ".25rem", opacity: 0.8 }}>Base {baseYear}: {formatMoney(kpiB.adrAvg)}</div>
              </div>

              <div className="card" style={{ padding: ".85rem", borderRadius: 18 }}>
                <div style={{ fontWeight: 900, opacity: 0.75 }}>RevPAR (aprox.)</div>
                <div style={{ fontSize: "1.35rem", fontWeight: 950, marginTop: ".25rem" }}>{formatMoney(kpiY.revpar)}</div>
                <div style={{ marginTop: ".25rem", opacity: 0.8 }}>Base {baseYear}: {formatMoney(kpiB.revpar)}</div>
              </div>
            </div>
          )}
        </div>

        {/* ===== Carrouseles (highlights) ===== */}
        <div style={{ marginTop: "1rem" }}>
          <HighlightsCarousel year={year} hotelFilter={globalHotelJcr} filePath={HF_PATH} />
        </div>

        {/* ===== Comparativa ===== */}
        <div className="card" style={{ marginTop: "1rem", padding: "1rem", borderRadius: 22 }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            Comparativa {year} vs {baseYear}
          </div>

          {!hfYearHotel.length ? (
            <div style={{ marginTop: ".6rem", opacity: 0.85 }}>Sin datos para armar comparativa.</div>
          ) : (
            <div style={{ marginTop: ".85rem", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
                <thead>
                  <tr style={{ textAlign: "left", opacity: 0.85 }}>
                    <th style={{ padding: ".55rem" }}>Mes</th>
                    <th style={{ padding: ".55rem" }}>Revenue {year}</th>
                    <th style={{ padding: ".55rem" }}>Revenue {baseYear}</th>
                    <th style={{ padding: ".55rem" }}>Occ {year}</th>
                    <th style={{ padding: ".55rem" }}>Occ {baseYear}</th>
                    <th style={{ padding: ".55rem" }}>ADR {year}</th>
                    <th style={{ padding: ".55rem" }}>ADR {baseYear}</th>
                    <th style={{ padding: ".55rem" }}>RevPAR {year}</th>
                    <th style={{ padding: ".55rem" }}>RevPAR {baseYear}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.curr.map((c) => {
                    const b = monthly.base[c.m];
                    return (
                      <tr key={c.m} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                        <td style={{ padding: ".55rem", fontWeight: 900 }}>{monthNames[c.m]}</td>
                        <td style={{ padding: ".55rem" }}>{formatMoney(c.sumRevenue)}</td>
                        <td style={{ padding: ".55rem", opacity: 0.9 }}>{formatMoney(b.sumRevenue)}</td>
                        <td style={{ padding: ".55rem" }}>{formatPct01(c.occAvg01)}</td>
                        <td style={{ padding: ".55rem", opacity: 0.9 }}>{formatPct01(b.occAvg01)}</td>
                        <td style={{ padding: ".55rem" }}>{formatMoney(c.adrAvg)}</td>
                        <td style={{ padding: ".55rem", opacity: 0.9 }}>{formatMoney(b.adrAvg)}</td>
                        <td style={{ padding: ".55rem" }}>{formatMoney(c.revpar)}</td>
                        <td style={{ padding: ".55rem", opacity: 0.9 }}>{formatMoney(b.revpar)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ===== Ranking por mes ===== */}
        <div className="card" style={{ marginTop: "1rem", padding: "1rem", borderRadius: 22 }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            Ranking por mes (Revenue)
          </div>

          <div style={{ marginTop: ".85rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: ".6rem" }}>
            {rankingPorMes.map((x) => (
              <div key={x.m} className="card" style={{ padding: ".75rem", borderRadius: 18 }}>
                <div style={{ fontWeight: 950 }}>{monthNames[x.m]}</div>
                <div style={{ marginTop: ".25rem", fontSize: "1.05rem", fontWeight: 950 }}>{formatMoney(x.totalRev)}</div>
                <div style={{ marginTop: ".15rem", opacity: 0.8, fontSize: ".9rem" }}>{formatInt(x.days)} días</div>
              </div>
            ))}
          </div>
        </div>

        {/* ===== H&F resumen + detalle ===== */}
        <div style={{ marginTop: "1rem" }}>
          <HofSummary year={year} hotelFilter={globalHotelJcr} filePath={HF_PATH} />
        </div>

        <div style={{ marginTop: "1rem" }}>
          <HofExplorer year={year} hotelFilter={globalHotelJcr} filePath={HF_PATH} />
        </div>

        {/* ===== Membership ===== */}
        <div style={{ marginTop: "1.25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
            Membership (JCR)
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Cantidades + gráficos. Usa filtro global de año + hotel (MARRIOTT / SHERATON BCR / SHERATON MDQ).
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <MembershipSummary
              year={year}
              baseYear={baseYear}
              title={`Acumulado ${year} · vs ${baseYear}`}
              filePath={MEMBERSHIP_PATH}
              allowedHotels={JCR_HOTELS as any}
              hotelFilter={globalHotelJcr as any}
              compactCharts={true}
            />
          </div>
        </div>

        {/* ===== Nacionalidades (solo Marriott, SIN filtro hotel) ===== */}
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

      {/* =======================
          BLOQUE MAITEI (Gotel)
      ======================= */}
      <section id="maitei" className="section" style={{ marginTop: "2rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.5rem", fontWeight: 950 }}>
          Maitei (Management Gotel)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Bloque separado con filtros propios (no mezcla con JCR).
        </div>

        {/* Sticky filtros MAITEI (celeste) */}
        <div
          style={{
            ...stickyBarStyle,
            marginTop: "1rem",
            background: "linear-gradient(135deg, rgba(30,140,255,.92), rgba(0,95,200,.92))",
            border: "1px solid rgba(255,255,255,.15)",
          }}
        >
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "end" }}>
            <div style={{ minWidth: 160 }}>
              <div style={{ ...labelStyle, color: "white" }}>Año</div>
              <select
                value={maiteiYear}
                onChange={(e) => setMaiteiYear(Number(e.target.value))}
                style={{ ...selectStyle, background: "rgba(255,255,255,.14)", color: "white" }}
              >
                {[2022, 2023, 2024, 2025].map((y) => (
                  <option key={y} value={y} style={{ color: "black" }}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ minWidth: 160 }}>
              <div style={{ ...labelStyle, color: "white" }}>Base</div>
              <select
                value={maiteiBaseYear}
                onChange={(e) => setMaiteiBaseYear(Number(e.target.value))}
                style={{ ...selectStyle, background: "rgba(255,255,255,.14)", color: "white" }}
              >
                {[2022, 2023, 2024, 2025].map((y) => (
                  <option key={y} value={y} style={{ color: "black" }}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ minWidth: 220 }}>
              <div style={{ ...labelStyle, color: "white" }}>Hotel</div>
              <select value={maiteiHotel} disabled style={{ ...selectStyle, background: "rgba(255,255,255,.14)", color: "white", opacity: 0.95 }}>
                {MAITEI_HOTELS.map((h) => (
                  <option key={h} value={h} style={{ color: "black" }}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* KPIs MAITEI */}
        <div className="card" style={{ marginTop: "1rem", padding: "1rem", borderRadius: 22 }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            KPIs (Maitei)
          </div>

          {!hfMaiteiYear.length ? (
            <div style={{ marginTop: ".6rem", opacity: 0.85 }}>Sin filas H&amp;F para MAITEI en {maiteiYear}.</div>
          ) : (
            <div style={{ marginTop: ".75rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: ".75rem" }}>
              <div className="card" style={{ padding: ".85rem", borderRadius: 18 }}>
                <div style={{ fontWeight: 900, opacity: 0.75 }}>Room Revenue (YTD)</div>
                <div style={{ fontSize: "1.35rem", fontWeight: 950, marginTop: ".25rem" }}>{formatMoney(kpiMY.sumRevenue)}</div>
                <div style={{ marginTop: ".25rem", opacity: 0.8 }}>Base {maiteiBaseYear}: {formatMoney(kpiMB.sumRevenue)}</div>
              </div>

              <div className="card" style={{ padding: ".85rem", borderRadius: 18 }}>
                <div style={{ fontWeight: 900, opacity: 0.75 }}>Ocupación (prom.)</div>
                <div style={{ fontSize: "1.35rem", fontWeight: 950, marginTop: ".25rem" }}>{formatPct01(kpiMY.occAvg01)}</div>
                <div style={{ marginTop: ".25rem", opacity: 0.8 }}>Base {maiteiBaseYear}: {formatPct01(kpiMB.occAvg01)}</div>
              </div>

              <div className="card" style={{ padding: ".85rem", borderRadius: 18 }}>
                <div style={{ fontWeight: 900, opacity: 0.75 }}>ADR (prom.)</div>
                <div style={{ fontSize: "1.35rem", fontWeight: 950, marginTop: ".25rem" }}>{formatMoney(kpiMY.adrAvg)}</div>
                <div style={{ marginTop: ".25rem", opacity: 0.8 }}>Base {maiteiBaseYear}: {formatMoney(kpiMB.adrAvg)}</div>
              </div>

              <div className="card" style={{ padding: ".85rem", borderRadius: 18 }}>
                <div style={{ fontWeight: 900, opacity: 0.75 }}>RevPAR (aprox.)</div>
                <div style={{ fontSize: "1.35rem", fontWeight: 950, marginTop: ".25rem" }}>{formatMoney(kpiMY.revpar)}</div>
                <div style={{ marginTop: ".25rem", opacity: 0.8 }}>Base {maiteiBaseYear}: {formatMoney(kpiMB.revpar)}</div>
              </div>
            </div>
          )}
        </div>

        {/* MAITEI detalle */}
        <div style={{ marginTop: "1rem" }}>
          <HofSummary year={maiteiYear} hotelFilter={maiteiHotel} filePath={HF_PATH} />
        </div>

        <div style={{ marginTop: "1rem" }}>
          <HofExplorer year={maiteiYear} hotelFilter={maiteiHotel} filePath={HF_PATH} />
        </div>
      </section>
    </div>
  );
}
