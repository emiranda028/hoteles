// app/components/YearComparator.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  readCsvFromPublic,
  toNumberSmart,
  toPercent01,
  safeDiv,
  formatMoney,
  formatPct01,
  formatInt,
  CsvRow,
} from "./csvClient";

// Estos dos existen en tu repo (ya venían andando en algún momento).
// Importante: NO les pasamos props que no existan (así no rompe types).
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

/* =========================
   Config
========================= */

type JcrHotel = "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ";
type MaiteiHotel = "MAITEI";

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

const JCR_HOTELS: JcrHotel[] = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];

const MONTHS = [
  { n: 1, label: "Ene" },
  { n: 2, label: "Feb" },
  { n: 3, label: "Mar" },
  { n: 4, label: "Abr" },
  { n: 5, label: "May" },
  { n: 6, label: "Jun" },
  { n: 7, label: "Jul" },
  { n: 8, label: "Ago" },
  { n: 9, label: "Sep" },
  { n: 10, label: "Oct" },
  { n: 11, label: "Nov" },
  { n: 12, label: "Dic" },
] as const;

/* =========================
   Helpers (keys)
========================= */

function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[."']/g, "")
    .replace(/á/g, "a")
    .replace(/é/g, "e")
    .replace(/í/g, "i")
    .replace(/ó/g, "o")
    .replace(/ú/g, "u")
    .replace(/ñ/g, "n");
}

function pickKey(keys: string[], candidates: string[]): string | null {
  const map = new Map<string, string>();
  keys.forEach((k) => map.set(normKey(k), k));

  for (const c of candidates) {
    const hit = map.get(normKey(c));
    if (hit) return hit;
  }

  // fallback: contains
  const nk = keys.map((k) => ({ k, nk: normKey(k) }));
  for (const c of candidates) {
    const nc = normKey(c);
    const found = nk.find((x) => x.nk.includes(nc));
    if (found) return found.k;
  }
  return null;
}

function parseDateSmart(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  const s = String(v).trim();
  if (!s) return null;

  // formatos frecuentes:
  // - 1/6/2022
  // - 01-06-22 Wed
  // - 2022-06-01
  // - 01/06/2022
  const iso = Date.parse(s);
  if (!isNaN(iso)) return new Date(iso);

  // dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    let yy = Number(m1[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function cardStyle(bg = "#111827"): React.CSSProperties {
  return {
    background: bg,
    borderRadius: 18,
    padding: "0.9rem 1rem",
    boxShadow: "0 10px 24px rgba(0,0,0,.18)",
    border: "1px solid rgba(255,255,255,.08)",
  };
}

/* =========================
   Types normalized
========================= */

type HfRow = {
  date: Date | null;
  year: number | null;
  month: number | null;
  hof: "History" | "Forecast" | string;
  empresa: string;

  occPct01: number; // 0..1

  roomRevenue: number;
  adr: number; // Average Rate

  // opcionales (si existen)
  totalRooms: number;
  arrRooms: number;
  compRooms: number;
  houseUse: number;
  adultsChl: number;
};

type MetricPack = {
  days: number;
  occAvg01: number; // promedio (ponderado si hay totalRooms)
  adrAvg: number; // promedio (ponderado por rooms sold si tuviéramos; acá simple promedio)
  roomRevSum: number;
  revParApprox: number; // adrAvg * occAvg01 (aprox)
  personsAvg: number;
};

function emptyPack(): MetricPack {
  return {
    days: 0,
    occAvg01: 0,
    adrAvg: 0,
    roomRevSum: 0,
    revParApprox: 0,
    personsAvg: 0,
  };
}

/* =========================
   Component
========================= */

export default function YearComparator() {
  // ===== Global JCR filters =====
  const [jcrYear, setJcrYear] = useState<number>(2024);
  const [jcrBaseYear, setJcrBaseYear] = useState<number>(2023);
  const [jcrHotel, setJcrHotel] = useState<JcrHotel>("MARRIOTT");
  const [jcrMonth, setJcrMonth] = useState<number>(new Date().getMonth() + 1);

  // ===== MAITEI block filters =====
  const [maiteiYear, setMaiteiYear] = useState<number>(2024);
  const [maiteiBaseYear, setMaiteiBaseYear] = useState<number>(2023);
  const [maiteiMonth, setMaiteiMonth] = useState<number>(new Date().getMonth() + 1);

  // ===== CSV data =====
  const [raw, setRaw] = useState<CsvRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // ===== key detection =====
  const [keyInfo, setKeyInfo] = useState<{ keys: string[]; map: Record<string, string | null> } | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readCsvFromPublic(HF_PATH)
      .then((rows) => {
        if (!alive) return;
        setRaw(rows || []);
        setLoading(false);

        const keys = rows?.[0] ? Object.keys(rows[0]) : [];
        const map = {
          fecha: pickKey(keys, ["Fecha", "Date"]),
          hof: pickKey(keys, ["HoF", "Hof", "HOF"]),
          empresa: pickKey(keys, ["Empresa", "Hotel"]),
          occPct: pickKey(keys, ["Occ.%", "Occ%", "Occupancy", "OCC%"]),
          roomRevenue: pickKey(keys, ["Room Revenue", "RoomRevenue", "RoomRevenueUSD"]),
          adr: pickKey(keys, ["Average Rate", "ADR", "AverageRate"]),
          totalRooms: pickKey(keys, ['"Total\nOcc."', "Total Occ.", "TotalOcc", "Total Rooms", "TotalRooms"]),
          arrRooms: pickKey(keys, ['"Arr.\nRooms"', "Arr. Rooms", "ArrRooms"]),
          compRooms: pickKey(keys, ['"Comp.\nRooms"', "Comp. Rooms", "CompRooms"]),
          houseUse: pickKey(keys, ['"House\nUse"', "House Use", "HouseUse"]),
          adultsChl: pickKey(keys, ['"Adl. &\nChl."', "Adl. & Chl.", "Adl.&Chl.", "Adults", "Adl"]),
        };
        setKeyInfo({ keys, map });
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message || "Error leyendo CSV");
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const normalized: HfRow[] = useMemo(() => {
    if (!raw || !keyInfo) return [];
    const k = keyInfo.map;

    return raw.map((r) => {
      const d = parseDateSmart(k.fecha ? r[k.fecha] : null);
      const year = d ? d.getFullYear() : null;
      const month = d ? d.getMonth() + 1 : null;

      const hof = String(k.hof ? r[k.hof] : "").trim() || "";
      const empresa = String(k.empresa ? r[k.empresa] : "").trim() || "";

      const occPctRaw = toNumberSmart(k.occPct ? r[k.occPct] : 0);
      const occPct01 = clamp01(toPercent01(occPctRaw));

      const roomRevenue = toNumberSmart(k.roomRevenue ? r[k.roomRevenue] : 0);
      const adr = toNumberSmart(k.adr ? r[k.adr] : 0);

      const totalRooms = toNumberSmart(k.totalRooms ? r[k.totalRooms] : 0);
      const arrRooms = toNumberSmart(k.arrRooms ? r[k.arrRooms] : 0);
      const compRooms = toNumberSmart(k.compRooms ? r[k.compRooms] : 0);
      const houseUse = toNumberSmart(k.houseUse ? r[k.houseUse] : 0);
      const adultsChl = toNumberSmart(k.adultsChl ? r[k.adultsChl] : 0);

      return {
        date: d,
        year,
        month,
        hof,
        empresa,
        occPct01,
        roomRevenue,
        adr,
        totalRooms,
        arrRooms,
        compRooms,
        houseUse,
        adultsChl,
      };
    });
  }, [raw, keyInfo]);

  const yearsAvailable = useMemo(() => {
    const s = new Set<number>();
    for (const r of normalized) if (r.year) s.add(r.year);
    return Array.from(s).sort((a, b) => b - a);
  }, [normalized]);

  // ====== Filtering helpers ======
  const isJcrEmpresa = (empresa: string) => empresa === "MARRIOTT" || empresa === "SHERATON BCR" || empresa === "SHERATON MDQ";
  const isMaiteiEmpresa = (empresa: string) => empresa === "MAITEI";

  function subset(opts: {
    year: number;
    empresa: string;
    month?: number;
    hof?: "History" | "Forecast";
  }): HfRow[] {
    const { year, empresa, month, hof } = opts;
    return normalized.filter((r) => {
      if (!r.year || r.year !== year) return false;
      if (r.empresa !== empresa) return false;
      if (typeof month === "number" && r.month !== month) return false;
      if (hof && String(r.hof).toLowerCase() !== hof.toLowerCase()) return false;
      return true;
    });
  }

  function calcPack(rows: HfRow[]): MetricPack {
    if (!rows.length) return emptyPack();

    // promedio ponderado de occ: si totalRooms existe (>0), pondero por totalRooms; si no, promedio simple.
    let w = 0;
    let occW = 0;

    let adrSum = 0;
    let adrN = 0;

    let revSum = 0;

    let personsSum = 0;
    let personsN = 0;

    for (const r of rows) {
      const weight = r.totalRooms > 0 ? r.totalRooms : 1;
      w += weight;
      occW += r.occPct01 * weight;

      if (r.adr > 0) {
        adrSum += r.adr;
        adrN += 1;
      }
      revSum += r.roomRevenue;

      if (r.adultsChl > 0) {
        personsSum += r.adultsChl;
        personsN += 1;
      }
    }

    const occAvg01 = clamp01(safeDiv(occW, w));
    const adrAvg = safeDiv(adrSum, adrN);
    const revParApprox = adrAvg * occAvg01;
    const personsAvg = safeDiv(personsSum, personsN);

    return {
      days: rows.length,
      occAvg01,
      adrAvg,
      roomRevSum: revSum,
      revParApprox,
      personsAvg,
    };
  }

  function monthPack(empresa: string, year: number, hof: "History" | "Forecast", month: number): MetricPack {
    return calcPack(subset({ empresa, year, hof, month }));
  }

  // ====== JCR packs ======
  const jcrThisHist = useMemo(() => calcPack(subset({ empresa: jcrHotel, year: jcrYear, hof: "History" })), [normalized, jcrHotel, jcrYear]);
  const jcrBaseHist = useMemo(() => calcPack(subset({ empresa: jcrHotel, year: jcrBaseYear, hof: "History" })), [normalized, jcrHotel, jcrBaseYear]);

  const jcrThisFcst = useMemo(() => calcPack(subset({ empresa: jcrHotel, year: jcrYear, hof: "Forecast" })), [normalized, jcrHotel, jcrYear]);
  const jcrBaseFcst = useMemo(() => calcPack(subset({ empresa: jcrHotel, year: jcrBaseYear, hof: "Forecast" })), [normalized, jcrHotel, jcrBaseYear]);

  const jcrMonthRows = useMemo(() => subset({ empresa: jcrHotel, year: jcrYear, month: jcrMonth }), [normalized, jcrHotel, jcrYear, jcrMonth]);
  const jcrMonthPackHist = useMemo(() => monthPack(jcrHotel, jcrYear, "History", jcrMonth), [normalized, jcrHotel, jcrYear, jcrMonth]);
  const jcrMonthPackFcst = useMemo(() => monthPack(jcrHotel, jcrYear, "Forecast", jcrMonth), [normalized, jcrHotel, jcrYear, jcrMonth]);

  // ====== MAITEI packs ======
  const maiteiThisHist = useMemo(() => calcPack(subset({ empresa: "MAITEI", year: maiteiYear, hof: "History" })), [normalized, maiteiYear]);
  const maiteiBaseHist = useMemo(() => calcPack(subset({ empresa: "MAITEI", year: maiteiBaseYear, hof: "History" })), [normalized, maiteiBaseYear]);

  const maiteiThisFcst = useMemo(() => calcPack(subset({ empresa: "MAITEI", year: maiteiYear, hof: "Forecast" })), [normalized, maiteiYear]);
  const maiteiBaseFcst = useMemo(() => calcPack(subset({ empresa: "MAITEI", year: maiteiBaseYear, hof: "Forecast" })), [normalized, maiteiBaseYear]);

  const maiteiMonthRows = useMemo(() => subset({ empresa: "MAITEI", year: maiteiYear, month: maiteiMonth }), [normalized, maiteiYear, maiteiMonth]);
  const maiteiMonthPackHist = useMemo(() => monthPack("MAITEI", maiteiYear, "History", maiteiMonth), [normalized, maiteiYear, maiteiMonth]);
  const maiteiMonthPackFcst = useMemo(() => monthPack("MAITEI", maiteiYear, "Forecast", maiteiMonth), [normalized, maiteiYear, maiteiMonth]);

  // ====== Monthly comparison table ======
  function buildCompare(empresa: string, year: number, baseYear: number, hof: "History" | "Forecast") {
    return MONTHS.map((m) => {
      const a = monthPack(empresa, year, hof, m.n);
      const b = monthPack(empresa, baseYear, hof, m.n);
      return { month: m, a, b };
    });
  }

  const jcrCompareHist = useMemo(() => buildCompare(jcrHotel, jcrYear, jcrBaseYear, "History"), [normalized, jcrHotel, jcrYear, jcrBaseYear]);
  const jcrCompareFcst = useMemo(() => buildCompare(jcrHotel, jcrYear, jcrBaseYear, "Forecast"), [normalized, jcrHotel, jcrYear, jcrBaseYear]);

  const maiteiCompareHist = useMemo(() => buildCompare("MAITEI", maiteiYear, maiteiBaseYear, "History"), [normalized, maiteiYear, maiteiBaseYear]);
  const maiteiCompareFcst = useMemo(() => buildCompare("MAITEI", maiteiYear, maiteiBaseYear, "Forecast"), [normalized, maiteiYear, maiteiBaseYear]);

  // ====== Rankings (by day) ======
  function topDays(rows: HfRow[], mode: "revenue" | "occ", topN = 10) {
    const arr = rows
      .filter((r) => r.date)
      .slice()
      .sort((x, y) => {
        if (mode === "revenue") return (y.roomRevenue || 0) - (x.roomRevenue || 0);
        return (y.occPct01 || 0) - (x.occPct01 || 0);
      })
      .slice(0, topN);
    return arr;
  }

  const jcrTopRev = useMemo(() => topDays(jcrMonthRows, "revenue", 10), [jcrMonthRows]);
  const jcrTopOcc = useMemo(() => topDays(jcrMonthRows, "occ", 10), [jcrMonthRows]);

  const maiteiTopRev = useMemo(() => topDays(maiteiMonthRows, "revenue", 10), [maiteiMonthRows]);
  const maiteiTopOcc = useMemo(() => topDays(maiteiMonthRows, "occ", 10), [maiteiMonthRows]);

  // ====== UI small components ======
  const Pill = ({
    active,
    color,
    children,
    onClick,
  }: {
    active?: boolean;
    color: "red" | "blue" | "gray";
    children: React.ReactNode;
    onClick?: () => void;
  }) => {
    const palette =
      color === "red"
        ? {
            bg: active ? "#b91c1c" : "rgba(185,28,28,.15)",
            border: active ? "rgba(255,255,255,.25)" : "rgba(185,28,28,.35)",
            text: "#fff",
          }
        : color === "blue"
        ? {
            bg: active ? "#0284c7" : "rgba(2,132,199,.12)",
            border: active ? "rgba(255,255,255,.25)" : "rgba(2,132,199,.35)",
            text: "#fff",
          }
        : {
            bg: active ? "#334155" : "rgba(148,163,184,.12)",
            border: active ? "rgba(255,255,255,.22)" : "rgba(148,163,184,.35)",
            text: "#e5e7eb",
          };

    return (
      <button
        onClick={onClick}
        style={{
          cursor: onClick ? "pointer" : "default",
          padding: ".55rem .75rem",
          borderRadius: 999,
          border: `1px solid ${palette.border}`,
          background: palette.bg,
          color: palette.text,
          fontWeight: 800,
          letterSpacing: ".2px",
          fontSize: ".92rem",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </button>
    );
  };

  const MetricCard = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div style={cardStyle("#0b1220")}>
      <div style={{ fontSize: ".9rem", opacity: 0.85, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: ".25rem", fontSize: "1.35rem", fontWeight: 950 }}>{value}</div>
      {sub ? <div style={{ marginTop: ".25rem", fontSize: ".9rem", opacity: 0.8 }}>{sub}</div> : null}
    </div>
  );

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: "1.25rem", fontWeight: 950, letterSpacing: ".2px" }}>{children}</div>
  );

  const SectionDesc = ({ children }: { children: React.ReactNode }) => (
    <div style={{ marginTop: ".35rem", opacity: 0.85 }}>{children}</div>
  );

  const Table = ({
    head,
    rows,
  }: {
    head: string[];
    rows: (string | number | React.ReactNode)[][];
  }) => (
    <div style={{ overflowX: "auto", borderRadius: 16, border: "1px solid rgba(255,255,255,.08)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: ".65rem .7rem",
                  fontSize: ".9rem",
                  background: "rgba(15,23,42,.85)",
                  borderBottom: "1px solid rgba(255,255,255,.08)",
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,.06)" }}>
              {r.map((c, j) => (
                <td key={j} style={{ padding: ".6rem .7rem", fontSize: ".92rem" }}>
                  {c as any}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const SummaryGrid = ({ pThis, pBase }: { pThis: MetricPack; pBase: MetricPack }) => {
    const deltaPct = (a: number, b: number) => {
      if (b === 0) return "—";
      return ((safeDiv(a - b, b)) * 100).toFixed(1) + "%";
    };

    return (
      <div style={{ display: "grid", gap: ".85rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: ".85rem" }}>
          <MetricCard
            label="Ocupación (promedio)"
            value={formatPct01(pThis.occAvg01)}
            sub={`vs base: ${deltaPct(pThis.occAvg01, pBase.occAvg01)}`}
          />
          <MetricCard
            label="ADR (promedio)"
            value={formatMoney(pThis.adrAvg)}
            sub={`vs base: ${deltaPct(pThis.adrAvg, pBase.adrAvg)}`}
          />
          <MetricCard
            label="Room Revenue (suma)"
            value={formatMoney(pThis.roomRevSum)}
            sub={`vs base: ${deltaPct(pThis.roomRevSum, pBase.roomRevSum)}`}
          />
          <MetricCard
            label="RevPAR (aprox)"
            value={formatMoney(pThis.revParApprox)}
            sub={`vs base: ${deltaPct(pThis.revParApprox, pBase.revParApprox)}`}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: ".85rem" }}>
          <MetricCard label="Días en dataset" value={formatInt(pThis.days)} sub="Cantidad de filas filtradas" />
          <MetricCard label="Personas (prom.)" value={formatInt(pThis.personsAvg)} sub="Adl. & Chl. promedio" />
          <MetricCard
            label="Chequeo"
            value={pThis.occAvg01 <= 1 ? "OK" : "REVISAR"}
            sub="Ocupación nunca debe superar 100%"
          />
        </div>
      </div>
    );
  };

  const CompareTable = ({
    data,
    year,
    baseYear,
    label,
  }: {
    data: { month: (typeof MONTHS)[number]; a: MetricPack; b: MetricPack }[];
    year: number;
    baseYear: number;
    label: string;
  }) => {
    const rows = data.map((x) => {
      const dOcc = (x.a.occAvg01 - x.b.occAvg01) * 100;
      const dAdr = x.a.adrAvg - x.b.adrAvg;
      const dRev = x.a.roomRevSum - x.b.roomRevSum;

      return [
        x.month.label,
        formatPct01(x.a.occAvg01),
        formatPct01(x.b.occAvg01),
        `${dOcc >= 0 ? "+" : ""}${dOcc.toFixed(1)} pp`,
        formatMoney(x.a.adrAvg),
        formatMoney(x.b.adrAvg),
        `${dAdr >= 0 ? "+" : ""}${formatMoney(dAdr)}`,
        formatMoney(x.a.roomRevSum),
        formatMoney(x.b.roomRevSum),
        `${dRev >= 0 ? "+" : ""}${formatMoney(dRev)}`,
      ];
    });

    return (
      <div style={{ display: "grid", gap: ".65rem" }}>
        <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>{label}</div>
        <Table
          head={[
            "Mes",
            `Occ ${year}`,
            `Occ ${baseYear}`,
            "Δ Occ",
            `ADR ${year}`,
            `ADR ${baseYear}`,
            "Δ ADR",
            `Rev ${year}`,
            `Rev ${baseYear}`,
            "Δ Rev",
          ]}
          rows={rows}
        />
      </div>
    );
  };

  const RankingBlock = ({ title, rows, mode }: { title: string; rows: HfRow[]; mode: "revenue" | "occ" }) => {
    const body = rows.map((r) => {
      const d = r.date ? r.date.toLocaleDateString("es-AR") : "—";
      return [
        d,
        formatPct01(r.occPct01),
        formatMoney(r.roomRevenue),
        formatMoney(r.adr),
        mode === "revenue" ? "Top Rev" : "Top Occ",
      ];
    });

    return (
      <div style={{ display: "grid", gap: ".6rem" }}>
        <div style={{ fontWeight: 950 }}>{title}</div>
        <Table head={["Fecha", "Occ", "Room Rev", "ADR", "Tipo"]} rows={body} />
      </div>
    );
  };

  const MonthDetail = ({ rows }: { rows: HfRow[] }) => {
    const sorted = rows.slice().sort((a, b) => {
      const ta = a.date ? a.date.getTime() : 0;
      const tb = b.date ? b.date.getTime() : 0;
      return ta - tb;
    });

    const body = sorted.map((r) => [
      r.date ? r.date.toLocaleDateString("es-AR") : "—",
      String(r.hof || ""),
      formatPct01(r.occPct01),
      formatMoney(r.roomRevenue),
      formatMoney(r.adr),
      formatInt(r.totalRooms),
      formatInt(r.arrRooms),
      formatInt(r.compRooms),
      formatInt(r.houseUse),
      formatInt(r.adultsChl),
    ]);

    return (
      <div style={{ display: "grid", gap: ".6rem" }}>
        <div style={{ fontWeight: 950 }}>Detalle día a día</div>
        <Table
          head={["Fecha", "HoF", "Occ", "Room Rev", "ADR", "TotalRooms", "Arr", "Comp", "HouseUse", "Persons"]}
          rows={body}
        />
      </div>
    );
  };

  // ====== Rendering ======
  if (loading) {
    return (
      <div style={cardStyle("#0b1220")}>
        <div style={{ fontWeight: 950 }}>Cargando…</div>
        <div style={{ marginTop: ".35rem", opacity: 0.85 }}>Leyendo {HF_PATH}</div>
      </div>
    );
  }

  if (err) {
    return (
      <div style={cardStyle("#2b0b0b")}>
        <div style={{ fontWeight: 950 }}>Error</div>
        <div style={{ marginTop: ".35rem", opacity: 0.9 }}>{err}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1.35rem" }}>
      {/* =======================
          BLOQUE JCR (grupo)
      ======================= */}
      <section className="section" id="jcr" style={{ display: "grid", gap: "1rem" }}>
        <div style={cardStyle("#0b1220")}>
          <div style={{ display: "grid", gap: ".5rem" }}>
            <div style={{ fontSize: "1.4rem", fontWeight: 950 }}>Hoteles — H&F / KPIs / Comparativa</div>
            <div style={{ opacity: 0.85 }}>
              Bloque <b>JCR</b> (Marriott + Sheratons). Filtros globales pegajosos hasta Nacionalidades.
            </div>
          </div>
        </div>

        {/* Sticky JCR filters */}
        <div
          style={{
            position: "sticky",
            top: 10,
            zIndex: 20,
            backdropFilter: "blur(8px)",
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,.10)",
            background: "rgba(15, 23, 42, .75)",
            padding: ".85rem",
            boxShadow: "0 12px 26px rgba(0,0,0,.22)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".55rem", alignItems: "center" }}>
            <Pill color="gray">JCR</Pill>

            <div style={{ display: "flex", gap: ".45rem", flexWrap: "wrap" }}>
              {JCR_HOTELS.map((h) => (
                <Pill key={h} color="red" active={jcrHotel === h} onClick={() => setJcrHotel(h)}>
                  {h}
                </Pill>
              ))}
            </div>

            <div style={{ width: 1, height: 26, background: "rgba(255,255,255,.15)", margin: "0 .35rem" }} />

            <label style={{ display: "flex", alignItems: "center", gap: ".5rem", fontWeight: 900 }}>
              Año
              <select
                value={jcrYear}
                onChange={(e) => setJcrYear(Number(e.target.value))}
                style={{
                  borderRadius: 12,
                  padding: ".45rem .6rem",
                  border: "1px solid rgba(255,255,255,.18)",
                  background: "rgba(185,28,28,.16)",
                  color: "white",
                  fontWeight: 900,
                }}
              >
                {yearsAvailable.map((y) => (
                  <option key={y} value={y} style={{ color: "#111" }}>
                    {y}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: ".5rem", fontWeight: 900 }}>
              vs
              <select
                value={jcrBaseYear}
                onChange={(e) => setJcrBaseYear(Number(e.target.value))}
                style={{
                  borderRadius: 12,
                  padding: ".45rem .6rem",
                  border: "1px solid rgba(255,255,255,.18)",
                  background: "rgba(185,28,28,.10)",
                  color: "white",
                  fontWeight: 900,
                }}
              >
                {yearsAvailable.map((y) => (
                  <option key={y} value={y} style={{ color: "#111" }}>
                    {y}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: ".5rem", fontWeight: 900 }}>
              Mes
              <select
                value={jcrMonth}
                onChange={(e) => setJcrMonth(Number(e.target.value))}
                style={{
                  borderRadius: 12,
                  padding: ".45rem .6rem",
                  border: "1px solid rgba(255,255,255,.18)",
                  background: "rgba(185,28,28,.10)",
                  color: "white",
                  fontWeight: 900,
                }}
              >
                {MONTHS.map((m) => (
                  <option key={m.n} value={m.n} style={{ color: "#111" }}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ marginTop: ".55rem", opacity: 0.85, fontSize: ".95rem" }}>
            Dataset H&F: <b>{HF_PATH}</b> · Hotel filtrado por columna <b>Empresa</b> · HoF por columna <b>HoF</b>
          </div>

          {keyInfo ? (
            <div style={{ marginTop: ".45rem", opacity: 0.7, fontSize: ".85rem" }}>
              Keys detectadas:{" "}
              {Object.entries(keyInfo.map)
                .map(([k, v]) => `${k}=${v ?? "—"}`)
                .join(" · ")}
            </div>
          ) : null}
        </div>

        {/* ===== H&F KPIs (History) ===== */}
        <div style={cardStyle("#0b1220")}>
          <SectionTitle>KPIs — History</SectionTitle>
          <SectionDesc>
            Promedios y sumas correctas (no suma porcentajes). Filtro: <b>{jcrHotel}</b> · <b>{jcrYear}</b> vs{" "}
            <b>{jcrBaseYear}</b>
          </SectionDesc>

          <div style={{ marginTop: ".85rem" }}>
            <SummaryGrid pThis={jcrThisHist} pBase={jcrBaseHist} />
          </div>
        </div>

        {/* ===== H&F KPIs (Forecast) ===== */}
        <div style={cardStyle("#0b1220")}>
          <SectionTitle>KPIs — Forecast</SectionTitle>
          <SectionDesc>
            Misma lógica de cálculo para Forecast. Filtro: <b>{jcrHotel}</b> · <b>{jcrYear}</b> vs{" "}
            <b>{jcrBaseYear}</b>
          </SectionDesc>

          <div style={{ marginTop: ".85rem" }}>
            <SummaryGrid pThis={jcrThisFcst} pBase={jcrBaseFcst} />
          </div>
        </div>

        {/* ===== Comparativa ===== */}
        <div style={cardStyle("#0b1220")}>
          <SectionTitle>Comparativa mensual</SectionTitle>
          <SectionDesc>Tabla por mes para History y Forecast (Ocupación, ADR y Room Revenue).</SectionDesc>

          <div style={{ marginTop: ".95rem", display: "grid", gap: "1.25rem" }}>
            <CompareTable
              data={jcrCompareHist}
              year={jcrYear}
              baseYear={jcrBaseYear}
              label={`History — ${jcrHotel}`}
            />
            <CompareTable
              data={jcrCompareFcst}
              year={jcrYear}
              baseYear={jcrBaseYear}
              label={`Forecast — ${jcrHotel}`}
            />
          </div>
        </div>

        {/* ===== Ranking por mes (Top días) ===== */}
        <div style={cardStyle("#0b1220")}>
          <SectionTitle>Ranking por mes</SectionTitle>
          <SectionDesc>
            Top 10 días del mes <b>{MONTHS.find((x) => x.n === jcrMonth)?.label}</b> · {jcrYear} · {jcrHotel}
          </SectionDesc>

          <div style={{ marginTop: ".95rem", display: "grid", gap: "1.15rem", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <RankingBlock title="Top 10 por Room Revenue" rows={jcrTopRev} mode="revenue" />
            <RankingBlock title="Top 10 por Ocupación" rows={jcrTopOcc} mode="occ" />
          </div>
        </div>

        {/* ===== Detalle mensual ===== */}
        <div style={cardStyle("#0b1220")}>
          <SectionTitle>Mes detallado</SectionTitle>
          <SectionDesc>
            Filas del mes seleccionado (History + Forecast). Si acá no hay nada, el problema es el filtro Empresa/Año/Mes.
          </SectionDesc>

          <div style={{ marginTop: ".85rem", display: "grid", gap: "1.1rem" }}>
            <div style={{ display: "grid", gap: ".5rem", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <div style={cardStyle("#07101f")}>
                <div style={{ fontWeight: 950 }}>Pack History (mes)</div>
                <div style={{ marginTop: ".35rem", opacity: 0.85 }}>
                  Occ: <b>{formatPct01(jcrMonthPackHist.occAvg01)}</b> · ADR: <b>{formatMoney(jcrMonthPackHist.adrAvg)}</b> · Rev:{" "}
                  <b>{formatMoney(jcrMonthPackHist.roomRevSum)}</b>
                </div>
              </div>
              <div style={cardStyle("#07101f")}>
                <div style={{ fontWeight: 950 }}>Pack Forecast (mes)</div>
                <div style={{ marginTop: ".35rem", opacity: 0.85 }}>
                  Occ: <b>{formatPct01(jcrMonthPackFcst.occAvg01)}</b> · ADR: <b>{formatMoney(jcrMonthPackFcst.adrAvg)}</b> · Rev:{" "}
                  <b>{formatMoney(jcrMonthPackFcst.roomRevSum)}</b>
                </div>
              </div>
            </div>

            <MonthDetail rows={jcrMonthRows} />
          </div>
        </div>

        {/* ===== 4) MEMBERSHIP (JCR) ===== */}
        <div style={cardStyle("#0b1220")}>
          <SectionTitle>Membership (JCR)</SectionTitle>
          <SectionDesc>
            Usa filtro global de año y hotel (JCR/MARRIOTT/SHERATONS). Si tu componente ya lo filtra internamente, mejor.
          </SectionDesc>

          <div style={{ marginTop: ".85rem" }}>
            {/* IMPORTANTÍSIMO: no pasamos props inventadas para no romper types */}
            <MembershipSummary year={jcrYear} baseYear={jcrBaseYear} filePath={MEMBERSHIP_PATH} hotelFilter={jcrHotel as any} />
          </div>
        </div>

        {/* ===== 5) NACIONALIDADES ===== */}
        <div style={cardStyle("#0b1220")}>
          <SectionTitle>Nacionalidades</SectionTitle>
          <SectionDesc>
            Ranking por país + distribución por continente. (Archivo Marriott). Usa filtro global de año. (Sin filtro hotel)
          </SectionDesc>

          <div style={{ marginTop: ".85rem" }}>
            {/* IMPORTANTÍSIMO: CountryRanking en tu repo viene con Props year+filePath (sin hotelFilter) */}
            <CountryRanking year={jcrYear} filePath={NACIONALIDADES_PATH} />
          </div>
        </div>
      </section>

      {/* =======================
          BLOQUE MAITEI (Gotel)
      ======================= */}
      <section className="section" id="maitei" style={{ display: "grid", gap: "1rem" }}>
        <div style={cardStyle("#061521")}>
          <div style={{ display: "grid", gap: ".4rem" }}>
            <div style={{ fontSize: "1.25rem", fontWeight: 950 }}>Maitei — Management (Gotel)</div>
            <div style={{ opacity: 0.85 }}>Bloque aparte con filtros propios (celeste).</div>
          </div>
        </div>

        {/* Sticky MAITEI filters */}
        <div
          style={{
            position: "sticky",
            top: 10,
            zIndex: 15,
            backdropFilter: "blur(8px)",
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,.10)",
            background: "rgba(3, 105, 161, .18)",
            padding: ".85rem",
            boxShadow: "0 12px 26px rgba(0,0,0,.22)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".55rem", alignItems: "center" }}>
            <Pill color="blue">MAITEI</Pill>

            <label style={{ display: "flex", alignItems: "center", gap: ".5rem", fontWeight: 900 }}>
              Año
              <select
                value={maiteiYear}
                onChange={(e) => setMaiteiYear(Number(e.target.value))}
                style={{
                  borderRadius: 12,
                  padding: ".45rem .6rem",
                  border: "1px solid rgba(255,255,255,.18)",
                  background: "rgba(2,132,199,.14)",
                  color: "white",
                  fontWeight: 900,
                }}
              >
                {yearsAvailable.map((y) => (
                  <option key={y} value={y} style={{ color: "#111" }}>
                    {y}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: ".5rem", fontWeight: 900 }}>
              vs
              <select
                value={maiteiBaseYear}
                onChange={(e) => setMaiteiBaseYear(Number(e.target.value))}
                style={{
                  borderRadius: 12,
                  padding: ".45rem .6rem",
                  border: "1px solid rgba(255,255,255,.18)",
                  background: "rgba(2,132,199,.10)",
                  color: "white",
                  fontWeight: 900,
                }}
              >
                {yearsAvailable.map((y) => (
                  <option key={y} value={y} style={{ color: "#111" }}>
                    {y}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: ".5rem", fontWeight: 900 }}>
              Mes
              <select
                value={maiteiMonth}
                onChange={(e) => setMaiteiMonth(Number(e.target.value))}
                style={{
                  borderRadius: 12,
                  padding: ".45rem .6rem",
                  border: "1px solid rgba(255,255,255,.18)",
                  background: "rgba(2,132,199,.10)",
                  color: "white",
                  fontWeight: 900,
                }}
              >
                {MONTHS.map((m) => (
                  <option key={m.n} value={m.n} style={{ color: "#111" }}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* MAITEI KPIs */}
        <div style={cardStyle("#061521")}>
          <SectionTitle>KPIs — History</SectionTitle>
          <SectionDesc>
            Filtro: <b>MAITEI</b> · <b>{maiteiYear}</b> vs <b>{maiteiBaseYear}</b>
          </SectionDesc>
          <div style={{ marginTop: ".85rem" }}>
            <SummaryGrid pThis={maiteiThisHist} pBase={maiteiBaseHist} />
          </div>
        </div>

        <div style={cardStyle("#061521")}>
          <SectionTitle>KPIs — Forecast</SectionTitle>
          <SectionDesc>
            Filtro: <b>MAITEI</b> · <b>{maiteiYear}</b> vs <b>{maiteiBaseYear}</b>
          </SectionDesc>
          <div style={{ marginTop: ".85rem" }}>
            <SummaryGrid pThis={maiteiThisFcst} pBase={maiteiBaseFcst} />
          </div>
        </div>

        {/* MAITEI Comparativa */}
        <div style={cardStyle("#061521")}>
          <SectionTitle>Comparativa mensual</SectionTitle>
          <SectionDesc>Tabla por mes para MAITEI (History y Forecast).</SectionDesc>

          <div style={{ marginTop: ".95rem", display: "grid", gap: "1.25rem" }}>
            <CompareTable data={maiteiCompareHist} year={maiteiYear} baseYear={maiteiBaseYear} label="History — MAITEI" />
            <CompareTable data={maiteiCompareFcst} year={maiteiYear} baseYear={maiteiBaseYear} label="Forecast — MAITEI" />
          </div>
        </div>

        {/* MAITEI Ranking + Detalle */}
        <div style={cardStyle("#061521")}>
          <SectionTitle>Ranking por mes</SectionTitle>
          <SectionDesc>
            Top 10 días del mes <b>{MONTHS.find((x) => x.n === maiteiMonth)?.label}</b> · {maiteiYear} · MAITEI
          </SectionDesc>

          <div style={{ marginTop: ".95rem", display: "grid", gap: "1.15rem", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <RankingBlock title="Top 10 por Room Revenue" rows={maiteiTopRev} mode="revenue" />
            <RankingBlock title="Top 10 por Ocupación" rows={maiteiTopOcc} mode="occ" />
          </div>
        </div>

        <div style={cardStyle("#061521")}>
          <SectionTitle>Mes detallado</SectionTitle>
          <SectionDesc>Filas del mes MAITEI seleccionado (History + Forecast).</SectionDesc>

          <div style={{ marginTop: ".85rem", display: "grid", gap: "1.1rem" }}>
            <div style={{ display: "grid", gap: ".5rem", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <div style={cardStyle("#04111b")}>
                <div style={{ fontWeight: 950 }}>Pack History (mes)</div>
                <div style={{ marginTop: ".35rem", opacity: 0.85 }}>
                  Occ: <b>{formatPct01(maiteiMonthPackHist.occAvg01)}</b> · ADR: <b>{formatMoney(maiteiMonthPackHist.adrAvg)}</b> · Rev:{" "}
                  <b>{formatMoney(maiteiMonthPackHist.roomRevSum)}</b>
                </div>
              </div>
              <div style={cardStyle("#04111b")}>
                <div style={{ fontWeight: 950 }}>Pack Forecast (mes)</div>
                <div style={{ marginTop: ".35rem", opacity: 0.85 }}>
                  Occ: <b>{formatPct01(maiteiMonthPackFcst.occAvg01)}</b> · ADR: <b>{formatMoney(maiteiMonthPackFcst.adrAvg)}</b> · Rev:{" "}
                  <b>{formatMoney(maiteiMonthPackFcst.roomRevSum)}</b>
                </div>
              </div>
            </div>

            <MonthDetail rows={maiteiMonthRows} />
          </div>
        </div>
      </section>

      {/* Debug mínimo si algo viene raro */}
      <div style={{ opacity: 0.65, fontSize: ".85rem", padding: ".5rem .15rem" }}>
        Debug: filas CSV={normalized.length} · ejemplos Empresa={Array.from(new Set(normalized.map((x) => x.empresa))).slice(0, 12).join(" | ")}
      </div>
    </div>
  );
}
