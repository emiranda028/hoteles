"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;               // año seleccionado (filtro global)
  baseYear: number;           // año base comparativo
  allowedHotels: string[];    // ej: ["MARRIOTT","SHERATON BCR","SHERATON MDQ"]
  filePath: string;           // ej: "/data/jcr_membership.xlsx"
  title?: string;             // opcional
};

type RowAny = Record<string, any>;

type DetectInfo = {
  hotelKey?: string;
  membershipKey?: string;
  qtyKey?: string;
  dateKey?: string;
  keys: string[];
};

type TierAgg = {
  tier: string;     // "Member (MRD)"
  code: string;     // "MRD"
  qty: number;
  share: number;    // 0-1
};

const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR");
const fmtPct = (p01: number) => (p01 * 100).toFixed(1).replace(".", ",") + "%";
const fmtPP = (pp: number) => pp.toFixed(1).replace(".", ",") + " p.p.";

function normKey(s: any) {
  return String(s ?? "").trim().toLowerCase();
}
function normHotel(raw: any) {
  const s = String(raw ?? "").trim().toUpperCase();

  // Normalizaciones típicas (por si el Excel viniera con nombres largos)
  if (s.includes("MARRIOTT")) return "MARRIOTT";
  if (s.includes("BARILOCHE") || s.includes("BCR")) return "SHERATON BCR";
  if (s.includes("MAR DEL PLATA") || s.includes("MDQ")) return "SHERATON MDQ";

  return s;
}
function normTier(raw: any) {
  // Ej: " Member (MRD)" -> "Member (MRD)"
  return String(raw ?? "").trim().replace(/\s+/g, " ");
}
function tierCode(tier: string) {
  const m = tier.match(/\(([^)]+)\)/);
  return (m?.[1] ?? "").trim().toUpperCase();
}

function parseNumber(v: any): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;

  // soporta "1.234" "1,234" "1.234,56"
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.-]/g, "");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseDateLoose(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  const s = String(v).trim();
  if (!s) return null;

  // Formatos comunes: "2024-10-22", "22/10/2024", "22-10-2024"
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;

  const m1 = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]) - 1;
    const yy = Number(m1[3].length === 2 ? "20" + m1[3] : m1[3]);
    const d = new Date(yy, mm, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function detectColumns(rows: RowAny[]): DetectInfo {
  const keys = Object.keys(rows?.[0] ?? {});
  const kset = new Set(keys.map(normKey));

  const pick = (cands: string[]) => {
    for (const c of cands) {
      const cn = c.toLowerCase();
      // match exact key ignoring case/trim
      const real = keys.find((k) => normKey(k) === cn);
      if (real) return real;
    }
    return undefined;
  };

  // En tu Excel real: Bonboy / Cantidad / Fecha / Empresa
  const hotelKey = pick(["empresa", "hotel", "property", "propiedad"]);
  const membershipKey = pick(["bonboy", "membership", "tier", "membresia", "membresía"]);
  const qtyKey = pick(["cantidad", "qty", "quantity", "count", "total"]);
  const dateKey = pick(["fecha", "date", "day"]);

  return { hotelKey, membershipKey, qtyKey, dateKey, keys };
}

const TIER_COLORS: Record<string, { bar: string; dot: string }> = {
  MRD: { bar: "#ef4444", dot: "#ef4444" }, // rojo
  GLD: { bar: "#f59e0b", dot: "#f59e0b" }, // dorado
  TTM: { bar: "#a855f7", dot: "#a855f7" }, // violeta
  PLT: { bar: "#94a3b8", dot: "#94a3b8" }, // gris azulado
  SLR: { bar: "#cbd5e1", dot: "#cbd5e1" }, // gris claro
  AMB: { bar: "#38bdf8", dot: "#38bdf8" }, // celeste
};

function colorFor(code: string) {
  return TIER_COLORS[code] ?? { bar: "#e5e7eb", dot: "#9ca3af" };
}

function monthLabelEs(m: number) {
  const names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return names[m - 1] ?? String(m);
}

type Scope = "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ";

export default function MembershipSummary({
  year,
  baseYear,
  allowedHotels,
  filePath,
  title = "Membership (JCR)",
}: Props) {
  const [rows, setRows] = useState<RowAny[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  // Scope: JCR (consolidado) o 1 hotel
  const [scope, setScope] = useState<Scope>("JCR");

  // Periodo interno (Año o un mes)
  const [mode, setMode] = useState<"YEAR" | "MONTH">("YEAR");
  const [month, setMonth] = useState<number>(1);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");

        const res = await readXlsxFromPublic(filePath);
        if (!alive) return;

        setRows(res.rows ?? []);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Error cargando XLSX");
        setRows([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [filePath]);

  const detect = useMemo(() => detectColumns(rows), [rows]);

  const normalized = useMemo(() => {
    if (!rows?.length) return [];

    const { hotelKey, membershipKey, qtyKey, dateKey } = detect;

    // Si no detectó, devolvemos igual para debug
    return rows
      .map((r) => {
        const hotelRaw = hotelKey ? r[hotelKey] : "";
        const tierRaw = membershipKey ? r[membershipKey] : "";
        const qtyRaw = qtyKey ? r[qtyKey] : 0;
        const dateRaw = dateKey ? r[dateKey] : null;

        const hotel = normHotel(hotelRaw);
        const tier = normTier(tierRaw);
        const code = tierCode(tier);
        const qty = parseNumber(qtyRaw);
        const dt = parseDateLoose(dateRaw);

        return {
          hotel,
          tier,
          code,
          qty,
          dt,
          year: dt ? dt.getFullYear() : null,
          month: dt ? dt.getMonth() + 1 : null,
        };
      })
      .filter((x) => x.qty > 0);
  }, [rows, detect]);

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    for (const r of normalized) {
      if (typeof r.year === "number") set.add(r.year);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [normalized]);

  const scopeHotels = useMemo(() => {
    if (scope === "JCR") return allowedHotels;
    return [scope];
  }, [scope, allowedHotels]);

  function aggFor(targetYear: number) {
    const list = normalized.filter((r) => r.year === targetYear && scopeHotels.includes(r.hotel));
    const list2 = mode === "YEAR" ? list : list.filter((r) => r.month === month);

    const map = new Map<string, number>();
    for (const r of list2) {
      const k = r.tier || "(sin categoría)";
      map.set(k, (map.get(k) ?? 0) + r.qty);
    }
    return map;
  }

  const curMap = useMemo(() => aggFor(year), [year, scopeHotels, normalized, mode, month]);
  const baseMap = useMemo(() => aggFor(baseYear), [baseYear, scopeHotels, normalized, mode, month]);

  const tiers: TierAgg[] = useMemo(() => {
    const keysCur = Array.from(curMap.keys());
    const keysBase = Array.from(baseMap.keys());
    const keys = Array.from(new Set<string>([...keysCur, ...keysBase]));

    const total = keys.reduce((acc, k) => acc + (curMap.get(k) ?? 0), 0);

    const list = keys
      .map((k) => {
        const qty = curMap.get(k) ?? 0;
        const tier = k;
        const code = tierCode(tier);
        const share = total > 0 ? qty / total : 0;
        return { tier, code, qty, share };
      })
      .filter((x) => x.qty > 0)
      .sort((a, b) => b.qty - a.qty);

    return list;
  }, [curMap, baseMap]);

  const totalCur = useMemo(() => {
    let s = 0;
    for (const v of curMap.values()) s += v;
    return s;
  }, [curMap]);

  const totalBase = useMemo(() => {
    let s = 0;
    for (const v of baseMap.values()) s += v;
    return s;
  }, [baseMap]);

  const deltaPct = useMemo(() => {
    if (totalBase <= 0) return null;
    return ((totalCur / totalBase) - 1) * 100;
  }, [totalCur, totalBase]);

  const donutStyle = useMemo(() => {
    if (!tiers.length || totalCur <= 0) return {};
    let acc = 0;
    const stops: string[] = [];

    for (const t of tiers) {
      const c = colorFor(t.code).bar;
      const start = acc;
      const end = acc + t.share * 360;
      stops.push(`${c} ${start}deg ${end}deg`);
      acc = end;
    }

    return {
      backgroundImage: `conic-gradient(${stops.join(", ")})`,
    } as React.CSSProperties;
  }, [tiers, totalCur]);

  const headerSubtitle = useMemo(() => {
    const scopeLabel = scope === "JCR" ? "Consolidado JCR" : `Membership (${scope})`;
    const period =
      mode === "YEAR"
        ? `Año ${year}`
        : `${monthLabelEs(month)} ${year}`;
    return `${scopeLabel} — ${period} · vs ${baseYear}`;
  }, [scope, mode, month, year, baseYear]);

  // Si no hay columnas detectadas, mostramos debug “útil”
  const debugLine = useMemo(() => {
    return `Detectado: hotel=${detect.hotelKey ?? "—"} · membership=${detect.membershipKey ?? "—"} · qty=${detect.qtyKey ?? "—"} · fecha=${detect.dateKey ?? "—"}`;
  }, [detect]);

  // UI
  if (loading) {
    return (
      <div className="card">
        <div className="cardTitle">{title}</div>
        <div className="cardNote">Cargando datos…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="cardTitle">{title}</div>
        <div className="delta down">{error}</div>
        <div className="cardNote">{debugLine}</div>
        <div className="cardNote">Keys ejemplo: {detect.keys.slice(0, 12).join(", ")}</div>
      </div>
    );
  }

  // Sin datos para el año/scope actual (pero el archivo está OK)
  const noData = totalCur <= 0;

  return (
    <section className="section" id="membership">
      <div className="sectionHeader">
        <div>
          <div className="sectionKicker">Fidelización</div>
          <h3 className="sectionTitle">{title}</h3>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            {headerSubtitle}
          </div>
        </div>

        {/* Filtros hotel */}
        <div className="pillRow" style={{ justifyContent: "flex-end" }}>
          <button
            className={`pill ${scope === "JCR" ? "active" : ""}`}
            onClick={() => setScope("JCR")}
            type="button"
          >
            JCR
          </button>
          <button
            className={`pill ${scope === "MARRIOTT" ? "active" : ""}`}
            onClick={() => setScope("MARRIOTT")}
            type="button"
          >
            MARRIOTT
          </button>
          <button
            className={`pill ${scope === "SHERATON BCR" ? "active" : ""}`}
            onClick={() => setScope("SHERATON BCR")}
            type="button"
          >
            SHERATON BCR
          </button>
          <button
            className={`pill ${scope === "SHERATON MDQ" ? "active" : ""}`}
            onClick={() => setScope("SHERATON MDQ")}
            type="button"
          >
            SHERATON MDQ
          </button>
        </div>
      </div>

      {/* Modo (Año vs Mes) — el AÑO lo define el filtro global (year). */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="cardTop" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className="cardTitle">{scope === "JCR" ? "Membership (JCR)" : `Membership (${scope})`}</div>
            <div className="cardNote">Acumulado {year} · vs {baseYear}</div>
          </div>

          <div className="segRow" aria-label="Modo">
            <button
              className={`segBtn ${mode === "YEAR" ? "active" : ""}`}
              type="button"
              onClick={() => setMode("YEAR")}
            >
              Año
            </button>
            <div className="segDivider" />
            {Array.from({ length: 12 }).map((_, i) => {
              const m = i + 1;
              return (
                <button
                  key={m}
                  className={`segBtn ${mode === "MONTH" && month === m ? "active" : ""}`}
                  type="button"
                  onClick={() => {
                    setMode("MONTH");
                    setMonth(m);
                  }}
                >
                  {monthLabelEs(m)}
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)",
            gap: "1.25rem",
            padding: "1.25rem",
          }}
        >
          {/* Card total */}
          <div
            style={{
              borderRadius: "18px",
              border: "1px solid rgba(0,0,0,.07)",
              background: "rgba(0,0,0,.02)",
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: ".65rem",
              minHeight: 220,
            }}
          >
            <div style={{ color: "var(--muted)", fontWeight: 600 }}>Total</div>
            <div style={{ fontSize: "3.2rem", fontWeight: 800, lineHeight: 1 }}>
              {noData ? "—" : fmtInt(totalCur)}
            </div>

            {deltaPct === null ? (
              <div className="delta" style={{ marginTop: ".15rem" }}>
                Base {baseYear}: {totalBase > 0 ? fmtInt(totalBase) : "—"}
              </div>
            ) : (
              <div className={`delta ${deltaPct >= 0 ? "up" : "down"}`} style={{ marginTop: ".15rem" }}>
                {deltaPct >= 0 ? "+" : ""}
                {deltaPct.toFixed(1).replace(".", ",")}% vs {baseYear}
              </div>
            )}

            {/* Donut composición */}
            <div style={{ marginTop: ".75rem", display: "flex", gap: "1rem", alignItems: "center" }}>
              <div
                style={{
                  width: 90,
                  height: 90,
                  borderRadius: "999px",
                  ...donutStyle,
                  position: "relative",
                  border: "1px solid rgba(0,0,0,.08)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 12,
                    borderRadius: "999px",
                    background: "white",
                    border: "1px solid rgba(0,0,0,.06)",
                  }}
                />
              </div>

              <div style={{ display: "grid", gap: ".35rem" }}>
                <div style={{ fontWeight: 700, color: "var(--text)" }}>Composición</div>
                <div style={{ fontSize: ".85rem", color: "var(--muted)" }}>
                  {mode === "YEAR" ? `Año ${year}` : `${monthLabelEs(month)} ${year}`}
                </div>
              </div>
            </div>

            {noData && (
              <div style={{ marginTop: ".75rem", color: "var(--muted)", fontSize: ".9rem" }}>
                Sin datos para {scope} en {mode === "YEAR" ? year : `${monthLabelEs(month)} ${year}`}.<br />
                Años disponibles en el archivo: {availableYears.length ? availableYears.join(", ") : "—"}.
              </div>
            )}
          </div>

          {/* Barras / ranking por tier */}
          <div style={{ display: "grid", gap: ".8rem", alignContent: "start" }}>
            {tiers.length === 0 ? (
              <div style={{ color: "var(--muted)" }}>
                Sin filas para este filtro. <span style={{ fontSize: ".85rem" }}>{debugLine}</span>
              </div>
            ) : (
              tiers.map((t) => {
                const c = colorFor(t.code);
                const widthPct = Math.max(2, Math.min(100, (t.qty / Math.max(...tiers.map(x => x.qty))) * 100));
                return (
                  <div
                    key={t.tier}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(220px, 320px) minmax(0, 1fr) 90px",
                      gap: "1rem",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "grid", gap: ".15rem" }}>
                      <div style={{ fontWeight: 800, fontSize: "1.25rem" }}>
                        {t.tier}
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: ".95rem" }}>
                        {fmtPct(t.share)} del total
                      </div>
                    </div>

                    <div
                      style={{
                        height: 14,
                        borderRadius: 999,
                        background: "rgba(0,0,0,.08)",
                        overflow: "hidden",
                        border: "1px solid rgba(0,0,0,.06)",
                      }}
                      aria-label={`Barra ${t.tier}`}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${widthPct}%`,
                          background: c.bar,
                          borderRadius: 999,
                        }}
                      />
                    </div>

                    <div style={{ textAlign: "right", fontWeight: 800, fontSize: "1.15rem" }}>
                      {fmtInt(t.qty)}
                    </div>
                  </div>
                );
              })
            )}

            {/* Leyenda colores (consistente) */}
            <div style={{ marginTop: ".4rem", display: "flex", flexWrap: "wrap", gap: ".6rem 1rem", color: "var(--muted)", fontSize: ".9rem" }}>
              {["MRD", "GLD", "TTM", "PLT", "SLR", "AMB"].map((k) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: ".45rem" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 99, background: colorFor(k).dot, display: "inline-block" }} />
                  <span style={{ fontWeight: 700 }}>{k}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Debug discreto (por si vuelve a romperse en Vercel) */}
        <div style={{ padding: "0 1.25rem 1.1rem", color: "var(--muted)", fontSize: ".78rem" }}>
          {debugLine}
        </div>
      </div>
    </section>
  );
}
