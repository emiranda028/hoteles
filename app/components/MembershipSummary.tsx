"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic, XlsxRow } from "./xlsxClient";

type MonthFilter = "ALL" | number; // 1..12

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

  /** filtro opcional por mes (1..12) */
  monthFilter?: MonthFilter;
};

function norm(s: any): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function pickKey(keys: string[], candidates: string[]): string {
  const K = keys.map((k) => ({ raw: k, n: norm(k).replace(/\./g, "") }));

  for (const c of candidates) {
    const cn = norm(c).replace(/\./g, "");
    const hit = K.find((x) => x.n === cn);
    if (hit) return hit.raw;
  }
  for (const c of candidates) {
    const cn = norm(c).replace(/\./g, "");
    const hit = K.find((x) => x.n.includes(cn));
    if (hit) return hit.raw;
  }
  return "";
}

function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number" && isFinite(v)) return v;

  const s = String(v).trim();
  if (!s) return 0;

  const cleaned = s
    .replace(/\./g, "")
    .replace(",", ".")
    .replace("%", "")
    .replace(/\s+/g, "")
    .trim();

  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Fecha robusta:
 * - Date
 * - número Excel (serial)
 * - dd/mm/yyyy o d/m/yy
 * - yyyy-mm-dd
 * - parse genérico
 */
function parseDateAny(v: any): Date | null {
  if (v === null || v === undefined || v === "") return null;

  if (v instanceof Date && !isNaN(v.getTime())) return v;

  // Excel serial (muy común en xlsx)
  if (typeof v === "number" && isFinite(v)) {
    // 25569 = días entre 1899-12-30 y 1970-01-01
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(v).trim();
  if (!s) return null;

  // dd/mm/yyyy o d/m/yyyy o dd-mm-yyyy
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    let yy = Number(m1[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // yyyy-mm-dd (ISO)
  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

function memColor(name: string): string {
  const s = norm(name);

  // Ajustá si tus nombres vienen distintos
  if (s.includes("gold")) return "#D4AF37"; // oro
  if (s.includes("platinum")) return "#C0C0C0"; // plata
  if (s.includes("silver")) return "#B0B0B0";
  if (s.includes("titanium")) return "#7A7A7A";
  if (s.includes("ambassador")) return "#4FA3FF"; // celeste
  if (s.includes("member")) return "#8A8A8A";
  if (s.includes("other") || s.includes("otros")) return "#666";
  return "#888";
}

function formatInt(n: number): string {
  return Math.round(n).toLocaleString("es-AR");
}

export default function MembershipSummary({
  year,
  baseYear,
  filePath,
  hotelFilter,
  allowedHotels = [],
  compactCharts = false,
  monthFilter = "ALL",
}: Props) {
  const [rows, setRows] = useState<XlsxRow[]>([]);
  const [sheet, setSheet] = useState<string>("");

  const [keysDetected, setKeysDetected] = useState<{
    kHotel: string;
    kMem: string;
    kQty: string;
    kFecha: string;
  }>({ kHotel: "", kMem: "", kQty: "", kFecha: "" });

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

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

  useEffect(() => {
    if (!rows.length) return;

    const keys = Object.keys(rows[0] ?? {});
    const kHotel = pickKey(keys, ["Empresa", "Hotel"]);
    const kMem = pickKey(keys, ["Bonboy", "Membership", "Membresia", "Membresía"]);
    const kQty = pickKey(keys, ["Cantidad", "Qty", "Quantity", "Guests", "Pax"]);
    const kFecha = pickKey(keys, ["Fecha", "Date"]);

    setKeysDetected({ kHotel, kMem, kQty, kFecha });
  }, [rows]);

  const filtered = useMemo(() => {
    const { kHotel, kMem, kQty, kFecha } = keysDetected;
    if (!rows.length || !kMem || !kQty || !kFecha || !kHotel) return [];

    const hf = norm(hotelFilter);
    const allowSet = new Set((allowedHotels ?? []).map(norm).filter(Boolean));

    return rows
      .map((r) => {
        const empRaw = r[kHotel];
        const memRaw = r[kMem];
        const qtyRaw = r[kQty];
        const dateRaw = r[kFecha];

        const emp = String(empRaw ?? "").trim();
        const mem = String(memRaw ?? "").trim();
        const qty = toNumberSmart(qtyRaw);

        const d = parseDateAny(dateRaw);
        const yy = d ? d.getFullYear() : null;
        const mm = d ? d.getMonth() + 1 : null;

        return { emp, empN: norm(emp), mem, memN: norm(mem), qty, yy, mm };
      })
      .filter((x) => x.memN && x.qty >= 0)
      // ✅ Año: si no hay fecha válida, NO cuenta
      .filter((x) => x.yy === year)
      // ✅ Mes opcional
      .filter((x) => (monthFilter === "ALL" ? true : x.mm === monthFilter))
      // ✅ allowedHotels: si está definido, solo esos
      .filter((x) => (allowSet.size > 0 ? allowSet.has(x.empN) : true))
      // ✅ hotelFilter exacto, sin mezclar Sheratons
      .filter((x) => (!hf ? true : x.empN === hf));
  }, [rows, keysDetected, year, monthFilter, hotelFilter, allowedHotels]);

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
    const m = monthFilter === "ALL" ? "" : ` · mes ${String(monthFilter).padStart(2, "0")}`;
    return `Membership — ${h} · ${year}${m} (acumulado)`;
  }, [hotelFilter, year, monthFilter]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Cargando Membership…
      </div>
    );
  }

  if (err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Error Membership: {err}
      </div>
    );
  }

  if (!totals.items.length) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 950 }}>{title}</div>
        <div style={{ opacity: 0.8, marginTop: ".35rem" }}>
          Sin datos para {year} con el filtro actual.
        </div>
        <div style={{ opacity: 0.7, marginTop: ".5rem", fontSize: ".9rem" }}>
          Sheet: {sheet || "—"} · Detectado: hotel={keysDetected.kHotel || "—"} · membership={keysDetected.kMem || "—"} ·
          qty={keysDetected.kQty || "—"} · fecha={keysDetected.kFecha || "—"}
        </div>
      </div>
    );
  }

  const max = Math.max(...totals.items.map((x) => x.qty), 1);

  return (
    <section className="section" id="membership">
      <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
        {title}
      </div>

      <div className="sectionDesc" style={{ marginTop: ".35rem", opacity: 0.85 }}>
        Total:{" "}
        <span style={{ fontSize: "1.8rem", fontWeight: 950, marginLeft: ".35rem" }}>
          {formatInt(totals.total)}
        </span>
      </div>

      <div
        className="card"
        style={{
          padding: compactCharts ? ".85rem" : "1rem",
          borderRadius: 18,
          marginTop: ".85rem",
        }}
      >
        <div style={{ display: "grid", gap: ".55rem" }}>
          {totals.items.map((it) => {
            const w = Math.round((it.qty / max) * 100);
            const color = memColor(it.mem);

            return (
              <div
                key={it.mem}
                style={{
                  display: "grid",
                  gridTemplateColumns: "220px 1fr 90px",
                  gap: ".75rem",
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 850 }}>{it.mem}</div>

                <div
                  style={{
                    height: 12,
                    borderRadius: 999,
                    background: "rgba(255,255,255,.10)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${w}%`,
                      height: "100%",
                      background: color,
                      borderRadius: 999,
                    }}
                    title={`${it.mem}: ${formatInt(it.qty)}`}
                  />
                </div>

                <div style={{ textAlign: "right", fontWeight: 900 }}>
                  {formatInt(it.qty)}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ opacity: 0.7, marginTop: ".75rem", fontSize: ".9rem" }}>
          Sheet: {sheet || "—"} · Detectado: hotel={keysDetected.kHotel || "—"} · membership={keysDetected.kMem || "—"} ·
          qty={keysDetected.kQty || "—"} · fecha={keysDetected.kFecha || "—"}
          {allowedHotels?.length ? ` · allowedHotels=${allowedHotels.join(", ")}` : ""}
          {hotelFilter ? ` · filtroHotel=${hotelFilter}` : ""}
          {monthFilter === "ALL" ? "" : ` · filtroMes=${monthFilter}`}
        </div>

        <div style={{ opacity: 0.65, marginTop: ".35rem", fontSize: ".85rem" }}>
          (Comparativa vs {baseYear} lista para agregar luego, manteniendo esta base estable.)
        </div>
      </div>
    </section>
  );
}
