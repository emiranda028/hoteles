"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic, CsvRow } from "./csvClient";
import type { HofHotel } from "./HofExplorer";

type Props = {
  filePath: string;
  year: number;
  baseYear: number;
  hotel: HofHotel;
};

type Hf = {
  empresa: string;
  year: number;
  month: number;
  totalRooms: number;
  occ: number;
  inHouse: number;
  adrWsum: number;
  adrW: number;
  roomRevenue: number;
  totalRevenue: number;
};

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function norm(s: any) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function parseNumber(v: any): number {
  const s = norm(v);
  if (!s) return 0;
  const cleaned = s.replace(/\./g, "").replace(/,/g, ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseDateFlexible(v: any): Date | null {
  const s = norm(v);
  if (!s) return null;

  const d1 = new Date(s);
  if (!isNaN(d1.getTime())) return d1;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const yy = parseInt(m[3].length === 2 ? "20" + m[3] : m[3], 10);
    const d = new Date(yy, mm - 1, dd);
    if (!isNaN(d.getTime())) return d;
  }

  const n = parseInt(s, 10);
  if (Number.isFinite(n) && n > 20000 && n < 90000) {
    const base = new Date(Date.UTC(1899, 11, 30));
    base.setUTCDate(base.getUTCDate() + n);
    return new Date(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  }

  return null;
}

function getField(row: CsvRow, wanted: string[]): string {
  for (let i = 0; i < wanted.length; i++) {
    const k = wanted[i];
    if (k in row) return row[k] || "";
  }
  return "";
}

function normalizeEmpresa(e: string): string {
  const up = norm(e).toUpperCase();
  if (!up) return "";
  if (up.includes("MARRIOTT")) return "MARRIOTT";
  if (up.includes("SHERATON") && (up.includes("BCR") || up.includes("BUENOS"))) return "SHERATON BCR";
  if (up.includes("SHERATON") && (up.includes("MDQ") || up.includes("MAR DEL") || up.includes("MDP"))) return "SHERATON MDQ";
  if (up.includes("MAITEI") || up.includes("GOTEL") || up.includes("POSADAS")) return "MAITEI";
  if (up === "SHERATON BCR" || up === "SHERATON MDQ" || up === "MARRIOTT" || up === "MAITEI") return up;
  return up;
}

function expandHotel(h: HofHotel): string[] {
  if (h === "JCR") return ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
  return [h];
}

function safeDiv(a: number, b: number) {
  if (!b) return 0;
  const x = a / b;
  return Number.isFinite(x) ? x : 0;
}

export default function HofSummary({ filePath, year, baseYear, hotel }: Props) {
  const [rows, setRows] = useState<Hf[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readCsvFromPublic(filePath)
      .then((res) => {
        if (!alive) return;

        const raw = res.rows || [];
        const out: Hf[] = [];

        for (let i = 0; i < raw.length; i++) {
          const r = raw[i];
          const empresa = normalizeEmpresa(getField(r, ["Empresa", "empresa", "Hotel", "hotel"]));
          const dateStr = getField(r, ["Fecha", "fecha", "Date", "date", "Día", "Dia"]);
          const fecha = parseDateFlexible(dateStr);
          if (!empresa || !fecha) continue;

          const y = fecha.getFullYear();
          const m = fecha.getMonth() + 1;

          const totalRooms = parseNumber(getField(r, ["Total Rooms in Hotel", "Total Rooms", "TotalRooms"]));
          const occ = parseNumber(getField(r, ["Rooms Occupied minus House Use", "Rooms Occ minus HU", "Occupied Rooms"]));
          const inHouse = parseNumber(getField(r, ["Total In-House Persons", "In-House", "InHousePersons"]));

          const adr = parseNumber(getField(r, ["ADR", "Average Rate", "AverageRate"]));
          const roomRevenue = parseNumber(getField(r, ["Room Revenue", "RoomRevenue"]));
          const totalRevenue = parseNumber(getField(r, ["Ventas Totales", "Total Revenue", "TotalRevenue", "Total Sales"]));

          out.push({
            empresa,
            year: y,
            month: m,
            totalRooms,
            occ,
            inHouse,
            adrWsum: adr * (occ || 0),
            adrW: occ || 0,
            roomRevenue,
            totalRevenue,
          });
        }

        setRows(out);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message || "Error leyendo CSV");
        setRows([]);
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  const allowed = useMemo(() => expandHotel(hotel), [hotel]);

  const agg = useMemo(() => {
    const build = (yy: number) => {
      const byM: Record<number, Hf> = {};
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.year !== yy) continue;
        if (allowed.indexOf(r.empresa) === -1) continue;

        const key = r.month;
        if (!byM[key]) {
          byM[key] = {
            empresa: "—",
            year: yy,
            month: key,
            totalRooms: 0,
            occ: 0,
            inHouse: 0,
            adrWsum: 0,
            adrW: 0,
            roomRevenue: 0,
            totalRevenue: 0,
          };
        }
        byM[key].totalRooms += r.totalRooms || 0;
        byM[key].occ += r.occ || 0;
        byM[key].inHouse += r.inHouse || 0;
        byM[key].adrWsum += r.adrWsum || 0;
        byM[key].adrW += r.adrW || 0;
        byM[key].roomRevenue += r.roomRevenue || 0;
        byM[key].totalRevenue += r.totalRevenue || 0;
      }

      const list: (Hf & { occRate: number; adr: number; dblOcc: number; revpar: number })[] = [];
      for (let m = 1; m <= 12; m++) {
        const x = byM[m];
        if (!x) continue;
        const adr = safeDiv(x.adrWsum, x.adrW);
        const occRate = safeDiv(x.occ, x.totalRooms);
        const dblOcc = safeDiv(x.inHouse, x.occ);
        const revpar = adr * dblOcc;
        list.push({ ...x, adr, occRate, dblOcc, revpar });
      }
      return list;
    };

    return {
      cur: build(year),
      base: build(baseYear),
    };
  }, [rows, allowed, year, baseYear]);

  const kpi = useMemo(() => {
    const sum = (list: any[]) => {
      let totalRooms = 0,
        occ = 0,
        inHouse = 0,
        adrWsum = 0,
        adrW = 0,
        roomRevenue = 0,
        totalRevenue = 0;

      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        totalRooms += r.totalRooms || 0;
        occ += r.occ || 0;
        inHouse += r.inHouse || 0;
        adrWsum += (r.adr || 0) * (r.occ || 0);
        adrW += r.occ || 0;
        roomRevenue += r.roomRevenue || 0;
        totalRevenue += r.totalRevenue || 0;
      }

      const adr = safeDiv(adrWsum, adrW);
      const occRate = safeDiv(occ, totalRooms);
      const dblOcc = safeDiv(inHouse, occ);
      const revpar = adr * dblOcc;

      return { totalRooms, occ, inHouse, adr, occRate, dblOcc, revpar, roomRevenue, totalRevenue };
    };

    return { cur: sum(agg.cur), base: sum(agg.base) };
  }, [agg]);

  if (loading) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Cargando comparativa…</div>;
  if (err) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}><b>Error:</b> {err}</div>;

  if (!agg.cur.length) {
    return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Sin datos para {hotel} en {year}.</div>;
  }

  const delta = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: ".75rem",
        }}
      >
        {[
          { label: "Ocupación", v: kpi.cur.occRate * 100, b: kpi.base.occRate * 100, fmt: (x: number) => `${x.toFixed(1)}%` },
          { label: "ADR", v: kpi.cur.adr, b: kpi.base.adr, fmt: (x: number) => x.toFixed(2) },
          { label: "Doble ocup.", v: kpi.cur.dblOcc, b: kpi.base.dblOcc, fmt: (x: number) => x.toFixed(2) },
          { label: "REVPar", v: kpi.cur.revpar, b: kpi.base.revpar, fmt: (x: number) => x.toFixed(2) },
          { label: "Room Revenue", v: kpi.cur.roomRevenue, b: kpi.base.roomRevenue, fmt: (x: number) => x.toFixed(0) },
          { label: "Ventas Totales", v: kpi.cur.totalRevenue, b: kpi.base.totalRevenue, fmt: (x: number) => x.toFixed(0) },
        ].map((k) => {
          const d = delta(k.v, k.b);
          const ok = Number.isFinite(d);
          return (
            <div
              key={k.label}
              className="card"
              style={{
                padding: ".9rem",
                borderRadius: 18,
                background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.05))",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <div style={{ opacity: 0.85, fontWeight: 850 }}>{k.label}</div>
              <div style={{ fontSize: "1.35rem", fontWeight: 950, marginTop: ".15rem" }}>{k.fmt(k.v)}</div>
              <div style={{ marginTop: ".25rem", opacity: 0.9 }}>
                vs {baseYear}:{" "}
                <b style={{ color: ok && d >= 0 ? "#A7F3D0" : "#FECACA" }}>{ok ? `${d >= 0 ? "+" : ""}${d.toFixed(1)}%` : "—"}</b>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabla comparativa mensual */}
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 950 }}>
          Comparativa mensual — {hotel} — {year} vs {baseYear}
        </div>

        <div style={{ marginTop: ".85rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.9 }}>
                <th style={{ padding: ".5rem .4rem" }}>Mes</th>
                <th style={{ padding: ".5rem .4rem" }}>Occ {year}</th>
                <th style={{ padding: ".5rem .4rem" }}>Occ {baseYear}</th>
                <th style={{ padding: ".5rem .4rem" }}>ADR {year}</th>
                <th style={{ padding: ".5rem .4rem" }}>ADR {baseYear}</th>
                <th style={{ padding: ".5rem .4rem" }}>REVPar {year}</th>
                <th style={{ padding: ".5rem .4rem" }}>REVPar {baseYear}</th>
                <th style={{ padding: ".5rem .4rem" }}>Ventas {year}</th>
                <th style={{ padding: ".5rem .4rem" }}>Ventas {baseYear}</th>
              </tr>
            </thead>
            <tbody>
              {agg.cur.map((c) => {
                const b = agg.base.find((x) => x.month === c.month);
                const bOcc = b ? b.occRate : 0;
                const bAdr = b ? b.adr : 0;
                const bRev = b ? b.revpar : 0;
                const bTot = b ? b.totalRevenue : 0;

                return (
                  <tr key={c.month} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={{ padding: ".55rem .4rem", fontWeight: 900 }}>{MONTHS[c.month - 1]}</td>
                    <td style={{ padding: ".55rem .4rem" }}>{(c.occRate * 100).toFixed(1)}%</td>
                    <td style={{ padding: ".55rem .4rem" }}>{(bOcc * 100).toFixed(1)}%</td>
                    <td style={{ padding: ".55rem .4rem" }}>{c.adr.toFixed(2)}</td>
                    <td style={{ padding: ".55rem .4rem" }}>{bAdr ? bAdr.toFixed(2) : "—"}</td>
                    <td style={{ padding: ".55rem .4rem" }}>{c.revpar.toFixed(2)}</td>
                    <td style={{ padding: ".55rem .4rem" }}>{bRev ? bRev.toFixed(2) : "—"}</td>
                    <td style={{ padding: ".55rem .4rem" }}>{c.totalRevenue.toFixed(0)}</td>
                    <td style={{ padding: ".55rem .4rem" }}>{bTot ? bTot.toFixed(0) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
