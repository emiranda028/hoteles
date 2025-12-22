"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic, CsvRow, toNumberSmart, toPercent01, safeDiv, formatMoney, formatPct } from "./csvClient";

type GlobalHotel = "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

type Props = {
  filePath: string;
  year: number;
  hotel: GlobalHotel;
};

function resolveCol(columns: string[], mustInclude: string[]): string | null {
  const norm = (s: string) =>
    s
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ")
      .replace(/\u00A0/g, " ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

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

export default function HighlightsCarousel({ filePath, year, hotel }: Props) {
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

  const kpi = useMemo(() => {
    if (!rows.length || !cols.length) return null;

    const colEmpresa = resolveCol(cols, ["EMPRESA"]) || "Empresa";
    const colFecha = resolveCol(cols, ["FECHA"]) || "Fecha";
    const colOccPct = resolveCol(cols, ["OCC.%"]) || "Occ.%";
    const colTotalOcc = resolveCol(cols, ["TOTAL", "OCC"]) || "Total\nOcc.";
    const colRev = resolveCol(cols, ["ROOM REVENUE"]) || "Room Revenue";

    const allowed = new Set(hotelsForFilter(hotel));

    const yRows = rows.filter((r) => {
      const emp = (r[colEmpresa] || "").trim().toUpperCase();
      if (!allowed.has(emp)) return false;

      // fecha puede venir "1/6/2022"
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

    for (const r of yRows) {
      const occ = toNumberSmart(r[colTotalOcc]);
      const rev = toNumberSmart(r[colRev]);
      const occPct = toPercent01(r[colOccPct]);
      if (isFinite(occ)) sumOcc += occ;
      if (isFinite(rev)) sumRev += rev;
      if (isFinite(occPct)) {
        sumOccPct += occPct;
        days += 1;
      }
    }

    const adr = safeDiv(sumRev, sumOcc);
    const occAvg = safeDiv(sumOccPct, days);
    const revpar = (isFinite(adr) && isFinite(occAvg)) ? adr * occAvg : NaN;

    return { sumRev, adr, occAvg, revpar };
  }, [rows, cols, year, hotel]);

  if (loading) {
    return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Cargando KPIs…</div>;
  }
  if (err) {
    return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Error: {err}</div>;
  }
  if (!kpi) {
    return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Sin datos (KPIs) para {hotel} en {year}.</div>;
  }

  const Card = ({ title, value, sub }: { title: string; value: string; sub?: string }) => (
    <div
      className="card"
      style={{
        padding: "1rem",
        borderRadius: 18,
        minWidth: 220,
        flex: "1 1 220px",
      }}
    >
      <div style={{ fontSize: ".9rem", opacity: 0.8, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: "1.35rem", fontWeight: 950, marginTop: ".35rem" }}>{value}</div>
      {sub ? <div style={{ marginTop: ".15rem", opacity: 0.7 }}>{sub}</div> : null}
    </div>
  );

  return (
    <div style={{ display: "flex", gap: ".8rem", flexWrap: "wrap" }}>
      <Card title="Room Revenue" value={formatMoney(kpi.sumRev)} />
      <Card title="ADR" value={formatMoney(kpi.adr)} />
      <Card title="Ocupación" value={formatPct(kpi.occAvg)} />
      <Card title="RevPAR" value={formatMoney(kpi.revpar)} sub="ADR × Ocupación (promedio)" />
    </div>
  );
}
