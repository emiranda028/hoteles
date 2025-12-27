"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  readCsvFromPublic,
  toNumberSmart,
  toPercent01,
  getYearFromRow,
  getMonthFromRow,
  parseDMY,
  formatMoneyUSD0,
  formatPct01,
  formatInt,
  safeDiv,
} from "./useCsvClient";

export type HofHotel = "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

export type HofRow = {
  // claves normalizadas
  empresa: string;
  hof: string;
  fecha: Date | null;
  year: number | null;
  month: number | null;

  totalOcc: number;
  arrRooms: number;
  compRooms: number;
  houseUse: number;

  occPct: number; // 0..1
  roomRevenue: number;
  averageRate: number;

  adlChl: number;
};

function pickKey(keys: string[], wanted: string[]) {
  const norm = (s: string) => s.trim().toLowerCase();
  const map = new Map(keys.map((k) => [norm(k), k] as const));
  for (const w of wanted) {
    const k = map.get(norm(w));
    if (k) return k;
  }
  // fallback: busca contiene
  for (const w of wanted) {
    const ww = norm(w);
    const found = keys.find((k) => norm(k).includes(ww));
    if (found) return found;
  }
  return "";
}

export type HofDataset = {
  rows: HofRow[];
  keys: string[];
  dateKey: string;
  empresaKey: string;
  hofKey: string;
};

export function useHofDataset(filePath: string) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState<HofDataset | null>(null);

  useEffect(() => {
    let alive = true;

    setLoading(true);
    setErr("");

    readCsvFromPublic(filePath)
      .then((rawRows) => {
        if (!alive) return;

        const keys = Object.keys(rawRows?.[0] ?? {});
        const empresaKey = pickKey(keys, ["Empresa"]);
        const hofKey = pickKey(keys, ["HoF", "Hof", "History/Forecast"]);
        const dateKey = pickKey(keys, ["Fecha"]);

        const kTotalOcc = pickKey(keys, ['Total Occ.', "Total Occ", "Total Occ."]);
        const kArr = pickKey(keys, ['Arr. Rooms', "Arr Rooms", "Arr." ]);
        const kComp = pickKey(keys, ['Comp. Rooms', "Comp Rooms", "Comp." ]);
        const kHouse = pickKey(keys, ['House Use', "HouseUse"]);
        const kOccPct = pickKey(keys, ["Occ.%", "Occ%"]);
        const kRev = pickKey(keys, ["Room Revenue", "RoomRevenue"]);
        const kADR = pickKey(keys, ["Average Rate", "ADR"]);
        const kAdl = pickKey(keys, ['Adl. & Chl.', "Adl & Chl", "Adl."]);

        const normalized: HofRow[] = rawRows.map((r) => {
          const fechaStr = String(r[dateKey] ?? "");
          const fecha = parseDMY(fechaStr);
          const year = getYearFromRow(r, dateKey);
          const month = getMonthFromRow(r, dateKey);

          return {
            empresa: String(r[empresaKey] ?? "").trim(),
            hof: String(r[hofKey] ?? "").trim(),
            fecha,
            year,
            month,

            totalOcc: toNumberSmart(r[kTotalOcc]),
            arrRooms: toNumberSmart(r[kArr]),
            compRooms: toNumberSmart(r[kComp]),
            houseUse: toNumberSmart(r[kHouse]),

            occPct: toPercent01(r[kOccPct]),
            roomRevenue: toNumberSmart(r[kRev]),
            averageRate: toNumberSmart(r[kADR]),

            adlChl: toNumberSmart(r[kAdl]),
          };
        });

        setData({
          rows: normalized,
          keys,
          dateKey,
          empresaKey,
          hofKey,
        });

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
  }, [filePath]);

  return { loading, err, data };
}

/* ======================
   KPIs / agregaciones
====================== */

export type HofKpis = {
  days: number;
  avgOcc: number;        // promedio simple de occPct (0..1) para evitar >100%
  totalRevenue: number;  // sum roomRevenue
  approxADR: number;     // revenue / (arr+comp) (aprox)
  totalRoomsSold: number;
};

export function computeKpis(rows: HofRow[]): HofKpis {
  const days = rows.length;

  const totalRevenue = rows.reduce((a, r) => a + (r.roomRevenue || 0), 0);
  const totalRoomsSold = rows.reduce((a, r) => a + (r.arrRooms || 0) + (r.compRooms || 0), 0);

  const avgOcc =
    days === 0 ? 0 : rows.reduce((a, r) => a + (r.occPct || 0), 0) / days;

  const approxADR = safeDiv(totalRevenue, totalRoomsSold);

  return { days, avgOcc, totalRevenue, approxADR, totalRoomsSold };
}

export type MonthlyAgg = {
  month: number; // 1..12
  days: number;
  kpis: HofKpis;
};

export function groupByMonth(rows: HofRow[]): MonthlyAgg[] {
  const m = new Map<number, HofRow[]>();
  for (const r of rows) {
    const mm = r.month ?? null;
    if (!mm) continue;
    if (!m.has(mm)) m.set(mm, []);
    m.get(mm)!.push(r);
  }

  const out: MonthlyAgg[] = Array.from(m.entries())
    .map(([month, rs]) => ({ month, days: rs.length, kpis: computeKpis(rs) }))
    .sort((a, b) => a.month - b.month);

  return out;
}

/* ======================
   UI: cards simples
====================== */

export function KpiCards({ kpis }: { kpis: HofKpis }) {
  const Card = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="card" style={{ padding: ".85rem 1rem", borderRadius: 18 }}>
      <div style={{ fontSize: ".9rem", opacity: 0.8 }}>{label}</div>
      <div style={{ fontSize: "1.35rem", fontWeight: 900, marginTop: ".2rem" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: ".75rem" }}>
      <Card label="Ocupación promedio" value={formatPct01(kpis.avgOcc)} />
      <Card label="Revenue (Rooms)" value={formatMoneyUSD0(kpis.totalRevenue)} />
      <Card label="ADR aprox" value={formatMoneyUSD0(kpis.approxADR)} />
      <Card label="Rooms sold (Arr+Comp)" value={formatInt(kpis.totalRoomsSold)} />
    </div>
  );
}
