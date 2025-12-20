"use client";

import React, { useEffect, useMemo, useState } from "react";
import HofExplorer from "./HofExplorer";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

/**
 * YearComparator
 * - Filtro global de año + año base (comparativo)
 * - Carrousel grande JCR (KPIs) al inicio
 * - Comparativa (texto)
 * - H&F Explorer JCR
 * - Membership JCR (con gráficos + filtro hotel)
 * - Nacionalidades (CountryRanking)
 * - Carrousel Maitei
 * - H&F Explorer Maitei
 *
 * Fuente principal operativa: /public/data/hf_diario.csv
 * Fuente membership: /public/data/jcr_membership.xlsx
 */

type HfRow = {
  empresa: string; // hotel code canónico (MARRIOTT / SHERATON MDQ / SHERATON BCR / MAITEI)
  fecha: Date;
  year: number;
  month: number;
  roomsOcc: number;
  revenue: number;
  guests: number;
};

const DEFAULT_YEAR = 2025;
const DEFAULT_BASE_YEAR = 2024;

// Hoteles
const JCR_HOTELS = ["MARRIOTT", "SHERATON MDQ", "SHERATON BCR"];
const GOTEL_HOTELS = ["MAITEI"];

// Disponibilidad fija para ocupación
const AVAIL_PER_DAY: Record<string, number> = {
  "MARRIOTT": 300,
  "SHERATON MDQ": 194,
  "SHERATON BCR": 161,
  "MAITEI": 98,
};

// ---------- helpers ----------
function safeNum(v: any) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  // soporta "22.441,71" y "22441.71"
  const norm = s.replace(/\./g, "").replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

function parseDateAny(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  const s = String(v).trim();

  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // yyyy-mm-dd or Date parseable
  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("es-AR");
}
function fmtMoney0(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtMoney2(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct01(p: number) {
  return (p * 100).toFixed(1).replace(".", ",") + "%";
}
function deltaPct(cur: number, base: number) {
  if (!base) return 0;
  return (cur / base - 1) * 100;
}
function deltaLabelPct(cur: number, base: number) {
  const d = deltaPct(cur, base);
  if (!base) return "—";
  return `${d >= 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")}%`;
}
function deltaLabelPP(cur01: number, base01: number) {
  const dpp = (cur01 - base01) * 100;
  return `${dpp >= 0 ? "+" : ""}${dpp.toFixed(1).replace(".", ",")} p.p.`;
}
function deltaClass(d: number): "up" | "down" | "flat" {
  if (d > 0.00001) return "up";
  if (d < -0.00001) return "down";
  return "flat";
}

function normalizeHotel(raw: any): string {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();

  // ya canónicos
  if (s === "MARRIOTT" || s === "SHERATON MDQ" || s === "SHERATON BCR" || s === "MAITEI") return s;

  // variantes típicas CSV / Excel / texto
  if (s.includes("MARRIOTT")) return "MARRIOTT";
  if (s.includes("MAR DEL PLATA") || s.includes("MDQ")) return "SHERATON MDQ";
  if (s.includes("BARILOCHE") || s.includes("BCR")) return "SHERATON BCR";
  if (s.includes("MAITEI")) return "MAITEI";

  return s;
}

// ---------- fetch & parse CSV ----------
async function fetchText(path: string) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (status ${res.status})`);
  return await res.text();
}

function splitCsvLine(line: string): string[] {
  // parser simple con soporte de comillas
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseHfCsv(text: string): HfRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const idx = (name: string) => headers.findIndex((h) => h.trim().toLowerCase() === name.trim().toLowerCase());

  const iEmpresa = idx("Empresa");
  const iFecha = idx("Fecha");
  const iRoomsOcc =
    idx("Rooms Occ.") !== -1 ? idx("Rooms Occ.") :
    idx("Rooms Occ") !== -1 ? idx("Rooms Occ") :
    idx("Total Occ.") !== -1 ? idx("Total Occ.") :
    idx("Total Occ") !== -1 ? idx("Total Occ") : -1;

  const iRevenue =
    idx("Room Revenue") !== -1 ? idx("Room Revenue") :
    idx("Revenue") !== -1 ? idx("Revenue") :
    idx("RoomRevenue") !== -1 ? idx("RoomRevenue") : -1;

  const iGuests =
    idx("Adl. & Chl.") !== -1 ? idx("Adl. & Chl.") :
    idx("Adl. & Chl") !== -1 ? idx("Adl. & Chl") :
    idx("Guests") !== -1 ? idx("Guests") : -1;

  if (iEmpresa === -1 || iFecha === -1) return [];

  const rows: HfRow[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r]);
    const empresaRaw = cols[iEmpresa];
    const dateRaw = cols[iFecha];

    const d = parseDateAny(dateRaw);
    if (!d) continue;

    const empresa = normalizeHotel(empresaRaw);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;

    const roomsOcc = iRoomsOcc >= 0 ? safeNum(cols[iRoomsOcc]) : 0;
    const revenue = iRevenue >= 0 ? safeNum(cols[iRevenue]) : 0;
    const guests = iGuests >= 0 ? safeNum(cols[iGuests]) : 0;

    rows.push({ empresa, fecha: d, year, month, roomsOcc, revenue, guests });
  }

  return rows;
}

// ---------- agregados ----------
function calcAgg(rows: HfRow[], hotels: string[], year: number) {
  const subset = rows.filter((r) => r.year === year && hotels.includes(r.empresa));

  const rooms = subset.reduce((s, r) => s + r.roomsOcc, 0);
  const revenue = subset.reduce((s, r) => s + r.revenue, 0);
  const guests = subset.reduce((s, r) => s + r.guests, 0);
  const adr = rooms > 0 ? revenue / rooms : 0;

  // ocupación ponderada sobre días reportados por hotel
  const daySeen = new Set<string>();
  const daysPerHotel = new Map<string, number>();

  for (const r of subset) {
    const key = `${r.empresa}-${r.year}-${r.month}-${r.fecha.getDate()}`;
    if (daySeen.has(key)) continue;
    daySeen.add(key);
    daysPerHotel.set(r.empresa, (daysPerHotel.get(r.empresa) ?? 0) + 1);
  }

  let available = 0;
  for (const h of hotels) {
    const d = daysPerHotel.get(h) ?? 0;
    available += d * (AVAIL_PER_DAY[h] ?? 0);
  }

  const occ01 = available > 0 ? rooms / available : 0;

  return { rooms, revenue, guests, adr, occ01, availableDays: daySeen.size };
}

// ---------- UI: Carrousel grande (degradé, 4 KPIs) ----------
function BigCarousel4(props: {
  title: string;
  subtitle: string;
  kpis: Array<{
    label: string;
    value: string;
    sub: string;
    delta?: string;
    deltaClass?: "up" | "down" | "flat";
    bg: string;
  }>;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((p) => (p + 1) % props.kpis.length), 3200);
    return () => clearInterval(t);
  }, [props.kpis.length]);

  const k = props.kpis[idx];

  return (
    <div className="card" style={{ padding: "1.25rem", borderRadius: 22, overflow: "hidden" }}>
      <div style={{ display: "grid", gap: ".25rem" }}>
        <div className="cardTitle" style={{ fontSize: "1.25rem" }}>
          {props.title}
        </div>
        <div className="cardNote">{props.subtitle}</div>
      </div>

      <div
        style={{
          marginTop: "1rem",
          borderRadius: 18,
          padding: "1.25rem",
          background: k?.bg,
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.22)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }}>
          <div style={{ display: "grid", gap: ".35rem" }}>
            <div style={{ fontWeight: 900, letterSpacing: "-.01em", fontSize: "1.05rem" }}>{k?.label}</div>
            <div style={{ fontSize: "clamp(2.4rem, 3.4vw, 3.2rem)", fontWeight: 950, lineHeight: 1.05 }}>
              {k?.value}
            </div>
            <div style={{ color: "rgba(255,255,255,0.80)", fontSize: ".95rem" }}>{k?.sub}</div>

            {k?.delta ? (
              <div className={`delta ${k.deltaClass ?? "flat"}`} style={{ width: "fit-content", marginTop: ".4rem" }}>
                {k.delta}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
            {props.kpis.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Slide ${i + 1}`}
                onClick={() => setIdx(i)}
                className={`dot ${i === idx ? "active" : ""}`}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.20)",
                  background: i === idx ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.10)",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- main ----------
export default function YearComparator() {
  const [year, setYear] = useState<number>(DEFAULT_YEAR);
  const [baseYear, setBaseYear] = useState<number>(DEFAULT_BASE_YEAR);

  const [hfRows, setHfRows] = useState<HfRow[]>([]);
  const [hfErr, setHfErr] = useState<string>("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setHfErr("");
        const text = await fetchText("/data/hf_diario.csv");
        if (!alive) return;
        const parsed = parseHfCsv(text);
        setHfRows(parsed);
      } catch (e: any) {
        if (!alive) return;
        setHfRows([]);
        setHfErr(e?.message ?? "Error cargando hf_diario.csv");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const yearsAvailable = useMemo(() => {
    const s = new Set<number>();
    for (const r of hfRows) s.add(r.year);
    const arr = Array.from(s).sort((a, b) => b - a);
    return arr.length ? arr : [2025, 2024, 2023, 2022];
  }, [hfRows]);

  // Garantizar que year/baseYear existan
  useEffect(() => {
    if (!yearsAvailable.length) return;
    if (!yearsAvailable.includes(year)) setYear(yearsAvailable[0]);
    if (!yearsAvailable.includes(baseYear)) {
      const fallback = yearsAvailable.find((y) => y !== year) ?? yearsAvailable[0];
      setBaseYear(fallback);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearsAvailable.join("|")]);

  // Agregados JCR desde CSV
  const jcrCur = useMemo(() => calcAgg(hfRows, JCR_HOTELS, year), [hfRows, year]);
  const jcrBase = useMemo(() => calcAgg(hfRows, JCR_HOTELS, baseYear), [hfRows, baseYear]);

  const dRooms = deltaPct(jcrCur.rooms, jcrBase.rooms);
  const dGuests = deltaPct(jcrCur.guests, jcrBase.guests);
  const dRev = deltaPct(jcrCur.revenue, jcrBase.revenue);
  const dAdr = deltaPct(jcrCur.adr, jcrBase.adr);
  const dOccPP = (jcrCur.occ01 - jcrBase.occ01) * 100;

  const occLine = useMemo(() => {
    return {
      base: fmtPct01(jcrBase.occ01),
      cur: fmtPct01(jcrCur.occ01),
      pp: deltaLabelPP(jcrCur.occ01, jcrBase.occ01),
    };
  }, [jcrBase.occ01, jcrCur.occ01]);

  const jcrKpis = useMemo(() => {
    // Si no hay datos, lo mostramos explícito (para evitar “0” silencioso)
    const noData = jcrCur.availableDays === 0 || jcrCur.rooms === 0;
    const suffix = noData ? " (sin filas en hf_diario.csv para ese año/hoteles)" : "";

    return [
      {
        label: "Habitaciones ocupadas",
        value: fmtInt(jcrCur.rooms),
        sub: `${fmtInt(jcrBase.rooms)} → ${fmtInt(jcrCur.rooms)} · ${baseYear} → ${year}${suffix}`,
        delta: `${deltaLabelPct(jcrCur.rooms, jcrBase.rooms)} vs ${baseYear}`,
        deltaClass: deltaClass(dRooms),
        bg: "radial-gradient(1100px 480px at 20% 10%, rgba(96,165,250,0.30), transparent 60%), linear-gradient(180deg, rgba(16,18,26,0.96), rgba(12,14,20,0.96))",
      },
      {
        label: "Recaudación total (Room Revenue, USD)",
        value: fmtMoney2(jcrCur.revenue),
        sub: `${fmtMoney2(jcrBase.revenue)} → ${fmtMoney2(jcrCur.revenue)} · ${baseYear} → ${year}${suffix}`,
        delta: `${deltaLabelPct(jcrCur.revenue, jcrBase.revenue)} vs ${baseYear}`,
        deltaClass: deltaClass(dRev),
        bg: "radial-gradient(1100px 480px at 20% 10%, rgba(245,158,11,0.26), transparent 60%), linear-gradient(180deg, rgba(16,18,26,0.96), rgba(12,14,20,0.96))",
      },
      {
        label: "Huéspedes (Adl. & Chl.)",
        value: fmtInt(jcrCur.guests),
        sub: `${fmtInt(jcrBase.guests)} → ${fmtInt(jcrCur.guests)} · ${baseYear} → ${year}${suffix}`,
        delta: `${deltaLabelPct(jcrCur.guests, jcrBase.guests)} vs ${baseYear}`,
        deltaClass: deltaClass(dGuests),
        bg: "radial-gradient(1100px 480px at 20% 10%, rgba(16,185,129,0.26), transparent 60%), linear-gradient(180deg, rgba(16,18,26,0.96), rgba(12,14,20,0.96))",
      },
      {
        label: "Tarifa promedio anual (ADR)",
        value: fmtMoney2(jcrCur.adr),
        sub: `${fmtMoney2(jcrBase.adr)} → ${fmtMoney2(jcrCur.adr)} · ${baseYear} → ${year}${suffix}`,
        delta: `${deltaLabelPct(jcrCur.adr, jcrBase.adr)} vs ${baseYear}`,
        deltaClass: deltaClass(dAdr),
        bg: "radial-gradient(1100px 480px at 20% 10%, rgba(168,85,247,0.24), transparent 60%), linear-gradient(180deg, rgba(16,18,26,0.96), rgba(12,14,20,0.96))",
      },
    ];
  }, [jcrCur, jcrBase, year, baseYear, dRooms, dGuests, dRev, dAdr]);

  // Agregados MAITEI
  const maiteiCur = useMemo(() => calcAgg(hfRows, GOTEL_HOTELS, year), [hfRows, year]);
  const maiteiBase = useMemo(() => calcAgg(hfRows, GOTEL_HOTELS, baseYear), [hfRows, baseYear]);

  const maiteiKpis = useMemo(() => {
    const suffix = maiteiCur.availableDays === 0 ? " (sin filas para MAITEI en ese año)" : "";
    const dR = deltaPct(maiteiCur.rooms, maiteiBase.rooms);
    const dG = deltaPct(maiteiCur.guests, maiteiBase.guests);
    const dV = deltaPct(maiteiCur.revenue, maiteiBase.revenue);
    const dA = deltaPct(maiteiCur.adr, maiteiBase.adr);

    return [
      {
        label: "Habitaciones ocupadas",
        value: fmtInt(maiteiCur.rooms),
        sub: `${fmtInt(maiteiBase.rooms)} → ${fmtInt(maiteiCur.rooms)} · ${baseYear} → ${year}${suffix}`,
        delta: `${deltaLabelPct(maiteiCur.rooms, maiteiBase.rooms)} vs ${baseYear}`,
        deltaClass: deltaClass(dR),
        bg: "radial-gradient(1100px 480px at 20% 10%, rgba(96,165,250,0.30), transparent 60%), linear-gradient(180deg, rgba(16,18,26,0.96), rgba(12,14,20,0.96))",
      },
      {
        label: "Recaudación total (Room Revenue, USD)",
        value: fmtMoney2(maiteiCur.revenue),
        sub: `${fmtMoney2(maiteiBase.revenue)} → ${fmtMoney2(maiteiCur.revenue)} · ${baseYear} → ${year}${suffix}`,
        delta: `${deltaLabelPct(maiteiCur.revenue, maiteiBase.revenue)} vs ${baseYear}`,
        deltaClass: deltaClass(dV),
        bg: "radial-gradient(1100px 480px at 20% 10%, rgba(245,158,11,0.26), transparent 60%), linear-gradient(180deg, rgba(16,18,26,0.96), rgba(12,14,20,0.96))",
      },
      {
        label: "Huéspedes (Adl. & Chl.)",
        value: fmtInt(maiteiCur.guests),
        sub: `${fmtInt(maiteiBase.guests)} → ${fmtInt(maiteiCur.guests)} · ${baseYear} → ${year}${suffix}`,
        delta: `${deltaLabelPct(maiteiCur.guests, maiteiBase.guests)} vs ${baseYear}`,
        deltaClass: deltaClass(dG),
        bg: "radial-gradient(1100px 480px at 20% 10%, rgba(16,185,129,0.26), transparent 60%), linear-gradient(180deg, rgba(16,18,26,0.96), rgba(12,14,20,0.96))",
      },
      {
        label: "Tarifa promedio anual (ADR)",
        value: fmtMoney2(maiteiCur.adr),
        sub: `${fmtMoney2(maiteiBase.adr)} → ${fmtMoney2(maiteiCur.adr)} · ${baseYear} → ${year}${suffix}`,
        delta: `${deltaLabelPct(maiteiCur.adr, maiteiBase.adr)} vs ${baseYear}`,
        deltaClass: deltaClass(dA),
        bg: "radial-gradient(1100px 480px at 20% 10%, rgba(168,85,247,0.24), transparent 60%), linear-gradient(180deg, rgba(16,18,26,0.96), rgba(12,14,20,0.96))",
      },
    ];
  }, [maiteiCur, maiteiBase, year, baseYear]);

  return (
    <section className="section" id="comparador" style={{ width: "100%" }}>
      {/* Header + filtros */}
      <div
        className="card"
        style={{
          padding: "1.15rem",
          borderRadius: 22,
          display: "grid",
          gap: ".9rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ minWidth: 280 }}>
            <div className="sectionKicker">INFORME DE GESTIÓN</div>
            <div className="sectionTitle" style={{ fontSize: "1.55rem", fontWeight: 950 }}>
              Grupo Hoteles – Comparativo multianual
            </div>
            <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
              Reporte ejecutivo con indicadores clave y comparaciones interanuales. Elaborado por LTELC para JCR S.A.
              <div style={{ marginTop: ".35rem", color: "var(--muted)" }}>
                Alcance: Grupo JCR (Marriott BA, Sheraton MDQ, Sheraton Bariloche) + GOTEL (Maitei).
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: ".5rem", justifyItems: "end" }}>
            <div style={{ color: "var(--muted)", fontSize: ".9rem", fontWeight: 800 }}>Filtro global de año</div>

            <div className="pillRow" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
              {yearsAvailable.map((y) => (
                <button
                  key={y}
                  type="button"
                  className={`pill ${y === year ? "active" : ""}`}
                  onClick={() => setYear(y)}
                >
                  {y}
                </button>
              ))}
            </div>

            <div style={{ color: "var(--muted)", fontSize: ".9rem", fontWeight: 800, marginTop: ".2rem" }}>
              Año base comparativo
            </div>

            <div className="pillRow" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
              {yearsAvailable
                .filter((y) => y !== year)
                .map((y) => (
                  <button
                    key={y}
                    type="button"
                    className={`pill ${y === baseYear ? "active" : ""}`}
                    onClick={() => setBaseYear(y)}
                  >
                    {y}
                  </button>
                ))}
            </div>
          </div>
        </div>

        {hfErr ? (
          <div className="delta down" style={{ width: "fit-content" }}>
            {hfErr}
          </div>
        ) : null}
      </div>

      {/* ====== 1) CARROUSEL JCR (grande, al inicio) ====== */}
      <div style={{ marginTop: "1rem" }}>
        <BigCarousel4
          title={`Grupo JCR — KPIs ${year} (vs ${baseYear})`}
          subtitle={`Ocupación: ${occLine.base} → ${occLine.cur} (${occLine.pp}) · Disponibilidad fija: Marriott 300/día · Sheraton MDQ 194/día · Sheraton BCR 161/día`}
          kpis={jcrKpis}
        />
      </div>

      {/* ====== 2) COMPARATIVA (título general) ====== */}
      <div className="card" style={{ padding: "1.15rem", marginTop: "1rem", borderRadius: 22 }}>
        <div className="cardTitle">Comparativa {year} vs {baseYear}</div>
        <div className="cardNote" style={{ marginTop: ".35rem" }}>
          La ocupación se calcula con disponibilidad fija (rooms disponibles por día) y días reportados en H&amp;F.
          Esto evita inconsistencias entre hoteles con diferentes capacidades.
        </div>
        <div style={{ marginTop: ".75rem", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="pill">Ocupación JCR: {fmtPct01(jcrCur.occ01)}</div>
          <div className="pill">Δ Ocupación: {deltaLabelPP(jcrCur.occ01, jcrBase.occ01)}</div>
          <div className="pill">ADR JCR: {fmtMoney2(jcrCur.adr)}</div>
          <div className="pill">Δ ADR: {deltaLabelPct(jcrCur.adr, jcrBase.adr)}</div>
          <div className="pill">Revenue JCR: {fmtMoney2(jcrCur.revenue)}</div>
          <div className="pill">Δ Revenue: {deltaLabelPct(jcrCur.revenue, jcrBase.revenue)}</div>
        </div>
      </div>

      {/* ====== 3) H&F — Explorador JCR ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
          H&amp;F – Grupo JCR
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Filtros por hotel JCR + año/mes/trimestre. Incluye ranking por mes por hotel.
        </div>

        <div className="card" style={{ marginTop: "1rem", padding: "1rem", borderRadius: 22 }}>
          <HofExplorer
            filePath="/data/hf_diario.csv"
            allowedHotels={JCR_HOTELS}
            title="H&F — Explorador (JCR)"
            defaultYear={year}
          />
        </div>
      </div>

      {/* ====== 4) MEMBERSHIP (JCR) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
          Membership (JCR)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Cantidades + gráficos por membresía. Incluye filtro por hotel (JCR / Marriott / Sheraton MDQ / Sheraton BCR).
        </div>

        <div className="card" style={{ marginTop: "1rem", padding: "1rem", borderRadius: 22 }}>
          <MembershipSummary
            title="Membership — JCR"
            year={year}
            baseYear={baseYear}
            allowedHotels={JCR_HOTELS}
            filePath="/data/jcr_membership.xlsx"
          />
        </div>
      </div>

      {/* ====== 5) NACIONALIDADES ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
          Nacionalidades
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Ranking por país + distribución global (mapa). Usa filtro global de año.
        </div>

        <div className="card" style={{ marginTop: "1rem", padding: "1rem", borderRadius: 22 }}>
          <CountryRanking year={year} />
        </div>
      </div>

      {/* ====== 6) CARROUSEL MAITEI (GOTEL) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <BigCarousel4
          title={`GOTEL Management — Maitei — KPIs ${year} (vs ${baseYear})`}
          subtitle={`Ocupación (Maitei): ${fmtPct01(maiteiBase.occ01)} → ${fmtPct01(maiteiCur.occ01)} (${deltaLabelPP(maiteiCur.occ01, maiteiBase.occ01)}) · Disponibilidad fija: 98/día`}
          kpis={maiteiKpis}
        />
      </div>

      {/* ====== 7) H&F — Explorador MAITEI ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
          H&amp;F – Maitei (GOTEL)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Filtros por año/mes/trimestre. Datos exclusivos del hotel Maitei.
        </div>

        <div className="card" style={{ marginTop: "1rem", padding: "1rem", borderRadius: 22 }}>
          <HofExplorer
            filePath="/data/hf_diario.csv"
            allowedHotels={GOTEL_HOTELS}
            title="H&F — Explorador (Maitei)"
            defaultYear={year}
          />
        </div>
      </div>

      {/* estilos mínimos si tu proyecto ya los tiene, no molestan */}
      <style jsx>{`
        .sectionKicker {
          font-size: 0.8rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          color: var(--muted);
        }
        .sectionTitle {
          color: var(--fg);
        }
        .sectionDesc {
          color: var(--muted);
          font-size: 0.95rem;
        }
        .cardTitle {
          font-weight: 950;
          letter-spacing: -0.01em;
        }
        .cardNote {
          color: var(--muted);
          font-size: 0.95rem;
        }
        .pillRow {
          display: flex;
          gap: 0.5rem;
        }
        .pill {
          border-radius: 999px;
          padding: 0.45rem 0.7rem;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.9);
          font-weight: 800;
          cursor: pointer;
        }
        .pill.active {
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(255, 255, 255, 0.22);
        }
        .delta {
          border-radius: 999px;
          padding: 0.35rem 0.65rem;
          font-weight: 900;
          font-size: 0.9rem;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
        }
        .delta.up {
          color: rgba(34, 197, 94, 0.95);
        }
        .delta.down {
          color: rgba(248, 113, 113, 0.95);
        }
        .delta.flat {
          color: rgba(255, 255, 255, 0.8);
        }
      `}</style>
    </section>
  );
}

