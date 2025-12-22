"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic } from "./csvClient";

const AVAIL_PER_DAY_BY_HOTEL: Record<string, number> = {
  MARRIOTT: 300,
  "SHERATON MDQ": 194,
  "SHERATON BCR": 161,
  MAITEI: 98,
};

const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function normHotel(x: any) {
  return String(x ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function parseMoneyES(v: any) {
  if (v == null) return 0;
  const s0 = String(v).trim();
  if (!s0) return 0;

  const s = s0.replace(/\s/g, "");
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  if (hasComma && !hasDot) return Number(s.replace(",", ".")) || 0;
  return Number(s) || 0;
}

function parseAnyDate(v: any): Date | null {
  if (!v && v !== 0) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  // Excel serial
  if (typeof v === "number" && Number.isFinite(v)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + v * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(v).trim();
  if (!s) return null;

  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR");
const fmtMoney0 = (n: number) => Math.round(n).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const fmtMoney2 = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct1 = (p01: number) => (p01 * 100).toFixed(1).replace(".", ",") + "%";

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
  occ01: number; // rooms / availableRooms
  adr: number;   // revenue / rooms
};

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
  const [month, setMonth] = useState<number>(1);
  const [quarter, setQuarter] = useState<number>(1);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readCsvFromPublic(filePath)
      .then(({ rows }) => {
        if (!alive) return;

        const parsed: HofRow[] = (rows ?? [])
          .map((r: any) => {
            const rawHotel = r.Empresa ?? r.empresa ?? r.Hotel ?? r.hotel;
            const h = normHotel(rawHotel);

            const d = parseAnyDate(r.Fecha ?? r.fecha ?? r.Date ?? r.date);
            if (!d) return null;

            const rooms = Number(String(r['Total Occ.'] ?? r['Total\nOcc.'] ?? r.Occupied ?? r.RoomsOcc ?? r.roomsOcc ?? 0).replace(/\./g,"").replace(",", ".")) || 0;
            const revenue = parseMoneyES(r["Room Revenue"] ?? r["Room\nRevenue"] ?? r.RoomRevenue ?? r.revenue ?? 0);
            const guests = Number(String(r["Adl. & Chl."] ?? r["Adl.\n&\nChl."] ?? r.Guests ?? r.guests ?? 0).replace(/\./g,"").replace(",", ".")) || 0;

            return {
              date: d,
              year: d.getFullYear(),
              month: d.getMonth() + 1,
              quarter: Math.floor(d.getMonth() / 3) + 1,
              rooms,
              revenue,
              guests,
              hotel: h,
            } as HofRow;
          })
          .filter(Boolean) as HofRow[];

        setRows(parsed);
      })
      .catch((e) => {
        console.error(e);
        setErr(String(e?.message ?? e));
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => {
      alive = false;
    };
  }, [filePath]);

  const yearsAvailable = useMemo(() => {
    const set = new Set<number>();
    rows
      .filter((r) => allowedHotels.includes(r.hotel))
      .forEach((r) => set.add(r.year));
    return Array.from(set).sort((a, b) => a - b);
  }, [rows, allowedHotels]);

  const rowsHotelYear = useMemo(() => {
    const h = normHotel(hotel);
    return rows.filter((r) => r.hotel === h && r.year === year);
  }, [rows, hotel, year]);

  function aggregate(list: HofRow[]): Agg | null {
    if (!list.length) return null;

    const availPerDay = AVAIL_PER_DAY_BY_HOTEL[normHotel(hotel)] ?? 0;
    const days = list.length;
    const availableRooms = availPerDay * days;

    const rooms = list.reduce((a, r) => a + (Number.isFinite(r.rooms) ? r.rooms : 0), 0);
    const revenue = list.reduce((a, r) => a + (Number.isFinite(r.revenue) ? r.revenue : 0), 0);
    const guests = list.reduce((a, r) => a + (Number.isFinite(r.guests) ? r.guests : 0), 0);

    const occ01 = availableRooms > 0 ? rooms / availableRooms : 0;
    const adr = rooms > 0 ? revenue / rooms : 0;

    return { rooms, revenue, guests, days, availableRooms, occ01, adr };
  }

  const aggYear = useMemo(() => aggregate(rowsHotelYear), [rowsHotelYear]);

  const detailAgg = useMemo(() => {
    if (!rowsHotelYear.length) return null;

    if (mode === "YEAR") return aggregate(rowsHotelYear);

    if (mode === "QUARTER") {
      const list = rowsHotelYear.filter((r) => r.quarter === quarter);
      return aggregate(list);
    }

    const list = rowsHotelYear.filter((r) => r.month === month);
    return aggregate(list);
  }, [rowsHotelYear, mode, month, quarter]);

  return (
    <section className="section" style={{ marginTop: "1rem" }}>
      <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 900 }}>{title}</div>

      <div className="card" style={{ padding: "1rem", borderRadius: 18, marginTop: ".75rem" }}>
        <div style={{ display: "grid", gap: ".75rem", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
          <div>
            <div style={{ fontSize: ".85rem", opacity: 0.75 }}>Hotel</div>
            <select value={hotel} onChange={(e) => onHotelChange(e.target.value)} style={{ width: "100%", padding: ".55rem", borderRadius: 12 }}>
              {allowedHotels.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>

          <div>
            <div style={{ fontSize: ".85rem", opacity: 0.75 }}>Año</div>
            <select value={year} onChange={(e) => onYearChange(Number(e.target.value))} style={{ width: "100%", padding: ".55rem", borderRadius: 12 }}>
              {yearsAvailable.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div>
            <div style={{ fontSize: ".85rem", opacity: 0.75 }}>Detalle</div>
            <select value={mode} onChange={(e) => setMode(e.target.value as any)} style={{ width: "100%", padding: ".55rem", borderRadius: 12 }}>
              <option value="YEAR">Año completo</option>
              <option value="QUARTER">Trimestre</option>
              <option value="MONTH">Mes</option>
            </select>
          </div>

          {mode === "QUARTER" && (
            <div>
              <div style={{ fontSize: ".85rem", opacity: 0.75 }}>Trimestre</div>
              <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} style={{ width: "100%", padding: ".55rem", borderRadius: 12 }}>
                {[1,2,3,4].map((q) => <option key={q} value={q}>Q{q}</option>)}
              </select>
            </div>
          )}

          {mode === "MONTH" && (
            <div>
              <div style={{ fontSize: ".85rem", opacity: 0.75 }}>Mes</div>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ width: "100%", padding: ".55rem", borderRadius: 12 }}>
                {MONTHS_ES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          )}
        </div>

        {loading && <div style={{ marginTop: ".9rem", opacity: 0.8 }}>Cargando H&F…</div>}
        {!loading && err && <div style={{ marginTop: ".9rem", color: "#b91c1c" }}>{err}</div>}

        {!loading && !err && !aggYear && (
          <div style={{ marginTop: ".9rem", opacity: 0.8 }}>Sin filas H&F para el filtro actual.</div>
        )}

        {!loading && !err && aggYear && (
          <div style={{ display: "grid", gap: ".75rem", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginTop: "1rem" }}>
            <div className="kpi">
              <div className="kpiLabel">Ocupación (ponderada)</div>
              <div className="kpiValue">{fmtPct1(aggYear.occ01)}</div>
              <div className="kpiHint">Rooms / (Disponibilidad * días)</div>
            </div>

            <div className="kpi">
              <div className="kpiLabel">Rooms Ocupadas</div>
              <div className="kpiValue">{fmtInt(aggYear.rooms)}</div>
            </div>

            <div className="kpi">
              <div className="kpiLabel">Room Revenue</div>
              <div className="kpiValue">{fmtMoney0(aggYear.revenue)}</div>
            </div>

            <div className="kpi">
              <div className="kpiLabel">ADR</div>
              <div className="kpiValue">{fmtMoney2(aggYear.adr)}</div>
            </div>

            <div className="kpi">
              <div className="kpiLabel">Huéspedes</div>
              <div className="kpiValue">{fmtInt(aggYear.guests)}</div>
            </div>
          </div>
        )}

        {!loading && !err && detailAgg && (
          <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid rgba(0,0,0,.08)" }}>
            <div style={{ fontWeight: 900, marginBottom: ".5rem" }}>Detalle ({mode === "YEAR" ? "Año" : mode === "QUARTER" ? `Q${quarter}` : MONTHS_ES[month - 1]})</div>

            <div style={{ display: "grid", gap: ".75rem", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
              <div className="kpi">
                <div className="kpiLabel">Ocupación</div>
                <div className="kpiValue">{fmtPct1(detailAgg.occ01)}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">Rooms</div>
                <div className="kpiValue">{fmtInt(detailAgg.rooms)}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">Revenue</div>
                <div className="kpiValue">{fmtMoney0(detailAgg.revenue)}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">ADR</div>
                <div className="kpiValue">{fmtMoney2(detailAgg.adr)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
