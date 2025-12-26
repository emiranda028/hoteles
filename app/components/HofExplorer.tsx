"use client";

import React, { useEffect, useMemo, useState } from "react";
import { formatMoneyUSD, formatPct01, parseFechaSmart, readCsvFromPublic, toNumberSmart, formatInt } from "./csvClient";

type GlobalHotel = "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

type Props = {
  year: number;
  hotel: GlobalHotel;
  filePath: string;
};

type HfRow = Record<string, any>;

function pick(row: HfRow, keys: string[]): any {
  for (const k of keys) if (row[k] !== undefined) return row[k];
  return undefined;
}

function monthLabel(m: number) {
  return ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][m - 1] || String(m);
}

export default function HofExplorer({ year, hotel, filePath }: Props) {
  const [rows, setRows] = useState<HfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [hof, setHof] = useState<string>("ALL"); // History / Forecast / hoy / ALL

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readCsvFromPublic(filePath)
      .then((r) => {
        if (!alive) return;
        // CORRECCIÓN DE TIPO PARA VERCEL
        setRows(r as unknown as HfRow[]);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message || "Error leyendo CSV");
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  const yearRows = useMemo(() => {
    return rows
      .map((r) => ({ r, dt: parseFechaSmart(r) }))
      .filter(({ r, dt }) => {
        const emp = String(r["Empresa"] ?? "").trim();
        if (emp !== hotel) return false;
        if (!dt) return false;
        if (dt.getFullYear() !== year) return false;
        const hofVal = String(r["HoF"] ?? "").trim();
        if (hof !== "ALL" && hofVal !== hof) return false;
        if (dt.getMonth() + 1 !== month) return false;
        return true;
      })
      .sort((a, b) => (a.dt!.getTime() - b.dt!.getTime()))
      .map(({ r }) => r);
  }, [rows, hotel, year, month, hof]);

  const monthTotals = useMemo(() => {
    let revenue = 0;
    let adrSum = 0;
    let adrCount = 0;
    let occSum = 0;
    let occCount = 0;

    for (const r of yearRows) {
      revenue += toNumberSmart(pick(r, ["Room Revenue", "Room\nRevenue"]));
      const adr = toNumberSmart(pick(r, ["Average Rate", "Average\nRate"]));
      const occ = toNumberSmart(pick(r, ["Occ.%", "Occ.% ", "Occ.%\n"]));
      if (adr > 0) { adrSum += adr; adrCount += 1; }
      if (occ > 0) { occSum += occ; occCount += 1; }
    }

    return {
      revenue,
      adrAvg: adrCount ? adrSum / adrCount : 0,
      occAvg: occCount ? occSum / occCount : 0,
      days: yearRows.length,
    };
  }, [yearRows]);

  if (loading) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Cargando detalle…</div>;
  if (err) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Error: {err}</div>;

  return (
    <div style={{ marginTop: ".85rem" }}>
      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
        <div className="card" style={{ padding: ".5rem .75rem", borderRadius: 14 }}>
          <b>Mes</b>{" "}
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ marginLeft: ".35rem" }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <option key={i + 1} value={i + 1}>{monthLabel(i + 1)}</option>
            ))}
          </select>
        </div>

        <div className="card" style={{ padding: ".5rem .75rem", borderRadius: 14 }}>
          <b>HoF</b>{" "}
          <select value={hof} onChange={(e) => setHof(e.target.value)} style={{ marginLeft: ".35rem" }}>
            <option value="ALL">ALL</option>
            <option value="History">History</option>
            <option value="hoy">hoy</option>
            <option value="Forecast">Forecast</option>
          </select>
        </div>

        <div className="card" style={{ padding: ".5rem .75rem", borderRadius: 14, opacity: 0.9 }}>
          <b>Totales mes</b>: {formatMoneyUSD(monthTotals.revenue)} · ADR {formatMoneyUSD(monthTotals.adrAvg)} · Occ {formatPct01(monthTotals.occAvg)} · {formatInt(monthTotals.days)} días
        </div>
      </div>

      {!yearRows.length ? (
        <div className="card" style={{ padding: "1rem", borderRadius: 18, marginTop
