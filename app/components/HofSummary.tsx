"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic, CsvRow, toNumberSmart, toPercent01, safeDiv, formatMoney, formatPct } from "./csvClient";

type GlobalHotel = "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

type Props = {
  filePath: string;
  year: number;
  hotel: GlobalHotel;
};

function norm(s: string) {
  return (s || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function resolveCol(columns: string[], mustInclude: string[]): string | null {
  const cols = columns.map((c) => ({ raw: c, n: norm(c) }));
  const want = mustInclude.map(norm);
  for (const c of cols) {
    let ok = true;
    for (const w of want) if (!c.n.includes(w)) ok = false;
    if (ok) return c.raw;
  }
  return null;
}

function hotelsForFilter(h: GlobalHotel): string[] {
  if (h === "JCR") return ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
  return [h];
}

export default function HofSummary({ filePath, year, hotel }: Props) {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readCsvFromPublic(filePath)
      .then(({ rows, columns }) => {
        if (!alive) return;
        setRows(rows);
        setCols(columns);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(String(e?.message || e));
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  const summary = useMemo(() => {
    if (!rows.length || !cols.length) return null;

    const colEmpresa = resolveCol(cols, ["EMPRESA"]) || "Empresa";
    const colFecha = resolveCol(cols, ["FECHA"]) || "Fecha";
    const colOccPct = resolveCol(cols, ["OCC.%"]) || "Occ.%";
    const colTotalOcc = resolveCol(cols, ["TOTAL", "OCC"]) || "Total\nOcc.";
    const colRev = resolveCol(cols, ["ROOM REVENUE"]) || "Room Revenue";
    const colArr = resolveCol(cols, ["ARR.", "ROOMS"]) || 'Arr.\nRooms';
    const colComp = resolveCol(cols, ["COMP.", "ROOMS"]) || 'Comp.\nRooms';

    const allowed = new Set(hotelsForFilter(hotel));

    const yRows = rows.filter((r) => {
      const emp = (r[colEmpresa] || "").trim().toUpperCase();
      if (!allowed.has(emp)) return false;

      const f = (r[colFecha] || "").trim();
      const m = f.match(/\/(\d{4})$/) || f.match(/^(\d{4})-/);
      const y = m ? Number(m[1]) : NaN;
      return y === year;
    });

    if (!yRows.length) return null;

    let sumOcc = 0;
    let sumRev = 0;
    let sumOccPct = 0;
    let days = 0;

    let sumArr = 0;
    let sumComp = 0;

    for (const r of yRows) {
      const occ = toNumberSmart(r[colTotalOcc]);
      const rev = toNumberSmart(r[colRev]);
      const occPct = toPercent01(r[colOccPct]);
      const arr = toNumberSmart(r[colArr]);
      const comp = toNumberSmart(r[colComp]);

      if (isFinite(occ)) sumOcc += occ;
      if (isFinite(rev)) sumRev += rev;
      if (isFinite(occPct)) {
        sumOccPct += occPct;
        days += 1;
      }
      if (isFinite(arr)) sumArr += arr;
      if (isFinite(comp)) sumComp += comp;
    }

    const adr = safeDiv(sumRev, sumOcc);
    const occAvg = safeDiv(sumOccPct, days);
    const revpar = (isFinite(adr) && isFinite(occAvg)) ? adr * occAvg : NaN;

    return { sumOcc, sumRev, adr, occAvg, revpar, sumArr, sumComp, countDays: days };
  }, [rows, cols, year, hotel]);

  if (loading) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Cargando H&F…</div>;
  if (err) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Error: {err}</div>;
  if (!summary) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Sin datos H&F para {hotel} en {year}.</div>;

  const Metric = ({ label, value }: { label: string; value: string }) => (
    <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
      <div style={{ fontSize: ".9rem", opacity: 0.8, fontWeight: 900 }}>{label}</div>
      <div style={{ fontSize: "1.3rem", fontWeight: 950, marginTop: ".35rem" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: ".8rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
      <Metric label="Room Revenue (Total)" value={formatMoney(summary.sumRev)} />
      <Metric label="ADR" value={formatMoney(summary.adr)} />
      <Metric label="Ocupación (promedio)" value={formatPct(summary.occAvg)} />
      <Metric label="RevPAR" value={formatMoney(summary.revpar)} />
      <Metric label="Total Occ (suma)" value={Math.round(summary.sumOcc).toLocaleString("es-AR")} />
      <Metric label="Arr. Rooms (suma)" value={Math.round(summary.sumArr).toLocaleString("es-AR")} />
      <Metric label="Comp. Rooms (suma)" value={Math.round(summary.sumComp).toLocaleString("es-AR")} />
      <Metric label="Días con datos" value={String(summary.countDays)} />
    </div>
  );
}
