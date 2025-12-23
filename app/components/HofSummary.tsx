"use client";

import React, { useEffect, useMemo, useState } from "react";
import { clamp01, formatInt, formatMoneyUSD, formatPct01, parseFechaSmart, readCsvFromPublic, safeDiv, toNumberSmart } from "./csvClient";

type GlobalHotel = "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

type Props = {
  year: number;
  baseYear: number;
  hotel: GlobalHotel;
  filePath: string;
  title?: string;
};

type HfRow = Record<string, any>;

function pick(row: HfRow, keys: string[]): any {
  for (const k of keys) if (row[k] !== undefined) return row[k];
  return undefined;
}

function aggregate(rows: HfRow[]) {
  let roomRevenue = 0;
  let adrSum = 0;
  let adrCount = 0;
  let occPctSum = 0;
  let occPctCount = 0;
  let totalOccNet = 0;
  let pax = 0;

  for (const r of rows) {
    const totalOcc = toNumberSmart(pick(r, ['Total Occ.', 'Total Occ', 'Total\nOcc.']));
    const houseUse = toNumberSmart(pick(r, ['House Use', 'House\nUse']));
    const occPct = toNumberSmart(pick(r, ['Occ.%', 'Occ.% ', 'Occ.%\n']));
    const rev = toNumberSmart(pick(r, ['Room Revenue', 'Room\nRevenue']));
    const adr = toNumberSmart(pick(r, ['Average Rate', 'Average\nRate']));
    const p = toNumberSmart(pick(r, ['Adl. & Chl.', 'Adl. &\nChl.']));

    totalOccNet += Math.max(0, totalOcc - houseUse);
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
  const occAvg = occPctCount ? occPctSum / occPctCount : 0;
  const dblOcc = safeDiv(pax, totalOccNet);
  const revpar = adrAvg * clamp01(occAvg);

  return { roomRevenue, adrAvg, occAvg, dblOcc, pax, totalOccNet, revpar };
}

function KPI({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
      <div style={{ fontWeight: 900, opacity: 0.9 }}>{label}</div>
      <div style={{ fontSize: "1.55rem", fontWeight: 950, marginTop: ".25rem" }}>{value}</div>
      {hint ? <div style={{ marginTop: ".35rem", opacity: 0.75, fontSize: ".95rem" }}>{hint}</div> : null}
    </div>
  );
}

export default function HofSummary({ year, baseYear, hotel, filePath, title }: Props) {
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
        setRows(r as HfRow[]);
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

  const rowsYear = useMemo(() => {
    return rows.filter((r) => {
      const emp = String(r["Empresa"] ?? "").trim();
      if (emp !== hotel) return false;
      const dt = parseFechaSmart(r);
      if (!dt) return false;
      if (dt.getFullYear() !== year) return false;
      return true;
    });
  }, [rows, hotel, year]);

  const rowsBase = useMemo(() => {
    return rows.filter((r) => {
      const emp = String(r["Empresa"] ?? "").trim();
      if (emp !== hotel) return false;
      const dt = parseFechaSmart(r);
      if (!dt) return false;
      if (dt.getFullYear() !== baseYear) return false;
      return true;
    });
  }, [rows, hotel, baseYear]);

  const aggY = useMemo(() => aggregate(rowsYear), [rowsYear]);
  const aggB = useMemo(() => aggregate(rowsBase), [rowsBase]);

  if (loading) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Cargando H&amp;F…</div>;
  if (err) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Error: {err}</div>;

  return (
    <div>
      <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
        {title || `H&F — KPIs ${year} (vs ${baseYear})`}
      </div>

      {!rowsYear.length ? (
        <div className="card" style={{ padding: "1rem", borderRadius: 18, marginTop: ".75rem" }}>
          Sin filas H&amp;F para {hotel} en {year}.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: ".75rem",
            marginTop: ".75rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          }}
        >
          <KPI label="Ocupación (prom.)" value={formatPct01(aggY.occAvg)} hint="Promedio del campo Occ.%" />
          <KPI label="ADR (prom.)" value={formatMoneyUSD(aggY.adrAvg)} hint="Promedio del Average Rate" />
          <KPI label="REVPAR (estim.)" value={formatMoneyUSD(aggY.revpar)} hint="ADR × Ocupación" />
          <KPI label="Room Revenue" value={formatMoneyUSD(aggY.roomRevenue)} hint="Suma del año" />
          <KPI label="Pax (Adl.&Chl.)" value={formatInt(aggY.pax)} hint="Suma del año" />
          <KPI label="Doble ocupación" value={(aggY.dblOcc * 100).toFixed(0) + "%"} hint="Pax / (TotalOcc - HouseUse)" />
        </div>
      )}

      {/* Comparativa simple YoY */}
      {rowsYear.length && rowsBase.length ? (
        <div className="card" style={{ padding: "1rem", borderRadius: 18, marginTop: ".85rem" }}>
          <div style={{ fontWeight: 900 }}>Comparativa rápida</div>
          <div style={{ marginTop: ".35rem", opacity: 0.85 }}>
            Room Revenue: <b>{formatMoneyUSD(aggY.roomRevenue)}</b> vs {formatMoneyUSD(aggB.roomRevenue)}{" "}
            <span style={{ opacity: 0.75 }}>
              ({(((aggY.roomRevenue - aggB.roomRevenue) / (aggB.roomRevenue || 1)) * 100).toFixed(1)}%)
            </span>
          </div>
          <div style={{ marginTop: ".25rem", opacity: 0.85 }}>
            Ocupación (prom.): <b>{formatPct01(aggY.occAvg)}</b> vs {formatPct01(aggB.occAvg)}
          </div>
          <div style={{ marginTop: ".25rem", opacity: 0.85 }}>
            ADR (prom.): <b>{formatMoneyUSD(aggY.adrAvg)}</b> vs {formatMoneyUSD(aggB.adrAvg)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
