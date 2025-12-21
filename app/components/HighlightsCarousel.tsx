"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic, CsvRow } from "./csvClient";

type Props = {
  year: number;
  globalHotel: string; // "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "JCR" | "MAITEI"
  filePath: string; // "/data/hf_diario.csv"
};

function norm(s: any) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function parsePercent(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  // "59,40%" -> 0.594
  const cleaned = s.replace("%", "").replace(/\./g, "").replace(/,/g, ".").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? n / 100 : n;
}

function parseMoney(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  // "22.441,71" -> 22441.71
  const cleaned = s.replace(/\./g, "").replace(/,/g, ".").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseDateAny(v: any): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;

  // 1) "1/6/2022"
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const d = Number(m1[1]);
    const mo = Number(m1[2]) - 1;
    const y = Number(m1[3]);
    const dt = new Date(y, mo, d);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  // 2) "01-06-22 Wed" -> dd-mm-yy
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m2) {
    const d = Number(m2[1]);
    const mo = Number(m2[2]) - 1;
    let y = Number(m2[3]);
    if (y < 100) y = 2000 + y;
    const dt = new Date(y, mo, d);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  const dt = new Date(s);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function canonicalHotel(empresaRaw: string) {
  const e = norm(empresaRaw);

  if (!e) return "";

  if (e.includes("MAITEI")) return "MAITEI";

  if (e.includes("MARRIOTT")) return "MARRIOTT";

  // Bariloche
  if (e.includes("BARILOCHE") || e.includes("BRC") || e.includes("BCR")) return "SHERATON BCR";

  // Mar del Plata
  if (e.includes("MAR DEL PLATA") || e.includes("MDQ") || e.includes("MDP")) return "SHERATON MDQ";

  // si ya viene exacto
  if (e === "SHERATON BCR") return "SHERATON BCR";
  if (e === "SHERATON MDQ") return "SHERATON MDQ";

  return e;
}

function fmt(n: number, digits = 0) {
  try {
    return new Intl.NumberFormat("es-AR", { maximumFractionDigits: digits }).format(n);
  } catch {
    return String(n.toFixed(digits));
  }
}

export default function HighlightsCarousel({ year, globalHotel, filePath }: Props) {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    (async () => {
      try {
        const data = await readCsvFromPublic(filePath);
        if (alive) {
          setRows(data || []);
          setLoading(false);
        }
      } catch {
        if (alive) {
          setRows([]);
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [filePath]);

  const filtered = useMemo(() => {
    const out: {
      dt: Date;
      hotel: string;
      hof: string;
      occ: number;
      adr: number;
      roomRev: number;
      totalRooms: number;
    }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      // headers raros: buscamos por “contiene”
      const keys = Object.keys(r);
      const get = (contains: string) => {
        const k = keys.find((x) => norm(x).includes(norm(contains)));
        return k ? r[k] : "";
      };

      const empresa = canonicalHotel(get("Empresa"));
      const hof = String(get("HoF") || get("HOF") || "").trim();
      const dt = parseDateAny(get("Fecha") || get("Date"));
      if (!dt) continue;

      const y = dt.getFullYear();
      if (y !== year) continue;

      // filtro hotel
      if (globalHotel === "JCR") {
        if (!(empresa === "MARRIOTT" || empresa === "SHERATON BCR" || empresa === "SHERATON MDQ")) continue;
      } else {
        if (empresa !== globalHotel) continue;
      }

      const occ = parsePercent(get("Occ.%") || get("Occ"));
      const adr = parseMoney(get("Average Rate") || get("ADR") || get("Average"));
      const roomRev = parseMoney(get("Room Revenue") || get("Room Reven"));
      const totalRooms = parseMoney(get("Total"));

      out.push({ dt, hotel: empresa, hof, occ, adr, roomRev, totalRooms });
    }

    return out;
  }, [rows, year, globalHotel]);

  const kpis = useMemo(() => {
    if (!filtered.length) {
      return { occAvg: 0, adrAvg: 0, roomRevSum: 0, days: 0 };
    }
    let occSum = 0;
    let adrSum = 0;
    let roomRevSum = 0;
    for (let i = 0; i < filtered.length; i++) {
      occSum += filtered[i].occ || 0;
      adrSum += filtered[i].adr || 0;
      roomRevSum += filtered[i].roomRev || 0;
    }
    return {
      occAvg: occSum / filtered.length,
      adrAvg: adrSum / filtered.length,
      roomRevSum,
      days: filtered.length,
    };
  }, [filtered]);

  const title = useMemo(() => {
    if (globalHotel === "JCR") return "Grupo JCR — KPIs";
    if (globalHotel === "MAITEI") return "Maitei (Gotel) — KPIs";
    return `${globalHotel} — KPIs`;
  }, [globalHotel]);

  if (loading) {
    return <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>Cargando KPIs…</div>;
  }

  if (!filtered.length) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        <div style={{ fontWeight: 950 }}>{title} {year}</div>
        <div style={{ marginTop: ".35rem", opacity: 0.8 }}>
          Sin filas H&F para el filtro actual. (Chequeá valores reales en columna Empresa del CSV)
        </div>
        <div style={{ marginTop: ".5rem", fontSize: ".9rem", opacity: 0.7 }}>
          Archivo: {filePath}
        </div>
      </div>
    );
  }

  const cards = [
    { label: "Ocupación promedio", value: `${fmt(kpis.occAvg * 100, 1)}%`, sub: `${kpis.days} días` },
    { label: "ADR promedio", value: `$ ${fmt(kpis.adrAvg, 0)}`, sub: "Average Rate" },
    { label: "Room Revenue", value: `$ ${fmt(kpis.roomRevSum, 0)}`, sub: "Suma año" },
  ];

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        <div style={{ fontWeight: 950, fontSize: "1.1rem" }}>{title} {year} (H&F)</div>
        <div style={{ marginTop: ".25rem", opacity: 0.75 }}>Usa filtro global de año + hotel</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "1rem" }}>
        {cards.map((c) => (
          <div
            key={c.label}
            className="card"
            style={{
              padding: "1rem",
              borderRadius: 22,
              background: "linear-gradient(135deg, rgba(0,0,0,.04), rgba(0,0,0,.02))",
              minHeight: 96,
            }}
          >
            <div style={{ fontWeight: 800, opacity: 0.85 }}>{c.label}</div>
            <div style={{ fontWeight: 950, fontSize: "1.8rem", marginTop: ".25rem" }}>{c.value}</div>
            <div style={{ marginTop: ".15rem", opacity: 0.7, fontSize: ".9rem" }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Responsive tweak */}
      <style jsx>{`
        @media (max-width: 900px) {
          div[style*="repeat(3"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
