"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number; // año global (puede venir del comparador)
  baseYear: number; // año base para variación
  hotelsJCR: string[]; // lista hoteles JCR (ej: ["MARRIOTT","SHERATON BCR","SHERATON MDQ"])
  filePath: string; // "/data/jcr_membership.xlsx"
};

type Row = {
  hotel: string;
  membership: string;
  qty: number;
  date: Date;
  year: number;
  month: number; // 1-12
};

type PeriodKey =
  | "YEAR"
  | "M01" | "M02" | "M03" | "M04" | "M05" | "M06"
  | "M07" | "M08" | "M09" | "M10" | "M11" | "M12";

const MONTHS: { key: PeriodKey; label: string; m: number }[] = [
  { key: "M01", label: "Ene", m: 1 },
  { key: "M02", label: "Feb", m: 2 },
  { key: "M03", label: "Mar", m: 3 },
  { key: "M04", label: "Abr", m: 4 },
  { key: "M05", label: "May", m: 5 },
  { key: "M06", label: "Jun", m: 6 },
  { key: "M07", label: "Jul", m: 7 },
  { key: "M08", label: "Ago", m: 8 },
  { key: "M09", label: "Sep", m: 9 },
  { key: "M10", label: "Oct", m: 10 },
  { key: "M11", label: "Nov", m: 11 },
  { key: "M12", label: "Dic", m: 12 },
];

function norm(s: any) {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function safeNum(v: any) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const str = String(v ?? "").replace(/\./g, "").replace(",", ".");
  const n = Number(str);
  return Number.isFinite(n) ? n : 0;
}

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  // XLSX a veces trae datetime como string
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("es-AR");
}
function fmtPct(n01: number) {
  return (n01 * 100).toFixed(1).replace(".", ",") + "%";
}

function deltaPct(cur: number, base: number) {
  if (!base) return 0;
  return ((cur / base) - 1) * 100;
}

function pickSheetName(sheets: Record<string, any[]>): string {
  // Si existe BonboyVF, priorizarla
  if (sheets["BonboyVF"]) return "BonboyVF";
  // Caso contrario, primera hoja
  return Object.keys(sheets)[0] ?? "Sheet1";
}

/**
 * Colores por membresía (códigos del Excel).
 * Ajustables si querés.
 */
const MEM_COLOR: Record<string, { fill: string; faint: string }> = {
  "MRD": { fill: "#ef6b6b", faint: "rgba(239,107,107,.18)" }, // Member
  "GLD": { fill: "#f2aa2b", faint: "rgba(242,170,43,.18)" }, // Gold
  "TTM": { fill: "#a06bf2", faint: "rgba(160,107,242,.18)" }, // Titanium
  "PLT": { fill: "#93a1b8", faint: "rgba(147,161,184,.20)" }, // Platinum
  "SLR": { fill: "#c9d2df", faint: "rgba(201,210,223,.35)" }, // Silver
  "AMB": { fill: "#57c4ff", faint: "rgba(87,196,255,.18)" }, // Ambassador
};

function membershipLabel(code: string) {
  const c = norm(code);
  if (c.includes("MRD") || c.includes("MEM")) return "Member (MRD)";
  if (c.includes("GLD") || c.includes("GOLD")) return "Gold Elite (GLD)";
  if (c.includes("TTM") || c.includes("TIT")) return "Titanium Elite (TTM)";
  if (c.includes("PLT") || c.includes("PLA")) return "Platinum Elite (PLT)";
  if (c.includes("SLR") || c.includes("SIL")) return "Silver Elite (SLR)";
  if (c.includes("AMB") || c.includes("AMBASS")) return "Ambassador Elite (AMB)";
  return c;
}

function membershipKey(code: string) {
  const c = norm(code);
  // normaliza a los códigos usados en colores
  if (c.includes("MRD") || c.includes("MEM")) return "MRD";
  if (c.includes("GLD") || c.includes("GOLD")) return "GLD";
  if (c.includes("TTM") || c.includes("TIT")) return "TTM";
  if (c.includes("PLT") || c.includes("PLA")) return "PLT";
  if (c.includes("SLR") || c.includes("SIL")) return "SLR";
  if (c.includes("AMB") || c.includes("AMBASS")) return "AMB";
  // Si viene ya como código raro, lo devolvemos tal cual (pero no tendrá color fijo)
  return c;
}

function cardShadow() {
  return "0 10px 30px rgba(15,23,42,.08)";
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: any;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "1px solid rgba(15,23,42,.12)",
        padding: ".55rem .9rem",
        borderRadius: "999px",
        background: active ? "rgba(15,23,42,.92)" : "white",
        color: active ? "white" : "rgba(15,23,42,.9)",
        fontWeight: 700,
        letterSpacing: ".2px",
        cursor: "pointer",
        transition: "transform .08s ease",
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(.98)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {children}
    </button>
  );
}

function SmallPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: any;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "1px solid rgba(15,23,42,.12)",
        padding: ".42rem .7rem",
        borderRadius: "10px",
        background: active ? "rgba(164,0,27,.92)" : "white",
        color: active ? "white" : "rgba(15,23,42,.85)",
        fontWeight: 700,
        cursor: "pointer",
        minWidth: "46px",
      }}
    >
      {children}
    </button>
  );
}

/** Donut SVG */
function Donut({
  slices,
  size = 130,
  stroke = 16,
}: {
  slices: { value: number; color: string }[];
  size?: number;
  stroke?: number;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(15,23,42,.08)"
        strokeWidth={stroke}
      />
      {slices.map((s, i) => {
        const frac = s.value / total;
        const dash = frac * c;
        const dasharray = `${dash} ${c - dash}`;
        const dashoffset = -offset;
        offset += dash;
        return (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={dasharray}
            strokeDashoffset={dashoffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
      })}
    </svg>
  );
}

export default function MembershipSummary({
  year,
  baseYear,
  hotelsJCR,
  filePath,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string>("");

  // Tabs hotel: JCR (consolidado) + 3 hoteles
  const allowedHotels = useMemo(() => hotelsJCR.map(norm), [hotelsJCR]);
  const [scope, setScope] = useState<string>("JCR"); // "JCR" o nombre hotel (MARRIOTT...)
  const [period, setPeriod] = useState<PeriodKey>("YEAR");

  // Selector de año propio del bloque (se sincroniza con el global cuando cambia)
  const [localYear, setLocalYear] = useState<number>(year);
  useEffect(() => setLocalYear(year), [year]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setError("");
        const sheets = await readXlsxFromPublic(filePath);

        const sheetName = pickSheetName(sheets);
        const data = sheets[sheetName] ?? [];
        if (!data.length) {
          throw new Error("Excel vacío o sin hojas legibles.");
        }

        // Normalizamos headers (primera fila es el header)
        const header = data[0] ?? [];
        const H = header.map((h: any) => norm(h));

        // Detectar columnas por nombre (tu Excel real: Bonboy, Cantidad, Fecha, Empresa)
        const idxHotel = H.findIndex((x) => x.includes("EMPRESA") || x.includes("HOTEL"));
        const idxMem = H.findIndex((x) => x.includes("BONBOY") || x.includes("MEMBERSHIP") || x.includes("MEMB"));
        const idxQty = H.findIndex((x) => x.includes("CANTIDAD") || x.includes("QTY") || x.includes("CANT"));
        const idxDate = H.findIndex((x) => x.includes("FECHA") || x.includes("DATE"));

        if (idxHotel < 0 || idxMem < 0 || idxQty < 0 || idxDate < 0) {
          throw new Error(
            `Headers no reconocidos. Detecté: hotel=${idxHotel}, membership=${idxMem}, qty=${idxQty}, fecha=${idxDate}`
          );
        }

        const parsed: Row[] = [];

        for (let i = 1; i < data.length; i++) {
          const r = data[i];
          if (!r || !r.length) continue;

          const hotelRaw = r[idxHotel];
          const memRaw = r[idxMem];
          const qtyRaw = r[idxQty];
          const dateRaw = r[idxDate];

          const hotel = norm(hotelRaw);
          const membership = norm(memRaw);
          const qty = safeNum(qtyRaw);
          const d = toDate(dateRaw);

          if (!hotel || !membership || !qty || !d) continue;

          parsed.push({
            hotel,
            membership,
            qty,
            date: d,
            year: d.getFullYear(),
            month: d.getMonth() + 1,
          });
        }

        if (mounted) setRows(parsed);
      } catch (e: any) {
        if (mounted) setError(e?.message ?? "Error leyendo Excel.");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [filePath]);

  const yearsAvailable = useMemo(() => {
    const ys = Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => a - b);
    return ys;
  }, [rows]);

  // Si el año global no existe en membership, caer al último disponible
  useEffect(() => {
    if (!yearsAvailable.length) return;
    if (!yearsAvailable.includes(localYear)) {
      setLocalYear(yearsAvailable[yearsAvailable.length - 1]);
    }
  }, [yearsAvailable, localYear]);

  // Filtrado por scope:
  // - Si scope === "JCR" => incluir los 3 hoteles JCR
  // - Si no => un hotel puntual
  const rowsScope = useMemo(() => {
    if (scope === "JCR") {
      return rows.filter((r) => allowedHotels.includes(r.hotel));
    }
    return rows.filter((r) => r.hotel === norm(scope));
  }, [rows, scope, allowedHotels]);

  // Filtrado por año + período
  const rowsPeriod = useMemo(() => {
    let list = rowsScope.filter((r) => r.year === localYear);
    if (period !== "YEAR") {
      const m = MONTHS.find((x) => x.key === period)?.m ?? 0;
      list = list.filter((r) => r.month === m);
    }
    return list;
  }, [rowsScope, localYear, period]);

  // Base para variación (mismo período, año base)
  const rowsBase = useMemo(() => {
    let list = rowsScope.filter((r) => r.year === baseYear);
    if (period !== "YEAR") {
      const m = MONTHS.find((x) => x.key === period)?.m ?? 0;
      list = list.filter((r) => r.month === m);
    }
    return list;
  }, [rowsScope, baseYear, period]);

  const sumMap = (list: Row[]) => {
    const m = new Map<string, number>();
    for (const r of list) {
      const k = membershipKey(r.membership);
      m.set(k, (m.get(k) ?? 0) + r.qty);
    }
    return m;
  };

  const curMap = useMemo(() => sumMap(rowsPeriod), [rowsPeriod]);
  const baseMap = useMemo(() => sumMap(rowsBase), [rowsBase]);

  const curTotal = useMemo(() => {
    let t = 0;
    curMap.forEach((v) => (t += v));
    return t;
  }, [curMap]);

  const baseTotal = useMemo(() => {
    let t = 0;
    baseMap.forEach((v) => (t += v));
    return t;
  }, [baseMap]);

  const totalDelta = useMemo(() => deltaPct(curTotal, baseTotal), [curTotal, baseTotal]);

  // Lista ordenada por qty desc
  const list = useMemo(() => {
    const keys = Array.from(
      new Set<string>([...Array.from(curMap.keys()), ...Array.from(baseMap.keys())])
    );

    const items = keys
      .map((k) => {
        const cur = curMap.get(k) ?? 0;
        const base = baseMap.get(k) ?? 0;
        const share = curTotal ? cur / curTotal : 0;
        return {
          key: k,
          label: membershipLabel(k),
          cur,
          base,
          share,
          color: MEM_COLOR[k]?.fill ?? "rgba(15,23,42,.45)",
          faint: MEM_COLOR[k]?.faint ?? "rgba(15,23,42,.10)",
        };
      })
      .filter((x) => x.cur > 0 || x.base > 0)
      .sort((a, b) => b.cur - a.cur);

    return items;
  }, [curMap, baseMap, curTotal]);

  const donutSlices = useMemo(() => {
    return list.map((x) => ({ value: x.cur, color: x.color }));
  }, [list]);

  const titleScope = scope === "JCR" ? "Consolidado JCR" : `Membership (${scope})`;
  const periodLabel =
    period === "YEAR" ? "Acumulado" : `Mes ${MONTHS.find((m) => m.key === period)?.label ?? ""}`;

  return (
    <section className="section" style={{ marginTop: "2.5rem" }}>
      <div className="sectionHeader">
        <div>
          <div className="sectionKicker">Fidelización</div>
          <h3 className="sectionTitle">Membership (JCR)</h3>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            {titleScope} — {periodLabel} {localYear} · vs {baseYear}
          </div>
        </div>
      </div>

      {/* Tabs de scope: JCR + hoteles */}
      <div
        style={{
          display: "flex",
          gap: ".6rem",
          flexWrap: "wrap",
          justifyContent: "flex-end",
          marginTop: "-3.1rem",
        }}
      >
        <Pill active={scope === "JCR"} onClick={() => setScope("JCR")}>JCR</Pill>
        {allowedHotels.map((h) => (
          <Pill key={h} active={scope === h} onClick={() => setScope(h)}>
            {h}
          </Pill>
        ))}
      </div>

      {/* Selector de año */}
      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: "1rem" }}>
        {yearsAvailable.length ? (
          yearsAvailable
            .slice()
            .sort((a, b) => b - a)
            .map((y) => (
              <Pill key={y} active={localYear === y} onClick={() => setLocalYear(y)}>
                {y}
              </Pill>
            ))
        ) : (
          <div style={{ color: "var(--muted)", fontSize: ".95rem" }}>
            {error ? `Error: ${error}` : "Cargando Excel…"}
          </div>
        )}
      </div>

      {/* Selector de período (Año + meses) */}
      <div
        style={{
          marginTop: "1rem",
          background: "white",
          border: "1px solid rgba(15,23,42,.08)",
          borderRadius: "999px",
          padding: ".55rem",
          display: "flex",
          gap: ".35rem",
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        <SmallPill active={period === "YEAR"} onClick={() => setPeriod("YEAR")}>
          Año
        </SmallPill>
        {MONTHS.map((m) => (
          <SmallPill key={m.key} active={period === m.key} onClick={() => setPeriod(m.key)}>
            {m.label}
          </SmallPill>
        ))}
      </div>

      {/* Card grande */}
      <div
        style={{
          marginTop: "1rem",
          background: "white",
          border: "1px solid rgba(15,23,42,.08)",
          borderRadius: "24px",
          boxShadow: cardShadow(),
          padding: "1.6rem",
        }}
      >
        {/* Si no hay datos, mostrar diagnóstico corto */}
        {yearsAvailable.length > 0 && curTotal === 0 ? (
          <div style={{ color: "rgba(15,23,42,.78)", fontSize: "1rem" }}>
            <div style={{ fontWeight: 800, marginBottom: ".35rem" }}>
              Sin datos para {scope === "JCR" ? "JCR" : scope} en {localYear}.
            </div>
            <div style={{ color: "rgba(15,23,42,.62)" }}>
              Años disponibles: {yearsAvailable.join(", ")}
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 420px) minmax(0, 1fr)",
            gap: "1.3rem",
            alignItems: "stretch",
          }}
        >
          {/* Left: Total + donut */}
          <div
            style={{
              borderRadius: "18px",
              border: "1px solid rgba(15,23,42,.08)",
              padding: "1.1rem 1.2rem",
              background: "linear-gradient(180deg, rgba(15,23,42,.02), rgba(15,23,42,.00))",
            }}
          >
            <div style={{ color: "rgba(15,23,42,.62)", fontWeight: 700 }}>Total</div>

            <div
              style={{
                fontSize: "4rem",
                fontWeight: 900,
                marginTop: ".35rem",
                letterSpacing: "-1px",
                color: "rgba(15,23,42,.95)",
              }}
            >
              {fmtInt(curTotal)}
            </div>

            <div
              style={{
                display: "inline-flex",
                gap: ".5rem",
                alignItems: "center",
                marginTop: ".6rem",
                padding: ".45rem .75rem",
                borderRadius: "999px",
                border: "1px solid rgba(16,185,129,.35)",
                background: "rgba(16,185,129,.10)",
                color: "rgba(5,150,105,.95)",
                fontWeight: 900,
              }}
            >
              {totalDelta >= 0 ? "+" : ""}
              {totalDelta.toFixed(1).replace(".", ",")}% vs {baseYear}
            </div>

            <div style={{ marginTop: "1rem", display: "flex", gap: "1rem", alignItems: "center" }}>
              <Donut slices={donutSlices} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, marginBottom: ".35rem" }}>Composición</div>
                <div style={{ color: "rgba(15,23,42,.62)", fontSize: ".95rem" }}>
                  Participación de cada categoría en el período seleccionado.
                </div>
              </div>
            </div>
          </div>

          {/* Right: barras */}
          <div style={{ padding: ".25rem .15rem" }}>
            <div style={{ fontWeight: 900, fontSize: "1.05rem", marginBottom: ".75rem" }}>
              Distribución por categoría
            </div>

            <div style={{ display: "grid", gap: ".9rem" }}>
              {list.map((x) => {
                const w = Math.max(0, Math.min(100, x.share * 100));
                return (
                  <div
                    key={x.key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "280px minmax(0, 1fr) 110px",
                      gap: "1rem",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: ".12rem" }}>
                      <div style={{ fontWeight: 900, color: "rgba(15,23,42,.92)" }}>
                        {x.label}
                      </div>
                      <div style={{ color: "rgba(15,23,42,.62)", fontWeight: 700 }}>
                        {fmtPct(x.share)} del total
                      </div>
                    </div>

                    <div
                      style={{
                        height: "12px",
                        borderRadius: "999px",
                        background: "rgba(15,23,42,.08)",
                        overflow: "hidden",
                        position: "relative",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${w}%`,
                          background: x.color,
                          borderRadius: "999px",
                        }}
                      />
                      {/* faint overlay */}
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background:
                            "linear-gradient(90deg, rgba(255,255,255,.22), rgba(255,255,255,0))",
                          pointerEvents: "none",
                        }}
                      />
                    </div>

                    <div style={{ textAlign: "right", fontWeight: 900, color: "rgba(15,23,42,.9)" }}>
                      {fmtInt(x.cur)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: "1.1rem", color: "rgba(15,23,42,.55)", fontSize: ".9rem" }}>
              Tip: podés alternar “Año” y meses para ver estacionalidad por hotel o consolidado.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
