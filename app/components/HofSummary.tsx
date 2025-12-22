// app/components/HofSummary.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic, CsvRow } from "./csvClient";

type Props = {
  year: number;
  filePath: string;
  hotelFilter?: string; // "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI"
};

type HofRow = CsvRow & {
  Empresa?: string;
  Fecha?: string;
  HoF?: string; // History/Forecast
};

function asString(v: any) {
  return (v ?? "").toString().trim();
}

function parseDateSmart(v: any): Date | null {
  const s = asString(v);
  if (!s) return null;

  // formatos que vimos: "1/6/2022" o "01-06-22 Wed"
  // Intento Date() directo
  const d1 = new Date(s);
  if (!isNaN(d1.getTime())) return d1;

  // dd-mm-yy ...
  const m = s.match(/^(\d{2})-(\d{2})-(\d{2,4})/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    const d2 = new Date(yy, mm - 1, dd);
    if (!isNaN(d2.getTime())) return d2;
  }

  return null;
}

function num(v: any): number {
  const n = typeof v === "number" ? v : Number((v ?? "").toString().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function pct01(v: any): number {
  // puede venir 0.594 o 59.40% ya normalizado por csvClient
  const n = num(v);
  if (n > 1.5) return n / 100;
  return n;
}

export default function HofSummary({ year, filePath, hotelFilter }: Props) {
  const [rows, setRows] = useState<HofRow[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setErr("");

    readCsvFromPublic(filePath)
      .then(({ rows }) => {
        if (!alive) return;
        setRows(rows as HofRow[]);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message ?? "Error leyendo CSV");
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  const filtered = useMemo(() => {
    const y = year;

    return rows.filter((r) => {
      const empresa = asString(r["Empresa"] ?? r["Hotel"] ?? r["empresa"]);
      const hof = asString(r["HoF"] ?? r["Hof"] ?? r["History/Forecast"]);
      const fecha = parseDateSmart(r["Fecha"] ?? r["DATE"] ?? r["Date"]);

      const okYear = fecha ? fecha.getFullYear() === y : false;

      const okHotel = hotelFilter ? empresa === hotelFilter : true;
      const okHof = hof ? true : true;

      return okYear && okHotel && okHof;
    });
  }, [rows, year, hotelFilter]);

  const kpis = useMemo(() => {
    // tomamos SUMAS coherentes (ocupación <= 100%)
    // columnas reales (por tu screenshot): Total Occ., Arr. Rooms, Comp. Rooms, House Use, Room Revenue, Average Rate, Occ.%
    let totalOcc = 0;
    let totalArr = 0;
    let totalComp = 0;
    let totalHU = 0;
    let rev = 0;
    let adrWeightedSum = 0;
    let adrWeight = 0;

    for (const r of filtered) {
      totalOcc += num(r['Total\nOcc.'] ?? r["Total Occ."] ?? r["Total Occ"] ?? r["Occ"]);
      totalArr += num(r['Arr.\nRooms'] ?? r["Arr. Rooms"] ?? r["Arr Rooms"]);
      totalComp += num(r['Comp.\nRooms'] ?? r["Comp. Rooms"] ?? r["Comp Rooms"]);
      totalHU += num(r['House\nUse'] ?? r["House Use"]);
      const rr = num(r["Room Revenue"] ?? r["Room\nRevenue"] ?? r["RoomRevenue"]);
      rev += rr;

      const adr = num(r["Average Rate"] ?? r["Average\nRate"] ?? r["ADR"]);
      // ADR ponderado por occupied (sin HU) si está
      const occNet = Math.max(0, num(r["Deduct\nIndiv."] ?? r["Deduct Indiv."] ?? 0) + num(r["Deduct\nGroup"] ?? r["Deduct Group"] ?? 0));
      // si no, pondero por Total Occ.
      const w = Math.max(1, num(r['Total\nOcc.'] ?? r["Total Occ."] ?? r["Total Occ"] ?? 0));
      adrWeightedSum += adr * w;
      adrWeight += w;
    }

    const occPct = (() => {
      // si hay columna Occ.% la promediamos ponderado por días
      let s = 0;
      let c = 0;
      for (const r of filtered) {
        const v = r["Occ.%"] ?? r["Occ.% "] ?? r["Occ%"] ?? r["Occ %"];
        const p = pct01(v);
        if (p > 0) {
          s += p;
          c += 1;
        }
      }
      if (c > 0) return s / c;
      return 0;
    })();

    const adr = adrWeight > 0 ? adrWeightedSum / adrWeight : 0;

    return {
      totalOcc,
      totalArr,
      totalComp,
      totalHU,
      rev,
      adr,
      occPct,
    };
  }, [filtered]);

  if (err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Error H&F: {err}
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

  const fmtInt = (n: number) => new Intl.NumberFormat("es-AR").format(Math.round(n));
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
      <div style={{ fontWeight: 900, marginBottom: ".75rem" }}>KPIs H&F ({hotelFilter ?? "Todos"})</div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: ".75rem",
        }}
      >
        <div className="miniCard" style={{ padding: ".75rem", borderRadius: 16 }}>
          <div style={{ opacity: 0.75, fontSize: ".9rem" }}>Ocupación %</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 950 }}>{fmtPct(kpis.occPct)}</div>
        </div>

        <div className="miniCard" style={{ padding: ".75rem", borderRadius: 16 }}>
          <div style={{ opacity: 0.75, fontSize: ".9rem" }}>Room Revenue</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 950 }}>{fmtMoney(kpis.rev)}</div>
        </div>

        <div className="miniCard" style={{ padding: ".75rem", borderRadius: 16 }}>
          <div style={{ opacity: 0.75, fontSize: ".9rem" }}>ADR (prom.)</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 950 }}>
            {new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(kpis.adr)}
          </div>
        </div>

        <div className="miniCard" style={{ padding: ".75rem", borderRadius: 16 }}>
          <div style={{ opacity: 0.75, fontSize: ".9rem" }}>Total Occ (sum)</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 950 }}>{fmtInt(kpis.totalOcc)}</div>
        </div>
      </div>
    </div>
  );
}
