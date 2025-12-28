"use client";

import React, { useMemo } from "react";
import { useHofData } from "./HofDataProvider";
import { HofRow } from "./hofModel";
import { formatPct, safeDiv } from "./useCsvClient";

type Theme = "jcr" | "gotel";

function weightRooms(r: HofRow) {
  return Math.max(0, (r.totalOcc || 0) - (r.houseUse || 0));
}

function aggMonth(rows: HofRow[]) {
  const w = rows.reduce((a, r) => a + weightRooms(r), 0);
  const occ = safeDiv(rows.reduce((a, r) => a + (r.occPct01 || 0) * weightRooms(r), 0), w);
  const adr = safeDiv(rows.reduce((a, r) => a + (r.adr || 0) * weightRooms(r), 0), w);
  const revenue = rows.reduce((a, r) => a + (r.roomRevenue || 0), 0);
  return { occ, adr, revenue, days: rows.length };
}

function monthName(m: number) {
  const names = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return names[m - 1] ?? String(m);
}

export default function MonthRanking({
  group = "jcr",
  title,
}: {
  group?: Theme;
  title?: string;
}) {
  const theme: Theme = group;
  const { loading, error, year, jcrRows, maiteiRows, jcrHotel, hof } = useHofData();
  const rows = (theme === "gotel" ? maiteiRows : jcrRows).filter((r) => r.year === year);

  const data = useMemo(() => {
    const map = new Map<number, HofRow[]>();
    for (const r of rows) {
      const m = r.month || 0;
      if (!m) continue;
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(r);
    }

    const items = Array.from(map.entries()).map(([m, rr]) => {
      const a = aggMonth(rr);
      return { m, ...a };
    });

    // ranking por ocupación desc
    items.sort((a, b) => (b.occ || 0) - (a.occ || 0));
    return items;
  }, [rows]);

  const header =
    title ??
    (theme === "gotel"
      ? `Ranking de meses — Maitei · ${year}`
      : `Ranking de meses — JCR (${jcrHotel}) · ${year}`);

  return (
    <section className="section">
      <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
        {header}
      </div>
      <div style={{ fontSize: ".92rem", opacity: 0.8, marginTop: ".25rem" }}>
        HoF: {hof === "All" ? "History + Forecast" : hof}
      </div>

      <div style={{ marginTop: ".85rem" }}>
        {loading ? (
          <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Cargando ranking…</div>
        ) : error ? (
          <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Error: {error}</div>
        ) : data.length === 0 ? (
          <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Sin datos para ranking mensual.</div>
        ) : (
          <div className="card" style={{ padding: "1rem", borderRadius: 18, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.85 }}>
                  <th style={{ padding: ".45rem .35rem" }}>#</th>
                  <th style={{ padding: ".45rem .35rem" }}>Mes</th>
                  <th style={{ padding: ".45rem .35rem" }}>Ocupación</th>
                  <th style={{ padding: ".45rem .35rem" }}>ADR</th>
                  <th style={{ padding: ".45rem .35rem" }}>Room Revenue</th>
                  <th style={{ padding: ".45rem .35rem" }}>Días</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <tr key={r.m} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                    <td style={{ padding: ".45rem .35rem", fontWeight: 800 }}>{i + 1}</td>
                    <td style={{ padding: ".45rem .35rem" }}>{monthName(r.m)} ({r.m})</td>
                    <td style={{ padding: ".45rem .35rem", fontWeight: 800 }}>{formatPct(r.occ || 0)}</td>
                    <td style={{ padding: ".45rem .35rem" }}>{(r.adr || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}</td>
                    <td style={{ padding: ".45rem .35rem" }}>{(r.revenue || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}</td>
                    <td style={{ padding: ".45rem .35rem" }}>{r.days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
