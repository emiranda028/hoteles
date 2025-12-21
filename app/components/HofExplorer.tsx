"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic } from "./csvClient";

type GlobalHotel = "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

type Props = {
  year: number;
  hotel: GlobalHotel;
  filePath: string; // "/data/hf_diario.csv"
};

type HfRow = Record<string, string>;

function toNum(s: any) {
  if (s === null || s === undefined) return 0;
  const raw = String(s).trim();
  if (!raw) return 0;
  const normalized = raw
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.-]/g, "");
  const v = Number(normalized);
  return Number.isFinite(v) ? v : 0;
}

function parseFechaAny(row: HfRow): Date | null {
  const f = row["Fecha"] || row["FECHA"] || "";
  if (f && typeof f === "string" && f.includes("/")) {
    const [d, m, y] = f.split("/").map((x) => Number(x));
    if (y && m && d) return new Date(y, m - 1, d);
  }
  const dateStr = row["Date"] || row["DATE"] || "";
  const m = String(dateStr).match(/^(\d{2})-(\d{2})-(\d{2})/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3]);
    const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
    return new Date(yyyy, mm - 1, dd);
  }
  return null;
}

function getEmpresa(row: HfRow) {
  return (row["Empresa"] || row["EMPRESA"] || "").trim().toUpperCase();
}
function getHoF(row: HfRow) {
  return (row["HoF"] || row["HOF"] || row["Hof"] || "").trim().toUpperCase();
}

function monthName(m: number) {
  return ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][m] || "";
}

export default function HofExplorer({ year, hotel, filePath }: Props) {
  const [rows, setRows] = useState<HfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr("");
    readCsvFromPublic(filePath)
      .then(({ rows }) => {
        if (!mounted) return;
        setRows(rows as HfRow[]);
        setLoading(false);
      })
      .catch((e: any) => {
        if (!mounted) return;
        setErr(e?.message || "Error leyendo CSV");
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [filePath]);

  const filtered = useMemo(() => {
    const base = rows.filter((r) => {
      const dt = parseFechaAny(r);
      if (!dt) return false;
      return dt.getFullYear() === year;
    });

    if (hotel === "JCR") {
      const allowed = new Set(["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"]);
      return base.filter((r) => allowed.has(getEmpresa(r)));
    }
    return base.filter((r) => getEmpresa(r) === hotel);
  }, [rows, year, hotel]);

  const history = useMemo(() => filtered.filter((r) => getHoF(r) === "HISTORY"), [filtered]);
  const forecast = useMemo(() => filtered.filter((r) => getHoF(r) === "FORECAST"), [filtered]);

  const byMonth = useMemo(() => {
    const map = new Map<number, { rev: number; adr: number; occ: number; n: number }>();

    for (const r of history) {
      const dt = parseFechaAny(r);
      if (!dt) continue;
      const m = dt.getMonth();

      const rev = toNum(r["Room Revenue"] || r["Room Reven"] || 0);
      const adr = toNum(r["Average Rate"] || 0);
      const occ = toNum(r["Occ.%"] || r["Occ%"] || 0);

      const cur = map.get(m) || { rev: 0, adr: 0, occ: 0, n: 0 };
      cur.rev += rev;
      cur.adr += adr;
      cur.occ += occ;
      cur.n += 1;
      map.set(m, cur);
    }

    const out = Array.from(map.entries())
      .map(([m, v]) => ({
        month: m,
        monthLabel: monthName(m),
        roomRevenue: v.rev,
        adrAvg: v.n ? v.adr / v.n : 0,
        occAvg: v.n ? v.occ / v.n : 0,
        days: v.n,
      }))
      .sort((a, b) => a.month - b.month);

    return out;
  }, [history]);

  if (loading) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Cargando H&F…</div>;
  if (err) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Error: {err}</div>;

  if (filtered.length === 0) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Sin filas H&F para el filtro actual. (Año {year} · Hotel {hotel})
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: ".85rem" }}>
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: ".5rem" }}>
          <div style={{ fontWeight: 950 }}>History & Forecast — {hotel}</div>
          <div style={{ opacity: 0.75 }}>Año {year} · Filas: {filtered.length} (H:{history.length} · F:{forecast.length})</div>
        </div>
      </div>

      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 950, marginBottom: ".5rem" }}>Ranking por mes (History)</div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: ".9rem", opacity: 0.9 }}>
                <th style={th}>Mes</th>
                <th style={th}>Room Revenue</th>
                <th style={th}>ADR prom</th>
                <th style={th}>Ocupación prom</th>
                <th style={th}>Días</th>
              </tr>
            </thead>
            <tbody>
              {byMonth.map((m) => (
                <tr key={m.month} style={{ borderTop: "1px solid rgba(0,0,0,.06)" }}>
                  <td style={td}><b>{m.monthLabel}</b></td>
                  <td style={td}>{m.roomRevenue.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</td>
                  <td style={td}>{m.adrAvg.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</td>
                  <td style={td}>{m.occAvg.toFixed(1).replace(".", ",")}%</td>
                  <td style={td}>{m.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: ".75rem", opacity: 0.75, fontSize: ".9rem" }}>
          *El ranking está armado con las filas <b>History</b> del CSV.
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: ".55rem .5rem" };
const td: React.CSSProperties = { padding: ".55rem .5rem", fontSize: ".95rem" };
