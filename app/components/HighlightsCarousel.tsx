"use client";

import React, { useEffect, useMemo, useState } from "react";
import { formatInt, formatMoneyUSD, formatPct01, parseFechaSmart, readCsvFromPublic, safeDiv, toNumberSmart, clamp01 } from "./csvClient";

type GlobalHotel = "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

type Props = {
  year: number;
  hotel: GlobalHotel;
  filePath: string;
};

type HfRow = Record<string, any>;

function monthKey(dt: Date): number {
  return dt.getMonth() + 1; // 1..12
}

function pick(row: HfRow, keys: string[]): any {
  for (const k of keys) if (row[k] !== undefined) return row[k];
  return undefined;
}

function aggregate(rows: HfRow[]) {
  let occNet = 0; // TotalOcc - HouseUse
  let pax = 0; // Adl & Chl
  let roomRevenue = 0;
  let adrSum = 0;
  let adrCount = 0;
  let occPctSum = 0;
  let occPctCount = 0;

  for (const r of rows) {
    const totalOcc = toNumberSmart(pick(r, ['Total Occ.', 'Total Occ', 'Total\nOcc.']));
    const houseUse = toNumberSmart(pick(r, ['House Use', 'House\nUse']));
    const occPct = toNumberSmart(pick(r, ['Occ.%', 'Occ.% ', 'Occ.%\n', 'Occ.%\r']));
    const rev = toNumberSmart(pick(r, ['Room Revenue', 'Room\nRevenue']));
    const adr = toNumberSmart(pick(r, ['Average Rate', 'Average\nRate']));
    const p = toNumberSmart(pick(r, ['Adl. & Chl.', 'Adl. &\nChl.']));

    const net = Math.max(0, totalOcc - houseUse);

    occNet += net;
    pax += p;
    roomRevenue += rev;

    if (adr > 0) {
      adrSum += adr;
      adrCount += 1;
    }
    if (occPct > 0) {
      occPctSum += occPct;
      occPctCount += 1;
    }
  }

  const adrAvg = adrCount ? adrSum / adrCount : 0;
  const occAvg = occPctCount ? occPctSum / occPctCount : 0; // ya viene 0..1 por toNumberSmart
  const dblOcc = safeDiv(pax, occNet); // >1 posible
  const revpar = adrAvg * clamp01(occAvg);

  return {
    occNet,
    pax,
    roomRevenue,
    adrAvg,
    occAvg,
    dblOcc,
    revpar,
  };
}

function CardKpi({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      className="card"
      style={{
        padding: "1rem",
        borderRadius: 18,
        minWidth: 220,
        scrollSnapAlign: "start",
      }}
    >
      <div style={{ fontWeight: 900, opacity: 0.9 }}>{title}</div>
      <div style={{ fontSize: "1.65rem", fontWeight: 950, marginTop: ".35rem" }}>{value}</div>
      {sub ? <div style={{ marginTop: ".35rem", opacity: 0.75 }}>{sub}</div> : null}
    </div>
  );
}

export default function HighlightsCarousel({ year, hotel, filePath }: Props) {
  const [rows, setRows] = useState<HfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readCsvFromPublic(filePath)
      .then((r) => {
        if (!alive) return;
        // CORRECCIÓN AQUÍ: Se añade 'unknown' para evitar el error de solapamiento de tipos en
