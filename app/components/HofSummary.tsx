"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic } from "./csvClient";

type HofRow = {
  date: Date;
  year: number;
  month: number;
  rooms: number;
  revenue: number;
  guests: number;
  hotel: string;
};

const AVAIL_PER_DAY_BY_HOTEL: Record<string, number> = {
  MARRIOTT: 300,
  "SHERATON MDQ": 194,
  "SHERATON BCR": 161,
  MAITEI: 98,
};

function normHotel(x: any) {
  return String(x ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function parseMoneyES(v: any): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/\s/g, "");
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) {
    return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (s.includes(",")) {
    return Number(s.replace(",", ".")) || 0;
  }
  return Number(s) || 0;
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

const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR");
const fmtMoney0 = (n: number) => Math.round(n).toLocaleString("es-AR");
const fmtMoney2 = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct1 = (v: number) => (v * 100).toFixed(1).replace(".", ",") + "%";

function agg(rows: HofRow[], hotel: string) {
  if (!rows.length) return null;

  const availDay = AVAIL_PER_DAY_BY_HOTEL[normHotel(hotel)] ?? 0;
  const days = rows.length;
  const availableRooms = availDay * days;

  const rooms = rows.reduce((a, r) => a + r.rooms, 0);
  const revenue = rows.reduce((a, r) => a + r.revenue, 0);
  const guests = rows.reduce((a, r) => a + r.guests, 0);

  const occ01 = availableRooms ? rooms / availableRooms : 0;
  const adr = rooms ? revenue / rooms : 0;

  return { rooms, revenue, guests, days, availableRooms, occ01, adr };
}

export default function HofSummary({
  filePath,
  year,
  hotel,
}: {
  filePath: string;
  year: number;
  hotel: string;
}) {
  const [rows, setRows] = useState<HofRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readCsvFromPublic(filePath)
      .then((csvRows) => {
        if (!alive) return;

        const parsed: HofRow[] = (csvRows ?? [])
          .map((r: any) => {
            const h = normHotel(r.Empresa ?? r.Hotel);
            const d = parseAnyDate(r.Fecha ?? r.Date);
            if (!d) return null;

            const rooms = Number(r["Total Occ."] ?? r["Total Occ"] ?? 0);
            const revenue = parseMoneyES(r["Room Revenue"] ?? r["RoomRevenue"]);
            const guests = Number(r["Adl. & Chl."] ?? r["Adl.&Chl."] ?? 0);

            return {
              date: d,
              year: d.getFullYear(),
              month: d.getMonth() + 1,
              rooms,
              revenue,
              guests,
              hotel: h,
            };
          })
          .filter(Boolean) as HofRow[];

        setRows(parsed);
      })
      .catch((e) => {
        console.error(e);
        setErr("Error cargando H&F");
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => {
      alive = false;
    };
  }, [filePath]);

  const filtered = useMemo(() => {
    const h = normHotel(hotel);
    return rows.filter((r) => r.hotel === h && r.year === year);
  }, [rows, hotel, year]);

  const res = useMemo(() => agg(filtered, hotel), [filtered, hotel]);

  return (
    <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
      <div style={{ fontWeight: 900, fontSize: "1.05rem" }}>H&F — Resumen</div>

      {loading && <div style={{ marginTop: ".5rem" }}>Cargando…</div>}
      {!loading && err && <div style={{ marginTop: ".5rem" }}>{err}</div>}
      {!loading && !err && !res && (
        <div style={{ marginTop: ".5rem" }}>Sin filas H&F para el filtro actual.</div>
      )}

      {res && (
        <div
          style={{
            marginTop: ".75rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: ".6rem",
          }}
        >
          <div className="card" style={{ padding: ".75rem", borderRadius: 16 }}>
            <div style={{ opacity: 0.8, fontSize: ".85rem" }}>Ocupación</div>
            <div style={{ fontWeight: 950, fontSize: "1.25rem" }}>{fmtPct1(res.occ01)}</div>
          </div>

          <div className="card" style={{ padding: ".75rem", borderRadius: 16 }}>
            <div style={{ opacity: 0.8, fontSize: ".85rem" }}>Rooms</div>
            <div style={{ fontWeight: 950, fontSize: "1.25rem" }}>{fmtInt(res.rooms)}</div>
          </div>

          <div className="card" style={{ padding: ".75rem", borderRadius: 16 }}>
            <div style={{ opacity: 0.8, fontSize: ".85rem" }}>Room Revenue</div>
            <div style={{ fontWeight: 950, fontSize: "1.25rem" }}>{fmtMoney0(res.revenue)}</div>
          </div>

          <div className="card" style={{ padding: ".75rem", borderRadius: 16 }}>
            <div style={{ opacity: 0.8, fontSize: ".85rem" }}>ADR</div>
            <div style={{ fontWeight: 950, fontSize: "1.25rem" }}>{fmtMoney2(res.adr)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
