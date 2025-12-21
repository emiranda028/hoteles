"use client";

import React, { useEffect, useMemo, useState } from "react";

type Props = {
  filePath: string;               // "/data/hf_diario.csv"
  allowedHotels: string[];        // ["MARRIOTT","SHERATON MDQ","SHERATON BCR"] o ["MAITEI"]
  title: string;
  defaultYear?: number;           // 2025
  defaultHotel?: string;          // "MARRIOTT"
};

type HFRow = {
  hotel: string;
  date: Date | null;
  year: number;
  month: number;   // 1-12
  quarter: number; // 1-4
  occ: number;     // 0..1
  roomsOcc: number;
  roomRevenue: number;
  adr: number;
  guests: number;
};

const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function toNum(x: any) {
  if (typeof x === "number") return isFinite(x) ? x : 0;
  const s = String(x ?? "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d\.\-]/g, "")
    .trim();
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function parsePercent(x: any) {
  const s = String(x ?? "").trim();
  if (!s) return 0;
  // "59,40%" o "0.594"
  if (s.includes("%")) return toNum(s) / 100;
  const n = toNum(s);
  return n > 1 ? n / 100 : n;
}

function normKey(k: string) {
  return String(k ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function pickKey(keys: string[], candidates: string[]) {
  const map = new Map<string, string>();
  for (let i = 0; i < keys.length; i++) map.set(normKey(keys[i]), keys[i]);
  for (let i = 0; i < candidates.length; i++) {
    const k = map.get(normKey(candidates[i]));
    if (k) return k;
  }
  return "";
}

function parseDateSmart(x: any): Date | null {
  if (x instanceof Date && !isNaN(x.getTime())) return x;
  const s = String(x ?? "").trim();
  if (!s) return null;

  // "1/6/2022"
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3]);
    const dt = new Date(yy, mm - 1, dd);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // "01-06-22 Wed" / "01-06-2022"
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    const dt = new Date(yy, mm - 1, dd);
    return isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

function parseCSV(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  const out: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row: any = {};
    // Parser simple (asumiendo que tu CSV no tiene comas adentro de comillas complejas)
    const cols = lines[i].split(",");
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (cols[j] ?? "").replace(/^"|"$/g, "");
    }
    out.push(row);
  }
  return out;
}

export default function HofExplorer({
  filePath,
  allowedHotels,
  title,
  defaultYear = 2025,
  defaultHotel,
}: Props) {
  const [raw, setRaw] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [hotel, setHotel] = useState<string>(defaultHotel || allowedHotels[0] || "");
  const [year, setYear] = useState<number>(defaultYear);
  const [quarter, setQuarter] = useState<number>(0); // 0 = todos
  const [month, setMonth] = useState<number>(0);     // 0 = todos

  useEffect(() => {
    let mounted = true;
    async function run() {
      setLoading(true);
      try {
        const res = await fetch(filePath, { cache: "no-store" });
        const txt = await res.text();
        const rows = parseCSV(txt);
        if (!mounted) return;
        setRaw(rows);
        setLoading(false);
      } catch (e) {
        if (!mounted) return;
        setRaw([]);
        setLoading(false);
      }
    }
    run();
    return () => {
      mounted = false;
    };
  }, [filePath]);

  const hfRows: HFRow[] = useMemo(() => {
    if (!raw.length) return [];

    const keys = Object.keys(raw[0] ?? {});

    // en tus datos vimos: Empresa, Fecha, "Total Occ.", Occ.%, Room Revenue, Average Rate, "Adl. & Chl."
    const kHotel = pickKey(keys, ["Empresa", "Hotel", "empresa"]);
    const kDate = pickKey(keys, ["Fecha", "Date", "fecha"]);
    const kOcc = pickKey(keys, ["Occ.%", "Occ.% ", "Occ%", "Ocupacion", "Ocupación", "Occ"]);
    const kRoomsOcc = pickKey(keys, ['Total Occ.', "Total Occ", "Rooms Occupied", "Occ Rooms"]);
    const kRevenue = pickKey(keys, ["Room Revenue", "RoomRevenue", "Revenue"]);
    const kADR = pickKey(keys, ["Average Rate", "ADR", "Tarifa Promedio"]);
    const kGuests = pickKey(keys, ["Adl. & Chl.", "Adl & Chl", "Guests", "Huéspedes", "Huespedes"]);

    const out: HFRow[] = [];

    for (let i = 0; i < raw.length; i++) {
      const r: any = raw[i];
      const h = String(r[kHotel] ?? "").trim();
      if (!h) continue;
      if (allowedHotels.length && !allowedHotels.includes(h)) continue;

      const dt = parseDateSmart(r[kDate]);
      const yy = dt ? dt.getFullYear() : 0;
      const mm = dt ? dt.getMonth() + 1 : 0;
      const qq = mm ? Math.floor((mm - 1) / 3) + 1 : 0;

      const occ = parsePercent(r[kOcc]);
      const roomsOcc = toNum(r[kRoomsOcc]);
      const roomRevenue = toNum(r[kRevenue]);
      const adr = toNum(r[kADR]);
      const guests = toNum(r[kGuests]);

      if (!yy || !mm) continue;

      out.push({
        hotel: h,
        date: dt,
        year: yy,
        month: mm,
        quarter: qq,
        occ,
        roomsOcc,
        roomRevenue,
        adr,
        guests,
      });
    }

    return out;
  }, [raw, allowedHotels]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < hfRows.length; i++) set.add(hfRows[i].year);
    return Array.from(set).sort((a, b) => b - a);
  }, [hfRows]);

  useEffect(() => {
    // si el year default no existe, caemos al más nuevo
    if (years.length && !years.includes(year)) setYear(years[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years.join("|")]);

  const rowsFiltered = useMemo(() => {
    let r = hfRows.filter((x) => x.hotel === hotel && x.year === year);
    if (quarter) r = r.filter((x) => x.quarter === quarter);
    if (month) r = r.filter((x) => x.month === month);
    return r;
  }, [hfRows, hotel, year, quarter, month]);

  const kpis = useMemo(() => {
    if (!rowsFiltered.length) return null;

    let occSum = 0;
    let occN = 0;

    let rooms = 0;
    let rev = 0;
    let guests = 0;

    // ADR promedio ponderado por rooms
    let adrNum = 0;
    let adrDen = 0;

    for (let i = 0; i < rowsFiltered.length; i++) {
      const x = rowsFiltered[i];
      if (x.occ > 0) {
        occSum += x.occ;
        occN += 1;
      }
      rooms += x.roomsOcc || 0;
      rev += x.roomRevenue || 0;
      guests += x.guests || 0;

      if (x.adr > 0 && x.roomsOcc > 0) {
        adrNum += x.adr * x.roomsOcc;
        adrDen += x.roomsOcc;
      }
    }

    return {
      occAvg: occN ? occSum / occN : 0,
      rooms,
      rev,
      guests,
      adr: adrDen ? adrNum / adrDen : 0,
    };
  }, [rowsFiltered]);

  const monthly = useMemo(() => {
    // 12 meses fijos
    const arr = MONTHS_ES.map((name, idx) => ({
      month: idx + 1,
      name,
      occAvg: 0,
      occN: 0,
      rooms: 0,
      rev: 0,
    }));

    for (let i = 0; i < hfRows.length; i++) {
      const x = hfRows[i];
      if (x.hotel !== hotel) continue;
      if (x.year !== year) continue;

      const m = x.month;
      if (!m) continue;
      const item = arr[m - 1];

      if (x.occ > 0) {
        item.occAvg += x.occ;
        item.occN += 1;
      }
      item.rooms += x.roomsOcc || 0;
      item.rev += x.roomRevenue || 0;
    }

    for (let i = 0; i < arr.length; i++) {
      arr[i].occAvg = arr[i].occN ? arr[i].occAvg / arr[i].occN : 0;
    }

    // si hay filtro de quarter/month, el “detalle mensual” se sigue viendo, pero ranking puede respetar filtro:
    // Para vos: ranking por mes por hotel (año completo) -> lo dejamos año completo.
    return arr;
  }, [hfRows, hotel, year]);

  const ranking = useMemo(() => {
    const list = monthly
      .map((m) => ({ ...m }))
      .sort((a, b) => b.occAvg - a.occAvg);
    return list;
  }, [monthly]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        Cargando History & Forecast…
      </div>
    );
  }

  return (
    <section className="section" style={{ marginTop: "1.25rem" }}>
      <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
        {title}
      </div>
      <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
        Filtros por hotel + año/mes/trimestre. Incluye ranking por mes por hotel.
      </div>

      {/* Filtros */}
      <div
        className="card"
        style={{
          marginTop: ".85rem",
          padding: "1rem",
          borderRadius: 22,
          display: "grid",
          gap: ".75rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>HOTEL</span>
          <select value={hotel} onChange={(e) => setHotel(e.target.value)} style={{ padding: ".6rem", borderRadius: 12 }}>
            {allowedHotels.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>YEAR</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ padding: ".6rem", borderRadius: 12 }}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>QUARTER</span>
          <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} style={{ padding: ".6rem", borderRadius: 12 }}>
            <option value={0}>Todos</option>
            <option value={1}>Q1</option>
            <option value={2}>Q2</option>
            <option value={3}>Q3</option>
            <option value={4}>Q4</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>MONTH</span>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ padding: ".6rem", borderRadius: 12 }}>
            <option value={0}>Todos</option>
            {MONTHS_ES.map((m, idx) => (
              <option key={m} value={idx + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* KPIs */}
      <div
        style={{
          marginTop: ".9rem",
          display: "grid",
          gap: ".75rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
          <div style={{ opacity: 0.75, fontSize: 12, fontWeight: 800 }}>Ocupación promedio</div>
          <div style={{ fontWeight: 950, fontSize: "1.4rem", marginTop: 6 }}>
            {kpis ? (kpis.occAvg * 100).toFixed(1) + "%" : "—"}
          </div>
        </div>

        <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
          <div style={{ opacity: 0.75, fontSize: 12, fontWeight: 800 }}>Rooms occupied</div>
          <div style={{ fontWeight: 950, fontSize: "1.4rem", marginTop: 6 }}>
            {kpis ? kpis.rooms.toLocaleString("es-AR") : "—"}
          </div>
        </div>

        <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
          <div style={{ opacity: 0.75, fontSize: 12, fontWeight: 800 }}>Room Revenue</div>
          <div style={{ fontWeight: 950, fontSize: "1.4rem", marginTop: 6 }}>
            {kpis ? kpis.rev.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
          </div>
        </div>

        <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
          <div style={{ opacity: 0.75, fontSize: 12, fontWeight: 800 }}>ADR</div>
          <div style={{ fontWeight: 950, fontSize: "1.4rem", marginTop: 6 }}>
            {kpis ? kpis.adr.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
          </div>
        </div>
      </div>

      {/* Detalle mensual + Ranking */}
      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          alignItems: "start",
        }}
      >
        <div className="card" style={{ padding: "1rem", borderRadius: 22, overflowX: "auto" }}>
          <div style={{ fontWeight: 950, marginBottom: ".6rem" }}>Detalle mensual</div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 420 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.75 }}>
                <th style={{ padding: ".45rem .35rem" }}>Mes</th>
                <th style={{ padding: ".45rem .35rem" }}>Ocupación</th>
                <th style={{ padding: ".45rem .35rem" }}>Rooms</th>
                <th style={{ padding: ".45rem .35rem" }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.month} style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                  <td style={{ padding: ".5rem .35rem", fontWeight: 900 }}>{m.name}</td>
                  <td style={{ padding: ".5rem .35rem" }}>{(m.occAvg * 100).toFixed(1)}%</td>
                  <td style={{ padding: ".5rem .35rem" }}>{m.rooms.toLocaleString("es-AR")}</td>
                  <td style={{ padding: ".5rem .35rem" }}>
                    {m.rev.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
          <div style={{ fontWeight: 950, marginBottom: ".6rem" }}>Ranking de meses</div>
          <div style={{ display: "grid", gap: ".45rem" }}>
            {ranking.map((m, idx) => (
              <div
                key={m.month}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: ".75rem",
                  padding: ".55rem .7rem",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,.08)",
                  background: "rgba(255,255,255,.03)",
                }}
              >
                <div style={{ fontWeight: 900, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {idx + 1}. {m.name}
                </div>
                <div style={{ fontWeight: 950 }}>{(m.occAvg * 100).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Debug útil si no trae */}
      {!hfRows.length && (
        <div className="card" style={{ marginTop: "1rem", padding: "1rem", borderRadius: 22, opacity: 0.8 }}>
          Sin datos. Revisá que <b>{filePath}</b> exista en <b>/public/data</b> y que el CSV tenga columnas como Empresa/Fecha/Occ.%/Room Revenue.
        </div>
      )}
    </section>
  );
}
