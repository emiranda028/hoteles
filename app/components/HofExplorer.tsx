"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic, CsvRow } from "./csvClient";

export type HofHotel = "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";
export type HofMode = "History" | "Forecast";

type Props = {
  filePath: string; // /data/hf_diario.csv
  year: number;
  hotel: HofHotel;
  mode?: HofMode | "All";
};

type HfRow = {
  empresa: string;
  hof: HofMode;
  fecha: Date;
  year: number;
  month: number; // 1-12
  day: number;

  totalRooms: number;
  roomsOccMinusHU: number;
  inHouse: number;

  adr: number;
  roomRevenue: number;
  fnbRevenue: number;
  otherRevenue: number;
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
  const cleaned = s
    .replace(/\./g, "") // miles
    .replace(/,/g, ".") // decimal
    .replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseDateFlexible(v: any): Date | null {
  const s = norm(v);
  if (!s) return null;

  // si viene yyyy-mm-dd o dd/mm/yyyy lo intentamos
  const d1 = new Date(s);
  if (!isNaN(d1.getTime())) return d1;

  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const yy = parseInt(m[3].length === 2 ? "20" + m[3] : m[3], 10);
    const d = new Date(yy, mm - 1, dd);
    if (!isNaN(d.getTime())) return d;
  }

  // excel date serial (ej 46004)
  const n = parseInt(s, 10);
  if (Number.isFinite(n) && n > 20000 && n < 90000) {
    // Excel serial: days since 1899-12-30
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

  // fallback: si ya viene en limpio:
  if (up === "SHERATON BCR" || up === "SHERATON MDQ" || up === "MARRIOTT" || up === "MAITEI") return up;

  return up;
}

function expandHotel(h: HofHotel): string[] {
  if (h === "JCR") return ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
  return [h];
}

function safeDiv(a: number, b: number): number {
  if (!b) return 0;
  const x = a / b;
  return Number.isFinite(x) ? x : 0;
}

export default function HofExplorer({ filePath, year, hotel, mode = "All" }: Props) {
  const [rows, setRows] = useState<HfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr("");

    readCsvFromPublic(filePath)
      .then((res) => {
        if (!mounted) return;

        const raw = res.rows || [];
        const parsed: HfRow[] = [];

        for (let i = 0; i < raw.length; i++) {
          const r = raw[i];

          const empresa = normalizeEmpresa(
            getField(r, ["Empresa", "empresa", "Hotel", "hotel", "Property", "property", "HoF Empresa"])
          );

          const hofStr = norm(getField(r, ["HoF", "Hof", "hof", "Tipo", "tipo"]));
          const hof: HofMode = hofStr.toLowerCase().includes("forecast") ? "Forecast" : "History";

          const dateStr = getField(r, ["Fecha", "fecha", "Date", "date", "Día", "Dia"]);
          const fecha = parseDateFlexible(dateStr);
          if (!empresa || !fecha) continue;

          const totalRooms = parseNumber(getField(r, ["Total Rooms in Hotel", "Total Rooms", "TotalRooms", "Total Rooms in the Hotel"]));
          const roomsOccMinusHU = parseNumber(getField(r, ["Rooms Occupied minus House Use", "Rooms Occ minus HU", "Rooms Occupied", "Occupied Rooms"]));
          const inHouse = parseNumber(getField(r, ["Total In-House Persons", "In-House", "Total In House Persons", "InHousePersons"]));

          const adr = parseNumber(getField(r, ["ADR", "Average Rate", "AverageRate"]));
          const roomRevenue = parseNumber(getField(r, ["Room Revenue", "RoomRevenue"]));
          const fnbRevenue = parseNumber(getField(r, ["Food And Beverage Revenue", "Food And Beverage", "F&B Revenue", "FnbRevenue"]));
          const otherRevenue = parseNumber(getField(r, ["Other Revenue", "OtherRevenue"]));
          const totalRevenue = parseNumber(getField(r, ["Ventas Totales", "Ventas", "Total Revenue", "TotalRevenue", "Total Sales"]));

          const y = fecha.getFullYear();
          const m = fecha.getMonth() + 1;
          const d = fecha.getDate();

          parsed.push({
            empresa,
            hof,
            fecha,
            year: y,
            month: m,
            day: d,
            totalRooms,
            roomsOccMinusHU,
            inHouse,
            adr,
            roomRevenue,
            fnbRevenue,
            otherRevenue,
            totalRevenue,
          });
        }

        setRows(parsed);
        setLoading(false);
      })
      .catch((e) => {
        if (!mounted) return;
        setErr(e?.message || "Error leyendo CSV");
        setRows([]);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [filePath]);

  const filtered = useMemo(() => {
    const allowed = expandHotel(hotel);
    const out: HfRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.year !== year) continue;
      if (allowed.indexOf(r.empresa) === -1) continue;
      if (mode !== "All" && r.hof !== mode) continue;
      out.push(r);
    }

    // ordenar por fecha
    out.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    return out;
  }, [rows, year, hotel, mode]);

  const byMonth = useMemo(() => {
    const bucket: Record<number, HfRow[]> = {};
    for (let i = 0; i < filtered.length; i++) {
      const r = filtered[i];
      if (!bucket[r.month]) bucket[r.month] = [];
      bucket[r.month].push(r);
    }
    return bucket;
  }, [filtered]);

  const monthSummary = useMemo(() => {
    // métricas correctas: ocupación = sum(occ)/sum(totalRooms) NO sumar porcentajes
    type M = {
      month: number;
      totalRooms: number;
      occ: number;
      inHouse: number;
      roomRevenue: number;
      fnbRevenue: number;
      otherRevenue: number;
      totalRevenue: number;
      adrAvg: number; // ponderado por occ
      occRate: number;
      dblOcc: number;
      revpar: number;
    };

    const out: M[] = [];
    for (let m = 1; m <= 12; m++) {
      const list = byMonth[m] || [];
      if (!list.length) continue;

      let totalRooms = 0;
      let occ = 0;
      let inHouse = 0;
      let roomRevenue = 0;
      let fnbRevenue = 0;
      let otherRevenue = 0;
      let totalRevenue = 0;

      // ADR ponderado por occ
      let adrWeightedSum = 0;
      let adrWeight = 0;

      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        totalRooms += r.totalRooms || 0;
        occ += r.roomsOccMinusHU || 0;
        inHouse += r.inHouse || 0;

        roomRevenue += r.roomRevenue || 0;
        fnbRevenue += r.fnbRevenue || 0;
        otherRevenue += r.otherRevenue || 0;
        totalRevenue += r.totalRevenue || 0;

        const w = r.roomsOccMinusHU || 0;
        adrWeightedSum += (r.adr || 0) * w;
        adrWeight += w;
      }

      const adrAvg = safeDiv(adrWeightedSum, adrWeight);
      const occRate = safeDiv(occ, totalRooms);
      const dblOcc = safeDiv(inHouse, occ);
      const revpar = adrAvg * dblOcc;

      out.push({
        month: m,
        totalRooms,
        occ,
        inHouse,
        roomRevenue,
        fnbRevenue,
        otherRevenue,
        totalRevenue,
        adrAvg,
        occRate,
        dblOcc,
        revpar,
      });
    }

    return out;
  }, [byMonth]);

  if (loading) {
    return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Cargando H&F…</div>;
  }

  if (err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <b>Error:</b> {err}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Sin filas H&F para el filtro actual.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 950 }}>
          H&F — {hotel} — {year} {mode !== "All" ? `(${mode})` : ""}
        </div>

        <div style={{ marginTop: ".75rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.9 }}>
                <th style={{ padding: ".5rem .4rem" }}>Mes</th>
                <th style={{ padding: ".5rem .4rem" }}>Ocupación</th>
                <th style={{ padding: ".5rem .4rem" }}>ADR</th>
                <th style={{ padding: ".5rem .4rem" }}>Doble Ocup.</th>
                <th style={{ padding: ".5rem .4rem" }}>REVPar</th>
                <th style={{ padding: ".5rem .4rem" }}>Room Rev</th>
                <th style={{ padding: ".5rem .4rem" }}>F&B</th>
                <th style={{ padding: ".5rem .4rem" }}>Other</th>
                <th style={{ padding: ".5rem .4rem" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {monthSummary.map((m) => (
                <tr key={m.month} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <td style={{ padding: ".55rem .4rem", fontWeight: 900 }}>{MONTHS[m.month - 1]}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{(m.occRate * 100).toFixed(1)}%</td>
                  <td style={{ padding: ".55rem .4rem" }}>{m.adrAvg.toFixed(2)}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{m.dblOcc.toFixed(2)}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{m.revpar.toFixed(2)}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{m.roomRevenue.toFixed(0)}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{m.fnbRevenue.toFixed(0)}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{m.otherRevenue.toFixed(0)}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{m.totalRevenue.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalle diario (responsive) */}
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 950 }}>Detalle diario</div>
        <div style={{ marginTop: ".75rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.9 }}>
                <th style={{ padding: ".5rem .4rem" }}>Fecha</th>
                <th style={{ padding: ".5rem .4rem" }}>Hotel</th>
                <th style={{ padding: ".5rem .4rem" }}>HoF</th>
                <th style={{ padding: ".5rem .4rem" }}>Occ</th>
                <th style={{ padding: ".5rem .4rem" }}>ADR</th>
                <th style={{ padding: ".5rem .4rem" }}>Room Rev</th>
                <th style={{ padding: ".5rem .4rem" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((r, idx) => {
                const occRate = safeDiv(r.roomsOccMinusHU, r.totalRooms);
                return (
                  <tr key={idx} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={{ padding: ".55rem .4rem" }}>{r.fecha.toLocaleDateString("es-AR")}</td>
                    <td style={{ padding: ".55rem .4rem", fontWeight: 850 }}>{r.empresa}</td>
                    <td style={{ padding: ".55rem .4rem" }}>{r.hof}</td>
                    <td style={{ padding: ".55rem .4rem" }}>{(occRate * 100).toFixed(1)}%</td>
                    <td style={{ padding: ".55rem .4rem" }}>{r.adr.toFixed(2)}</td>
                    <td style={{ padding: ".55rem .4rem" }}>{r.roomRevenue.toFixed(0)}</td>
                    <td style={{ padding: ".55rem .4rem" }}>{r.totalRevenue.toFixed(0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: ".5rem", opacity: 0.75, fontSize: ".9rem" }}>
            Mostrando hasta 200 filas (para no romper mobile).
          </div>
        </div>
      </div>
    </div>
  );
}
