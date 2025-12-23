"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic, toNumberSmart, safeDiv, toPercent01, formatMoney, formatPct } from "./csvClient";

type HfRow = Record<string, any>;

function normHotel(x: any) {
  return String(x ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function parseAnyDate(v: any): Date | null {
  if (v instanceof Date && !isNaN(+v)) return v;
  if (typeof v === "number") {
    const base = new Date(Date.UTC(1899, 11, 30));
    return new Date(base.getTime() + v * 86400000);
  }
  const s = String(v ?? "").trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    return isNaN(+d) ? null : d;
  }

  const d2 = new Date(s);
  return isNaN(+d2) ? null : d2;
}

const AVAIL_PER_DAY_BY_HOTEL: Record<string, number> = {
  MARRIOTT: 300,
  "SHERATON MDQ": 194,
  "SHERATON BCR": 161,
  MAITEI: 98,
};

function kpiCard(label: string, value: string) {
  return (
    <div className="card" style={{ padding: ".9rem", borderRadius: 18, minWidth: 190 }}>
      <div style={{ opacity: 0.8, fontSize: ".85rem" }}>{label}</div>
      <div style={{ fontWeight: 950, fontSize: "1.3rem", marginTop: ".15rem" }}>{value}</div>
    </div>
  );
}

export default function HighlightsCarousel({
  filePath,
  year,
  hotel,
}: {
  filePath: string;
  year: number;
  hotel: string;
}) {
  const [rows, setRows] = useState<HfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readCsvFromPublic(filePath)
      .then((csvRows) => {
        if (!alive) return;
        setRows(csvRows ?? []);
      })
      .catch((e) => {
        console.error(e);
        setErr("Error cargando CSV");
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => {
      alive = false;
    };
  }, [filePath]);

  const kpis = useMemo(() => {
    const h = normHotel(hotel);

    const filtered = (rows ?? [])
      .map((r) => {
        const d = parseAnyDate(r.Fecha ?? r.Date);
        if (!d) return null;
        return { ...r, __date: d };
      })
      .filter(Boolean) as any[];

    const byHotelYear = filtered.filter(
      (r) => normHotel(r.Empresa ?? r.Hotel) === h && r.__date.getFullYear() === year
    );

    if (!byHotelYear.length) return null;

    // Rooms y Revenue
    const rooms = byHotelYear.reduce((a, r) => a + toNumberSmart(r["Total Occ."] ?? r["Total Occ"] ?? 0), 0);
    const roomRevenue = byHotelYear.reduce((a, r) => a + toNumberSmart(r["Room Revenue"] ?? 0), 0);

    // Ocupación real: rooms / (available per day * days)
    const days = byHotelYear.length;
    const availPerDay = AVAIL_PER_DAY_BY_HOTEL[h] ?? 0;
    const available = availPerDay * days;

    const occ01 = toPercent01(safeDiv(rooms, available)); // ya viene en 0..1
    const adr = safeDiv(roomRevenue, rooms);

    return {
      rooms,
      roomRevenue,
      occ01,
      adr,
    };
  }, [rows, year, hotel]);

  return (
    <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
      <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>KPIs principales</div>

      {loading && <div style={{ marginTop: ".5rem" }}>Cargando…</div>}
      {!loading && err && <div style={{ marginTop: ".5rem" }}>{err}</div>}
      {!loading && !err && !kpis && (
        <div style={{ marginTop: ".5rem", opacity: 0.9 }}>
          Sin datos para el filtro actual.
        </div>
      )}

      {kpis && (
        <div
          style={{
            marginTop: ".85rem",
            display: "flex",
            gap: ".75rem",
            overflowX: "auto",
            paddingBottom: ".25rem",
          }}
        >
          {kpiCard("Ocupación", formatPct(kpis.occ01))}
          {kpiCard("Rooms", Math.round(kpis.rooms).toLocaleString("es-AR"))}
          {kpiCard("Room Revenue", formatMoney(kpis.roomRevenue))}
          {kpiCard("ADR", kpis.adr.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
        </div>
      )}
    </div>
  );
}
