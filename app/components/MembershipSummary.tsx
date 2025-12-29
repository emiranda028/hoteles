"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type XlsxRow = Record<string, any>;

export type MembershipSummaryProps = {
  year: number;
  baseYear: number;
  filePath: string;

  /** "" => todos (pero respetando allowedHotels si viene) */
  hotelFilter?: string;

  /** Si viene, limita universo de hoteles (por Empresa) */
  allowedHotels?: string[];

  /** Solo estético */
  compactCharts?: boolean;
};

function pickKey(keys: string[], candidates: string[]) {
  const norm = (s: string) => s.trim().toLowerCase();
  const map = new Map(keys.map((k) => [norm(k), k]));
  for (const c of candidates) {
    const hit = map.get(norm(c));
    if (hit) return hit;
  }
  // fallback: contiene
  for (const c of candidates) {
    const cN = norm(c);
    const hit = keys.find((k) => norm(k).includes(cN));
    if (hit) return hit;
  }
  return "";
}

/** Excel serial date -> JS Date (UTC base 1899-12-30) */
function excelSerialToDate(n: number): Date {
  const utc = Date.UTC(1899, 11, 30) + Math.round(n) * 86400000;
  return new Date(utc);
}

function parseAnyDate(v: any): Date | null {
  if (v === null || v === undefined || v === "") return null;

  // already Date
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  // excel serial
  if (typeof v === "number" && isFinite(v) && v > 1000) {
    const d = excelSerialToDate(v);
    return isNaN(d.getTime()) ? null : d;
  }

  // string
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;

    // yyyy-mm-dd
    const iso = new Date(s);
    if (!isNaN(iso.getTime())) return iso;

    // dd/mm/yyyy or d/m/yyyy
    const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m1) {
      const dd = Number(m1[1]);
      const mm = Number(m1[2]);
      let yy = Number(m1[3]);
      if (yy < 100) yy += 2000;
      const d = new Date(yy, mm - 1, dd);
      return isNaN(d.getTime()) ? null : d;
    }

    // dd-mm-yy with text day (rare)
    // fallback: try Date again
    const d2 = new Date(s);
    return isNaN(d2.getTime()) ? null : d2;
  }

  return null;
}

function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const cleaned = v
      .replace(/\./g, "")
      .replace(",", ".")
      .replace("%", "")
      .trim();
    const n = Number(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function formatInt(n: number): string {
  return Math.round(n).toLocaleString("es-AR");
}

function cardStyle(radius = 18): React.CSSProperties {
  return {
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.12)",
    borderRadius: radius,
    padding: "1rem",
    backdropFilter: "blur(6px)",
  };
}

export default function MembershipSummary(props: MembershipSummaryProps) {
  const { year, baseYear, filePath, hotelFilter = "", allowedHotels = [], compactCharts = false } = props;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<XlsxRow[]>([]);
  const [detected, setDetected] = useState<{ sheet?: string; hotel?: string; mem?: string; qty?: string; fecha?: string }>({});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    (async () => {
      try {
        const r = await readXlsxFromPublic(filePath);
        // r: { sheet: string; rows: XlsxRow[] }
        const sheet = (r as any)?.sheet ?? "";
        const data: XlsxRow[] = ((r as any)?.rows ?? []) as XlsxRow[];

        const keys = Object.keys(data?.[0] ?? {});
        const kHotel = pickKey(keys, ["Empresa", "Hotel"]);
        const kMem = pickKey(keys, ["Bonboy", "Membership", "Membresia", "Membresía"]);
        const kQty = pickKey(keys, ["Cantidad", "Qty", "Count", "Total", "Rooms", "Huéspedes", "Huespedes"]);
        const kFecha = pickKey(keys, ["Fecha", "Date", "Día", "Dia"]);

        if (!alive) return;

        setDetected({ sheet, hotel: kHotel, mem: kMem, qty: kQty, fecha: kFecha });
        setRows(data);
        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "Error leyendo XLSX");
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [filePath]);

  const filtered = useMemo(() => {
    const kHotel = detected.hotel || "Empresa";
    const kMem = detected.mem || "Bonboy";
    const kQty = detected.qty || "Cantidad";
    const kFecha = detected.fecha || "Fecha";

    const allowedSet = new Set((allowedHotels || []).filter(Boolean));
    const mustRestrictToAllowed = allowedSet.size > 0;

    const out = (rows || []).filter((r) => {
      const empresa = String(r?.[kHotel] ?? "").trim();
      if (!empresa) return false;

      // universo permitido (JCR)
      if (mustRestrictToAllowed && !allowedSet.has(empresa)) return false;

      // filtro hotel exacto (no mezclar Sheratons)
      if (hotelFilter && empresa !== hotelFilter) return false;

      // año
      const d = parseAnyDate(r?.[kFecha]);
      const y = d ? d.getFullYear() : NaN;
      if (!Number.isFinite(y)) return false;
      if (y !== year) return false;

      // debe existir membership
      const mem = String(r?.[kMem] ?? "").trim();
      if (!mem) return false;

      // cantidad > 0 (si está)
      const qty = toNumberSmart(r?.[kQty]);
      if (qty <= 0) return false;

      return true;
    });

    return out;
  }, [rows, detected, hotelFilter, allowedHotels, year]);

  const summary = useMemo(() => {
    const kMem = detected.mem || "Bonboy";
    const kQty = detected.qty || "Cantidad";

    const map = new Map<string, number>();
    for (const r of filtered) {
      const mem = String(r?.[kMem] ?? "").trim();
      const qty = toNumberSmart(r?.[kQty]);
      map.set(mem, (map.get(mem) ?? 0) + qty);
    }

    const items = Array.from(map.entries())
      .map(([membership, qty]) => ({ membership, qty }))
      .sort((a, b) => b.qty - a.qty);

    const total = items.reduce((acc, it) => acc + it.qty, 0);

    return { items, total };
  }, [filtered, detected]);

  const title = `Membership (JCR) — Acumulado ${year} · vs ${baseYear}`;

  if (loading) {
    return <div style={cardStyle(22)}>Cargando membership…</div>;
  }

  if (err) {
    return (
      <div style={cardStyle(22)}>
        <b>{title}</b>
        <div style={{ marginTop: ".5rem" }}>Error: {err}</div>
        <div style={{ marginTop: ".5rem", opacity: 0.85, fontSize: ".92rem" }}>
          Sheet: {detected.sheet ?? "·"} · Detectado: hotel={detected.hotel ?? "·"} · membership={detected.mem ?? "·"} · qty=
          {detected.qty ?? "·"} · fecha={detected.fecha ?? "·"}
        </div>
      </div>
    );
  }

  if (!summary.items.length) {
    return (
      <div style={cardStyle(22)}>
        <b>{title}</b>
        <div style={{ marginTop: ".5rem" }}>
          Sin datos para <b>{year}</b>
          {hotelFilter ? (
            <>
              {" "}
              en <b>{hotelFilter}</b>
            </>
          ) : null}
          .
        </div>
        <div style={{ marginTop: ".5rem", opacity: 0.85, fontSize: ".92rem" }}>
          Sheet: {detected.sheet ?? "·"} · Detectado: hotel={detected.hotel ?? "·"} · membership={detected.mem ?? "·"} · qty=
          {detected.qty ?? "·"} · fecha={detected.fecha ?? "·"}
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle(22)}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ fontSize: "1.1rem", fontWeight: 950 }}>{title}</div>
        <div style={{ opacity: 0.85 }}>
          Total: <b>{formatInt(summary.total)}</b>
        </div>
      </div>

      <div style={{ marginTop: ".45rem", opacity: 0.82, fontSize: ".92rem" }}>
        Sheet: {detected.sheet ?? "·"} · Detectado: hotel={detected.hotel ?? "·"} · membership={detected.mem ?? "·"} · qty=
        {detected.qty ?? "·"} · fecha={detected.fecha ?? "·"}
      </div>

      <div style={{ marginTop: ".9rem", display: "grid", gap: ".5rem" }}>
        {summary.items.slice(0, compactCharts ? 6 : 12).map((it) => {
          const pct = summary.total ? it.qty / summary.total : 0;
          return (
            <div
              key={it.membership}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: ".75rem",
                alignItems: "center",
                padding: ".6rem .75rem",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,.12)",
                background: "rgba(0,0,0,.18)",
              }}
            >
              <div style={{ display: "grid", gap: ".35rem" }}>
                <div style={{ fontWeight: 900 }}>{it.membership}</div>
                <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(pct * 100)}%`, height: "100%", background: "rgba(255,255,255,.40)" }} />
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 950 }}>{formatInt(it.qty)}</div>
                <div style={{ opacity: 0.8, fontSize: ".9rem" }}>{(pct * 100).toFixed(1)}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
