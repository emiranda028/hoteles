"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic } from "./csvClient";

/* =====================
   Configuración fija
===================== */

const AVAIL_PER_DAY_BY_HOTEL: Record<string, number> = {
  MARRIOTT: 300,
  "SHERATON MDQ": 194,
  "SHERATON BCR": 161,
  MAITEI: 98,
};

const MONTHS_ES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
];

function normHotel(x: any) {
  return String(x ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function parseMoneyES(v: any): number {
  if (!v) return 0;
  const s = String(v).replace(/\s/g, "");
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

  const s = String(v).trim();
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

/* =====================
   Tipos
===================== */

type HofRow = {
  date: Date;
  year: number;
  month: number;
  quarter: number;
  rooms: number;
  revenue: number;
  guests: number;
  hotel: string;
};

type Agg = {
  rooms: number;
  revenue: number;
  guests: number;
  days: number;
  availableRooms: number;
  occ01: number;
  adr: number;
};

/* =====================
   Componente
===================== */

export default function HofExplorer({
  filePath = "/data/hf_diario.csv",
  allowedHotels,
  title,
  year,
  onYearChange,
  hotel,
  onHotelChange,
}: {
  filePath?: string;
  allowedHotels: string[];
  title: string;
  year: number;
  onYearChange: (y: number) => void;
  hotel: string;
  onHotelChange: (h: string) => void;
}) {
  const [rows, setRows] = useState<HofRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"YEAR" | "QUARTER" | "MONTH">("YEAR");
  const [month, setMonth] = useState(1);
  const [quarter, setQuarter] = useState(1);
  const [err, setErr] = useState("");

  /* ========= LOAD ========= */

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readCsvFromPublic(filePath)
      .then((rows) => {
        if (!alive) return;

        const parsed: HofRow[] = rows
          .map((r: any) => {
            const h = normHotel(r.Empresa ?? r.Hotel);
            const d = parseAnyDate(r.Fecha ?? r.Date);
            if (!d) return null;

            return {
              date: d,
              year: d.getFullYear(),
              month: d.getMonth() + 1,
              quarter: Math.floor(d.getMonth() / 3) + 1,
              rooms: Number(r["Total Occ."] ?? 0),
              revenue: parseMoneyES(r["Room Revenue"]),
              guests: Number(r["Adl. & Chl."] ?? 0),
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

  /* ========= FILTROS ========= */

  const rowsHotelYear = useMemo(() => {
    return rows.filter(
      (r) => r.hotel === normHotel(hotel) && r.year === year
    );
  }, [rows, hotel, year]);

  function aggregate(list: HofRow[]): Agg | null {
    if (!list.length) return null;

    const avail = AVAIL_PER_DAY_BY_HOTEL[normHotel(hotel)] ?? 0;
    const days = list.length;
    const availableRooms = avail * days;

    const rooms = list.reduce((a, r) => a + r.rooms, 0);
    const revenue = list.reduce((a, r) => a + r.revenue, 0);
    const guests = list.reduce((a, r) => a + r.guests, 0);

    return {
      rooms,
      revenue,
      guests,
      days,
      availableRooms,
      occ01: availableRooms ? rooms / availableRooms : 0,
      adr: rooms ? revenue / rooms : 0,
    };
  }

  const aggYear = useMemo(() => aggregate(rowsHotelYear), [rowsHotelYear]);

  /* ========= UI ========= */

  return (
    <section className="section">
      <div className="sectionTitle">{title}</div>

      <div className="card">
        {loading && <div>Cargando H&F…</div>}
        {!loading && err && <div>{err}</div>}
        {!loading && !aggYear && <div>Sin filas H&F para el filtro actual.</div>}

        {aggYear && (
          <div className="kpiGrid">
            <div className="kpi">
              <div className="kpiLabel">Ocupación</div>
              <div className="kpiValue">{fmtPct1(aggYear.occ01)}</div>
            </div>
            <div className="kpi">
              <div className="kpiLabel">Rooms</div>
              <div className="kpiValue">{fmtInt(aggYear.rooms)}</div>
            </div>
            <div className="kpi">
              <div className="kpiLabel">Revenue</div>
              <div className="kpiValue">{fmtMoney0(aggYear.revenue)}</div>
            </div>
            <div className="kpi">
              <div className="kpiLabel">ADR</div>
              <div className="kpiValue">{fmtMoney2(aggYear.adr)}</div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
