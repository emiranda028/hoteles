"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic, toNumberSmart, toPercent01, safeDiv, formatMoney, formatPct01 } from "./useCsvClient";

type Props = {
  title: string;
  accent: "jcr" | "maitei";
  filePath: string;
  year: number;
  baseYear: number;
  hotelFilter: string; // "" => todos
  quarter: number; // 0=todos
  month: number; // 0=todos
};

type HfRow = Record<string, any>;

const ACC = {
  jcr: {
    grad: "linear-gradient(135deg, rgba(165,0,0,0.92), rgba(255,120,120,0.92))",
    border: "rgba(165,0,0,0.25)",
  },
  maitei: {
    grad: "linear-gradient(135deg, rgba(0,110,220,0.92), rgba(150,220,255,0.92))",
    border: "rgba(0,140,255,0.25)",
  },
};

function getKey(keys: string[], wanted: string[]) {
  const low = keys.map((k) => k.toLowerCase());
  for (const w of wanted) {
    const idx = low.indexOf(w.toLowerCase());
    if (idx >= 0) return keys[idx];
  }
  // contains
  for (const w of wanted) {
    const idx = low.findIndex((k) => k.includes(w.toLowerCase()));
    if (idx >= 0) return keys[idx];
  }
  return "";
}

function parseDateAny(v: any): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  // dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]) - 1;
    const yy = Number(m1[3]);
    return new Date(yy, mm, dd);
  }
  // dd-mm-yy or dd-mm-yyyy
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m2) {
    const dd = Number(m2[1]);
    const mm = Number(m2[2]) - 1;
    let yy = Number(m2[3]);
    if (yy < 100) yy += 2000;
    return new Date(yy, mm, dd);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function quarterOfMonth(m: number) {
  if (m <= 3) return 1;
  if (m <= 6) return 2;
  if (m <= 9) return 3;
  return 4;
}

export default function KpiCarousel(props: Props) {
  const [rows, setRows] = useState<HfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readCsvFromPublic(props.filePath)
      .then((r) => {
        if (!alive) return;
        setRows(r.rows as any[]);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message ?? "Error leyendo CSV");
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [props.filePath]);

  const slides = useMemo(() => {
    if (!rows.length) return [];

    const keys = Object.keys(rows[0] ?? {});
    const kHotel = getKey(keys, ["Empresa", "Hotel"]);
    const kFecha = getKey(keys, ["Fecha", "Date"]);
    const kHof = getKey(keys, ["HoF", "History", "Forecast"]);
    const kOccPct = getKey(keys, ["Occ.%", "Occ%", "OCC%"]);
    const kRoomRev = getKey(keys, ["Room Revenue", "RoomRevenue", "Room_Revenue"]);
    const kAdr = getKey(keys, ["Average Rate", "ADR", "AverageRate"]);
    const kRoomsOcc = getKey(keys, ["Total Occ.", "Total Occ", "Rooms Occupied", "Occ Rooms"]);

    const pickYear = (y: number) => {
      const out: HfRow[] = [];
      for (const r of rows) {
        const d = parseDateAny(r[kFecha]);
        if (!d) continue;
        if (d.getFullYear() !== y) continue;
        if (props.quarter !== 0 && quarterOfMonth(d.getMonth() + 1) !== props.quarter) continue;
        if (props.month !== 0 && d.getMonth() + 1 !== props.month) continue;
        const emp = String(r[kHotel] ?? "").trim();
        if (props.hotelFilter && emp !== props.hotelFilter) continue;
        // solo History/Forecast si existe
        if (kHof) {
          const hof = String(r[kHof] ?? "").toLowerCase();
          if (!(hof.includes("history") || hof.includes("forecast"))) continue;
        }
        out.push(r);
      }
      return out;
    };

    const calc = (rs: HfRow[]) => {
      const occAvg01 =
        rs.length === 0
          ? 0
          : rs.reduce((acc, r) => acc + toPercent01(toNumberSmart(r[kOccPct])), 0) / rs.length;

      const roomRev = rs.reduce((acc, r) => acc + toNumberSmart(r[kRoomRev]), 0);

      const adrAvg =
        rs.length === 0 ? 0 : rs.reduce((acc, r) => acc + toNumberSmart(r[kAdr]), 0) / rs.length;

      const roomsOcc = rs.reduce((acc, r) => acc + toNumberSmart(r[kRoomsOcc]), 0);

      // RevPAR aproximación operativa: ADR * Ocupación (si ADR está bien)
      const revpar = adrAvg * occAvg01;

      // “Doble ocupación” (proxy): Adultos&Niños / RoomsOcc si existe columna Adl.& Chl.
      const kAdlChl = getKey(keys, ["Adl. & Chl.", "Adl&Chl", "Adults", "Pax"]);
      const pax = rs.reduce((acc, r) => acc + toNumberSmart(r[kAdlChl]), 0);
      const dobleOcc = safeDiv(pax, roomsOcc);

      return { occAvg01, roomRev, adrAvg, revpar, dobleOcc };
    };

    const cur = calc(pickYear(props.year));
    const base = calc(pickYear(props.baseYear));

    const delta = (a: number, b: number) => (b === 0 ? 0 : (a - b) / b);

    const items = [
      { k: "Ocupación promedio", v: formatPct01(cur.occAvg01), d: delta(cur.occAvg01, base.occAvg01) },
      { k: "ADR promedio", v: formatMoney(cur.adrAvg), d: delta(cur.adrAvg, base.adrAvg) },
      { k: "RevPAR (ADR×Occ)", v: formatMoney(cur.revpar), d: delta(cur.revpar, base.revpar) },
      { k: "Doble ocupación (Pax/RoomOcc)", v: cur.dobleOcc.toFixed(2), d: delta(cur.dobleOcc, base.dobleOcc) },
      { k: "Room Revenue (acumulado)", v: formatMoney(cur.roomRev), d: delta(cur.roomRev, base.roomRev) },
    ];

    return items;
  }, [rows, props.year, props.baseYear, props.hotelFilter, props.quarter, props.month]);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!slides.length) return;
    const t = setInterval(() => setIdx((p) => (p + 1) % slides.length), 3500);
    return () => clearInterval(t);
  }, [slides.length]);

  const a = ACC[props.accent];

  if (loading) {
    return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Cargando KPIs…</div>;
  }
  if (err) {
    return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Error: {err}</div>;
  }
  if (!slides.length) {
    return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Sin datos para KPIs.</div>;
  }

  const cur = slides[idx];

  const arrow = cur.d >= 0 ? "▲" : "▼";
  const deltaTxt = (cur.d * 100).toFixed(1) + "%";

  return (
    <div style={{ display: "grid", gap: ".65rem" }}>
      <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>{props.title}</div>

      <div
        className="card"
        style={{
          borderRadius: 18,
          padding: "1rem",
          border: `1px solid ${a.border}`,
          background: a.grad,
          color: "white",
          display: "flex",
          justifyContent: "space-between",
          gap: "1rem",
          alignItems: "center",
        }}
      >
        <div style={{ display: "grid", gap: ".35rem" }}>
          <div style={{ opacity: 0.92, fontWeight: 850 }}>{cur.k}</div>
          <div style={{ fontSize: "2.0rem", fontWeight: 1000, lineHeight: 1 }}>{cur.v}</div>
          <div style={{ opacity: 0.95, fontWeight: 900 }}>
            {arrow} {deltaTxt} vs {props.baseYear}
          </div>
        </div>

        <div style={{ display: "flex", gap: ".4rem" }}>
          {slides.map((_, i) => (
            <div
              key={i}
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: i === idx ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.35)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
