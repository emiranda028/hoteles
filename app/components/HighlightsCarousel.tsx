"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic, CsvRow } from "./csvClient";
import type { HofHotel } from "./HofExplorer";

type Props = {
  filePath: string;
  year: number;
  hotel: HofHotel;
};

function norm(s: any) {
  return String(s ?? "").trim().replace(/\s+/g, " ");
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

export default function HighlightsCarousel({ filePath, year, hotel }: Props) {
  const [raw, setRaw] = useState<CsvRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    readCsvFromPublic(filePath)
      .then((res) => {
        if (!alive) return;
        setRaw(res.rows || []);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setRaw([]);
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  const kpi = useMemo(() => {
    const allowed = expandHotel(hotel);

    let totalRooms = 0;
    let occ = 0;
    let inHouse = 0;
    let adrWsum = 0;
    let adrW = 0;
    let roomRevenue = 0;
    let totalRevenue = 0;

    for (let i = 0; i < raw.length; i++) {
      const r = raw[i];
      const empresa = normalizeEmpresa(getField(r, ["Empresa", "empresa"]));
      if (allowed.indexOf(empresa) === -1) continue;

      const fecha = parseDateFlexible(getField(r, ["Fecha", "fecha", "Date", "date", "Día", "Dia"]));
      if (!fecha || fecha.getFullYear() !== year) continue;

      const tr = parseNumber(getField(r, ["Total Rooms in Hotel", "Total Rooms", "TotalRooms"]));
      const oc = parseNumber(getField(r, ["Rooms Occupied minus House Use", "Rooms Occ minus HU", "Occupied Rooms"]));
      const ih = parseNumber(getField(r, ["Total In-House Persons", "In-House", "InHousePersons"]));
      const adr = parseNumber(getField(r, ["ADR", "Average Rate"]));
      const rr = parseNumber(getField(r, ["Room Revenue", "RoomRevenue"]));
      const tot = parseNumber(getField(r, ["Ventas Totales", "Total Revenue", "TotalRevenue"]));

      totalRooms += tr;
      occ += oc;
      inHouse += ih;
      adrWsum += adr * oc;
      adrW += oc;
      roomRevenue += rr;
      totalRevenue += tot;
    }

    const adr = safeDiv(adrWsum, adrW);
    const occRate = safeDiv(occ, totalRooms);
    const dblOcc = safeDiv(inHouse, occ);
    const revpar = adr * dblOcc;

    return { totalRooms, occRate, adr, dblOcc, revpar, roomRevenue, totalRevenue };
  }, [raw, year, hotel]);

  const cards = [
    { title: "Ocupación", value: `${(kpi.occRate * 100).toFixed(1)}%`, subtitle: "Rooms Occ / Total Rooms" },
    { title: "ADR", value: kpi.adr.toFixed(2), subtitle: "Promedio ponderado" },
    { title: "REVPar", value: kpi.revpar.toFixed(2), subtitle: "ADR × Doble Ocup." },
    { title: "Ventas", value: kpi.totalRevenue.toFixed(0), subtitle: "Ventas Totales" },
  ];

  if (loading) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Cargando KPIs…</div>;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: ".75rem",
      }}
    >
      {cards.map((c) => (
        <div
          key={c.title}
          className="card"
          style={{
            padding: "1rem",
            borderRadius: 18,
            background: "linear-gradient(135deg, rgba(120,170,255,0.20), rgba(160,90,255,0.10))",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <div style={{ opacity: 0.85, fontWeight: 850 }}>{c.title}</div>
          <div style={{ marginTop: ".15rem", fontWeight: 950, fontSize: "1.45rem" }}>{c.value}</div>
          <div style={{ marginTop: ".25rem", opacity: 0.8, fontSize: ".95rem" }}>{c.subtitle}</div>
        </div>
      ))}
    </div>
  );
}
