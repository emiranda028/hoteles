"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;               // año “global” (si querés)
  baseYear: number;           // año base para comparación
  hotelsJCR: string[];        // ["MARRIOTT","SHERATON BCR","SHERATON MDQ"]
  filePath: string;           // "/data/jcr_membership.xlsx"
  title?: string;             // opcional
  defaultHotelScope?: "JCR" | string;
};

type RowNorm = {
  hotel: string;
  membership: string;
  qty: number;
  date: Date | null;
  year: number | null;
  month: number | null; // 1..12
};

type Bucket = {
  key: string;
  label: string;
  qty: number;
  share01: number; // 0..1
  color: string;
};

const MONTHS = [
  { k: "YEAR", label: "Año" },
  { k: "1", label: "Ene" },
  { k: "2", label: "Feb" },
  { k: "3", label: "Mar" },
  { k: "4", label: "Abr" },
  { k: "5", label: "May" },
  { k: "6", label: "Jun" },
  { k: "7", label: "Jul" },
  { k: "8", label: "Ago" },
  { k: "9", label: "Sep" },
  { k: "10", label: "Oct" },
  { k: "11", label: "Nov" },
  { k: "12", label: "Dic" },
] as const;

function normKey(s: any) {
  return String(s ?? "").trim().toLowerCase();
}

function toNumber(n: any) {
  if (typeof n === "number") return n;
  const s = String(n ?? "")
    .trim()
    .replace(/\./g, "")     // miles
    .replace(",", ".");     // decimales
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

/** Excel serial date → JS Date */
function excelSerialToDate(serial: number) {
  // Excel (Windows) epoch: 1899-12-30
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400; // seconds
  return new Date(utcValue * 1000);
}

function parseDateMaybe(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  if (typeof v === "number") {
    // podría ser serial de Excel
    const d = excelSerialToDate(v);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(v).trim();
  if (!s) return null;

  // Intento parseo “dd/mm/yyyy” o “d/m/yyyy”
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    let yy = Number(m1[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // Intento ISO / Date.parse
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);

  return null;
}

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("es-AR");
}

function fmtPct(p01: number) {
  return (p01 * 100).toFixed(1).replace(".", ",") + "%";
}

function deltaPct(cur: number, base: number) {
  if (!base) return 0;
  return ((cur / base) - 1) * 100;
}

function pickColor(code: string) {
  const k = code.toUpperCase();

  // Si viene “Member (MRD)” lo detecto también
  const has = (needle: string) => k.includes(needle);

  if (has("MRD") || has("MEMBER")) return "#EF4444";      // rojo
  if (has("GLD") || has("GOLD")) return "#F59E0B";        // dorado
  if (has("TTM") || has("TITANIUM")) return "#A855F7";    // violeta
  if (has("PLT") || has("PLATINUM")) return "#94A3B8";    // slate
  if (has("SLR") || has("SILVER")) return "#CBD5E1";      // gris claro
  if (has("AMB") || has("AMBASSADOR")) return "#38BDF8";  // celeste
  return "#22C55E";                                       // verde fallback
}

function cleanLabel(raw: string) {
  const s = String(raw ?? "").trim();
  if (!s) return "Sin categoría";
  return s;
}

function buildConicGradient(buckets: Bucket[]) {
  // conic-gradient(color a%, color b%, ...)
  let acc = 0;
  const parts: string[] = [];
  for (const b of buckets) {
    const from = acc * 100;
    acc += b.share01;
    const to = acc * 100;
    parts.push(`${b.color} ${from.toFixed(2)}% ${to.toFixed(2)}%`);
  }
  if (parts.length === 0) return "conic-gradient(#e5e7eb 0% 100%)";
  return `conic-gradient(${parts.join(", ")})`;
}

function sumFromRows(rows: RowNorm[]) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = r.membership || "Sin categoría";
    map.set(key, (map.get(key) ?? 0) + (r.qty ?? 0));
  }
  return map;
}

export default function MembershipSummary({
  year,
  baseYear,
  hotelsJCR,
  filePath,
  title = "Membership (JCR)",
  defaultHotelScope = "JCR",
}: Props) {
  // Scope de hotel: "JCR" = consolidado
  const scopes = useMemo(() => ["JCR", ...hotelsJCR], [hotelsJCR]);
  const [scope, setScope] = useState<string>(defaultHotelScope);

  // Año local (arranca en el global)
  const [yearSel, setYearSel] = useState<number>(year);

  // Periodo: YEAR o mes 1..12
  const [period, setPeriod] = useState<string>("YEAR");

  // Data
  const [rows, setRows] = useState<RowNorm[]>([]);
  const [debug, setDebug] = useState<{ sheet: string; keys: string[] }>({ sheet: "", keys: [] });
  const [err, setErr] = useState<string>("");

  // Sync year global → local (si cambia desde arriba)
  useEffect(() => {
    setYearSel(year);
  }, [year]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr("");
        const { rows: rawRows, sheetName } = await readXlsxFromPublic(filePath);

        const keys = Object.keys(rawRows?.[0] ?? {});
        const keyMap = new Map<string, string>();
        for (const k of keys) keyMap.set(normKey(k), k);

        // Detectores (tu Excel: Bonboy/Cantidad/Fecha/Empresa)
        const kHotel = keyMap.get("empresa") ?? "";     // Empresa
        const kMem = keyMap.get("bonboy") ?? "";        // Bonboy
        const kQty = keyMap.get("cantidad") ?? "";      // Cantidad
        const kDate = keyMap.get("fecha") ?? keyMap.get("date") ?? ""; // Fecha

        const normalized: RowNorm[] = (rawRows ?? []).map((r: any) => {
          const hotel = String(r?.[kHotel] ?? "").trim();
          const membership = String(r?.[kMem] ?? "").trim();
          const qty = toNumber(r?.[kQty]);
          const d = parseDateMaybe(r?.[kDate]);

          const yy = d ? d.getFullYear() : null;
          const mm = d ? d.getMonth() + 1 : null;

          return {
            hotel,
            membership,
            qty,
            date: d,
            year: yy,
            month: mm,
          };
        });

        if (!alive) return;

        setRows(normalized);
        setDebug({ sheet: sheetName, keys });
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "Error cargando Excel");
        setRows([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [filePath]);

  const availableYears = useMemo(() => {
    const s = new Set<number>();
    for (const r of rows) {
      if (r.year) s.add(r.year);
    }
    return Array.from(s).sort((a, b) => a - b);
  }, [rows]);

  // Aseguro que yearSel esté en años disponibles; si no, caigo al max.
  useEffect(() => {
    if (availableYears.length === 0) return;
    if (!availableYears.includes(yearSel)) {
      setYearSel(availableYears[availableYears.length - 1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableYears.join("|")]);

  const scopeHotels = useMemo(() => {
    if (scope === "JCR") return hotelsJCR;
    return [scope];
  }, [scope, hotelsJCR]);

  const curRows = useMemo(() => {
    const y = yearSel;
    const month = period === "YEAR" ? null : Number(period);

    return rows.filter((r) => {
      if (!r.year || !r.month) return false;
      if (r.year !== y) return false;
      if (!scopeHotels.includes(r.hotel)) return false;
      if (month && r.month !== month) return false;
      return true;
    });
  }, [rows, scopeHotels, yearSel, period]);

  const baseRows = useMemo(() => {
    const y = baseYear;
    const month = period === "YEAR" ? null : Number(period);

    return rows.filter((r) => {
      if (!r.year || !r.month) return false;
      if (r.year !== y) return false;
      if (!scopeHotels.includes(r.hotel)) return false;
      if (month && r.month !== month) return false;
      return true;
    });
  }, [rows, scopeHotels, baseYear, period]);

  const curMap = useMemo(() => sumFromRows(curRows), [curRows]);
  const baseMap = useMemo(() => sumFromRows(baseRows), [baseRows]);

  const totalCur = useMemo(() => {
    let t = 0;
    for (const v of curMap.values()) t += v;
    return t;
  }, [curMap]);

  const totalBase = useMemo(() => {
    let t = 0;
    for (const v of baseMap.values()) t += v;
    return t;
  }, [baseMap]);

  const buckets = useMemo(() => {
    const keys = Array.from(new Set<string>([
      ...Array.from(curMap.keys()),
      ...Array.from(baseMap.keys()),
    ]));

    const list: Bucket[] = keys
      .map((k) => {
        const qty = curMap.get(k) ?? 0;
        return {
          key: k,
          label: cleanLabel(k),
          qty,
          share01: totalCur > 0 ? qty / totalCur : 0,
          color: pickColor(k),
        };
      })
      .filter((b) => b.qty > 0)
      .sort((a, b) => b.qty - a.qty);

    return list;
  }, [curMap, baseMap, totalCur]);

  const conic = useMemo(() => buildConicGradient(buckets), [buckets]);

  const delta = useMemo(() => {
    if (!totalBase) return 0;
    return deltaPct(totalCur, totalBase);
  }, [totalCur, totalBase]);

  const scopeTitle = useMemo(() => {
    if (scope === "JCR") return "Consolidado JCR";
    return `Membership (${scope})`;
  }, [scope]);

  const subtitle = useMemo(() => {
    const p = period === "YEAR"
      ? "Acumulado anual"
      : `Mes: ${MONTHS.find((m) => m.k === period)?.label ?? ""}`;
    return `${p} ${yearSel} · vs ${baseYear}`;
  }, [period, yearSel, baseYear]);

  return (
    <section className="section" id="membership">
      <div className="sectionHeader">
        <div>
          <div className="sectionKicker">Fidelización</div>
          <h3 className="sectionTitle">{title}</h3>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            {scopeTitle} — {subtitle}
          </div>
        </div>

        {/* Botones hotel */}
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {scopes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`segBtn ${scope === s ? "active" : ""}`}
              style={{
                padding: ".55rem .85rem",
                borderRadius: "999px",
                border: "1px solid var(--border)",
                background: scope === s ? "var(--primary)" : "transparent",
                color: scope === s ? "white" : "var(--text)",
                fontWeight: 700,
                letterSpacing: ".02em",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Año selector interno */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ color: "var(--muted)", fontSize: ".9rem" }}>
          Fuente: Excel (sheet: <strong>{debug.sheet || "—"}</strong>)
        </div>

        <div style={{ display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: ".9rem", color: "var(--muted)" }}>Año:</div>
          <select
            value={yearSel}
            onChange={(e) => setYearSel(Number(e.target.value))}
            style={{
              padding: ".55rem .7rem",
              borderRadius: ".8rem",
              border: "1px solid var(--border)",
              background: "white",
              fontWeight: 700,
            }}
          >
            {availableYears.length === 0 ? (
              <option value={yearSel}>{yearSel}</option>
            ) : (
              availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Period tabs */}
      <div
        style={{
          marginTop: ".9rem",
          display: "flex",
          gap: ".35rem",
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        {MONTHS.map((m) => {
          const active = period === m.k;
          return (
            <button
              key={m.k}
              type="button"
              onClick={() => setPeriod(String(m.k))}
              className={`monthBtn ${active ? "active" : ""}`}
              style={{
                padding: ".5rem .65rem",
                borderRadius: ".75rem",
                border: "1px solid var(--border)",
                background: active ? "var(--primary)" : "transparent",
                color: active ? "white" : "var(--text)",
                fontWeight: 700,
                minWidth: m.k === "YEAR" ? "4.2rem" : "3.1rem",
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Main card */}
      <div
        className="card"
        style={{
          marginTop: "1rem",
          padding: "1.25rem",
          borderRadius: "1.25rem",
        }}
      >
        {err ? (
          <div style={{ color: "crimson", fontWeight: 700 }}>
            Error: {err}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 0.55fr) minmax(0, 1fr)",
              gap: "1.25rem",
              alignItems: "stretch",
            }}
          >
            {/* Left: total + donut */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "1.25rem",
                padding: "1.15rem",
                background: "linear-gradient(180deg, rgba(0,0,0,.02), rgba(0,0,0,0))",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>Total</div>

              <div style={{ fontSize: "4rem", fontWeight: 900, marginTop: ".35rem", lineHeight: 1 }}>
                {fmtInt(totalCur)}
              </div>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: ".4rem",
                  padding: ".45rem .7rem",
                  borderRadius: "999px",
                  marginTop: ".65rem",
                  border: "1px solid rgba(16,185,129,.35)",
                  background: "rgba(16,185,129,.10)",
                  color: "#047857",
                  fontWeight: 900,
                  width: "fit-content",
                }}
              >
                {delta >= 0 ? "+" : ""}{delta.toFixed(1).replace(".", ",")}% vs {baseYear}
              </div>

              <div style={{ marginTop: "1rem", fontWeight: 800, color: "var(--muted)" }}>
                Composición
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "1rem",
                  alignItems: "center",
                  marginTop: ".75rem",
                }}
              >
                {/* Donut */}
                <div
                  style={{
                    width: "130px",
                    height: "130px",
                    borderRadius: "999px",
                    background: conic,
                    position: "relative",
                    flex: "0 0 auto",
                  }}
                  aria-label="Composición de membership"
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: "18px",
                      borderRadius: "999px",
                      background: "white",
                      border: "1px solid var(--border)",
                    }}
                  />
                </div>

                {/* Legend */}
                <div style={{ display: "grid", gap: ".45rem", minWidth: 0 }}>
                  {buckets.slice(0, 6).map((b) => (
                    <div key={b.key} style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                      <span
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "999px",
                          background: b.color,
                          flex: "0 0 auto",
                        }}
                      />
                      <div style={{ fontSize: ".92rem", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {b.label}
                      </div>
                      <div style={{ marginLeft: "auto", fontSize: ".92rem", fontWeight: 900 }}>
                        {fmtPct(b.share01)}
                      </div>
                    </div>
                  ))}
                  {buckets.length > 6 && (
                    <div style={{ fontSize: ".85rem", color: "var(--muted)" }}>
                      +{buckets.length - 6} categorías
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: bars */}
            <div style={{ padding: ".25rem .1rem" }}>
              <div style={{ fontWeight: 900, fontSize: "1.1rem", marginBottom: ".5rem" }}>
                Detalle por membresía
              </div>

              {totalCur === 0 ? (
                <div style={{ color: "var(--muted)", fontWeight: 700 }}>
                  Sin datos para {scope} en {yearSel} ({period === "YEAR" ? "Año" : `Mes ${period}`}).
                </div>
              ) : (
                <div style={{ display: "grid", gap: ".9rem" }}>
                  {buckets.map((b) => {
                    const pct = b.share01 * 100;
                    return (
                      <div key={b.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 240px) 1fr 120px", gap: ".8rem", alignItems: "center" }}>
                        <div style={{ fontWeight: 900 }}>
                          {b.label}
                          <div style={{ fontSize: ".9rem", color: "var(--muted)", fontWeight: 800 }}>
                            {fmtPct(b.share01)} del total
                          </div>
                        </div>

                        <div
                          style={{
                            height: "12px",
                            borderRadius: "999px",
                            background: "rgba(148,163,184,.25)",
                            overflow: "hidden",
                            border: "1px solid rgba(148,163,184,.25)",
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              background: b.color,
                              borderRadius: "999px",
                              transition: "width .35s ease",
                            }}
                          />
                        </div>

                        <div style={{ textAlign: "right", fontWeight: 900, fontSize: "1.05rem" }}>
                          {fmtInt(b.qty)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Debug suave (por si vuelve a fallar headers) */}
        <div style={{ marginTop: "1rem", color: "var(--muted)", fontSize: ".78rem" }}>
          Keys ejemplo: {debug.keys.slice(0, 12).join(", ")}{debug.keys.length > 12 ? "…" : ""}
        </div>
      </div>
    </section>
  );
}
