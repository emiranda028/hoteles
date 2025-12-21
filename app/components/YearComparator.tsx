"use client";

import React, { useEffect, useMemo, useState } from "react";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

type GlobalHotel = "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "JCR" | "MAITEI";

const JCR_HOTELS: GlobalHotel[] = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

function norm(s: any) {
  return String(s ?? "").trim();
}
function up(s: any) {
  return norm(s).toUpperCase();
}

function toNum(x: any) {
  if (x === null || x === undefined) return 0;
  if (typeof x === "number") return isFinite(x) ? x : 0;

  // CSV viene como "22,441.71" o "22.441,71" o "59.40%"
  const raw = String(x).trim();
  if (!raw) return 0;

  // %:
  if (raw.includes("%")) {
    const s = raw.replace("%", "").replace(",", ".").replace(/[^\d.-]/g, "");
    const n = Number(s);
    return isFinite(n) ? n : 0;
  }

  // intentos de normalización:
  // - si tiene coma y punto, asumimos que la coma es separador de miles si viene estilo US "22,441.71"
  // - si viene estilo ES "22.441,71", removemos puntos y cambiamos coma por punto
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  let cleaned = raw;

  if (hasComma && hasDot) {
    // heurística: si el último punto está después de la última coma, probablemente dot decimal (US)
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    if (lastDot > lastComma) {
      cleaned = raw.replace(/,/g, "");
    } else {
      cleaned = raw.replace(/\./g, "").replace(",", ".");
    }
  } else if (hasComma && !hasDot) {
    cleaned = raw.replace(/\./g, "").replace(",", ".");
  }

  cleaned = cleaned.replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

// Fecha en hf_diario: "6/1/2022" (m/d/yyyy) o "1/6/2022" según export.
// Mejor: si viene Date + "Date" columna "01-06-22 Wed" también existe.
function parseAnyDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;

  const s = norm(value);
  if (!s) return null;

  // 1) formato dd-mm-yy (ej "01-06-22 Wed")
  const m1 = s.match(/^(\d{2})-(\d{2})-(\d{2})/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    const yy = Number(m1[3]);
    const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
    const d = new Date(yyyy, mm - 1, dd);
    if (!isNaN(d.getTime())) return d;
  }

  // 2) formato d/m/yyyy o m/d/yyyy -> heurística: si primer número > 12 => es día
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) {
    const a = Number(m2[1]);
    const b = Number(m2[2]);
    const yyyy = Number(m2[3]);
    let dd = a;
    let mm = b;

    if (a <= 12 && b <= 12) {
      // ambiguo, pero en tus ejemplos parecía 1/6/2022 = 1 de junio (Argentina)
      // preferimos dd/mm
      dd = a;
      mm = b;
    } else if (a > 12) {
      dd = a;
      mm = b;
    } else {
      // b > 12
      dd = b;
      mm = a;
    }

    const d = new Date(yyyy, mm - 1, dd);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

type HfRow = {
  hotel: GlobalHotel | string;
  hof: "History" | "Forecast" | string;
  date: Date;
  year: number;
  month: number;
  totalOcc: number;
  roomRevenue: number;
  adr: number;
  occPct: number; // 0..100
};

function monthLabel(m: number) {
  const labels = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return labels[m] ?? "";
}

function sum(arr: number[]) {
  let t = 0;
  for (let i = 0; i < arr.length; i++) t += arr[i];
  return t;
}

function fmtMoney(n: number) {
  // sin moneda fija, pero estilo AR
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}
function fmtNum(n: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}
function fmtPct(n: number) {
  if (!isFinite(n)) return "0.0%";
  return `${n.toFixed(1)}%`;
}

export default function YearComparator() {
  // filtros globales
  const [year, setYear] = useState<number>(2025);
  const [baseYear, setBaseYear] = useState<number>(2024);
  const [globalHotel, setGlobalHotel] = useState<GlobalHotel>("MARRIOTT");

  // data state
  const [hfRows, setHfRows] = useState<HfRow[]>([]);
  const [hfLoading, setHfLoading] = useState<boolean>(true);
  const [hfError, setHfError] = useState<string>("");

  // load hf_diario.csv
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setHfLoading(true);
        setHfError("");

        const res = await fetch(HF_PATH);
        if (!res.ok) throw new Error(`No se pudo cargar ${HF_PATH} (${res.status})`);
        const text = await res.text();

        // parse CSV “simple” (headers con saltos de línea)
        // No usamos libs; mantenemos robusto.
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          setHfRows([]);
          setHfLoading(false);
          return;
        }

        // separador: coma
        const header = lines[0].split(",");
        const idx = (nameCandidates: string[]) => {
          const h = header.map((x) => x.trim());
          for (let i = 0; i < nameCandidates.length; i++) {
            const target = nameCandidates[i];
            const pos = h.findIndex((col) => col === target);
            if (pos >= 0) return pos;
          }
          // fallback por contains
          for (let i = 0; i < nameCandidates.length; i++) {
            const target = nameCandidates[i].toLowerCase();
            const pos = h.findIndex((col) => col.toLowerCase().includes(target));
            if (pos >= 0) return pos;
          }
          return -1;
        };

        const iEmpresa = idx(["Empresa"]);
        const iHof = idx(["HoF"]);
        const iFecha = idx(["Fecha"]);
        const iDate = idx(["Date"]);

        const iTotalOcc = idx(["Total\nOcc.", "Total Occ.", "Total Occ"]);
        const iRoomRev = idx(["Room Revenue", "Room Revenue "]);
        const iAdr = idx(["Average Rate", "ADR"]);
        const iOccPct = idx(["Occ.%", "Occ.% "]);

        const parsed: HfRow[] = [];

        for (let li = 1; li < lines.length; li++) {
          const cols = lines[li].split(",");

          const hotelRaw = iEmpresa >= 0 ? cols[iEmpresa] : "";
          const hofRaw = iHof >= 0 ? cols[iHof] : "";
          const fechaRaw = iFecha >= 0 ? cols[iFecha] : "";
          const dateRaw = iDate >= 0 ? cols[iDate] : "";

          const d = parseAnyDate(fechaRaw) || parseAnyDate(dateRaw);
          if (!d) continue;

          const y = d.getFullYear();
          const m = d.getMonth() + 1;

          const row: HfRow = {
            hotel: up(hotelRaw) || hotelRaw || "",
            hof: (norm(hofRaw) as any) || "",
            date: d,
            year: y,
            month: m,
            totalOcc: iTotalOcc >= 0 ? toNum(cols[iTotalOcc]) : 0,
            roomRevenue: iRoomRev >= 0 ? toNum(cols[iRoomRev]) : 0,
            adr: iAdr >= 0 ? toNum(cols[iAdr]) : 0,
            occPct: iOccPct >= 0 ? toNum(cols[iOccPct]) : 0,
          };

          parsed.push(row);
        }

        if (!mounted) return;

        setHfRows(parsed);
        setHfLoading(false);

        // autoconfig años disponibles (si todavía estás en default)
        const yearsSet = new Set<number>();
        for (let i = 0; i < parsed.length; i++) yearsSet.add(parsed[i].year);
        const years = Array.from(yearsSet).sort((a, b) => b - a);

        if (years.length) {
          // si el año elegido no existe, agarramos el más nuevo
          if (!yearsSet.has(year)) setYear(years[0]);
          if (!yearsSet.has(baseYear)) setBaseYear(years[0] - 1);
        }
      } catch (e: any) {
        if (!mounted) return;
        setHfError(e?.message || "Error cargando History & Forecast");
        setHfRows([]);
        setHfLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // hotel filter aplicado a secciones (HF, KPIs, Comparativa)
  const hfFiltered = useMemo(() => {
    if (!hfRows.length) return [];

    const targetHotels =
      globalHotel === "JCR" ? JCR_HOTELS : [globalHotel];

    const set = new Set(targetHotels.map((h) => String(h)));
    return hfRows.filter((r) => set.has(String(r.hotel)));
  }, [hfRows, globalHotel]);

  const yearsAvailable = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < hfRows.length; i++) set.add(hfRows[i].year);
    return Array.from(set).sort((a, b) => b - a);
  }, [hfRows]);

  // KPIs por año (sobre History + Forecast juntos, como venías mostrando)
  const kpis = useMemo(() => {
    const cur = hfFiltered.filter((r) => r.year === year);
    const base = hfFiltered.filter((r) => r.year === baseYear);

    const curOcc = sum(cur.map((r) => r.totalOcc));
    const baseOcc = sum(base.map((r) => r.totalOcc));

    const curRev = sum(cur.map((r) => r.roomRevenue));
    const baseRev = sum(base.map((r) => r.roomRevenue));

    // ADR promedio ponderado por occ
    const curAdr = curOcc > 0 ? sum(cur.map((r) => r.adr * r.totalOcc)) / curOcc : 0;
    const baseAdr = baseOcc > 0 ? sum(base.map((r) => r.adr * r.totalOcc)) / baseOcc : 0;

    const diff = (a: number, b: number) => (b === 0 ? null : ((a - b) / b) * 100);

    return {
      cur: { occ: curOcc, rev: curRev, adr: curAdr },
      base: { occ: baseOcc, rev: baseRev, adr: baseAdr },
      delta: {
        occ: diff(curOcc, baseOcc),
        rev: diff(curRev, baseRev),
        adr: diff(curAdr, baseAdr),
      },
    };
  }, [hfFiltered, year, baseYear]);

  // detalle mensual (suma por mes)
  const monthly = useMemo(() => {
    const make = (y: number) => {
      const arr = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        occ: 0,
        rev: 0,
        adrW: 0,
        adrBase: 0,
      }));

      const rows = hfFiltered.filter((r) => r.year === y);
      for (let i = 0; i < rows.length; i++) {
        const m = rows[i].month;
        if (m < 1 || m > 12) continue;

        const idx = m - 1;
        arr[idx].occ += rows[i].totalOcc;
        arr[idx].rev += rows[i].roomRevenue;
        arr[idx].adrW += rows[i].adr * rows[i].totalOcc;
        arr[idx].adrBase += rows[i].totalOcc;
      }

      // consolidar ADR por mes
      return arr.map((x) => ({
        month: x.month,
        occ: x.occ,
        rev: x.rev,
        adr: x.adrBase > 0 ? x.adrW / x.adrBase : 0,
      }));
    };

    return {
      cur: make(year),
      base: make(baseYear),
    };
  }, [hfFiltered, year, baseYear]);

  // comparativa simple: top diferencias por mes en revenue
  const compareByMonth = useMemo(() => {
    const list = [];
    for (let i = 0; i < 12; i++) {
      const c = monthly.cur[i];
      const b = monthly.base[i];
      const deltaRev = c.rev - b.rev;
      const deltaOcc = c.occ - b.occ;
      list.push({
        month: c.month,
        deltaRev,
        deltaOcc,
        curRev: c.rev,
        baseRev: b.rev,
      });
    }
    // top 6 por abs revenue
    return list.sort((a, b) => Math.abs(b.deltaRev) - Math.abs(a.deltaRev)).slice(0, 6);
  }, [monthly]);

  // Membership hotel filter: MAITEI NO aplica, membership es solo JCR group (y sus 3 hoteles)
  const membershipHotelFilter = useMemo(() => {
    if (globalHotel === "MAITEI") return "JCR" as const;
    return globalHotel; // "MARRIOTT" | "SHERATON..." | "JCR"
  }, [globalHotel]);

  // UI helpers
  const kpiCard = (title: string, curVal: string, baseVal: string, delta: number | null, gradient: string) => (
    <div
      className="card"
      style={{
        padding: "1rem",
        borderRadius: 18,
        background: gradient,
        border: "1px solid rgba(255,255,255,.08)",
        minHeight: 92,
      }}
    >
      <div style={{ fontWeight: 950, fontSize: ".95rem" }}>{title}</div>
      <div style={{ marginTop: ".35rem", display: "flex", alignItems: "baseline", gap: ".6rem", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 950, fontSize: "1.35rem" }}>{curVal}</div>
        <div style={{ opacity: 0.75 }}>
          vs {baseYear}: <b>{baseVal}</b>
        </div>
      </div>
      <div style={{ marginTop: ".25rem", opacity: 0.85 }}>
        {delta === null ? "Sin base" : `Δ ${fmtPct(delta)}`}
      </div>
    </div>
  );

  return (
    <section className="section" id="comparador">
      {/* ===== Encabezado + filtros globales ===== */}
      <div style={{ display: "grid", gap: ".75rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.35rem", fontWeight: 950 }}>
          Comparador anual (H&F / KPIs / Membership / Nacionalidades)
        </div>
        <div className="sectionDesc" style={{ opacity: 0.8 }}>
          Filtros globales de <b>año</b> y <b>hotel</b>. Nacionalidades usa solo año (archivo Marriott).
        </div>

        {/* Filtros responsive */}
        <div
          className="card"
          style={{
            padding: "1rem",
            borderRadius: 18,
            display: "flex",
            gap: ".75rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
            <div style={{ opacity: 0.75, fontSize: ".9rem" }}>Año:</div>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ padding: ".45rem .6rem", borderRadius: 10 }}>
              {yearsAvailable.length
                ? yearsAvailable.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))
                : [2025, 2024, 2023].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
            <div style={{ opacity: 0.75, fontSize: ".9rem" }}>Base:</div>
            <select value={baseYear} onChange={(e) => setBaseYear(Number(e.target.value))} style={{ padding: ".45rem .6rem", borderRadius: 10 }}>
              {yearsAvailable.length
                ? yearsAvailable.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))
                : [2024, 2023, 2022].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
            <div style={{ opacity: 0.75, fontSize: ".9rem" }}>Hotel:</div>
            <select value={globalHotel} onChange={(e) => setGlobalHotel(e.target.value as GlobalHotel)} style={{ padding: ".45rem .6rem", borderRadius: 10 }}>
              <option value="MARRIOTT">MARRIOTT</option>
              <option value="SHERATON BCR">SHERATON BCR</option>
              <option value="SHERATON MDQ">SHERATON MDQ</option>
              <option value="JCR">JCR (grupo)</option>
              <option value="MAITEI">MAITEI</option>
            </select>
          </div>

          <div style={{ marginLeft: "auto", opacity: 0.7, fontSize: ".9rem" }}>
            Data H&F: {HF_PATH}
          </div>
        </div>
      </div>

      {/* ===== 1) KPIs PRINCIPALES ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          KPIs principales {year} (vs {baseYear})
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Suma anual y diferencia vs base. (Aplican filtros globales).
        </div>

        {hfLoading ? (
          <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 18 }}>
            Cargando H&F…
          </div>
        ) : hfError ? (
          <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 18 }}>
            <b>Error:</b> {hfError}
          </div>
        ) : (
          <div
            style={{
              marginTop: ".85rem",
              display: "grid",
              gridTemplateColumns: "repeat(12, minmax(0,1fr))",
              gap: "1rem",
            }}
          >
            <div style={{ gridColumn: "span 12" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(12, minmax(0,1fr))",
                  gap: "1rem",
                }}
              >
                <div style={{ gridColumn: "span 12" }}>
                  {kpiCard(
                    "Rooms Occ. (Total Occ.)",
                    fmtNum(kpis.cur.occ),
                    fmtNum(kpis.base.occ),
                    kpis.delta.occ,
                    "linear-gradient(135deg, rgba(59,130,246,.18), rgba(17,24,39,.1))"
                  )}
                </div>

                <div style={{ gridColumn: "span 12" }}>
                  {kpiCard(
                    "Room Revenue",
                    fmtMoney(kpis.cur.rev),
                    fmtMoney(kpis.base.rev),
                    kpis.delta.rev,
                    "linear-gradient(135deg, rgba(236,72,153,.16), rgba(17,24,39,.1))"
                  )}
                </div>

                <div style={{ gridColumn: "span 12" }}>
                  {kpiCard(
                    "ADR (prom. ponderado)",
                    kpis.cur.adr.toLocaleString("es-AR", { maximumFractionDigits: 2 }),
                    kpis.base.adr.toLocaleString("es-AR", { maximumFractionDigits: 2 }),
                    kpis.delta.adr,
                    "linear-gradient(135deg, rgba(16,185,129,.16), rgba(17,24,39,.1))"
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== 2) HISTORY & FORECAST (detalle mensual) ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          History &amp; Forecast — Detalle mensual
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Suma por mes para el hotel/grupo filtrado.
        </div>

        <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 18, overflowX: "auto" }}>
          {!hfFiltered.length ? (
            <div style={{ opacity: 0.8 }}>
              Sin filas H&F para el filtro actual. (Revisá “Empresa” en el CSV y que coincida con los nombres).
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.85 }}>
                  <th style={{ padding: ".55rem .35rem" }}>Mes</th>
                  <th style={{ padding: ".55rem .35rem" }}>{year} Occ</th>
                  <th style={{ padding: ".55rem .35rem" }}>{year} Rev</th>
                  <th style={{ padding: ".55rem .35rem" }}>{year} ADR</th>
                  <th style={{ padding: ".55rem .35rem" }}>{baseYear} Occ</th>
                  <th style={{ padding: ".55rem .35rem" }}>{baseYear} Rev</th>
                  <th style={{ padding: ".55rem .35rem" }}>{baseYear} ADR</th>
                </tr>
              </thead>
              <tbody>
                {monthly.cur.map((m, idx) => {
                  const b = monthly.base[idx];
                  return (
                    <tr key={m.month} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                      <td style={{ padding: ".55rem .35rem", fontWeight: 900 }}>{monthLabel(m.month)}</td>
                      <td style={{ padding: ".55rem .35rem" }}>{fmtNum(m.occ)}</td>
                      <td style={{ padding: ".55rem .35rem" }}>{fmtMoney(m.rev)}</td>
                      <td style={{ padding: ".55rem .35rem" }}>{m.adr.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: ".55rem .35rem", opacity: 0.85 }}>{fmtNum(b.occ)}</td>
                      <td style={{ padding: ".55rem .35rem", opacity: 0.85 }}>{fmtMoney(b.rev)}</td>
                      <td style={{ padding: ".55rem .35rem", opacity: 0.85 }}>{b.adr.toLocaleString("es-AR", { maximumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ===== 3) COMPARATIVA (Top meses por diferencia) ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Comparativa rápida — meses con mayor diferencia
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Top por variación absoluta de Room Revenue.
        </div>

        <div style={{ marginTop: ".85rem", display: "grid", gap: ".75rem" }}>
          {compareByMonth.map((x) => {
            const sign = x.deltaRev >= 0 ? "+" : "";
            const pct = x.baseRev > 0 ? ((x.curRev - x.baseRev) / x.baseRev) * 100 : null;

            return (
              <div key={x.month} className="card" style={{ padding: "1rem", borderRadius: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 950 }}>
                    {monthLabel(x.month)} — Δ Rev: <span style={{ fontWeight: 950 }}>{sign}{fmtMoney(x.deltaRev)}</span>
                  </div>
                  <div style={{ opacity: 0.8 }}>
                    {pct === null ? "Sin base" : `(${sign}${pct.toFixed(1)}%)`}
                  </div>
                </div>
                <div style={{ marginTop: ".35rem", opacity: 0.75 }}>
                  {year}: {fmtMoney(x.curRev)} • {baseYear}: {fmtMoney(x.baseRev)} • Δ Occ: {x.deltaOcc >= 0 ? "+" : ""}{fmtNum(x.deltaOcc)}
                </div>
              </div>
            );
          })}

          {!compareByMonth.length && (
            <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
              Sin comparativa (faltan datos del año o base).
            </div>
          )}
        </div>
      </div>

      {/* ===== 4) MEMBERSHIP ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Membership (JCR)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Cantidades + gráficos. Usa filtro global de año + hotel (JCR/MARRIOTT/SHERATONS). MAITEI redirige a JCR.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <MembershipSummary
            year={year}
            baseYear={baseYear}
            allowedHotels={Array.from(JCR_HOTELS)}
            filePath={MEMBERSHIP_PATH}
            hotelFilter={membershipHotelFilter as any}
            compactCharts={true}
          />
        </div>
      </div>

      {/* ===== 5) Nacionalidades ===== */}
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

      {/* Footer debug suave */}
      <div style={{ marginTop: "1.25rem", opacity: 0.65, fontSize: ".85rem" }}>
        Debug: hotel={globalHotel} • year={year} • base={baseYear} • hfRows={hfRows.length} • hfFiltered={hfFiltered.length}
      </div>
    </section>
  );
}
