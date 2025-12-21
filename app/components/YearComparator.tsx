"use client";

import React, { useEffect, useMemo, useState } from "react";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

type GlobalHotel = "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";
type HofType = "History" | "Forecast";

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

const JCR_HOTELS: GlobalHotel[] = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];

type HFRow = {
  date: Date | null;
  year: number | null;
  month: number | null; // 1..12
  hof: HofType | null;
  hotel: GlobalHotel | null;

  occPct: number; // 0..100
  adr: number; // Average Rate
  roomRevenue: number;

  totalRooms: number;
  oooRooms: number;
  adults: number;

  raw: Record<string, any>;
};

function norm(s: any) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function parseNumberFlexible(v: any): number {
  const s0 = String(v ?? "").trim();
  if (!s0) return 0;

  let s = s0.replace("%", "").trim();

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    // europeo 22.441,71 -> 22441.71
    s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  if (!hasDot && hasComma) {
    s = s.replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  // 21.931 (miles) -> 21931
  const m = s.match(/^(-?\d+)\.(\d{3})$/);
  if (m) {
    const n = Number((m[1] + m[2]).replace(/\s/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseDateFlexible(v: any): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;

  // acepta dd/mm/yyyy o d/m/yyyy o mm/dd/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null;

  const a = Number(m[1]);
  const b = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;

  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(y)) return null;

  // heurística:
  // - si a > 12 => a=day
  // - si b > 12 => b=day y a=month
  // - sino asumimos dayfirst (Argentina)
  let day = a;
  let month = b;
  if (a > 12) {
    day = a;
    month = b;
  } else if (b > 12) {
    month = a;
    day = b;
  } else {
    day = a;
    month = b;
  }

  const d = new Date(y, month - 1, day);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function cleanHeader(h: string) {
  return String(h ?? "")
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .trim();
}

// CSV parser robusto (soporta comillas + comas + saltos de línea dentro de comillas)
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      cur.push(field);
      field = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(field);
      field = "";
      // evitamos meter filas vacías
      if (cur.some((x) => String(x ?? "").trim() !== "")) rows.push(cur);
      cur = [];
      continue;
    }

    field += ch;
  }

  // último
  cur.push(field);
  if (cur.some((x) => String(x ?? "").trim() !== "")) rows.push(cur);

  return rows;
}

async function readCsvFromPublic(path: string): Promise<Record<string, any>[]> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (status ${res.status})`);
  const text = await res.text();

  const grid = parseCSV(text);
  if (!grid.length) return [];

  const headers = grid[0].map(cleanHeader);
  const dataRows = grid.slice(1);

  // armamos objetos y limpiamos columnas vacías
  const usableIdx: number[] = [];
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i] ?? "").trim() !== "") usableIdx.push(i);
  }

  const finalHeaders = usableIdx.map((i) => headers[i]);

  const out: Record<string, any>[] = [];
  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    const obj: Record<string, any> = {};
    for (let c = 0; c < usableIdx.length; c++) {
      const idx = usableIdx[c];
      obj[finalHeaders[c]] = row[idx] ?? "";
    }
    out.push(obj);
  }
  return out;
}

function pickKey(keys: string[], candidates: string[]) {
  const upper = keys.map((k) => norm(k));
  for (let i = 0; i < candidates.length; i++) {
    const cand = norm(candidates[i]);
    const idx = upper.indexOf(cand);
    if (idx >= 0) return keys[idx];
  }
  return "";
}

function hotelToGroup(h: GlobalHotel): GlobalHotel[] {
  if (h === "JCR") return JCR_HOTELS;
  return [h];
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("es-AR").format(Math.round(n));
}
function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(n));
}
function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function kpiCardStyle(bg1: string, bg2: string) {
  return {
    padding: "1rem",
    borderRadius: 22,
    color: "white",
    background: `linear-gradient(135deg, ${bg1}, ${bg2})`,
    boxShadow: "0 18px 40px rgba(0,0,0,.12)",
  } as React.CSSProperties;
}

export default function YearComparator() {
  const [hfRaw, setHfRaw] = useState<Record<string, any>[]>([]);
  const [hfLoading, setHfLoading] = useState(true);
  const [hfErr, setHfErr] = useState<string>("");

  // filtros globales
  const [year, setYear] = useState<number>(2025);
  const [baseYear, setBaseYear] = useState<number>(2024);
  const [globalHotel, setGlobalHotel] = useState<GlobalHotel>("JCR");

  useEffect(() => {
    let alive = true;
    setHfLoading(true);
    setHfErr("");

    (async () => {
      try {
        const rows = await readCsvFromPublic(HF_PATH);
        if (!alive) return;
        setHfRaw(rows);
      } catch (e: any) {
        if (!alive) return;
        setHfErr(e?.message ?? String(e));
      } finally {
        if (alive) setHfLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const hfParsed: HFRow[] = useMemo(() => {
    const rows = hfRaw ?? [];
    if (!rows.length) return [];

    const keys = Object.keys(rows[0] ?? {});
    const kHotel = pickKey(keys, ["Empresa", "Hotel"]);
    const kHoF = pickKey(keys, ["HoF", "HOF"]);
    const kFecha = pickKey(keys, ["Fecha", "FECHA", "Date", "DATE"]);
    const kOcc = pickKey(keys, ["Occ.%", "Occ.% ", "Occ.%\t", "Occ%"]);
    const kRev = pickKey(keys, ["Room Revenue", "Room Reven", "Room Reven ", "RoomRevenue"]);
    const kAdr = pickKey(keys, ["Average Rate", "ADR", "AverageRate"]);
    const kTotal = pickKey(keys, ["Total"]);
    const kOOO = pickKey(keys, ["OOO Rooms", "OOO", "OOO Rooms "]);
    const kAdults = pickKey(keys, ["Adl. & Chl.", "Adl. &", "Adl. & Chl", "Adults"]);

    const out: HFRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] ?? {};

      const hotelRaw = norm(r[kHotel]);
      let hotel: GlobalHotel | null = null;
      if (hotelRaw.includes("MARRIOTT")) hotel = "MARRIOTT";
      else if (hotelRaw.includes("SHERATON BCR")) hotel = "SHERATON BCR";
      else if (hotelRaw.includes("SHERATON MDQ")) hotel = "SHERATON MDQ";
      else if (hotelRaw.includes("MAITEI")) hotel = "MAITEI";

      const hofRaw = norm(r[kHoF]);
      const hof: HofType | null = hofRaw.includes("FORE") ? "Forecast" : hofRaw.includes("HIST") ? "History" : null;

      const d = parseDateFlexible(r[kFecha]);
      const y = d ? d.getFullYear() : null;
      const m = d ? d.getMonth() + 1 : null;

      const occPct = parseNumberFlexible(r[kOcc]);
      const roomRevenue = parseNumberFlexible(r[kRev]);
      const adr = parseNumberFlexible(r[kAdr]);
      const totalRooms = parseNumberFlexible(r[kTotal]);
      const oooRooms = parseNumberFlexible(r[kOOO]);
      const adults = parseNumberFlexible(r[kAdults]);

      if (!hotel || !hof || !d || !y) continue;

      out.push({
        date: d,
        year: y,
        month: m,
        hof,
        hotel,
        occPct,
        adr,
        roomRevenue,
        totalRooms,
        oooRooms,
        adults,
        raw: r,
      });
    }

    // orden por fecha
    out.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
    return out;
  }, [hfRaw]);

  const availableYears = useMemo(() => {
    const ys: number[] = [];
    for (let i = 0; i < hfParsed.length; i++) {
      const y = hfParsed[i].year;
      if (y && !ys.includes(y)) ys.push(y);
    }
    ys.sort((a, b) => a - b);
    return ys;
  }, [hfParsed]);

  // si el año seleccionado no existe, lo ajustamos
  useEffect(() => {
    if (!availableYears.length) return;
    if (!availableYears.includes(year)) {
      setYear(availableYears[availableYears.length - 1]);
    }
    if (!availableYears.includes(baseYear)) {
      // baseYear por defecto: el anterior al último
      const last = availableYears[availableYears.length - 1];
      const prev = availableYears.includes(last - 1) ? last - 1 : availableYears[Math.max(0, availableYears.length - 2)];
      setBaseYear(prev);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableYears.length]);

  const hotelsForFilter = useMemo(() => {
    return ["JCR", "MARRIOTT", "SHERATON BCR", "SHERATON MDQ", "MAITEI"] as GlobalHotel[];
  }, []);

  const hfFiltered = useMemo(() => {
    const hs = hotelToGroup(globalHotel);
    return hfParsed.filter((r) => r.year === year && r.hotel && hs.includes(r.hotel));
  }, [hfParsed, globalHotel, year]);

  const hfFilteredBase = useMemo(() => {
    const hs = hotelToGroup(globalHotel);
    return hfParsed.filter((r) => r.year === baseYear && r.hotel && hs.includes(r.hotel));
  }, [hfParsed, globalHotel, baseYear]);

  // KPIs: tomamos último día disponible por HoF dentro del filtro
  const kpis = useMemo(() => {
    let lastHist: HFRow | null = null;
    let lastFore: HFRow | null = null;

    for (let i = 0; i < hfFiltered.length; i++) {
      const r = hfFiltered[i];
      if (r.hof === "History") lastHist = r;
      if (r.hof === "Forecast") lastFore = r;
    }

    const mk = (r: HFRow | null) => ({
      occ: r?.occPct ?? 0,
      adr: r?.adr ?? 0,
      rev: r?.roomRevenue ?? 0,
      total: r?.totalRooms ?? 0,
      ooo: r?.oooRooms ?? 0,
      date: r?.date ? r.date.toLocaleDateString("es-AR") : "—",
    });

    return { hist: mk(lastHist), fore: mk(lastFore) };
  }, [hfFiltered]);

  // Comparativa anual (sumas y promedios)
  const compare = useMemo(() => {
    const sum = (rows: HFRow[], hof: HofType) => {
      let rev = 0;
      let adrSum = 0;
      let adrN = 0;
      let occSum = 0;
      let occN = 0;

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.hof !== hof) continue;
        rev += r.roomRevenue || 0;
        if (r.adr > 0) {
          adrSum += r.adr;
          adrN += 1;
        }
        if (r.occPct > 0) {
          occSum += r.occPct;
          occN += 1;
        }
      }

      return {
        rev,
        adr: adrN ? adrSum / adrN : 0,
        occ: occN ? occSum / occN : 0,
      };
    };

    const curH = sum(hfFiltered, "History");
    const curF = sum(hfFiltered, "Forecast");
    const baseH = sum(hfFilteredBase, "History");
    const baseF = sum(hfFilteredBase, "Forecast");

    const deltaPct = (a: number, b: number) => (b === 0 ? null : ((a - b) / b) * 100);

    return {
      curH,
      curF,
      baseH,
      baseF,
      dRevH: deltaPct(curH.rev, baseH.rev),
      dRevF: deltaPct(curF.rev, baseF.rev),
      dAdrH: deltaPct(curH.adr, baseH.adr),
      dAdrF: deltaPct(curF.adr, baseF.adr),
      dOccH: deltaPct(curH.occ, baseH.occ),
      dOccF: deltaPct(curF.occ, baseF.occ),
    };
  }, [hfFiltered, hfFilteredBase]);

  const membershipHotelFilter = useMemo(() => {
    // Membership es SOLO JCR group. Si globalHotel=MAITEI, forzamos JCR.
    if (globalHotel === "MAITEI") return "JCR";
    return globalHotel;
  }, [globalHotel]);

  const titleHotel = useMemo(() => {
    if (globalHotel === "JCR") return "Grupo JCR";
    return globalHotel;
  }, [globalHotel]);

  return (
    <section className="section" id="comparador">
      {/* ===== Encabezado + filtros globales ===== */}
      <div style={{ display: "grid", gap: ".75rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.35rem", fontWeight: 950 }}>
          HoF Explorer — {titleHotel}
        </div>
        <div className="sectionDesc" style={{ opacity: 0.85 }}>
          Filtros globales: <b>Año</b> + <b>Hotel</b>. Afectan H&F, Comparativa y Membership. Nacionalidades usa solo Año.
        </div>

        <div
          className="card"
          style={{
            padding: "1rem",
            borderRadius: 22,
            display: "grid",
            gap: ".75rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: 900, marginBottom: ".35rem" }}>Hotel</div>
            <select
              value={globalHotel}
              onChange={(e) => setGlobalHotel(e.target.value as GlobalHotel)}
              style={{ width: "100%", padding: ".6rem .7rem", borderRadius: 12 }}
            >
              {hotelsForFilter.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontWeight: 900, marginBottom: ".35rem" }}>Año</div>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ width: "100%", padding: ".6rem .7rem", borderRadius: 12 }}
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontWeight: 900, marginBottom: ".35rem" }}>Base (comparativa)</div>
            <select
              value={baseYear}
              onChange={(e) => setBaseYear(Number(e.target.value))}
              style={{ width: "100%", padding: ".6rem .7rem", borderRadius: 12 }}
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div style={{ opacity: 0.85, fontSize: 13 }}>
            {hfLoading ? "Cargando hf_diario.csv…" : hfErr ? `Error: ${hfErr}` : `Filas H&F: ${hfFiltered.length}`}
          </div>
        </div>
      </div>

      {/* ====== 1) CARROUSELES (JCR + MAITEI) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Carrouseles (resumen rápido)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Vista tipo “cards” horizontal, útil para mobile. (JCR y MAITEI se mantienen separados)
        </div>

        <div style={{ marginTop: ".85rem", display: "grid", gap: "1rem" }}>
          <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
            <div style={{ fontWeight: 950, marginBottom: ".6rem" }}>Grupo JCR — KPIs {year}</div>
            <div
              style={{
                display: "grid",
                gap: ".75rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              }}
            >
              <div style={kpiCardStyle("#111827", "#6D28D9")}>
                <div style={{ opacity: 0.9, fontWeight: 900 }}>History</div>
                <div style={{ fontSize: 28, fontWeight: 950, marginTop: ".25rem" }}>{fmtPct(kpis.hist.occ)}</div>
                <div style={{ opacity: 0.9 }}>Occupancy</div>
                <div style={{ marginTop: ".65rem", opacity: 0.95 }}>
                  Rev: <b>{fmtMoney(kpis.hist.rev)}</b> · ADR: <b>{fmtMoney(kpis.hist.adr)}</b>
                </div>
                <div style={{ marginTop: ".35rem", opacity: 0.85, fontSize: 12 }}>Último: {kpis.hist.date}</div>
              </div>

              <div style={kpiCardStyle("#0F172A", "#22C55E")}>
                <div style={{ opacity: 0.9, fontWeight: 900 }}>Forecast</div>
                <div style={{ fontSize: 28, fontWeight: 950, marginTop: ".25rem" }}>{fmtPct(kpis.fore.occ)}</div>
                <div style={{ opacity: 0.9 }}>Occupancy</div>
                <div style={{ marginTop: ".65rem", opacity: 0.95 }}>
                  Rev: <b>{fmtMoney(kpis.fore.rev)}</b> · ADR: <b>{fmtMoney(kpis.fore.adr)}</b>
                </div>
                <div style={{ marginTop: ".35rem", opacity: 0.85, fontSize: 12 }}>Último: {kpis.fore.date}</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
            <div style={{ fontWeight: 950, marginBottom: ".6rem" }}>MAITEI — vista separada</div>
            <div style={{ opacity: 0.85, fontSize: 13 }}>
              Si seleccionás Hotel = <b>MAITEI</b>, toda la sección H&F y comparativa muestra MAITEI. Membership sigue
              siendo JCR (por definición del negocio).
            </div>
          </div>
        </div>
      </div>

      {/* ====== 2) H&F (DETALLE + KPIs) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          History &amp; Forecast (detalle)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Tabla del año seleccionado filtrada por hotel global.
        </div>

        <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 22, overflowX: "auto" }}>
          {hfErr ? (
            <div>Error: {hfErr}</div>
          ) : hfLoading ? (
            <div>Cargando…</div>
          ) : !hfFiltered.length ? (
            <div>Sin filas para {year} / {globalHotel}. Revisá que hf_diario.csv tenga “Fecha / HoF / Empresa”.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.85 }}>
                  <th style={{ padding: ".45rem .4rem" }}>Fecha</th>
                  <th style={{ padding: ".45rem .4rem" }}>HoF</th>
                  <th style={{ padding: ".45rem .4rem" }}>Hotel</th>
                  <th style={{ padding: ".45rem .4rem" }}>Occ.%</th>
                  <th style={{ padding: ".45rem .4rem" }}>ADR</th>
                  <th style={{ padding: ".45rem .4rem" }}>Room Revenue</th>
                  <th style={{ padding: ".45rem .4rem" }}>Total</th>
                  <th style={{ padding: ".45rem .4rem" }}>OOO</th>
                </tr>
              </thead>
              <tbody>
                {hfFiltered.slice(Math.max(0, hfFiltered.length - 30)).map((r, idx) => (
                  <tr key={idx} style={{ borderTop: "1px solid rgba(0,0,0,.07)" }}>
                    <td style={{ padding: ".45rem .4rem", fontWeight: 800 }}>
                      {r.date ? r.date.toLocaleDateString("es-AR") : "—"}
                    </td>
                    <td style={{ padding: ".45rem .4rem" }}>{r.hof}</td>
                    <td style={{ padding: ".45rem .4rem" }}>{r.hotel}</td>
                    <td style={{ padding: ".45rem .4rem", fontWeight: 900 }}>{fmtPct(r.occPct)}</td>
                    <td style={{ padding: ".45rem .4rem" }}>{fmtInt(r.adr)}</td>
                    <td style={{ padding: ".45rem .4rem" }}>{fmtMoney(r.roomRevenue)}</td>
                    <td style={{ padding: ".45rem .4rem" }}>{fmtInt(r.totalRooms)}</td>
                    <td style={{ padding: ".45rem .4rem" }}>{fmtInt(r.oooRooms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ====== 3) COMPARATIVA (AÑO vs BASE) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Comparativa {year} vs {baseYear}
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Totales anuales (sumas y promedios) para History y Forecast.
        </div>

        <div
          style={{
            marginTop: ".85rem",
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
            <div style={{ fontWeight: 950 }}>History</div>
            <div style={{ marginTop: ".5rem" }}>
              Rev {year}: <b>{fmtMoney(compare.curH.rev)}</b>{" "}
              <span style={{ opacity: 0.8 }}>
                ({compare.dRevH === null ? "—" : `${compare.dRevH.toFixed(1)}%`})
              </span>
            </div>
            <div style={{ marginTop: ".25rem" }}>
              ADR {year}: <b>{fmtInt(compare.curH.adr)}</b>{" "}
              <span style={{ opacity: 0.8 }}>
                ({compare.dAdrH === null ? "—" : `${compare.dAdrH.toFixed(1)}%`})
              </span>
            </div>
            <div style={{ marginTop: ".25rem" }}>
              Occ {year}: <b>{fmtPct(compare.curH.occ)}</b>{" "}
              <span style={{ opacity: 0.8 }}>
                ({compare.dOccH === null ? "—" : `${compare.dOccH.toFixed(1)}%`})
              </span>
            </div>

            <div style={{ marginTop: ".75rem", opacity: 0.85, fontSize: 13 }}>
              Base {baseYear}: Rev <b>{fmtMoney(compare.baseH.rev)}</b> · ADR <b>{fmtInt(compare.baseH.adr)}</b> · Occ{" "}
              <b>{fmtPct(compare.baseH.occ)}</b>
            </div>
          </div>

          <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
            <div style={{ fontWeight: 950 }}>Forecast</div>
            <div style={{ marginTop: ".5rem" }}>
              Rev {year}: <b>{fmtMoney(compare.curF.rev)}</b>{" "}
              <span style={{ opacity: 0.8 }}>
                ({compare.dRevF === null ? "—" : `${compare.dRevF.toFixed(1)}%`})
              </span>
            </div>
            <div style={{ marginTop: ".25rem" }}>
              ADR {year}: <b>{fmtInt(compare.curF.adr)}</b>{" "}
              <span style={{ opacity: 0.8 }}>
                ({compare.dAdrF === null ? "—" : `${compare.dAdrF.toFixed(1)}%`})
              </span>
            </div>
            <div style={{ marginTop: ".25rem" }}>
              Occ {year}: <b>{fmtPct(compare.curF.occ)}</b>{" "}
              <span style={{ opacity: 0.8 }}>
                ({compare.dOccF === null ? "—" : `${compare.dOccF.toFixed(1)}%`})
              </span>
            </div>

            <div style={{ marginTop: ".75rem", opacity: 0.85, fontSize: 13 }}>
              Base {baseYear}: Rev <b>{fmtMoney(compare.baseF.rev)}</b> · ADR <b>{fmtInt(compare.baseF.adr)}</b> · Occ{" "}
              <b>{fmtPct(compare.baseF.occ)}</b>
            </div>
          </div>
        </div>
      </div>

      {/* ====== 4) MEMBERSHIP ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Membership (JCR)
        </div>
        <div  className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Cantidades + gráficos. Usa filtro global de año + hotel (JCR / Marriott / Sheratons). Si globalHotel=MAITEI, se usa JCR.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <MembershipSummary
            year={year}
            baseYear={baseYear}
            allowedHotels={JCR_HOTELS as unknown as string[]}
            filePath={MEMBERSHIP_PATH}
            title="Membership (JCR)"
            hotelFilter={membershipHotelFilter as any}
            compactCharts={true}
          />
        </div>
      </div>

      {/* ====== 5) NACIONALIDADES ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Nacionalidades
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Ranking por país + distribución por continente. (Archivo Marriott). Usa filtro global de año.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <CountryRanking year={year} filePath={NACIONALIDADES_PATH} hotelFilter={""} />
        </div>
      </div>

      {/* ===== Responsive tweaks ===== */}
      <style jsx>{`
        @media (max-width: 900px) {
          .sectionTitle {
            font-size: 1.2rem !important;
          }
          table {
            font-size: 12px !important;
          }
        }
      `}</style>
    </section>
  );
}
