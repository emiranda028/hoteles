"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic } from "./csvClient";

type Props = {
  year: number;
  hotel: "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";
  filePath: string; // "/data/hf_diario.csv"
  title?: string;
};

type HfRow = Record<string, string>;

function toNum(s: any) {
  if (s === null || s === undefined) return 0;
  const raw = String(s).trim();
  if (!raw) return 0;
  // soporta "22.441,71" y "22441.71"
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
  // ejemplo: "01-06-22 Wed"
  if (dateStr) {
    const m = String(dateStr).match(/^(\d{2})-(\d{2})-(\d{2})/);
    if (m) {
      const dd = Number(m[1]);
      const mm = Number(m[2]);
      const yy = Number(m[3]);
      const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
      return new Date(yyyy, mm - 1, dd);
    }
  }
  return null;
}

function getEmpresa(row: HfRow) {
  return (row["Empresa"] || row["EMPRESA"] || "").trim().toUpperCase();
}

function getHoF(row: HfRow) {
  return (row["HoF"] || row["HOF"] || row["Hof"] || "").trim().toUpperCase();
}

function sumRows(rows: HfRow[]) {
  // intentamos agarrar métricas típicas del CSV
  const roomsOcc = rows.reduce((a, r) => a + toNum(r["Occ.%"] || r["Occ%"] || r["Occ. %"] || 0), 0);
  const roomRevenue = rows.reduce((a, r) => a + toNum(r["Room Revenue"] || r["Room Reven"] || r["RoomRevenue"] || 0), 0);
  const adr = rows.reduce((a, r) => a + toNum(r["Average Rate"] || r["AverageRate"] || 0), 0);

  const n = Math.max(rows.length, 1);
  return {
    days: rows.length,
    occAvg: roomsOcc / n, // ojo: si Occ.% ya viene como porcentaje
    roomRevenue,
    adrAvg: adr / n,
  };
}

function formatPct(v: number) {
  if (!Number.isFinite(v)) return "—";
  return `${v.toFixed(1).replace(".", ",")}%`;
}
function formatMoney(v: number) {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

export default function HighlightsCarousel({ year, hotel, filePath, title }: Props) {
  const [rows, setRows] = useState<HfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

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
    const wantedYear = year;

    const base = rows.filter((r) => {
      const dt = parseFechaAny(r);
      if (!dt) return false;
      return dt.getFullYear() === wantedYear;
    });

    if (hotel === "JCR") {
      const allowed = new Set(["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"]);
      return base.filter((r) => allowed.has(getEmpresa(r)));
    }
    return base.filter((r) => getEmpresa(r) === hotel);
  }, [rows, year, hotel]);

  const history = useMemo(() => filtered.filter((r) => getHoF(r) === "HISTORY"), [filtered]);
  const forecast = useMemo(() => filtered.filter((r) => getHoF(r) === "FORECAST"), [filtered]);

  const kpiHistory = useMemo(() => sumRows(history), [history]);
  const kpiForecast = useMemo(() => sumRows(forecast), [forecast]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Cargando KPIs…
      </div>
    );
  }
  if (err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Error: {err}
      </div>
    );
  }

  const header = title || (hotel === "JCR" ? "Grupo JCR — KPIs" : `${hotel} — KPIs`);

  return (
    <div style={{ display: "grid", gap: ".75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>{header} {year}</div>
        <div style={{ opacity: 0.7, fontSize: ".9rem" }}>
          History ({kpiHistory.days}) · Forecast ({kpiForecast.days})
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: ".75rem",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        }}
        className="kpiGrid"
      >
        <div style={cardStyleGrad("linear-gradient(135deg, #0ea5e9, #22c55e)")}>
          <div style={kpiLabel}>Room Revenue (History)</div>
          <div style={kpiValue}>{formatMoney(kpiHistory.roomRevenue)}</div>
          <div style={kpiSub}>ADR prom: {formatMoney(kpiHistory.adrAvg)}</div>
        </div>

        <div style={cardStyleGrad("linear-gradient(135deg, #a855f7, #ec4899)")}>
          <div style={kpiLabel}>Room Revenue (Forecast)</div>
          <div style={kpiValue}>{formatMoney(kpiForecast.roomRevenue)}</div>
          <div style={kpiSub}>ADR prom: {formatMoney(kpiForecast.adrAvg)}</div>
        </div>

        <div style={cardStyleGrad("linear-gradient(135deg, #f59e0b, #ef4444)")}>
          <div style={kpiLabel}>Ocupación prom. (History)</div>
          <div style={kpiValue}>{formatPct(kpiHistory.occAvg)}</div>
          <div style={kpiSub}>Días: {kpiHistory.days}</div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          .kpiGrid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

const cardStyleGrad = (bg: string): React.CSSProperties => ({
  background: bg,
  color: "white",
  borderRadius: 18,
  padding: "1rem",
  minHeight: 110,
  boxShadow: "0 10px 30px rgba(0,0,0,.08)",
});

const kpiLabel: React.CSSProperties = { fontSize: ".85rem", opacity: 0.9, fontWeight: 800 };
const kpiValue: React.CSSProperties = { fontSize: "1.9rem", fontWeight: 950, marginTop: ".2rem" };
const kpiSub: React.CSSProperties = { fontSize: ".9rem", opacity: 0.9, marginTop: ".2rem", fontWeight: 700 };
