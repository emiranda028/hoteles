"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type RowAny = Record<string, any>;

type Props = {
  year: number; // filtro global
  baseYear: number; // para delta
  hotelsJCR: string[]; // lista de hoteles del grupo (para mostrar en botones)
  filePath: string; // "/data/jcr_membership.xlsx"
};

type Mode = "year" | "month";

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function normKey(s: string) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function pickColumn(keys: string[], candidates: string[]) {
  const kNorm = keys.map((k) => ({ k, n: normKey(k) }));
  for (const c of candidates) {
    const cn = normKey(c);
    const found = kNorm.find((x) => x.n === cn) || kNorm.find((x) => x.n.includes(cn));
    if (found) return found.k;
  }
  return "";
}

// Soporta: number serial Excel, dd/mm/yyyy, dd-mm-yy, "01-06-22 Wed", etc.
function parseAnyDate(v: any): Date | null {
  if (v == null || v === "") return null;

  // Excel serial (muy común)
  if (typeof v === "number" && isFinite(v)) {
    // Excel epoch: 1899-12-30
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + v * 24 * 60 * 60 * 1000);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = v.toString().trim();
  if (!s) return null;

  // Si viene "01-06-22 Wed" me quedo con el primer token
  const first = s.split(" ")[0];

  // dd/mm/yyyy
  const m1 = first.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m1) {
    const dd = parseInt(m1[1], 10);
    const mm = parseInt(m1[2], 10);
    let yy = parseInt(m1[3], 10);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // dd-mm-yyyy o dd-mm-yy
  const m2 = first.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (m2) {
    const dd = parseInt(m2[1], 10);
    const mm = parseInt(m2[2], 10);
    let yy = parseInt(m2[3], 10);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // ISO o parse genérico
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// 7.301 / 7,301 / "7 301" / "7301"
function parseQty(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && isFinite(v)) return v;

  const s = v.toString().trim();
  if (!s) return 0;

  // si tiene separadores, los saco
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "") // puntos de miles
    .replace(/,(?=\d{3}(\D|$))/g, ""); // comas de miles

  const n = Number(cleaned.replace(",", "."));
  return isFinite(n) ? n : 0;
}

function normalizeHotel(raw: any): string {
  const s = (raw ?? "").toString().trim();
  const n = normKey(s);

  if (!n) return "";

  // Marriott
  if (n.includes("marriott")) return "MARRIOTT";

  // Sheraton MDQ / Mar del Plata
  if (n.includes("mdq") || n.includes("mar del plata")) return "SHERATON MDQ";

  // Sheraton BCR / Bariloche
  if (n.includes("bcr") || n.includes("bariloche")) return "SHERATON BCR";

  // Maitei / Gotel
  if (n.includes("maitei")) return "MAITEI";

  // Si ya viene como código
  if (n.includes("sheraton") && n.includes("mdq")) return "SHERATON MDQ";
  if (n.includes("sheraton") && n.includes("bcr")) return "SHERATON BCR";

  // fallback: devolver en mayúscula simple
  return s.toUpperCase();
}

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("es-AR");
}

function pct(cur: number, base: number) {
  if (!base) return 0;
  return ((cur / base) - 1) * 100;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export default function MembershipSummary({ year, baseYear, hotelsJCR, filePath }: Props) {
  const [rows, setRows] = useState<RowAny[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  // Filtros UI
  const [hotel, setHotel] = useState<string>("MARRIOTT");
  const [mode, setMode] = useState<Mode>("year");
  const [month, setMonth] = useState<number>(0); // 1..12, 0 = "todos"

  // Debug (para que nunca quedes ciego)
  const [debug, setDebug] = useState<{
    hotelCol?: string;
    membershipCol?: string;
    qtyCol?: string;
    dateCol?: string;
    keysSample?: string[];
  }>({});

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        setLoading(true);
        setErr("");

        const data = await readXlsxFromPublic(filePath);
        if (!mounted) return;

        const list = Array.isArray(data) ? data : [];
        setRows(list);

        const keys = Object.keys(list?.[0] ?? {});
        const hotelCol = pickColumn(keys, ["Hotel", "Empresa", "Property", "Propiedad"]);
        const membershipCol = pickColumn(keys, ["Bonvoy", "Bonboy", "Membership", "Nivel", "Tier", "Categoria", "Type"]);
        const qtyCol = pickColumn(keys, ["Cantidad", "Qty", "Count", "Total", "Members"]);
        const dateCol = pickColumn(keys, ["Fecha", "Date", "Periodo", "Day", "Dia"]);

        setDebug({
          hotelCol: hotelCol || "—",
          membershipCol: membershipCol || "—",
          qtyCol: qtyCol || "—",
          dateCol: dateCol || "—",
          keysSample: keys,
        });

      } catch (e: any) {
        setErr(e?.message || "Error leyendo el Excel.");
      } finally {
        setLoading(false);
      }
    }

    run();
    return () => {
      mounted = false;
    };
  }, [filePath]);

  // Hoteles para botones: JCR por pedido (y MAITEI se muestra aparte en otra sección, acá no lo mezclo)
  const hotelButtons = useMemo(() => {
    // si hotelsJCR viene con nombres “largos”, igual lo normalizo
    const normalized = hotelsJCR.map(normalizeHotel).filter(Boolean);
    const uniq = Array.from(new Set(normalized));
    // preferencia orden
    const order = ["MARRIOTT", "SHERATON MDQ", "SHERATON BCR"];
    return order.filter((h) => uniq.includes(h));
  }, [hotelsJCR]);

  // Filas normalizadas
  const normalizedRows = useMemo(() => {
    if (!rows.length) return [];

    const keys = Object.keys(rows[0] ?? {});
    const hotelCol = pickColumn(keys, ["Hotel", "Empresa", "Property", "Propiedad"]);
    const membershipCol = pickColumn(keys, ["Bonvoy", "Bonboy", "Membership", "Nivel", "Tier", "Categoria", "Type"]);
    const qtyCol = pickColumn(keys, ["Cantidad", "Qty", "Count", "Total", "Members"]);
    const dateCol = pickColumn(keys, ["Fecha", "Date", "Periodo", "Day", "Dia"]);

    // Si falta algo clave, corto
    if (!hotelCol || !membershipCol || !qtyCol) return [];

    return rows
      .map((r) => {
        const h = normalizeHotel(r[hotelCol]);
        const m = (r[membershipCol] ?? "").toString().trim();
        const q = parseQty(r[qtyCol]);
        const d = dateCol ? parseAnyDate(r[dateCol]) : null;
        const y = d ? d.getFullYear() : null;
        const mo = d ? d.getMonth() + 1 : null;
        return { h, m, q, d, y, mo };
      })
      .filter((x) => x.h && x.m && x.q > 0); // me quedo con lo útil
  }, [rows]);

  // Años disponibles reales
  const yearsAvailable = useMemo(() => {
    const ys = normalizedRows.map((r) => r.y).filter((x): x is number => typeof x === "number");
    const uniq = Array.from(new Set(ys)).sort((a, b) => a - b);
    return uniq;
  }, [normalizedRows]);

  // Aplico filtros
  const filtered = useMemo(() => {
    const wantYear = year;
    const wantHotel = hotel;

    return normalizedRows.filter((r) => {
      if (r.h !== wantHotel) return false;
      if (typeof r.y !== "number") return false;
      if (r.y !== wantYear) return false;
      if (mode === "month" && month > 0) {
        return r.mo === month;
      }
      return true;
    });
  }, [normalizedRows, hotel, year, mode, month]);

  // Base (para delta)
  const filteredBase = useMemo(() => {
    const wantHotel = hotel;
    return normalizedRows.filter((r) => {
      if (r.h !== wantHotel) return false;
      if (typeof r.y !== "number") return false;
      if (r.y !== baseYear) return false;
      if (mode === "month" && month > 0) {
        return r.mo === month;
      }
      return true;
    });
  }, [normalizedRows, hotel, baseYear, mode, month]);

  // Aggregación por membership
  const breakdown = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const key = r.m;
      m.set(key, (m.get(key) ?? 0) + r.q);
    }
    // sort desc
    const list = Array.from(m.entries())
      .map(([k, v]) => ({ k, v }))
      .sort((a, b) => b.v - a.v);

    return list;
  }, [filtered]);

  const total = useMemo(() => breakdown.reduce((acc, x) => acc + x.v, 0), [breakdown]);

  // Base total
  const totalBase = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filteredBase) {
      const key = r.m;
      m.set(key, (m.get(key) ?? 0) + r.q);
    }
    const sum = Array.from(m.values()).reduce((a, b) => a + b, 0);
    return sum;
  }, [filteredBase]);

  const deltaTotalPct = useMemo(() => pct(total, totalBase), [total, totalBase]);

  // Auto-corrección: si el hotel actual no existe en botones, seteo el primero
  useEffect(() => {
    if (!hotelButtons.length) return;
    if (!hotelButtons.includes(hotel)) setHotel(hotelButtons[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelButtons.join("|")]);

  // UI helpers
  const subtitle = mode === "year"
    ? `Acumulado ${year} · vs ${baseYear}`
    : month === 0
      ? `Mensual (${year}) · todos los meses`
      : `Mes: ${MONTHS_ES[month - 1]} (${year}) · vs ${baseYear}`;

  const emptyState = !loading && !err && breakdown.length === 0;

  return (
    <section className="section" style={{ marginTop: "2.5rem" }}>
      <div className="sectionHeader">
        <div>
          <div className="sectionKicker">Fidelización</div>
          <h3 className="sectionTitle">Membership (JCR)</h3>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Cantidades + gráficos por hotel. Usa el filtro global de año.
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: "1.25rem" }}>
        {/* Top controls */}
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            {hotelButtons.map((h) => (
              <button
                key={h}
                type="button"
                className={`kpiBtn ${hotel === h ? "active" : ""}`}
                onClick={() => setHotel(h)}
              >
                {h}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className={`kpiBtn ${mode === "year" ? "active" : ""}`}
              onClick={() => {
                setMode("year");
                setMonth(0);
              }}
            >
              Año
            </button>
            <button
              type="button"
              className={`kpiBtn ${mode === "month" ? "active" : ""}`}
              onClick={() => setMode("month")}
            >
              Mes
            </button>

            {mode === "month" && (
              <div style={{ display: "flex", gap: ".35rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={`kpiBtn ${month === 0 ? "active" : ""}`}
                  onClick={() => setMonth(0)}
                >
                  Todos
                </button>
                {MONTHS_ES.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    className={`kpiBtn ${month === i + 1 ? "active" : ""}`}
                    onClick={() => setMonth(i + 1)}
                  >
                    {m.slice(0, 3)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: ".35rem", color: "var(--muted)" }}>
          <strong>Membership ({hotel})</strong> — {subtitle}
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ marginTop: "1rem", color: "var(--muted)" }}>Cargando Excel…</div>
        ) : err ? (
          <div style={{ marginTop: "1rem", color: "#b00020" }}>
            Error: {err}
          </div>
        ) : emptyState ? (
          <div style={{ marginTop: "1rem" }}>
            <div style={{ color: "#b00020", fontWeight: 700 }}>
              Sin datos para {hotel} en {year}.
            </div>
            <div style={{ marginTop: ".35rem", color: "var(--muted)" }}>
              Años disponibles: {yearsAvailable.length ? yearsAvailable.join(", ") : "—"}
            </div>
            <div style={{ marginTop: ".35rem", color: "var(--muted)" }}>
              Detectado: hotel={debug.hotelCol} · membership={debug.membershipCol} · qty={debug.qtyCol} · fecha={debug.dateCol}
            </div>
            <div style={{ marginTop: ".35rem", color: "var(--muted)" }}>
              Keys ejemplo: {(debug.keysSample ?? []).slice(0, 12).join(", ")}
            </div>
            <div style={{ marginTop: ".6rem", color: "var(--muted)" }}>
              Si el año existe pero igual dice “sin datos”, el problema suele ser que la columna <strong>Fecha</strong> no es una fecha real (o viene vacía),
              o que el nombre del hotel en Excel no coincide (ej. “Marriott Buenos Aires” vs “MARRIOTT”).
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: "1rem",
              display: "grid",
              gridTemplateColumns: "minmax(0, 380px) minmax(0, 1fr)",
              gap: "1.25rem",
              alignItems: "start",
            }}
          >
            {/* Total card */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "18px",
                padding: "1.1rem",
                background: "linear-gradient(180deg, rgba(0,0,0,.02), rgba(0,0,0,0))",
              }}
            >
              <div style={{ color: "var(--muted)", fontSize: ".95rem" }}>Total</div>
              <div style={{ fontSize: "3rem", fontWeight: 800, lineHeight: 1.05, marginTop: ".35rem" }}>
                {fmtInt(total)}
              </div>
              <div style={{ marginTop: ".6rem" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: ".35rem",
                    padding: ".35rem .6rem",
                    borderRadius: "999px",
                    fontWeight: 700,
                    border: "1px solid var(--border)",
                    background: deltaTotalPct >= 0 ? "rgba(0,160,90,.10)" : "rgba(220,0,60,.10)",
                    color: deltaTotalPct >= 0 ? "rgb(0,120,70)" : "rgb(160,0,50)",
                  }}
                >
                  {deltaTotalPct >= 0 ? "▲" : "▼"} {deltaTotalPct >= 0 ? "+" : ""}
                  {deltaTotalPct.toFixed(1).replace(".", ",")}% vs {baseYear}
                </span>
              </div>
            </div>

            {/* Bars */}
            <div>
              <div style={{ display: "grid", gap: ".85rem" }}>
                {breakdown.map((x) => {
                  const share = total ? x.v / total : 0;
                  return (
                    <div key={x.k} style={{ display: "grid", gridTemplateColumns: "minmax(0, 260px) 1fr 110px", gap: ".75rem", alignItems: "center" }}>
                      <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>{x.k}</div>

                      <div
                        style={{
                          height: "14px",
                          borderRadius: "999px",
                          background: "rgba(0,0,0,.08)",
                          overflow: "hidden",
                          position: "relative",
                        }}
                        aria-label={`Barra ${x.k}`}
                      >
                        <div
                          style={{
                            width: `${(clamp01(share) * 100).toFixed(2)}%`,
                            height: "100%",
                            borderRadius: "999px",
                            background: "linear-gradient(90deg, rgba(170,0,60,.85), rgba(255,90,90,.85))",
                          }}
                        />
                      </div>

                      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: "1.1rem" }}>
                        {fmtInt(x.v)}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: ".85rem", color: "var(--muted)", fontSize: ".85rem" }}>
                Tip: si querés, puedo sumar un gráfico tipo “torta” (share %) sin librerías externas, usando SVG.
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}


