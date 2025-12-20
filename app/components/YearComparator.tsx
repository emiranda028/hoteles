"use client";

import { useEffect, useMemo, useState } from "react";
import HofExplorer from "./HofExplorer";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

type HofRow = {
  empresa: string;
  fecha: Date | null;
  year: number | null;
  month: number | null; // 1..12
  quarter: number | null; // 1..4
  totalOcc: number;
  roomRevenue: number;
  adr: number; // average rate (si viene en el CSV)
  guests: number;
  hof: string; // History/Forecast
};

// ======= Config =======
const DEFAULT_YEAR = 2025;
const DEFAULT_BASE_YEAR = 2024;

const JCR_HOTELS = ["MARRIOTT", "SHERATON MDQ", "SHERATON BCR"] as const;
type JcrHotel = (typeof JCR_HOTELS)[number];

const GOTEL_HOTELS = ["MAITEI"] as const;

const HF_CSV_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_XLSX_PATH = "/data/jcr_membership.xlsx";

// Si todavía no lo tenés, no rompe build: simplemente muestra “sin datos”.
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

// ======= Utils (números / fechas) =======
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function normStr(s: any) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function safeNum(v: any): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;

  // Soportar formatos tipo: 22.441,71  o  22441.71  o  22,441.71
  // Estrategia:
  // - Si tiene ',' y '.', asumimos que el separador decimal es el último de ellos.
  // - Si solo tiene ',', puede ser decimal (ES) => reemplazamos ',' por '.'
  // - Si solo tiene '.', decimal (EN)
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let out = s;

  // quitar % y espacios
  out = out.replace(/%/g, "").replace(/\s/g, "");

  if (hasComma && hasDot) {
    const lastComma = out.lastIndexOf(",");
    const lastDot = out.lastIndexOf(".");
    const decIsComma = lastComma > lastDot;

    if (decIsComma) {
      // miles: '.' => remove ; decimal: ',' => '.'
      out = out.replace(/\./g, "").replace(",", ".");
    } else {
      // miles: ',' => remove ; decimal: '.' => keep
      out = out.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    // ES decimal
    out = out.replace(/\./g, "").replace(",", ".");
  } else {
    // dot decimal or plain
    out = out.replace(/,/g, "");
  }

  const n = Number(out);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);
}

function fmtMoney(n: number) {
  // No asumimos moneda; mostramos número “completo”.
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);
}

function fmtPct(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(clamp(n, 0, 1));
}

function fmtPP(n: number) {
  // puntos porcentuales
  const sign = n > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n)} p.p.`;
}

function monthNameEs(m: number) {
  const names = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  return names[clamp(m, 1, 12) - 1] ?? `Mes ${m}`;
}

function parseDateLoose(v: any): Date | null {
  // Tus datos tienen cosas tipo: 1/6/2022 o "01-06-22 Wed"
  const s = String(v ?? "").trim();
  if (!s) return null;

  // Si viene con día de semana pegado: "01-06-22 Wed"
  const s0 = s.split(" ")[0];

  // dd/mm/yyyy
  const m1 = s0.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    const yyyy = Number(m1[3]);
    const d = new Date(yyyy, mm - 1, dd);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  // dd-mm-yy
  const m2 = s0.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (m2) {
    const dd = Number(m2[1]);
    const mm = Number(m2[2]);
    const yy = Number(m2[3]);
    const yyyy = yy < 100 ? 2000 + yy : yy;
    const d = new Date(yyyy, mm - 1, dd);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  // fallback Date.parse
  const t = Date.parse(s0);
  if (Number.isFinite(t)) return new Date(t);
  return null;
}

// ======= CSV Parser (semicolon/comma, quoted headers) =======
function splitCsvLine(line: string, delimiter: string) {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // toggle quotes; support escaped double quotes
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }
  out.push(cur);
  return out.map((s) => String(s ?? "").trim());
}

function detectDelimiter(text: string) {
  // mira las primeras líneas y decide ; o ,
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const sample = lines.slice(0, 5).join("\n");
  const semi = (sample.match(/;/g) ?? []).length;
  const comma = (sample.match(/,/g) ?? []).length;
  return semi >= comma ? ";" : ",";
}

function parseCsvToObjects(text: string) {
  const delimiter = detectDelimiter(text);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const header = splitCsvLine(lines[0], delimiter).map((h) =>
    String(h ?? "")
      .replace(/\uFEFF/g, "")
      .trim()
  );

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = cells[c] ?? "";
    }
    rows.push(obj);
  }
  return rows;
}

// ======= Extractors (tolerantes a headers) =======
function pick(obj: Record<string, any>, candidates: string[]) {
  const keys = Object.keys(obj);
  const lower = new Map(keys.map((k) => [k.toLowerCase(), k]));
  for (const cand of candidates) {
    const k = lower.get(cand.toLowerCase());
    if (k != null) return obj[k];
  }
  return "";
}

function toHofRow(obj: Record<string, any>): HofRow {
  const empresa = normStr(
    pick(obj, ["Empresa", "empresa", "Hotel", "hotel", "Property"])
  );

  const fechaRaw = pick(obj, ["Fecha", "fecha", "Date", "date"]);
  const dateRaw2 = pick(obj, ["Date", "date"]);
  const d = parseDateLoose(fechaRaw || dateRaw2);

  const year = d ? d.getFullYear() : null;
  const month = d ? d.getMonth() + 1 : null;
  const quarter = month ? (month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4) : null;

  const totalOcc = safeNum(pick(obj, ["Total Occ.", "Total Occ", "Total\nOcc.", "Total\nOcc", "Total", "Rooms Occupied"]));
  const roomRevenue = safeNum(pick(obj, ["Room Revenue", "RoomRevenue", "Revenue", "Room_Revenue"]));
  const adr = safeNum(pick(obj, ["Average Rate", "ADR", "AverageRate"]));
  const guests = safeNum(pick(obj, ["Adl. & Chl.", "Adl. & Chl", "Huéspedes", "Guests", "Adl&Chl"]));

  const hof = String(pick(obj, ["HoF", "Hof", "H&F", "History/Forecast"])).trim();

  return {
    empresa,
    fecha: d,
    year,
    month,
    quarter,
    totalOcc,
    roomRevenue,
    adr,
    guests,
    hof,
  };
}

// ======= Aggregations =======
type Agg = {
  rooms: number;
  revenue: number;
  guests: number;
  adr: number; // weighted: revenue / rooms (si rooms > 0)
  occ: number; // no calculamos aquí porque depende de disponibilidad fija (en HofExplorer)
};

function aggRows(rows: HofRow[]): Agg {
  const rooms = rows.reduce((a, r) => a + (r.totalOcc || 0), 0);
  const revenue = rows.reduce((a, r) => a + (r.roomRevenue || 0), 0);
  const guests = rows.reduce((a, r) => a + (r.guests || 0), 0);
  const adr = rooms > 0 ? revenue / rooms : 0;
  return { rooms, revenue, guests, adr, occ: 0 };
}

function pctDelta(cur: number, base: number) {
  if (!base) return 0;
  return (cur - base) / base;
}

// ======= UI helpers =======
function Card({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className ?? "card"}
      style={{
        borderRadius: 24,
        background: "rgba(255,255,255,.72)",
        border: "1px solid rgba(15,23,42,.10)",
        boxShadow: "0 10px 30px rgba(2,6,23,.06)",
        backdropFilter: "blur(10px)",
        padding: "1rem",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function PillButton({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btnPill"
      style={{
        padding: ".55rem .9rem",
        borderRadius: 999,
        border: active ? "1px solid rgba(59,130,246,.45)" : "1px solid rgba(15,23,42,.14)",
        background: active ? "rgba(59,130,246,.12)" : "rgba(255,255,255,.8)",
        color: "rgba(2,6,23,.88)",
        fontWeight: 800,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function StatTile({
  title,
  value,
  sub,
  gradient,
}: {
  title: string;
  value: string;
  sub: string;
  gradient: string;
}) {
  return (
    <div
      style={{
        borderRadius: 26,
        padding: "1.1rem 1.15rem",
        background: gradient,
        color: "white",
        minHeight: 108,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow: "0 18px 40px rgba(2,6,23,.18)",
      }}
    >
      <div style={{ fontSize: ".92rem", fontWeight: 900, opacity: 0.95 }}>{title}</div>
      <div style={{ fontSize: "2rem", fontWeight: 950, letterSpacing: "-.02em", lineHeight: 1.05 }}>
        {value}
      </div>
      <div style={{ fontSize: ".9rem", fontWeight: 800, opacity: 0.92 }}>{sub}</div>
    </div>
  );
}

function DeltaBadge({ cur, base, isPP }: { cur: number; base: number; isPP?: boolean }) {
  if (isPP) {
    const pp = (cur - base) * 100;
    const pos = pp >= 0;
    return (
      <span
        style={{
          padding: ".25rem .55rem",
          borderRadius: 999,
          fontWeight: 950,
          fontSize: ".82rem",
          color: pos ? "rgb(21,128,61)" : "rgb(185,28,28)",
          background: pos ? "rgba(34,197,94,.16)" : "rgba(239,68,68,.16)",
          border: pos ? "1px solid rgba(34,197,94,.25)" : "1px solid rgba(239,68,68,.25)",
          whiteSpace: "nowrap",
        }}
      >
        {fmtPP(pp)}
      </span>
    );
  }

  const p = pctDelta(cur, base) * 100;
  const pos = p >= 0;
  const sign = pos ? "+" : "";
  return (
    <span
      style={{
        padding: ".25rem .55rem",
        borderRadius: 999,
        fontWeight: 950,
        fontSize: ".82rem",
        color: pos ? "rgb(21,128,61)" : "rgb(185,28,28)",
        background: pos ? "rgba(34,197,94,.16)" : "rgba(239,68,68,.16)",
        border: pos ? "1px solid rgba(34,197,94,.25)" : "1px solid rgba(239,68,68,.25)",
        whiteSpace: "nowrap",
      }}
    >
      {sign}
      {new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(p)}%
    </span>
  );
}

function ResponsiveGrid({
  children,
  min = 260,
  gap = 14,
}: {
  children: React.ReactNode;
  min?: number;
  gap?: number;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        gap,
      }}
    >
      {children}
    </div>
  );
}

// ======= Main component =======
export default function YearComparator() {
  const [hofRows, setHofRows] = useState<HofRow[]>([]);
  const [loading, setLoading] = useState(true);

  // filtros globales (para membership + nacionalidades)
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [baseYear, setBaseYear] = useState(DEFAULT_BASE_YEAR);
  const [globalHotel, setGlobalHotel] = useState<string>("JCR"); // JCR / MARRIOTT / SHERATON MDQ / SHERATON BCR

  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        setLoading(true);
        const res = await fetch(HF_CSV_PATH, { cache: "no-store" });
        if (!res.ok) throw new Error(`No se pudo cargar ${HF_CSV_PATH} (status ${res.status})`);
        const text = await res.text();
        const objs = parseCsvToObjects(text);
        const rows = objs.map(toHofRow);

        // filtramos los que no tengan año/empresa
        const clean = rows.filter((r) => r.empresa && r.year && r.month && r.quarter);

        if (alive) setHofRows(clean);
      } catch (e) {
        console.error(e);
        if (alive) setHofRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, []);

  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    for (const r of hofRows) {
      if (r.year) ys.add(r.year);
    }
    const out = Array.from(ys).sort((a, b) => b - a);
    return out;
  }, [hofRows]);

  // Asegurar year/baseYear válidos
  useEffect(() => {
    if (availableYears.length === 0) return;
    if (!availableYears.includes(year)) setYear(availableYears[0]);
    if (!availableYears.includes(baseYear)) {
      const candidate = year - 1;
      if (availableYears.includes(candidate)) setBaseYear(candidate);
      else setBaseYear(availableYears[Math.min(1, availableYears.length - 1)]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableYears.join(","), hofRows.length]);

  // ===== KPIs JCR (año actual y base) =====
  const jcrYearRows = useMemo(() => {
    return hofRows.filter((r) => r.year === year && JCR_HOTELS.includes(r.empresa as any));
  }, [hofRows, year]);

  const jcrBaseRows = useMemo(() => {
    return hofRows.filter((r) => r.year === baseYear && JCR_HOTELS.includes(r.empresa as any));
  }, [hofRows, baseYear]);

  const kpiJcrCur = useMemo(() => aggRows(jcrYearRows), [jcrYearRows]);
  const kpiJcrBase = useMemo(() => aggRows(jcrBaseRows), [jcrBaseRows]);

  // ===== Comparativa 2025 vs 2024 (tabla por hotel) =====
  const compareTable = useMemo(() => {
    const hotels = Array.from(JCR_HOTELS);

    return hotels.map((h) => {
      const cur = aggRows(hofRows.filter((r) => r.year === year && r.empresa === h));
      const base = aggRows(hofRows.filter((r) => r.year === baseYear && r.empresa === h));
      return { hotel: h, cur, base };
    });
  }, [hofRows, year, baseYear]);

  // ====== Render ======
  return (
    <section className="section" id="comparador" style={{ marginTop: "1rem" }}>
      {/* Header de sección */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: ".8rem", alignItems: "end", justifyContent: "space-between" }}>
        <div>
          <div className="sectionTitle" style={{ fontSize: "1.3rem", fontWeight: 950 }}>
            Informe de Gestión · Comparativo multianual
          </div>
          <div className="sectionDesc" style={{ marginTop: ".25rem", opacity: 0.8, fontWeight: 700 }}>
            KPIs del Grupo JCR + comparativa interanual + H&F + Membership + Nacionalidades.
          </div>
        </div>

        <Card style={{ padding: ".85rem .95rem" }}>
          <div style={{ fontWeight: 950, marginBottom: ".45rem" }}>Filtros globales</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".55rem", alignItems: "center" }}>
            <div style={{ display: "flex", gap: ".45rem", flexWrap: "wrap" }}>
              {availableYears.slice(0, 8).map((y) => (
                <PillButton
                  key={y}
                  active={y === year}
                  onClick={() => {
                    setYear(y);
                    // si baseYear quedara igual al year, lo corremos a y-1 si existe
                    if (baseYear === y && availableYears.includes(y - 1)) setBaseYear(y - 1);
                  }}
                >
                  {y}
                </PillButton>
              ))}
            </div>

            <div style={{ width: 1, height: 26, background: "rgba(2,6,23,.12)" }} />

            <div style={{ display: "flex", gap: ".45rem", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontWeight: 900, opacity: 0.8 }}>vs</span>
              {availableYears
                .filter((y) => y !== year)
                .slice(0, 8)
                .map((y) => (
                  <PillButton key={y} active={y === baseYear} onClick={() => setBaseYear(y)}>
                    {y}
                  </PillButton>
                ))}
            </div>

            <div style={{ width: 1, height: 26, background: "rgba(2,6,23,.12)" }} />

            <div style={{ display: "flex", gap: ".45rem", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontWeight: 900, opacity: 0.8 }}>Hotel</span>
              {["JCR", ...JCR_HOTELS].map((h) => (
                <PillButton key={h} active={globalHotel === h} onClick={() => setGlobalHotel(h)}>
                  {h === "JCR" ? "JCR (Total)" : h}
                </PillButton>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* ===== 1) CARROUSELES JCR ===== */}
      <div style={{ marginTop: "1rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
          Grupo JCR — KPIs {year} (vs {baseYear})
        </div>
        <div className="sectionDesc" style={{ marginTop: ".3rem", opacity: 0.82 }}>
          Datos consolidados desde H&F ({HF_CSV_PATH}). En el Explorer la ocupación se calcula con disponibilidad fija.
        </div>

        <div style={{ marginTop: ".9rem" }}>
          <ResponsiveGrid min={240} gap={14}>
            <StatTile
              title="Habitaciones ocupadas"
              value={loading ? "—" : fmtInt(kpiJcrCur.rooms)}
              sub={
                loading ? "—" : `${fmtInt(kpiJcrBase.rooms)} → ${fmtInt(kpiJcrCur.rooms)} · `
              }
              gradient="linear-gradient(135deg, rgb(59,130,246), rgb(34,197,94))"
            />
            <StatTile
              title="Recaudación total (Room Revenue)"
              value={loading ? "—" : fmtMoney(kpiJcrCur.revenue)}
              sub={loading ? "—" : `${fmtMoney(kpiJcrBase.revenue)} → ${fmtMoney(kpiJcrCur.revenue)} · `}
              gradient="linear-gradient(135deg, rgb(147,51,234), rgb(59,130,246))"
            />
            <StatTile
              title="Huéspedes"
              value={loading ? "—" : fmtInt(kpiJcrCur.guests)}
              sub={loading ? "—" : `${fmtInt(kpiJcrBase.guests)} → ${fmtInt(kpiJcrCur.guests)} · `}
              gradient="linear-gradient(135deg, rgb(236,72,153), rgb(147,51,234))"
            />
            <StatTile
              title="Tarifa promedio anual (ADR aprox.)"
              value={loading ? "—" : fmtMoney(kpiJcrCur.adr)}
              sub={loading ? "—" : `${fmtMoney(kpiJcrBase.adr)} → ${fmtMoney(kpiJcrCur.adr)} · `}
              gradient="linear-gradient(135deg, rgb(245,158,11), rgb(236,72,153))"
            />
          </ResponsiveGrid>

          {/* deltas */}
          <Card style={{ marginTop: "0.9rem" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".8rem", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 950 }}>Variación vs {baseYear}</div>
              <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", gap: ".35rem", alignItems: "center", fontWeight: 850 }}>
                  Rooms <DeltaBadge cur={kpiJcrCur.rooms} base={kpiJcrBase.rooms} />
                </span>
                <span style={{ display: "inline-flex", gap: ".35rem", alignItems: "center", fontWeight: 850 }}>
                  Revenue <DeltaBadge cur={kpiJcrCur.revenue} base={kpiJcrBase.revenue} />
                </span>
                <span style={{ display: "inline-flex", gap: ".35rem", alignItems: "center", fontWeight: 850 }}>
                  Huéspedes <DeltaBadge cur={kpiJcrCur.guests} base={kpiJcrBase.guests} />
                </span>
                <span style={{ display: "inline-flex", gap: ".35rem", alignItems: "center", fontWeight: 850 }}>
                  ADR <DeltaBadge cur={kpiJcrCur.adr} base={kpiJcrBase.adr} />
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ===== 2) COMPARATIVA (tabla por hotel) ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
          Comparativa {year} vs {baseYear} — por hotel (JCR)
        </div>

        <Card style={{ marginTop: ".85rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ textAlign: "left", fontWeight: 950, opacity: 0.9 }}>
                <th style={{ padding: ".65rem .6rem" }}>Hotel</th>
                <th style={{ padding: ".65rem .6rem" }}>Rooms ({year})</th>
                <th style={{ padding: ".65rem .6rem" }}>Δ</th>
                <th style={{ padding: ".65rem .6rem" }}>Revenue ({year})</th>
                <th style={{ padding: ".65rem .6rem" }}>Δ</th>
                <th style={{ padding: ".65rem .6rem" }}>Guests ({year})</th>
                <th style={{ padding: ".65rem .6rem" }}>Δ</th>
                <th style={{ padding: ".65rem .6rem" }}>ADR ({year})</th>
                <th style={{ padding: ".65rem .6rem" }}>Δ</th>
              </tr>
            </thead>
            <tbody>
              {compareTable.map((row) => (
                <tr key={row.hotel} style={{ borderTop: "1px solid rgba(2,6,23,.08)" }}>
                  <td style={{ padding: ".7rem .6rem", fontWeight: 950 }}>{row.hotel}</td>

                  <td style={{ padding: ".7rem .6rem", fontWeight: 900 }}>{fmtInt(row.cur.rooms)}</td>
                  <td style={{ padding: ".7rem .6rem" }}>
                    <DeltaBadge cur={row.cur.rooms} base={row.base.rooms} />
                  </td>

                  <td style={{ padding: ".7rem .6rem", fontWeight: 900 }}>{fmtMoney(row.cur.revenue)}</td>
                  <td style={{ padding: ".7rem .6rem" }}>
                    <DeltaBadge cur={row.cur.revenue} base={row.base.revenue} />
                  </td>

                  <td style={{ padding: ".7rem .6rem", fontWeight: 900 }}>{fmtInt(row.cur.guests)}</td>
                  <td style={{ padding: ".7rem .6rem" }}>
                    <DeltaBadge cur={row.cur.guests} base={row.base.guests} />
                  </td>

                  <td style={{ padding: ".7rem .6rem", fontWeight: 900 }}>{fmtMoney(row.cur.adr)}</td>
                  <td style={{ padding: ".7rem .6rem" }}>
                    <DeltaBadge cur={row.cur.adr} base={row.base.adr} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* ===== 3) H&F — Explorer JCR ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
          H&amp;F — Grupo JCR (Explorer)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Filtros por hotel + año/trimestre/mes. Incluye ranking mensual por hotel.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <HofExplorer
            title="H&F – Grupo JCR"
            filePath={HF_CSV_PATH}
            allowedHotels={[...JCR_HOTELS]}
            defaultYear={year}
          />
        </div>
      </div>

      {/* ===== 4) MEMBERSHIP ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
          Membership (JCR)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Filtrado por año y hotel (JCR total o por propiedad). Gráficos compactos con colores por membresía.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <MembershipSummary
            year={year}
            baseYear={baseYear}
            allowedHotels={[...JCR_HOTELS]}
            filePath={MEMBERSHIP_XLSX_PATH}
            hotelFilter={globalHotel}
          />
        </div>
      </div>

 {/* ===== 5) NACIONALIDADES ===== */}
<div style={{ marginTop: "1.25rem" }}>
  <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
    Nacionalidades
  </div>

  <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
    Ranking por país + distribución por continente. Usa filtro global de año y hotel.
  </div>

  <div style={{ marginTop: ".85rem" }}>
    <CountryRanking
      year={year}
      baseYear={baseYear}
      filePath={NACIONALIDADES_PATH}
      hotel={globalHotel}                 // 👈 IMPORTANTE: es "hotel", no "hotelFilter"
      allowedHotels={JCR_HOTELS}          // 👈 para que JCR sea la suma de los 3 hoteles
      limit={12}
    />
  </div>
</div>


      {/* ===== 6) GOTEL / MAITEI ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
          Gotel Management — Hotel Maitei
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Bloque separado del Grupo JCR.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <HofExplorer
            title="H&F – Maitei (Gotel)"
            filePath={HF_CSV_PATH}
            allowedHotels={[...GOTEL_HOTELS]}
            defaultYear={year}
          />
        </div>
      </div>

      {/* ===== Nota responsive ===== */}
      <style jsx global>{`
        .btnPill:hover {
          transform: translateY(-1px);
        }

        @media (max-width: 640px) {
          .sectionTitle {
            font-size: 1.05rem !important;
          }
          .sectionDesc {
            font-size: 0.95rem !important;
          }
          .btnPill {
            padding: 0.5rem 0.75rem !important;
            font-weight: 900 !important;
          }
        }
      `}</style>
    </section>
  );
}

