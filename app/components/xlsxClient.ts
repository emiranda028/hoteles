"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  filePath: string;
  limit?: number;
  /** si se usa, filtra por hotel/empresa; si no, dejar "" */
  hotelFilter?: string;
};

type Row = {
  year: number;
  continent: string;
  country: string;
  month: number; // 1..12
  amount: number; // Importe / Cantidad
  hotel?: string;
};

function norm(s: any) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function parseExcelSerialOrYear(v: any): number | null {
  // Si viene 2024, 2025, etc
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n)) return null;
  if (n >= 1900 && n <= 2100) return Math.trunc(n);

  // Si viene serial Excel tipo 46004 etc -> convertir a fecha y tomar year
  // Excel serial 1 = 1899-12-31 (con bug 1900). Usamos base 1899-12-30 para compatibilidad usual.
  if (n > 30000 && n < 70000) {
    const base = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(base.getTime() + Math.trunc(n) * 24 * 60 * 60 * 1000);
    return d.getUTCFullYear();
  }

  return null;
}

function parseMonth(v: any): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;

  // si ya viene número
  const n = Number(s);
  if (Number.isFinite(n) && n >= 1 && n <= 12) return Math.trunc(n);

  // textos típicos
  const m = norm(s);
  const map: Record<string, number> = {
    ENE: 1,
    ENERO: 1,
    FEB: 2,
    FEBRERO: 2,
    MAR: 3,
    MARZO: 3,
    ABR: 4,
    ABRIL: 4,
    MAY: 5,
    MAYO: 5,
    JUN: 6,
    JUNIO: 6,
    JUL: 7,
    JULIO: 7,
    AGO: 8,
    AGOSTO: 8,
    SEP: 9,
    SEPT: 9,
    SEPTIEMBRE: 9,
    OCT: 10,
    OCTUBRE: 10,
    NOV: 11,
    NOVIEMBRE: 11,
    DIC: 12,
    DICIEMBRE: 12,
  };
  return map[m] ?? null;
}

function parseNumberFlexible(v: any): number {
  const s0 = String(v ?? "").trim();
  if (!s0) return 0;

  // "22.441,71" -> 22441.71
  // "21.931" (miles) -> 21931
  // "1,234.56" -> 1234.56
  let s = s0;

  // si tiene % lo sacamos
  s = s.replace("%", "").trim();

  // caso europeo: miles con '.' y decimales con ','
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    // asumimos '.' miles y ',' decimales
    s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  // si solo tiene coma, asumimos coma decimal
  if (!hasDot && hasComma) {
    s = s.replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  // si solo tiene punto, puede ser decimal o miles.
  // heurística: si hay 1 punto y 3 dígitos a la derecha => miles
  const m = s.match(/^(-?\d+)\.(\d{3})$/);
  if (m) {
    const n = Number((m[1] + m[2]).replace(/\s/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function flagFromISO2(iso2: string) {
  const s = norm(iso2);
  if (s.length !== 2) return "";
  const A = 0x1f1e6; // regional indicator A
  const c0 = s.charCodeAt(0);
  const c1 = s.charCodeAt(1);
  if (c0 < 65 || c0 > 90 || c1 < 65 || c1 > 90) return "";
  return String.fromCodePoint(A + (c0 - 65), A + (c1 - 65));
}

// Mapeo mínimo para banderas (podés ampliar)
const COUNTRY_TO_ISO2: Record<string, string> = {
  ARGENTINA: "AR",
  BRASIL: "BR",
  BRAZIL: "BR",
  CHILE: "CL",
  URUGUAY: "UY",
  PARAGUAY: "PY",
  BOLIVIA: "BO",
  PERU: "PE",
  PERÚ: "PE",
  COLOMBIA: "CO",
  MEXICO: "MX",
  MÉXICO: "MX",
  "UNITED STATES": "US",
  "ESTADOS UNIDOS": "US",
  USA: "US",
  ESPAÑA: "ES",
  SPAIN: "ES",
  FRANCE: "FR",
  FRANCIA: "FR",
  ITALIA: "IT",
  ITALY: "IT",
  ALEMANIA: "DE",
  GERMANY: "DE",
  UK: "GB",
  "UNITED KINGDOM": "GB",
  INGLATERRA: "GB",
};

function isoFromCountry(country: string) {
  const k = norm(country);
  return COUNTRY_TO_ISO2[k] ?? "";
}

export default function CountryRanking({ year, filePath, limit = 12, hotelFilter = "" }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{ sheet?: string; keys?: string[]; years?: number[]; err?: string }>({});

  useEffect(() => {
    let alive = true;
    setLoading(true);

    (async () => {
      try {
        const r = await readXlsxFromPublic(filePath);
        const raw = (r.rows ?? []) as any[];

        const keys = Object.keys(raw[0] ?? {});
        const guessKey = (cands: string[]) => {
          const upper = keys.map((k) => norm(k));
          for (const cand of cands) {
            const idx = upper.indexOf(norm(cand));
            if (idx >= 0) return keys[idx];
          }
          return "";
        };

        // tus columnas típicas según lo que ya vimos:
        const kCont = guessKey(["Continente", "CONTINENTE"]);
        const kYear = guessKey(["Año", "ANO", "YEAR"]);
        const kCountry = guessKey(["PAÍS", "PAIS", "País", "Pais", "COUNTRY"]);
        const kMonth = guessKey(["Mes", "MES", "N° Mes", "N Mes", "N°MES", "MONTH"]);
        const kAmount = guessKey(["Importe", "IMPORTE", "Cantidad", "CANTIDAD", "N°", "N"]);

        // hotel/empresa (por si el archivo trae, si no, se ignora)
        const kHotel = guessKey(["Empresa", "EMPRESA", "Hotel", "HOTEL"]);

        const parsed: Row[] = [];
        const yearsFound: number[] = [];

        for (let i = 0; i < raw.length; i++) {
          const rr = raw[i] ?? {};
          const y = parseExcelSerialOrYear(rr[kYear]);
          if (!y) continue;

          const month = parseMonth(rr[kMonth]) ?? 0;
          const cont = String(rr[kCont] ?? "").trim();
          const country = String(rr[kCountry] ?? "").trim();
          const amount = parseNumberFlexible(rr[kAmount]);

          const hotel = kHotel ? String(rr[kHotel] ?? "").trim() : "";

          if (!country && !cont) continue;

          parsed.push({
            year: y,
            month: month || 0,
            continent: cont,
            country,
            amount,
            hotel: hotel || undefined,
          });
          yearsFound.push(y);
        }

        const yearsUniq = Array.from(new Set(yearsFound)).sort((a, b) => a - b);

        if (!alive) return;
        setRows(parsed);
        setMeta({
          sheet: r.sheetName,
          keys,
          years: yearsUniq,
        });
      } catch (e: any) {
        if (!alive) return;
        setMeta({ err: e?.message ?? String(e) });
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [filePath]);

  const filtered = useMemo(() => {
    const hf = norm(hotelFilter);
    return rows.filter((r) => {
      if (r.year !== year) return false;
      if (hf) {
        const rh = norm(r.hotel ?? "");
        if (rh && rh !== hf) return false;
      }
      return true;
    });
  }, [rows, year, hotelFilter]);

  const byCountry = useMemo(() => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < filtered.length; i++) {
      const c = String(filtered[i].country ?? "").trim();
      if (!c) continue;
      const k = norm(c);
      obj[k] = (obj[k] ?? 0) + (filtered[i].amount ?? 0);
    }
    return obj;
  }, [filtered]);

  const byContinent = useMemo(() => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < filtered.length; i++) {
      const c = String(filtered[i].continent ?? "").trim();
      if (!c) continue;
      const k = norm(c);
      obj[k] = (obj[k] ?? 0) + (filtered[i].amount ?? 0);
    }
    return obj;
  }, [filtered]);

  const total = useMemo(() => {
    let t = 0;
    const vals = Object.values(byCountry);
    for (let i = 0; i < vals.length; i++) t += vals[i];

    if (t === 0) {
      const vals2 = Object.values(byContinent);
      for (let i = 0; i < vals2.length; i++) t += vals2[i];
    }
    return t;
  }, [byCountry, byContinent]);

  const topCountries = useMemo(() => {
    const entries = Object.entries(byCountry)
      .map(([k, v]) => ({ countryKey: k, value: v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);

    // devolvemos nombre “bonito” manteniendo algo legible
    return entries.map((e) => {
      const iso = isoFromCountry(e.countryKey);
      const flag = iso ? flagFromISO2(iso) : "";
      return {
        label: e.countryKey,
        value: e.value,
        pct: total > 0 ? (e.value / total) * 100 : 0,
        flag,
      };
    });
  }, [byCountry, limit, total]);

  const topContinents = useMemo(() => {
    const entries = Object.entries(byContinent)
      .map(([k, v]) => ({ contKey: k, value: v }))
      .sort((a, b) => b.value - a.value);

    return entries.map((e) => ({
      label: e.contKey,
      value: e.value,
      pct: total > 0 ? (e.value / total) * 100 : 0,
    }));
  }, [byContinent, total]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Cargando nacionalidades…
      </div>
    );
  }

  if (meta.err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 800 }}>Nacionalidades</div>
        <div style={{ marginTop: ".35rem" }}>Error: {meta.err}</div>
      </div>
    );
  }

  if (!filtered.length) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 900 }}>Nacionalidades</div>
        <div style={{ marginTop: ".35rem" }}>
          Sin datos para {year}. (Archivo: {filePath})
        </div>
        <div style={{ marginTop: ".35rem", opacity: 0.85 }}>
          Sheet: {meta.sheet ?? "—"}
        </div>
        <div style={{ marginTop: ".35rem", opacity: 0.8, fontSize: 12 }}>
          Keys ejemplo: {(meta.keys ?? []).slice(0, 12).join(", ")}
        </div>
      </div>
    );
  }

  const fmt = (n: number) => new Intl.NumberFormat("es-AR").format(Math.round(n));

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div
        className="card"
        style={{
          padding: "1rem",
          borderRadius: 22,
          display: "grid",
          gridTemplateColumns: "1.2fr .8fr",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Ranking por país</div>
          <div style={{ marginTop: ".25rem", opacity: 0.85 }}>
            Total: <b>{fmt(total)}</b>
          </div>

          <div style={{ marginTop: ".75rem", display: "grid", gap: ".55rem" }}>
            {topCountries.map((c) => (
              <div
                key={c.label}
                style={{
                  display: "grid",
                  gridTemplateColumns: "26px 1fr auto",
                  alignItems: "center",
                  gap: ".5rem",
                }}
              >
                <div style={{ fontSize: 18, lineHeight: "18px" }}>{c.flag || "🌍"}</div>
                <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.label}
                </div>
                <div style={{ textAlign: "right", fontWeight: 900 }}>
                  {fmt(c.value)} <span style={{ opacity: 0.75, fontWeight: 800 }}>({c.pct.toFixed(1)}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Distribución por continente</div>
          <div style={{ marginTop: ".75rem", display: "grid", gap: ".55rem" }}>
            {topContinents.map((c) => (
              <div key={c.label} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: ".5rem" }}>
                <div style={{ fontWeight: 850 }}>{c.label}</div>
                <div style={{ textAlign: "right", fontWeight: 900 }}>
                  {fmt(c.value)} <span style={{ opacity: 0.75 }}>({c.pct.toFixed(1)}%)</span>
                </div>
                <div
                  style={{
                    gridColumn: "1 / -1",
                    height: 10,
                    borderRadius: 999,
                    background: "rgba(0,0,0,.08)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, c.pct))}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: "linear-gradient(90deg, rgba(0,0,0,.65), rgba(0,0,0,.25))",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Responsive: en mobile apilamos */}
      <style jsx>{`
        @media (max-width: 900px) {
          .card {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
