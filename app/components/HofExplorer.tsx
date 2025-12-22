"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic, CsvRow, toNumberSmart, formatMoney } from "./csvClient";

type GlobalHotel = "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

type Props = {
  filePath: string;
  year: number;
  hotel: GlobalHotel;
  limit?: number;
};

function norm(s: string) {
  return (s || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function resolveCol(columns: string[], mustInclude: string[]): string | null {
  const cols = columns.map((c) => ({ raw: c, n: norm(c) }));
  const want = mustInclude.map(norm);
  for (const c of cols) {
    let ok = true;
    for (const w of want) if (!c.n.includes(w)) ok = false;
    if (ok) return c.raw;
  }
  return null;
}

function hotelsForFilter(h: GlobalHotel): string[] {
  if (h === "JCR") return ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
  return [h];
}

export default function HofExplorer({ filePath, year, hotel, limit = 60 }: Props) {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readCsvFromPublic(filePath)
      .then(({ rows, columns }) => {
        if (!alive) return;
        setRows(rows);
        setCols(columns);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(String(e?.message || e));
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  const view = useMemo(() => {
    if (!rows.length || !cols.length) return { cols: [], rows: [] as CsvRow[] };

    const colEmpresa = resolveCol(cols, ["EMPRESA"]) || "Empresa";
    const colFecha = resolveCol(cols, ["FECHA"]) || "Fecha";
    const colOcc = resolveCol(cols, ["TOTAL", "OCC"]) || "Total\nOcc.";
    const colOccPct = resolveCol(cols, ["OCC.%"]) || "Occ.%";
    const colRev = resolveCol(cols, ["ROOM REVENUE"]) || "Room Revenue";
    const colAdr = resolveCol(cols, ["AVERAGE RATE"]) || "Average Rate";

    const allowed = new Set(hotelsForFilter(hotel));

    const filtered = rows
      .filter((r) => {
        const emp = (r[colEmpresa] || "").trim().toUpperCase();
        if (!allowed.has(emp)) return false;

        const f = (r[colFecha] || "").trim();
        const m = f.match(/\/(\d{4})$/) || f.match(/^(\d{4})-/);
        const y = m ? Number(m[1]) : NaN;
        return y === year;
      })
      .slice(0, Math.max(10, limit));

    return {
      cols: [colFecha, colEmpresa, colOcc, colOccPct, colAdr, colRev],
      rows: filtered,
      keyCols: { colFecha, colEmpresa, colOcc, colOccPct, colAdr, colRev },
    };
  }, [rows, cols, year, hotel, limit]);

  if (loading) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Cargando detalle diario…</div>;
  if (err) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Error: {err}</div>;
  if (!view.rows.length) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Sin filas H&F para {hotel} en {year}.</div>;

  const { colFecha, colEmpresa, colOcc, colOccPct, colAdr, colRev } = (view as any).keyCols;

  return (
    <div className="card" style={{ padding: "1rem", borderRadius: 18, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
        <thead>
          <tr style={{ textAlign: "left", opacity: 0.8 }}>
            <th style={{ padding: ".6rem .5rem" }}>Fecha</th>
            <th style={{ padding: ".6rem .5rem" }}>Empresa</th>
            <th style={{ padding: ".6rem .5rem" }}>Total Occ</th>
            <th style={{ padding: ".6rem .5rem" }}>Occ.%</th>
            <th style={{ padding: ".6rem .5rem" }}>ADR</th>
            <th style={{ padding: ".6rem .5rem" }}>Room Revenue</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((r, idx) => {
            const rev = toNumberSmart(r[colRev]);
            const adr = toNumberSmart(r[colAdr]);
            const occ = toNumberSmart(r[colOcc]);
            return (
              <tr key={idx} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                <td style={{ padding: ".55rem .5rem", whiteSpace: "nowrap" }}>{r[colFecha]}</td>
                <td style={{ padding: ".55rem .5rem", whiteSpace: "nowrap", fontWeight: 850 }}>{r[colEmpresa]}</td>
                <td style={{ padding: ".55rem .5rem" }}>{isFinite(occ) ? Math.round(occ).toLocaleString("es-AR") : r[colOcc]}</td>
                <td style={{ padding: ".55rem .5rem" }}>{r[colOccPct]}</td>
                <td style={{ padding: ".55rem .5rem" }}>{formatMoney(adr)}</td>
                <td style={{ padding: ".55rem .5rem" }}>{formatMoney(rev)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
