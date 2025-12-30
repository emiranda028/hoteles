"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic, XlsxRow } from "./xlsxClient";
import Pill from "./ui/Pill";
import SectionTitle from "./ui/SectionTitle";

/* =========================
   Props
========================= */

type Props = {
  year: number;
  baseYear: number;
  filePath: string;

  /** "" => todos */
  hotelFilter: string;

  /** si lo pasás, limita hoteles válidos (por ej JCR) */
  allowedHotels?: string[];

  /** si querés compacto */
  compactCharts?: boolean;
};

/* =========================
   Helpers
========================= */

function normKey(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[“”"]/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickKey(keys: string[], candidates: string[]): string {
  const K = keys.map((k) => ({ raw: k, n: normKey(k) }));

  // exact
  for (const c of candidates) {
    const cn = normKey(c);
    const hit = K.find((x) => x.n === cn);
    if (hit) return hit.raw;
  }
  // contains
  for (const c of candidates) {
    const cn = normKey(c);
    const hit = K.find((x) => x.n.includes(cn));
    if (hit) return hit.raw;
  }
  return "";
}

function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;

  const s = String(v).trim();
  if (!s) return 0;

  const cleaned = s.replace(/\./g, "").replace(",", ".").replace("%", "").trim();
  const n = Number(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

function parseDateAny(v: any): Date | null {
  if (v === null || v === undefined || v === "") return null;

  // Excel serial date (muy común en XLSX)
  if (typeof v === "number" && isFinite(v)) {
    // Excel: día 1 = 1899-12-31 (con bug 1900), práctica estándar: base 1899-12-30
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const ms = v * 24 * 60 * 60 * 1000;
    const d = new Date(excelEpoch.getTime() + ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (v instanceof Date) return v;

  const s = String(v).trim();
  if (!s) return null;

  // dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    const yy = Number(m1[3]);
    const d = new Date(yy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // fallback Date.parse
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);

  return null;
}


  // dd-mm-yy o dd-mm-yyyy
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m2) {
    const dd = Number(m2[1]);
    const mm = Number(m2[2]);
    let yy = Number(m2[3]);
    if (yy < 100) yy = 2000 + yy;
    const d = new Date(yy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);

  return null;
}

function quarterOfMonth(m: number): 1 | 2 | 3 | 4 {
  if (m <= 2) return 1;
  if (m <= 5) return 2;
  if (m <= 8) return 3;
  return 4;
}

function monthName(m: number): string {
  return ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][m] ?? String(m + 1);
}

function formatInt(n: number): string {
  return Math.round(n).toLocaleString("es-AR");
}

/** Colores por membresía */
function memColor(name: string): string {
  const s = String(name ?? "").toLowerCase();

  // Ajustá si tus nombres vienen distinto:
  if (s.includes("ambassador")) return "#4FA3FF"; // celeste
  if (s.includes("platinum")) return "#C0C0C0"; // plata
  if (s.includes("gold")) return "#D4AF37"; // oro
  if (s.includes("silver")) return "#B0B0B0";
  if (s.includes("titanium")) return "#7A7A7A";
  if (s.includes("member")) return "#8A8A8A";
  if (s.includes("other") || s.includes("otros")) return "#666666";

  return "#8A8A8A";
}

function cardStyle(compact: boolean): React.CSSProperties {
  return {
    padding: compact ? ".85rem" : "1rem",
    borderRadius: 18,
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.12)",
    boxShadow: "0 16px 34px rgba(0,0,0,.18)",
  };
}

/* =========================
   Componente
========================= */

type NormRow = {
  emp: string;
  mem: string;
  qty: number;
  date: Date | null;
  y: number | null;
  m: number | null; // 0..11
  q: 1 | 2 | 3 | 4 | null;
};

export default function MembershipSummary({
  year,
  baseYear,
  filePath,
  hotelFilter,
  allowedHotels = [],
  compactCharts = false,
}: Props) {
  const [rows, setRows] = useState<XlsxRow[]>([]);
  const [sheet, setSheet] = useState<string>("");

  const [det, setDet] = useState<{ kHotel: string; kMem: string; kQty: string; kFecha: string }>({
    kHotel: "",
    kMem: "",
    kQty: "",
    kFecha: "",
  });

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // filtros locales (trimestre y mes)
  const [qFilter, setQFilter] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [mFilter, setMFilter] = useState<number>(-1); // -1 => todos

  /* -------- leer XLSX -------- */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readXlsxFromPublic(filePath)
      .then((r) => {
        if (!alive) return;
        setSheet(r.sheet ?? "");
        setRows((r.rows ?? []) as XlsxRow[]);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message ?? "Error leyendo XLSX");
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  /* -------- detectar columnas -------- */
  useEffect(() => {
    if (!rows.length) return;

    const keys = Object.keys(rows[0] ?? {});

    const kHotel = pickKey(keys, ["Empresa", "Hotel"]);
    const kMem = pickKey(keys, ["Bonboy", "Membership", "Membresia", "Membresía"]);
    const kQty = pickKey(keys, ["Cantidad", "Qty", "Quantity", "Guests", "Pax"]);
    // preferimos Fecha
    const kFecha = pickKey(keys, ["Fecha", "Date"]);

    setDet({ kHotel, kMem, kQty, kFecha });
  }, [rows]);

  /* -------- normalizar filas -------- */
  const normalized: NormRow[] = useMemo(() => {
    if (!rows.length || !det.kMem || !det.kQty) return [];

    return rows.map((r) => {
      const emp = String(r[det.kHotel] ?? "").trim();
      const mem = String(r[det.kMem] ?? "").trim();
      const qty = toNumberSmart(r[det.kQty]);

      const d = det.kFecha ? parseDateAny(r[det.kFecha]) : null;
      const y = d ? d.getFullYear() : null;
      const m = d ? d.getMonth() : null;
      const q = d && m !== null ? quarterOfMonth(m) : null;

      return { emp, mem, qty, date: d, y, m, q };
    });
  }, [rows, det]);

  /* -------- aplicar filtros (hotel exacto + allowedHotels + año + trimestre + mes) -------- */
  const filtered = useMemo(() => {
    const hf = String(hotelFilter ?? "").trim();
    const allowSet = new Set((allowedHotels ?? []).map((x) => String(x).trim()).filter(Boolean));

    return normalized
      .filter((x) => x.mem && x.qty >= 0)
      .filter((x) => (x.y ? x.y === year : false)) // si no hay fecha, NO cuenta
      .filter((x) => {
        if (allowSet.size > 0 && !allowSet.has(x.emp)) return false;
        return true;
      })
      .filter((x) => {
        if (!hf) return true;
        // exacto por Empresa (sin mezclar Sheratons)
        return x.emp === hf;
      })
      .filter((x) => {
        if (qFilter === 0) return true;
        return x.q === qFilter;
      })
      .filter((x) => {
        if (mFilter === -1) return true;
        return x.m === mFilter;
      });
  }, [normalized, year, hotelFilter, allowedHotels, qFilter, mFilter]);

  /* -------- meses disponibles según año (+ trimestre si aplica) -------- */
  const monthsAvailable = useMemo(() => {
    const set = new Set<number>();
    for (const x of normalized) {
      if (x.y !== year) continue;
      if (qFilter !== 0 && x.q !== qFilter) continue;
      if (x.m !== null) set.add(x.m);
    }
    return Array.from(set.values()).sort((a, b) => a - b);
  }, [normalized, year, qFilter]);

  /* -------- totales por membresía -------- */
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const x of filtered) {
      map.set(x.mem, (map.get(x.mem) ?? 0) + x.qty);
    }

    const items = Array.from(map.entries())
      .map(([mem, qty]) => ({ mem, qty }))
      .sort((a, b) => b.qty - a.qty);

    const total = items.reduce((acc, it) => acc + it.qty, 0);

    return { items, total };
  }, [filtered]);

  const title = useMemo(() => {
    const h = hotelFilter ? hotelFilter : "JCR (Todos)";
    const q = qFilter === 0 ? "Todos" : `Q${qFilter}`;
    const m = mFilter === -1 ? "Todos" : monthName(mFilter);
    return `Membership — ${h} · ${year} · ${q} · ${m}`;
  }, [hotelFilter, year, qFilter, mFilter]);

  const tone: "red" | "blue" = String(hotelFilter ?? "").toUpperCase() === "MAITEI" ? "blue" : "red";

  /* =========================
     Renders
  ========================= */

  if (loading) {
    return (
      <div className="card" style={cardStyle(compactCharts)}>
        Cargando Membership…
      </div>
    );
  }

  if (err) {
    return (
      <div className="card" style={cardStyle(compactCharts)}>
        Error Membership: {err}
      </div>
    );
  }

  const debugLine = (
    <div style={{ opacity: 0.7, marginTop: ".6rem", fontSize: ".9rem" }}>
      Sheet: {sheet || "—"} · Detectado: hotel={det.kHotel || "—"} · membership={det.kMem || "—"} · qty={det.kQty || "—"} ·
      fecha={det.kFecha || "—"}
      {allowedHotels?.length ? ` · allowedHotels=${allowedHotels.join(", ")}` : ""}
      {hotelFilter ? ` · filtroHotel=${hotelFilter}` : ""}
    </div>
  );

  return (
    <section className="section" id="membership" style={{ display: "grid", gap: "1rem" }}>
      <SectionTitle
        title={title}
        desc="Barras por membresía (color real por categoría). Filtros: Año / Trimestre / Mes."
        right={
          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
            {/* Trimestres */}
            <Pill tone={tone} active={qFilter === 0} onClick={() => setQFilter(0)}>
              Trimestre · Todos
            </Pill>
            {[1, 2, 3, 4].map((q) => (
              <Pill key={q} tone={tone} active={qFilter === q} onClick={() => setQFilter(q as any)}>
                Q{q}
              </Pill>
            ))}

            <div style={{ width: 10 }} />

            {/* Meses */}
            <Pill
              tone={tone}
              active={mFilter === -1}
              onClick={() => setMFilter(-1)}
              title="Todos los meses dentro del filtro actual"
            >
              Mes · Todos
            </Pill>
            {monthsAvailable.map((m) => (
              <Pill key={m} tone={tone} active={mFilter === m} onClick={() => setMFilter(m)}>
                {monthName(m)}
              </Pill>
            ))}
          </div>
        }
      />

      {/* Total */}
      <div style={{ opacity: 0.85 }}>
        Total:{" "}
        <span style={{ fontSize: "1.8rem", fontWeight: 950, marginLeft: ".35rem" }}>
          {formatInt(totals.total)}
        </span>
        <span style={{ marginLeft: ".5rem", opacity: 0.75 }}>
          (vs {baseYear} listo para agregar después)
        </span>
      </div>

      {/* Contenido */}
      {!totals.items.length ? (
        <div className="card" style={cardStyle(compactCharts)}>
          <div style={{ fontWeight: 950 }}>Sin datos para este filtro.</div>
          <div style={{ opacity: 0.8, marginTop: ".35rem" }}>
            Probá cambiar trimestre/mes, o revisá que el XLSX tenga columna <b>Fecha</b> con año {year}.
          </div>
          {debugLine}
        </div>
      ) : (
        <div className="card" style={cardStyle(compactCharts)}>
          <div style={{ display: "grid", gap: ".6rem" }}>
            {(() => {
              const max = Math.max(...totals.items.map((x) => x.qty), 1);

              return totals.items.map((it) => {
                const w = Math.round((it.qty / max) * 100);
                const color = memColor(it.mem);

                return (
                  <div
                    key={it.mem}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "260px 1fr 90px",
                      gap: ".75rem",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{it.mem}</div>

                    <div style={{ height: 12, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${w}%`,
                          height: "100%",
                          background: color,
                          borderRadius: 999,
                          boxShadow: "0 10px 20px rgba(0,0,0,.18)",
                        }}
                        title={`${it.mem}: ${formatInt(it.qty)}`}
                      />
                    </div>

                    <div style={{ textAlign: "right", fontWeight: 950 }}>{formatInt(it.qty)}</div>
                  </div>
                );
              });
            })()}
          </div>

          {debugLine}
        </div>
      )}
    </section>
  );
}

