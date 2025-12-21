"use client";

import { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic } from "./csvClient";

type Props = {
  year: number;
  hotelFilter: string; // "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI"
  filePath: string; // "/data/hf_diario.csv"
};

type HfRow = {
  Empresa?: string;
  HoF?: string;
  Fecha?: string;
  Date?: string;

  ["Occ.%"]?: any;
  ["Average Rate"]?: any;
  ["Room Revenue"]?: any;
  ["Adl. & Chl."]?: any;

  // algunos CSV traen headers con espacios
  ["Occ.% "]?: any;
  ["Room Revenue "]?: any;
  ["Average Rate "]?: any;
};

function toNumber(x: any) {
  if (x === null || x === undefined) return 0;
  const s = String(x).trim();
  if (!s) return 0;
  // 59,40% => 59.40
  const pct = s.includes("%");
  const cleaned = s
    .replace(/\./g, "") // miles
    .replace(",", ".")
    .replace("%", "")
    .replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return pct ? n : n;
}

function parseDateAny(v: any): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;

  // intenta dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1;
    const yy = Number(m[3]);
    const d = new Date(yy, mm, dd);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  // intenta yyyy-mm-dd
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m2) {
    const yy = Number(m2[1]);
    const mm = Number(m2[2]) - 1;
    const dd = Number(m2[3]);
    const d = new Date(yy, mm, dd);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  const d3 = new Date(s);
  return Number.isFinite(d3.getTime()) ? d3 : null;
}

function getYear(r: HfRow): number | null {
  const d = parseDateAny(r.Fecha || r.Date);
  return d ? d.getFullYear() : null;
}

function isHistoryOrForecast(v: any) {
  const s = String(v ?? "").toLowerCase();
  return s.includes("history") || s.includes("forecast");
}

function formatMoneyARS(n: number) {
  try {
    return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  } catch {
    return String(Math.round(n));
  }
}

export default function HighlightsCarousel({ year, hotelFilter, filePath }: Props) {
  const [rows, setRows] = useState<HfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);

    readCsvFromPublic(filePath)
      .then((res) => {
        if (!alive) return;
        setRows((res.rows ?? []) as HfRow[]);
      })
      .catch((e: any) => {
        if (!alive) return;
        setErr(e?.message ?? "Error leyendo CSV");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  const allowedHotels = useMemo(() => {
    if (hotelFilter === "JCR") return ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
    return [hotelFilter];
  }, [hotelFilter]);

  const filtered = useMemo(() => {
    return (rows ?? [])
      .filter((r) => allowedHotels.includes(String(r.Empresa ?? "").trim()))
      .filter((r) => isHistoryOrForecast(r.HoF))
      .filter((r) => getYear(r) === year);
  }, [rows, allowedHotels, year]);

  const kpis = useMemo(() => {
    // KPI diarios agregados (promedios / sumas)
    let occSum = 0;
    let occCount = 0;

    let adrSum = 0;
    let adrCount = 0;

    let roomRevenue = 0;
    let pax = 0;

    for (const r of filtered) {
      const occ = toNumber((r as any)["Occ.%"] ?? (r as any)["Occ.% "]);
      if (occ > 0) {
        occSum += occ;
        occCount += 1;
      }

      const adr = toNumber((r as any)["Average Rate"] ?? (r as any)["Average Rate "]);
      if (adr > 0) {
        adrSum += adr;
        adrCount += 1;
      }

      roomRevenue += toNumber((r as any)["Room Revenue"] ?? (r as any)["Room Revenue "]);
      pax += toNumber((r as any)["Adl. & Chl."]);
    }

    const occAvg = occCount ? occSum / occCount : 0;
    const adrAvg = adrCount ? adrSum / adrCount : 0;

    return {
      rows: filtered.length,
      occAvg,
      adrAvg,
      roomRevenue,
      pax,
    };
  }, [filtered]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Cargando highlights…
      </div>
    );
  }

  if (err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Error: {err}
      </div>
    );
  }

  if (!filtered.length) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Sin filas H&amp;F para el filtro actual.
      </div>
    );
  }

  // Mini-cards estilo “carousel” horizontal, responsive con overflow
  return (
    <div
      style={{
        display: "grid",
        gap: ".75rem",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: ".75rem",
          overflowX: "auto",
          paddingBottom: ".25rem",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <MiniKpi title="Filas" value={String(kpis.rows)} />
        <MiniKpi title="Ocupación prom." value={`${kpis.occAvg.toFixed(1)}%`} />
        <MiniKpi title="ADR prom." value={formatMoneyARS(kpis.adrAvg)} />
        <MiniKpi title="Room Revenue" value={formatMoneyARS(kpis.roomRevenue)} />
        <MiniKpi title="Pax (Adl+Chl)" value={formatMoneyARS(kpis.pax)} />
      </div>

      <div style={{ fontSize: ".85rem", opacity: 0.8 }}>
        Filtro: <b>{hotelFilter}</b> · Año: <b>{year}</b>
      </div>
    </div>
  );
}

function MiniKpi({ title, value }: { title: string; value: string }) {
  return (
    <div
      className="card"
      style={{
        minWidth: 160,
        padding: ".85rem",
        borderRadius: 18,
        flex: "0 0 auto",
      }}
    >
      <div style={{ fontSize: ".78rem", opacity: 0.8 }}>{title}</div>
      <div style={{ fontSize: "1.1rem", fontWeight: 900, marginTop: ".15rem" }}>{value}</div>
    </div>
  );
}
