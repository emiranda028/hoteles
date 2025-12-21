"use client";

import React, { useEffect, useMemo, useState } from "react";
import { excelDateToJS, normalizeHeaderMap, pickKey, readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  filePath: string;
  limit?: number;
};

type Row = {
  year: number;
  country: string;
  continent: string;
  value: number;
};

function norm(s: any) {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toNum(x: any) {
  if (typeof x === "number") return isFinite(x) ? x : 0;
  const s = String(x ?? "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d\.\-]/g, "")
    .trim();
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function isoToFlag(iso2: string) {
  const s = norm(iso2);
  if (s.length !== 2) return "";
  const A = 0x1f1e6;
  const c1 = s.charCodeAt(0) - 65;
  const c2 = s.charCodeAt(1) - 65;
  if (c1 < 0 || c1 > 25 || c2 < 0 || c2 > 25) return "";
  return String.fromCodePoint(A + c1, A + c2);
}

const COUNTRY_TO_ISO: Record<string, string> = {
  ARGENTINA: "AR",
  BRASIL: "BR",
  BRAZIL: "BR",
  CHILE: "CL",
  URUGUAY: "UY",
  PARAGUAY: "PY",
  BOLIVIA: "BO",
  PERU: "PE",
  COLOMBIA: "CO",
  ECUADOR: "EC",
  VENEZUELA: "VE",
  MEXICO: "MX",
  "MÉXICO": "MX",
  "UNITED STATES": "US",
  "ESTADOS UNIDOS": "US",
  USA: "US",
  CANADA: "CA",
  SPAIN: "ES",
  ESPANA: "ES",
  "ESPAÑA": "ES",
  ITALY: "IT",
  ITALIA: "IT",
  FRANCE: "FR",
  FRANCIA: "FR",
  GERMANY: "DE",
  ALEMANIA: "DE",
  UK: "GB",
  "UNITED KINGDOM": "GB",
  "REINO UNIDO": "GB",
  CHINA: "CN",
  JAPON: "JP",
  "JAPÓN": "JP",
  AUSTRALIA: "AU",
};

function guessISO(countryName: string) {
  const k = norm(countryName);
  return COUNTRY_TO_ISO[k] || "";
}

export default function CountryRanking({ year, filePath, limit = 12 }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{ sheet: string; years: number[] }>({ sheet: "", years: [] });

  useEffect(() => {
    let mounted = true;

    async function run() {
      setLoading(true);
      try {
        const rr = await readXlsxFromPublic(filePath);
        const raw = rr.rows ?? [];

        if (raw.length === 0) {
          if (!mounted) return;
          setRows([]);
          setMeta({ sheet: rr.sheetName, years: [] });
          setLoading(false);
          return;
        }

        const hmap = normalizeHeaderMap(raw[0]);

        // En tu Excel vimos: Continente, Año, PAÍS, Mes, N° Mes (y a veces "Importe")
        const kYear = pickKey(hmap, ["Año", "Ano", "Year"]);
        const kCountry = pickKey(hmap, ["PAÍS", "PAIS", "Pais", "Country"]);
        const kCont = pickKey(hmap, ["Continente", "Continent"]);
        const kVal = pickKey(hmap, ["Cantidad", "Total", "Importe", "Value", "Qty"]);
        const kFecha = pickKey(hmap, ["Fecha", "Date"]);

        const parsed: Row[] = [];

        for (let i = 0; i < raw.length; i++) {
          const r: any = raw[i];

          let yy = 0;
          if (kYear) yy = Number(r[kYear]) || 0;

          if (!yy && kFecha) {
            const dt = excelDateToJS(r[kFecha]);
            if (dt) yy = dt.getFullYear();
          }

          const country = kCountry ? String(r[kCountry] ?? "").trim() : "";
          const continent = kCont ? String(r[kCont] ?? "").trim() : "";
          const value = kVal ? toNum(r[kVal]) : 0;

          if (!yy || !country) continue;

          parsed.push({
            year: yy,
            country,
            continent,
            value: value || 0,
          });
        }

        const years = Array.from(new Set(parsed.map((p) => p.year))).sort((a, b) => b - a);

        if (!mounted) return;
        setRows(parsed);
        setMeta({ sheet: rr.sheetName, years });
        setLoading(false);
      } catch (e) {
        if (!mounted) return;
        setRows([]);
        setMeta({ sheet: "", years: [] });
        setLoading(false);
      }
    }

    run();
    return () => {
      mounted = false;
    };
  }, [filePath]);

  const yearRows = useMemo(() => rows.filter((r) => r.year === year), [rows, year]);

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < yearRows.length; i++) {
      const c = String(yearRows[i].country || "").trim();
      if (!c) continue;
      m.set(c, (m.get(c) || 0) + (yearRows[i].value || 0));
    }
    return m;
  }, [yearRows]);

  const byContinent = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < yearRows.length; i++) {
      const c = String(yearRows[i].continent || "").trim() || "Sin continente";
      m.set(c, (m.get(c) || 0) + (yearRows[i].value || 0));
    }
    return m;
  }, [yearRows]);

  const total = useMemo(() => {
    let t = 0;
    const vals = Array.from(byCountry.values());
    for (let i = 0; i < vals.length; i++) t += vals[i];
    if (t === 0) {
      const vals2 = Array.from(byContinent.values());
      for (let i = 0; i < vals2.length; i++) t += vals2[i];
    }
    return t;
  }, [byCountry, byContinent]);

  const topCountries = useMemo(() => {
    const arr = Array.from(byCountry.entries()).map(([country, value]) => ({
      country,
      value,
      iso: guessISO(country),
    }));
    arr.sort((a, b) => b.value - a.value);
    return arr.slice(0, limit);
  }, [byCountry, limit]);

  const continents = useMemo(() => {
    const arr = Array.from(byContinent.entries()).map(([continent, value]) => ({ continent, value }));
    arr.sort((a, b) => b.value - a.value);
    return arr;
  }, [byContinent]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Cargando nacionalidades…
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Ranking por país</div>
            <div style={{ opacity: 0.75, marginTop: 4 }}>
              Año {year} · Total: <b>{total.toLocaleString("es-AR")}</b>
            </div>
          </div>
          <div style={{ opacity: 0.65, fontSize: 12 }}>
            Sheet: <b>{meta.sheet || "-"}</b>
            <br />
            Años: <b>{meta.years.length ? meta.years.join(", ") : "—"}</b>
          </div>
        </div>

        {topCountries.length === 0 ? (
          <div style={{ marginTop: "0.8rem", opacity: 0.75 }}>Sin datos para {year}. (Archivo: {filePath})</div>
        ) : (
          <div style={{ marginTop: "0.8rem", display: "grid", gap: ".5rem" }}>
            {topCountries.map((c, idx) => {
              const pct = total > 0 ? (c.value / total) * 100 : 0;
              const flag = c.iso ? isoToFlag(c.iso) : "";
              return (
                <div
                  key={c.country}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "42px 1fr auto",
                    alignItems: "center",
                    gap: ".75rem",
                    padding: ".6rem .7rem",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,.08)",
                    background: "rgba(255,255,255,.03)",
                  }}
                >
                  <div style={{ fontSize: 22, textAlign: "center" }}>{flag || "🌍"}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {idx + 1}. {c.country}
                    </div>
                    <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2 }}>
                      {c.value.toLocaleString("es-AR")} · {pct.toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ fontWeight: 900 }}>{pct.toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: ".85rem", borderRadius: 22 }}>
        <div style={{ fontWeight: 950, fontSize: ".95rem" }}>Distribución por continente</div>
        <div style={{ marginTop: ".6rem", display: "grid", gap: ".45rem" }}>
          {continents.map((c) => {
            const pct = total > 0 ? (c.value / total) * 100 : 0;
            return (
              <div
                key={c.continent}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: ".75rem",
                  padding: ".55rem .7rem",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,.06)",
                  background: "rgba(255,255,255,.02)",
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 800, opacity: 0.9 }}>{c.continent}</div>
                <div style={{ fontWeight: 900 }}>
                  {pct.toFixed(1)}% · {c.value.toLocaleString("es-AR")}
                </div>
              </div>
            );
          })}
          {!continents.length && <div style={{ opacity: 0.75 }}>Sin datos.</div>}
        </div>
      </div>
    </div>
  );
}
