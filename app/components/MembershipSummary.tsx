"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Row = Record<string, any>;

export type MembershipHotelFilter = "JCR" | "MARRIOTT" | "SHERATON MDQ" | "SHERATON BCR";

type Props = {
  filePath: string;
  year: number;
  baseYear: number;
  hotelFilter?: MembershipHotelFilter; // NO incluye MAITEI
};

type NormRow = {
  hotel: string;
  membership: string;
  qty: number;
  date: Date | null;
  year: number;
  month: number;
};

const JCR_HOTELS = ["MARRIOTT", "SHERATON MDQ", "SHERATON BCR"] as const;

function normKey(s: any) {
  return String(s ?? "").trim().toLowerCase();
}

function parseNum(x: any) {
  if (typeof x === "number") return x;
  const s = String(x ?? "").trim();
  if (!s) return 0;
  const norm = s.includes(",") && s.includes(".")
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

function parseDateAny(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  // excel numeric date
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(v).trim();
  if (!s) return null;

  const d1 = new Date(s);
  if (!isNaN(d1.getTime())) return d1;

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
  for (let i = 0; i < wanted.length; i++) {
    const w = wanted[i];
    const idx = lower.indexOf(w.toLowerCase());
    if (idx >= 0) return keys[idx];
  }
  return "";
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("es-AR").format(Math.round(n || 0));
}

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

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

        const out: NormRow[] = (rows as Row[]).map((r) => {
          const hotel = String(r[colHotel] ?? "").trim();
          const membership = String(r[colMembership] ?? "").trim();
          const qty = parseNum(r[colQty]);
          const date = parseDateAny(r[colDate]);

          const yy = date ? date.getFullYear() : 0;
          const mm = date ? date.getMonth() + 1 : 0;

          return { hotel, membership, qty, date, year: yy, month: mm };
        });

        setRows(out);
        setLoading(false);
      })
      .catch((e) => {
        if (!ok) return;
        setErr(String(e?.message ?? e));
        setRows([]);
        setLoading(false);
      });

    return () => {
      ok = false;
    };
  }, [filePath]);

  const hotelsToUse = useMemo(() => {
    if (hotelFilter === "JCR") return Array.from(JCR_HOTELS);
    return [hotelFilter];
  }, [hotelFilter]);

  const yearRows = useMemo(() => {
    return rows.filter((r) => r.year === year && hotelsToUse.includes(r.hotel));
  }, [rows, year, hotelsToUse]);

  const baseRows = useMemo(() => {
    return rows.filter((r) => r.year === baseYear && hotelsToUse.includes(r.hotel));
  }, [rows, baseYear, hotelsToUse]);

  const memberships = useMemo(() => {
    const s = new Set<string>();
    for (let i = 0; i < yearRows.length; i++) {
      const m = yearRows[i].membership;
      if (m) s.add(m);
    }
    // fallback: si year no tiene pero base sí
    if (s.size === 0) {
      for (let i = 0; i < baseRows.length; i++) {
        const m = baseRows[i].membership;
        if (m) s.add(m);
      }
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "es"));
  }, [yearRows, baseRows]);

  // matriz meses x membership
  const table = useMemo(() => {
    const byMem = new Map<string, number[]>();
    for (let i = 0; i < memberships.length; i++) byMem.set(memberships[i], new Array(12).fill(0));

    for (let i = 0; i < yearRows.length; i++) {
      const r = yearRows[i];
      const mem = r.membership || "—";
      const m = r.month;
      if (!m || m < 1 || m > 12) continue;
      if (!byMem.has(mem)) byMem.set(mem, new Array(12).fill(0));
      const arr = byMem.get(mem)!;
      arr[m - 1] += r.qty || 0;
    }

    return byMem;
  }, [yearRows, memberships]);

  const totalYear = useMemo(() => {
    let t = 0;
    const vals = Array.from(table.values());
    for (let i = 0; i < vals.length; i++) {
      const arr = vals[i];
      for (let j = 0; j < arr.length; j++) t += arr[j] || 0;
    }
    return t;
  }, [table]);

  const totalBase = useMemo(() => {
    let t = 0;
    for (let i = 0; i < baseRows.length; i++) t += baseRows[i].qty || 0;
    return t;
  }, [baseRows]);

  const composition = useMemo(() => {
    // total por membresía (año)
    const totals = new Map<string, number>();
    const keys = Array.from(table.keys());
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const arr = table.get(k) || [];
      let sum = 0;
      for (let j = 0; j < arr.length; j++) sum += arr[j] || 0;
      totals.set(k, sum);
    }

    const list = Array.from(totals.entries())
      .map(([k, v]) => ({ membership: k, total: v }))
      .sort((a, b) => b.total - a.total);

    return list;
  }, [table]);

  const title =
    hotelFilter === "JCR"
      ? "Membership (JCR)"
      : `Membership (${hotelFilter})`;

  return (
    <div className="msCard">
      <div className="msHead">
        <div>
          <div className="msTitle">{title}</div>
          <div className="msSub">
            Acumulado {year} · vs {baseYear}
          </div>
        </div>

        <div className="msPills">
          <span className="pill">{year}</span>
          <span className="pill ghost">vs {baseYear}</span>
        </div>
      </div>

      {loading ? (
        <div className="msEmpty">Cargando membership…</div>
      ) : err ? (
        <div className="msEmpty">Error: {err}</div>
      ) : yearRows.length === 0 ? (
        <div className="msEmpty">
          Sin datos para {hotelFilter} en {year}. (Archivo: {filePath})
        </div>
      ) : (
        <>
          {/* resumen */}
          <div className="msTop">
            <div className="msKpi">
              <div className="msKLabel">Total</div>
              <div className="msKValue">{fmtInt(totalYear)}</div>
              <div className="msKNote">
                {totalBase > 0 ? `${Math.round(((totalYear - totalBase) / totalBase) * 100)}% vs ${baseYear}` : `Sin base ${baseYear}`}
              </div>
            </div>

            <div className="msKpi">
              <div className="msKLabel">Hoteles</div>
              <div className="msKValue">{hotelFilter === "JCR" ? "3" : "1"}</div>
              <div className="msKNote">{hotelFilter === "JCR" ? "Marriott + Sheratons" : "Filtro hotel"}</div>
            </div>

            <div className="msKpi">
              <div className="msKLabel">Membresías</div>
              <div className="msKValue">{fmtInt(memberships.length)}</div>
              <div className="msKNote">Tipos detectados</div>
            </div>
          </div>

          {/* tabla mensual */}
          <div className="msTableWrap">
            <table className="msTable">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Año</th>
                  {MONTHS_ES.map((m) => (
                    <th key={m}>{m}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((mem) => {
                  const arr = table.get(mem) || new Array(12).fill(0);
                  let sum = 0;
                  for (let i = 0; i < arr.length; i++) sum += arr[i] || 0;
                  return (
                    <tr key={mem}>
                      <td style={{ textAlign: "left", fontWeight: 900 }}>{mem}</td>
                      {arr.map((v, i) => (
                        <td key={i}>{v ? fmtInt(v) : "0"}</td>
                      ))}
                      <td style={{ fontWeight: 950 }}>{fmtInt(sum)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* composición (mini charts) */}
          <div className="msCharts">
            <div className="msChartCard">
              <div className="msChartTitle">Composición</div>
              <div className="msBars">
                {composition.slice(0, 8).map((x) => {
                  const pct = totalYear > 0 ? (x.total / totalYear) * 100 : 0;
                  return (
                    <div key={x.membership} className="barRow">
                      <div className="barLabel">{x.membership}</div>
                      <div className="barTrack">
                        <div className="barFill" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="barVal">{Math.round(pct)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="msChartCard">
              <div className="msChartTitle">Top 5 (totales)</div>
              <div className="msTopList">
                {composition.slice(0, 5).map((x, idx) => (
                  <div key={x.membership} className="topItem">
                    <div className="topIdx">{idx + 1}</div>
                    <div className="topName">{x.membership}</div>
                    <div className="topVal">{fmtInt(x.total)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .msCard{
          border-radius:22px;
          padding:16px;
          background:rgba(255,255,255,.05);
          border:1px solid rgba(255,255,255,.08);
        }
        .msHead{
          display:flex;
          justify-content:space-between;
          gap:12px;
          flex-wrap:wrap;
          align-items:flex-end;
          margin-bottom:12px;
        }
        .msTitle{ font-weight:950; font-size:1.15rem; }
        .msSub{ opacity:.8; margin-top:2px; font-size:.92rem; }
        .msPills{ display:flex; gap:8px; flex-wrap:wrap; }
        .pill{
          font-size:.85rem;
          font-weight:850;
          padding:6px 10px;
          border-radius:999px;
          background:rgba(255,255,255,.10);
          border:1px solid rgba(255,255,255,.12);
        }
        .pill.ghost{ background:transparent; }

        .msEmpty{ opacity:.85; padding:10px 2px; }

        .msTop{
          display:grid;
          grid-template-columns: repeat(3, minmax(0,1fr));
          gap:10px;
          margin-bottom:12px;
        }
        .msKpi{
          border-radius:18px;
          padding:12px;
          background:rgba(0,0,0,.20);
          border:1px solid rgba(255,255,255,.08);
        }
        .msKLabel{ font-weight:900; opacity:.82; font-size:.9rem; }
        .msKValue{ font-weight:950; font-size:1.25rem; margin-top:6px; }
        .msKNote{ opacity:.78; font-size:.85rem; margin-top:6px; }

        .msTableWrap{
          overflow:auto;
          border-radius:16px;
          border:1px solid rgba(255,255,255,.08);
          background:rgba(0,0,0,.18);
        }
        .msTable{
          width:100%;
          border-collapse:collapse;
          font-size:.88rem;
          min-width:720px;
        }
        .msTable th, .msTable td{
          padding:10px 10px;
          border-bottom:1px solid rgba(255,255,255,.06);
          text-align:right;
          white-space:nowrap;
        }
        .msTable thead th{
          position:sticky;
          top:0;
          background:rgba(0,0,0,.45);
          backdrop-filter: blur(10px);
          font-weight:950;
        }

        .msCharts{
          margin-top:12px;
          display:grid;
          grid-template-columns: minmax(0,1.4fr) minmax(0,.9fr);
          gap:12px;
        }
        .msChartCard{
          border-radius:18px;
          padding:12px;
          background:rgba(0,0,0,.20);
          border:1px solid rgba(255,255,255,.08);
        }
        .msChartTitle{
          font-weight:950;
          margin-bottom:10px;
          opacity:.9;
        }

        .barRow{
          display:grid;
          grid-template-columns: 160px 1fr 46px;
          gap:8px;
          align-items:center;
          margin:8px 0;
        }
        .barLabel{
          font-weight:850;
          font-size:.86rem;
          opacity:.9;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .barTrack{
          height:10px;
          border-radius:999px;
          background:rgba(255,255,255,.08);
          overflow:hidden;
        }
        .barFill{
          height:100%;
          border-radius:999px;
          background:linear-gradient(90deg, rgba(94,232,255,.9), rgba(210,160,255,.9));
        }
        .barVal{ font-weight:900; font-size:.86rem; opacity:.9; text-align:right; }

        .msTopList{ display:grid; gap:8px; }
        .topItem{
          display:grid;
          grid-template-columns: 28px 1fr auto;
          gap:10px;
          align-items:center;
          padding:10px 10px;
          border-radius:14px;
          background:rgba(255,255,255,.05);
          border:1px solid rgba(255,255,255,.06);
        }
        .topIdx{ font-weight:950; opacity:.9; }
        .topName{ font-weight:900; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .topVal{ font-weight:950; }

        @media (max-width: 980px){
          .msTop{ grid-template-columns: 1fr; }
          .msCharts{ grid-template-columns: 1fr; }
          .barRow{ grid-template-columns: 140px 1fr 44px; }
        }
        @media (max-width: 520px){
          .barRow{ grid-template-columns: 120px 1fr 40px; }
          .msTitle{ font-size:1.05rem; }
        }
      `}</style>
    </div>
  );
}
