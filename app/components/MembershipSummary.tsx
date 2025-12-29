"use client";

import React, { useEffect, useMemo, useState } from "react";
import { formatInt } from "./useCsvClient";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  baseYear: number;
  filePath: string;
  hotelFilter: string; // "" => todos
  allowedHotels: string[];
  accent: "jcr" | "maitei";
};

type XlsxRow = Record<string, any>;

const ACC = {
  jcr: { line: "#7b0000", bg: "rgba(165,0,0,0.08)", border: "rgba(165,0,0,0.22)" },
  maitei: { line: "#0066cc", bg: "rgba(0,140,255,0.08)", border: "rgba(0,140,255,0.22)" },
};

function pickKey(keys: string[], candidates: string[]) {
  const low = keys.map((k) => k.toLowerCase());
  for (const c of candidates) {
    const idx = low.indexOf(c.toLowerCase());
    if (idx >= 0) return keys[idx];
  }
  for (const c of candidates) {
    const idx = low.findIndex((k) => k.includes(c.toLowerCase()));
    if (idx >= 0) return keys[idx];
  }
  return "";
}

function parseDateAny(v: any): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export default function MembershipSummary(props: Props) {
  const [rows, setRows] = useState<XlsxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    (async () => {
      try {
        const r = await readXlsxFromPublic(props.filePath);
        if (!alive) return;
        setRows((r.rows ?? []) as XlsxRow[]);
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
  }, [props.filePath]);

  const a = ACC[props.accent];

  const computed = useMemo(() => {
    if (!rows.length) return null;

    const keys = Object.keys(rows[0] ?? {});
    const kHotel = pickKey(keys, ["Empresa", "Hotel"]);
    const kMem = pickKey(keys, ["Bonboy", "Membership", "Membresia", "Membresía"]);
    const kQty = pickKey(keys, ["Cantidad", "Qty", "Count", "Total"]);
    const kFecha = pickKey(keys, ["Fecha", "Date"]);

    const filterRows = (y: number) => {
      const out: XlsxRow[] = [];
      for (const r of rows) {
        const hotel = String(r[kHotel] ?? "").trim();
        if (props.allowedHotels.length && !props.allowedHotels.includes(hotel)) continue;
        if (props.hotelFilter && hotel !== props.hotelFilter) continue;

        const d = parseDateAny(r[kFecha]);
        if (!d || d.getFullYear() !== y) continue;

        out.push(r);
      }
      return out;
    };

    const sumByMembership = (rs: XlsxRow[]) => {
      const map = new Map<string, number>();
      for (const r of rs) {
        const m = String(r[kMem] ?? "Sin clasificar").trim() || "Sin clasificar";
        const q = Number(String(r[kQty] ?? "0").replace(/\./g, "").replace(",", "."));
        map.set(m, (map.get(m) ?? 0) + (isNaN(q) ? 0 : q));
      }
      return map;
    };

    const cur = sumByMembership(filterRows(props.year));
    const total = [...cur.values()].reduce((a, b) => a + b, 0);

    // Top 6
    const items = [...cur.entries()]
      .map(([k, v]) => ({ k, v }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 6);

    return { total, items };
  }, [rows, props.year, props.hotelFilter, props.allowedHotels]);

  if (loading) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Cargando membership…</div>;
  if (err) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Error: {err}</div>;
  if (!computed) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Sin datos.</div>;

  return (
    <div className="card" style={{ padding: "1rem", borderRadius: 18, border: `1px solid ${a.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: "1.2rem" }}>
            Membership (acumulado {props.year})
          </div>
          <div style={{ opacity: 0.85, marginTop: ".25rem" }}>
            Top membresías por volumen.
          </div>
        </div>

        {/* TOTAL MÁS GRANDE */}
        <div style={{ textAlign: "right" }}>
          <div style={{ opacity: 0.8, fontWeight: 850 }}>Total</div>
          <div style={{ fontSize: "2.2rem", fontWeight: 1100, lineHeight: 1 }}>
            {formatInt(computed.total)}
          </div>
        </div>
      </div>

      {/* “Gráfico” simple tipo barras con color del grupo */}
      <div style={{ marginTop: "1rem", display: "grid", gap: ".55rem" }}>
        {computed.items.map((it) => {
          const pct = computed.total ? it.v / computed.total : 0;
          return (
            <div key={it.k} style={{ display: "grid", gap: ".25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem" }}>
                <div style={{ fontWeight: 900 }}>{it.k}</div>
                <div style={{ fontWeight: 1000 }}>{formatInt(it.v)}</div>
              </div>

              <div
                style={{
                  height: 12,
                  borderRadius: 999,
                  background: a.bg,
                  border: `1px solid ${a.border}`,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.max(2, pct * 100)}%`,
                    height: "100%",
                    background: a.line, // color del grupo
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
