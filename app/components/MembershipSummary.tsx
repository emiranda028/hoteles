"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Row = Record<string, any>;

export type MembershipHotelFilter = "JCR" | "MARRIOTT" | "SHERATON MDQ" | "SHERATON BCR";

type Props = {
  filePath: string;
  year: number;
  baseYear: number;
  hotelFilter?: MembershipHotelFilter; // membership NO usa Maitei
};

type NormRow = {
  hotel: string;
  membership: string;
  qty: number;
  date: Date | null;
  year: number;
  month: number; // 1-12
};

const JCR_HOTELS = ["MARRIOTT", "SHERATON MDQ", "SHERATON BCR"] as const;

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function parseNum(x: any) {
  if (typeof x === "number") return x;
  const s = String(x ?? "").trim();
  if (!s) return 0;

  // soporta "1.234,56" y "1234.56"
  const norm =
    s.includes(",") && s.includes(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(",", ".");

  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

function parseDateAny(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  // Excel date serial
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(v).trim();
  if (!s) return null;

  // ISO / parseable
  const d1 = new Date(s);
  if (!isNaN(d1.getTime())) return d1;

  // dd/mm/yyyy o dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    const d2 = new Date(yy, mm - 1, dd);
    return isNaN(d2.getTime()) ? null : d2;
  }

  return null;
}

function pickColumn(keys: string[], wanted: string[]) {
  const lower = keys.map((k) => k.toLowerCase());

  // match exact
  for (const w0 of wanted) {
    const w = w0.toLowerCase();
    const idx = lower.indexOf(w);
    if (idx >= 0) return keys[idx];
  }

  // contains
  for (const w0 of wanted) {
    const w = w0.toLowerCase();
    for (let j = 0; j < keys.length; j++) {
      if (keys[j].toLowerCase().includes(w)) return keys[j];
    }
  }

  return "";
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("es-AR").format(Math.round(n || 0));
}

function safeUpper(s: string) {
  return String(s ?? "").trim().toUpperCase();
}

export default function MembershipSummary({ filePath, year, baseYear, hotelFilter = "JCR" }: Props) {
  const [rows, setRows] = useState<NormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let ok = true;
    setLoading(true);
    setErr("");

    readXlsxFromPublic(filePath)
      .then(({ rows }) => {
        if (!ok) return;

        const first = rows?.[0] ?? {};
        const keys = Object.keys(first);

        const colHotel = pickColumn(keys, ["empresa", "hotel"]);
        const colMembership = pickColumn(keys, ["bonboy", "membership", "membresia", "membresía"]);
        const colQty = pickColumn(keys, ["cantidad", "qty", "quantity"]);
        const colDate = pickColumn(keys, ["fecha", "date"]);

        if (!colHotel || !colMembership || !colQty || !colDate) {
          setRows([]);
          setErr(
            `Headers no detectados. Detectado: hotel=${colHotel || "—"} · membership=${
              colMembership || "—"
            } · qty=${colQty || "—"} · fecha=${colDate || "—"}`
          );
          setLoading(false);
          return;
        }

        const out: NormRow[] = (rows as Row[]).map((r) => {
          const hotel = safeUpper(r[colHotel]);
          const membership = String(r[colMembership] ?? "").trim();
          const qty = parseNum(r[colQty]);
          const date = parseDateAny(r[colDate]);

          const yy = date ? date.getFullYear() : 0;
          const mm = date ? date.getMonth() + 1 : 0;

          return {
            hotel,
            membership,
            qty,
            date,
            year: yy,
            month: mm,
          };
        });

        // limpiamos filas vacías
        const cleaned = out.filter((r) => r.hotel && r.membership && r.qty > 0 && r.year > 0 && r.month >= 1 && r.month <= 12);

        setRows(cleaned);
        setLoading(false);
      })
      .catch((e) => {
        if (!ok) return;
        setErr(e?.message || String(e));
        setRows([]);
        setLoading(false);
      });

    return () => {
      ok = false;
    };
  }, [filePath]);

  // hoteles a usar (IMPORTANTE: string[] para evitar el error de TypeScript)
  const hotelsToUse: string[] = useMemo(() => {
    if (hotelFilter === "JCR") return [...JCR_HOTELS];
    return [hotelFilter];
  }, [hotelFilter]);

  const yearRows = useMemo(() => {
    return rows.filter((r) => r.year === year && hotelsToUse.includes(r.hotel));
  }, [rows, year, hotelsToUse]);

  const baseRows = useMemo(() => {
    return rows.filter((r) => r.year === baseYear && hotelsToUse.includes(r.hotel));
  }, [rows, baseYear, hotelsToUse]);

  const yearsAvail = useMemo(() => {
    const set: Record<string, boolean> = {};
    for (let i = 0; i < rows.length; i++) {
      const y = rows[i].year;
      if (y) set[String(y)] = true;
    }
    return Object.keys(set)
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
  }, [rows]);

  const totalYear = useMemo(() => yearRows.reduce((a, r) => a + (r.qty || 0), 0), [yearRows]);
  const totalBase = useMemo(() => baseRows.reduce((a, r) => a + (r.qty || 0), 0), [baseRows]);

  const byMonth = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => 0);
    for (let i = 0; i < yearRows.length; i++) {
      const m = yearRows[i].month;
      if (m >= 1 && m <= 12) arr[m - 1] += yearRows[i].qty || 0;
    }
    return arr;
  }, [yearRows]);

  const byMembership = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 0; i < yearRows.length; i++) {
      const k = yearRows[i].membership || "—";
      map[k] = (map[k] || 0) + (yearRows[i].qty || 0);
    }
    return Object.entries(map)
      .map(([k, v]) => ({ k, v }))
      .sort((a, b) => b.v - a.v);
  }, [yearRows]);

  const delta = useMemo(() => {
    if (!totalBase) return null;
    return totalYear - totalBase;
  }, [totalYear, totalBase]);

  const pct = useMemo(() => {
    if (!totalBase) return null;
    return (totalYear / totalBase - 1) * 100;
  }, [totalYear, totalBase]);

  // ===== Render =====
  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Cargando membership…
      </div>
    );
  }

  if (err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Membership ({hotelFilter})</div>
        <div style={{ opacity: 0.85 }}>{err}</div>
        <div style={{ marginTop: 8, opacity: 0.85 }}>
          Años disponibles: {yearsAvail.length ? yearsAvail.join(", ") : "—"}
        </div>
      </div>
    );
  }

  if (!yearRows.length) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Membership ({hotelFilter})</div>
        <div style={{ opacity: 0.9 }}>Sin datos para {hotelFilter} en {year}.</div>
        <div style={{ marginTop: 8, opacity: 0.85 }}>
          Años disponibles: {yearsAvail.length ? yearsAvail.join(", ") : "—"}
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>
            Membership ({hotelFilter}) — Acumulado {year} · vs {baseYear}
          </div>
          <div style={{ opacity: 0.8, marginTop: 4 }}>
            Hoteles incluidos: {hotelsToUse.join(" · ")}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "1.35rem", fontWeight: 950 }}>{fmtInt(totalYear)}</div>
          <div style={{ opacity: 0.85 }}>
            {totalBase ? (
              <>
                {delta !== null ? (delta >= 0 ? "+" : "") + fmtInt(delta) : "—"}{" "}
                {pct !== null ? `(${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)` : ""}
              </>
            ) : (
              <>Sin base {baseYear}</>
            )}
          </div>
        </div>
      </div>

      {/* Mini tabla mensual */}
      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 900, opacity: 0.9 }}>Año</th>
              {MONTHS_ES.map((m) => (
                <th key={m} style={{ textAlign: "right", padding: "10px 8px", fontWeight: 900, opacity: 0.9 }}>
                  {m}
                </th>
              ))}
              <th style={{ textAlign: "right", padding: "10px 8px", fontWeight: 900, opacity: 0.9 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: "10px 8px", fontWeight: 900 }}>{year}</td>
              {byMonth.map((v, idx) => (
                <td key={idx} style={{ padding: "10px 8px", textAlign: "right" }}>
                  {fmtInt(v)}
                </td>
              ))}
              <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 900 }}>{fmtInt(totalYear)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Composición: barras simples (responsive) */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Composición</div>

        <div style={{ display: "grid", gap: 10 }}>
          {byMembership.slice(0, 12).map((it) => {
            const pct = totalYear ? (it.v / totalYear) * 100 : 0;
            return (
              <div key={it.k} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 220px) 1fr auto", gap: 10, alignItems: "center" }}>
                <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.k}
                </div>
                <div style={{ background: "rgba(255,255,255,.08)", borderRadius: 999, height: 10, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(2, pct)}%`, height: "100%", background: "var(--primary)" }} />
                </div>
                <div style={{ fontVariantNumeric: "tabular-nums", opacity: 0.9 }}>{fmtInt(it.v)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
