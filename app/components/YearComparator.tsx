"use client";

import React, { useEffect, useMemo, useState } from "react";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";
import { parseCsv } from "./csvClient";

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

// números estilo ES: 22.441,71 / 59,40% etc.
function toNum(x: any) {
  if (x === null || x === undefined) return 0;
  if (typeof x === "number") return isFinite(x) ? x : 0;

  const raw = String(x).trim();
  if (!raw) return 0;

  if (raw.includes("%")) {
    const s = raw.replace("%", "").replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
    const n = Number(s);
    return isFinite(n) ? n : 0;
  }

  const cleaned = raw.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

function parseAnyDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;

  const s = norm(value);
  if (!s) return null;

  // "01-06-22 We"
  const m1 = s.match(/^(\d{2})-(\d{2})-(\d{2})/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    const yy = Number(m1[3]);
    const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
    const d = new Date(yyyy, mm - 1, dd);
    if (!isNaN(d.getTime())) return d;
  }

  // "1/6/2022" (ARG dd/mm)
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) {
    const dd = Number(m2[1]);
    const mm = Number(m2[2]);
    const yyyy = Number(m2[3]);
    const d = new Date(yyyy, mm - 1, dd);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

type HfRow = {
  hotel: string; // normalizado
  hof: string; // History/Forecast
  date: Date;
  year: number;
  month: number;
  totalOcc: number;
  roomRevenue: number;
  adr: number;
  occPct: number;
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
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}
function fmtNum(n: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}
function fmtPct(n: number | null) {
  if (n === null || !isFinite(n)) return "Sin base";
  return `${n.toFixed(1)}%`;
}

export default function YearComparator() {
  const [year, setYear] = useState<number>(2025);
  const [baseYear, setBaseYear] = useState<number>(2024);
  const [globalHotel, setGlobalHotel] = useState<GlobalHotel>("MARRIOTT");

  const [hfRows, setHfRows] = useState<HfRow[]>([]);
  const [hfLoading, setHfLoading] = useState(true);
  const [hfError, setHfError] = useState("");

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setHfLoading(true);
        setHfError("");

        const res = await fetch(HF_PATH);
        if (!res.ok) throw new Error(`No se pudo cargar ${HF_PATH} (${res.status})`);
        const text = await res.text();

        const parsed = parseCsv(text); // 🔥 detecta delimitador bien
        const rows = parsed.rows;

        if (!rows.length) {
          if (!mounted) return;
          setHfRows([]);
          setHfLoading(false);
          return;
        }

        // localizar columnas por nombre aproximado
        const headers = parsed.headers.map((h) => h.trim());
        const findKey = (cands: string[]) => {
          const low = headers.map((h) => h.toLowerCase());
          for (let i = 0; i < cands.length; i++) {
            const c = cands[i].toLowerCase();
            const idx = low.findIndex((h) => h === c);
            if (idx >= 0) return headers[idx];
          }
          for (let i = 0; i < cands.length; i++) {
            const c = cands[i].toLowerCase();
            const idx = low.findIndex((h) => h.includes(c));
            if (idx >= 0) return headers[idx];
          }
          return "";
        };

        const kEmpresa = findKey(["Empresa"]);
        const kHoF = findKey(["HoF"]);
        const kFecha = findKey(["Fecha"]);
        const kDate = findKey(["Date"]);
        const kTotalOcc = findKey(["Total", "Total Occ", "Total Occ."]);
        const kRoomRevenue = findKey(["Room Reven", "Room Revenue"]);
        const kADR = findKey(["Average Rate", "ADR"]);
        const kOccPct = findKey(["Occ.%", "Occ%"]);

        const out: HfRow[] = [];

        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];

          const hotel = up(r[kEmpresa] ?? "");
          const hof = norm(r[kHoF] ?? "");

          // en tu tabla aparecen Date y Fecha; usamos cualquiera
          const d = parseAnyDate(r[kFecha]) || parseAnyDate(r[kDate]);
          if (!d) continue;

          const y = d.getFullYear();
          const m = d.getMonth() + 1;

          out.push({
            hotel,
            hof,
            date: d,
            year: y,
            month: m,
            totalOcc: toNum(r[kTotalOcc]),
            roomRevenue: toNum(r[kRoomRevenue]),
            adr: toNum(r[kADR]),
            occPct: toNum(r[kOccPct]),
          });
        }

        if (!mounted) return;

        setHfRows(out);
        setHfLoading(false);

        // años disponibles
        const yset = new Set<number>();
        for (let i = 0; i < out.length; i++) yset.add(out[i].year);
        const years = Array.from(yset).sort((a, b) => b - a);

        if (years.length) {
          if (!yset.has(year)) setYear(years[0]);
          if (!yset.has(baseYear)) setBaseYear(years[0] - 1);
        }
      } catch (e: any) {
        if (!mounted) return;
        setHfError(e?.message || "Error cargando H&F");
        setHfRows([]);
        setHfLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const yearsAvailable = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < hfRows.length; i++) set.add(hfRows[i].year);
    return Array.from(set).sort((a, b) => b - a);
  }, [hfRows]);

  // --- filtro hotel H&F (incluye gotel/maitei separado) ---
  const hfFiltered = useMemo(() => {
    if (!hfRows.length) return [];
    const target =
      globalHotel === "JCR" ? JCR_HOTELS.map(String) : [String(globalHotel)];
    const set = new Set(target);
    return hfRows.filter((r) => set.has(String(r.hotel)));
  }, [hfRows, globalHotel]);

  // KPIs (sobre todo el año)
  const kpis = useMemo(() => {
    const cur = hfFiltered.filter((r) => r.year === year);
    const base = hfFiltered.filter((r) => r.year === baseYear);

    const curOcc = sum(cur.map((r) => r.totalOcc));
    const baseOcc = sum(base.map((r) => r.totalOcc));

    const curRev = sum(cur.map((r) => r.roomRevenue));
    const baseRev = sum(base.map((r) => r.roomRevenue));

    const curAdr = curOcc > 0 ? sum(cur.map((r) => r.adr * r.totalOcc)) / curOcc : 0;
    const baseAdr = baseOcc > 0 ? sum(base.map((r) => r.adr * r.totalOcc)) / baseOcc : 0;

    const deltaPct = (a: number, b: number) => (b === 0 ? null : ((a - b) / b) * 100);

    return {
      cur: { occ: curOcc, rev: curRev, adr: curAdr },
      base: { occ: baseOcc, rev: baseRev, adr: baseAdr },
      delta: {
        occ: deltaPct(curOcc, baseOcc),
        rev: deltaPct(curRev, baseRev),
        adr: deltaPct(curAdr, baseAdr),
      },
    };
  }, [hfFiltered, year, baseYear]);

  // mensual (ranking por mes vuelve)
  const monthly = useMemo(() => {
    const build = (y: number) => {
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

      return arr.map((x) => ({
        month: x.month,
        occ: x.occ,
        rev: x.rev,
        adr: x.adrBase > 0 ? x.adrW / x.adrBase : 0,
      }));
    };

    return { cur: build(year), base: build(baseYear) };
  }, [hfFiltered, year, baseYear]);

  // comparativa top meses por diferencia revenue
  const compareByMonth = useMemo(() => {
    const list: any[] = [];
    for (let i = 0; i < 12; i++) {
      const c = monthly.cur[i];
      const b = monthly.base[i];
      list.push({
        month: c.month,
        deltaRev: c.rev - b.rev,
        deltaOcc: c.occ - b.occ,
        curRev: c.rev,
        baseRev: b.rev,
      });
    }
    return list.sort((a, b) => Math.abs(b.deltaRev) - Math.abs(a.deltaRev)).slice(0, 6);
  }, [monthly]);

  // membership filter: MAITEI → JCR (tal como me pediste)
  const membershipHotelFilter = useMemo(() => {
    if (globalHotel === "MAITEI") return "JCR";
    return globalHotel;
  }, [globalHotel]);

  const kpiCard = (title: string, curVal: string, baseVal: string, delta: number | null, gradient: string) => (
    <div
      className="card"
      style={{
        padding: "1rem",
        borderRadius: 18,
        background: gradient,
        border: "1px solid rgba(255,255,255,.08)",
      }}
    >
      <div style={{ fontWeight: 950, fontSize: ".95rem" }}>{title}</div>
      <div style={{ marginTop: ".35rem", display: "flex", gap: ".6rem", alignItems: "baseline", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 950, fontSize: "1.35rem" }}>{curVal}</div>
        <div style={{ opacity: 0.8 }}>vs {baseYear}: <b>{baseVal}</b></div>
      </div>
      <div style={{ marginTop: ".25rem", opacity: 0.9 }}>Δ {fmtPct(delta)}</div>
    </div>
  );

  return (
    <section className="section" id="comparador">
      {/* ===== Header + filtros ===== */}
      <div style={{ display: "grid", gap: ".75rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.35rem", fontWeight: 950 }}>
          Dashboard Hoteles — Comparador anual
        </div>

        <div
          className="card"
          style={{
            padding: "1rem",
            borderRadius: 18,
            display: "flex",
            gap: ".75rem",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
            <div style={{ opacity: 0.75, fontSize: ".9rem" }}>Año:</div>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ padding: ".45rem .6rem", borderRadius: 10 }}>
              {(yearsAvailable.length ? yearsAvailable : [2025, 2024, 2023]).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
            <div style={{ opacity: 0.75, fontSize: ".9rem" }}>Base:</div>
            <select value={baseYear} onChange={(e) => setBaseYear(Number(e.target.value))} style={{ padding: ".45rem .6rem", borderRadius: 10 }}>
              {(yearsAvailable.length ? yearsAvailable : [2024, 2023, 2022]).map((y) => (
                <option key={y} value={y}>{y}</option>
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
              <option value="MAITEI">MAITEI (Gotel)</option>
            </select>
          </div>

          <div style={{ marginLeft: "auto", opacity: 0.7, fontSize: ".9rem" }}>
            H&F: {HF_PATH}
          </div>
        </div>
      </div>

      {/* ===== KPIs ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          KPIs principales {year} (vs {baseYear})
        </div>

        {hfLoading ? (
          <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 18 }}>Cargando H&F…</div>
        ) : hfError ? (
          <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 18 }}>
            <b>Error H&F:</b> {hfError}
          </div>
        ) : (
          <div style={{ marginTop: ".85rem", display: "grid", gap: "1rem" }}>
            {kpiCard(
              "Total Occ.",
              fmtNum(kpis.cur.occ),
              fmtNum(kpis.base.occ),
              kpis.delta.occ,
              "linear-gradient(135deg, rgba(59,130,246,.20), rgba(17,24,39,.1))"
            )}
            {kpiCard(
              "Room Revenue",
              fmtMoney(kpis.cur.rev),
              fmtMoney(kpis.base.rev),
              kpis.delta.rev,
              "linear-gradient(135deg, rgba(236,72,153,.18), rgba(17,24,39,.1))"
            )}
            {kpiCard(
              "ADR (ponderado)",
              kpis.cur.adr.toLocaleString("es-AR", { maximumFractionDigits: 2 }),
              kpis.base.adr.toLocaleString("es-AR", { maximumFractionDigits: 2 }),
              kpis.delta.adr,
              "linear-gradient(135deg, rgba(16,185,129,.18), rgba(17,24,39,.1))"
            )}
          </div>
        )}
      </div>

      {/* ===== H&F mensual ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          History &amp; Forecast — ranking por mes
        </div>

        <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 18, overflowX: "auto" }}>
          {!hfFiltered.length ? (
            <div style={{ opacity: 0.8 }}>
              Sin filas H&F para el filtro actual. (Chequeá valores reales en columna <b>Empresa</b> del CSV)
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

      {/* ===== Comparativa ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Comparativa — meses con mayor diferencia
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
                  <div style={{ opacity: 0.8 }}>{pct === null ? "Sin base" : `(${sign}${pct.toFixed(1)}%)`}</div>
                </div>
                <div style={{ marginTop: ".35rem", opacity: 0.75 }}>
                  {year}: {fmtMoney(x.curRev)} • {baseYear}: {fmtMoney(x.baseRev)} • Δ Occ: {x.deltaOcc >= 0 ? "+" : ""}{fmtNum(x.deltaOcc)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== Membership ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Membership (JCR)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Filtro global: Año + Hotel (JCR/MARRIOTT/SHERATONS). MAITEI se interpreta como JCR.
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

      {/* ===== Nacionalidades (solo Año, Marriott) ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Nacionalidades (Marriott)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Ranking por país + continentes. Usa solo filtro global de año.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <CountryRanking year={year} filePath={NACIONALIDADES_PATH} />
        </div>
      </div>

      {/* Debug */}
      <div style={{ marginTop: "1.25rem", opacity: 0.65, fontSize: ".85rem" }}>
        Debug: hotel={globalHotel} • year={year} • base={baseYear} • hfRows={hfRows.length} • hfFiltered={hfFiltered.length}
      </div>
    </section>
  );
}
