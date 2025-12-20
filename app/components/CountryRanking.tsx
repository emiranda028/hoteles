"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

/* =========================
   TYPES
   ========================= */
type Props = {
  year: number;
  filePath: string;
  hotelFilter?: string; // "JCR" | "MARRIOTT" | etc
  limit?: number;
};

type RawRow = Record<string, any>;

type ParsedRow = {
  hotel: string;
  qty: number;
  year: number | null;
  country: string;
  continent: string;
};

/* =========================
   HELPERS
   ========================= */
const norm = (v: any) =>
  String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

const safeNum = (v: any) => {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const parseDate = (v: any): Date | null => {
  if (v instanceof Date) return v;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};

/* =========================
   XLSX LOADER
   ========================= */
async function readXlsx(path: string): Promise<RawRow[]> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" }) as RawRow[];
}

/* =========================
   CONSTANTS
   ========================= */
const JCR_HOTELS = ["MARRIOTT", "SHERATON MDQ", "SHERATON BCR"];

const COUNTRY_ISO: Record<string, string> = {
  ARGENTINA: "AR",
  BRASIL: "BR",
  BRAZIL: "BR",
  URUGUAY: "UY",
  CHILE: "CL",
  PERU: "PE",
  PERÚ: "PE",
  COLOMBIA: "CO",
  MEXICO: "MX",
  MÉXICO: "MX",
  "UNITED STATES": "US",
  "ESTADOS UNIDOS": "US",
  USA: "US",
  SPAIN: "ES",
  ESPAÑA: "ES",
};

function isoToFlag(iso: string) {
  if (iso.length !== 2) return "🏳️";
  const A = 0x1f1e6;
  return String.fromCodePoint(
    A + iso.charCodeAt(0) - 65,
    A + iso.charCodeAt(1) - 65
  );
}

/* =========================
   COMPONENT
   ========================= */
export default function CountryRanking({
  year,
  filePath,
  hotelFilter = "JCR",
  limit = 10,
}: Props) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* ---------- LOAD ---------- */
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const raw = await readXlsx(filePath);

        const parsed: ParsedRow[] = raw.map((r) => {
          const d = parseDate(r.Fecha ?? r.fecha);
          return {
            hotel: norm(r.Empresa ?? r.Hotel),
            qty: safeNum(r.Cantidad),
            year: d ? d.getFullYear() : null,
            country: String(r.Pais ?? r.País ?? "").trim(),
            continent: String(r.Continente ?? "").trim(),
          };
        });

        if (mounted) setRows(parsed);
      } catch (e: any) {
        if (mounted) setError(e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [filePath]);

  /* ---------- FILTER ---------- */
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (r.year !== year) return false;
      if (hotelFilter === "JCR") return JCR_HOTELS.includes(r.hotel);
      return r.hotel === norm(hotelFilter);
    });
  }, [rows, year, hotelFilter]);

  /* ---------- AGGREGATES ---------- */
  const countryMap = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) => {
      if (!r.country) return;
      m.set(r.country, (m.get(r.country) ?? 0) + r.qty);
    });
    return m;
  }, [filtered]);

  const continentMap = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) => {
      if (!r.continent) return;
      m.set(r.continent, (m.get(r.continent) ?? 0) + r.qty);
    });
    return m;
  }, [filtered]);

  /* 🔧 FIX ES5: NO for..of */
  const total = useMemo(() => {
    let t = 0;
    countryMap.forEach((v) => (t += v));
    if (t === 0) continentMap.forEach((v) => (t += v));
    return t;
  }, [countryMap, continentMap]);

  const topCountries = useMemo(() => {
    const arr: { country: string; qty: number }[] = [];
    countryMap.forEach((qty, country) => {
      arr.push({ country, qty });
    });
    return arr.sort((a, b) => b.qty - a.qty).slice(0, limit);
  }, [countryMap, limit]);

  const continents = useMemo(() => {
    const arr: { continent: string; qty: number }[] = [];
    continentMap.forEach((qty, continent) => {
      arr.push({ continent, qty });
    });
    return arr.sort((a, b) => b.qty - a.qty);
  }, [continentMap]);

  /* ---------- UI ---------- */
  if (loading) return <div>Cargando nacionalidades…</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;

  return (
    <div>
      <h3>Nacionalidades · {hotelFilter} · {year}</h3>

      <div style={{ display: "grid", gap: "1rem" }}>
        {topCountries.map((c, i) => {
          const iso = COUNTRY_ISO[norm(c.country)] ?? "";
          const pct = total ? ((c.qty / total) * 100).toFixed(1) : "0";
          return (
            <div key={c.country} style={{ display: "flex", gap: "1rem" }}>
              <div style={{ width: 30 }}>{isoToFlag(iso)}</div>
              <div style={{ flex: 1 }}>
                {i + 1}. {c.country}
              </div>
              <div>{c.qty.toLocaleString()}</div>
              <div>{pct}%</div>
            </div>
          );
        })}
      </div>

      <hr style={{ margin: "1rem 0" }} />

      <h4>Continentes</h4>
      {continents.map((c) => (
        <div key={c.continent}>
          {c.continent}: {c.qty.toLocaleString()}
        </div>
      ))}
    </div>
  );
}
