"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  filePath: string; // "/data/jcr_nacionalidades.xlsx"
  limit?: number;
};

type NRow = {
  year: number;
  country: string;
  continent: string;
  amount: number;
};

function norm(s: any) {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function upper(s: any) {
  return norm(s).toUpperCase();
}

function num(v: any) {
  if (typeof v === "number" && isFinite(v)) return v;
  const s = String(v ?? "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function pickKey(keys: string[], candidates: string[]) {
  const low = keys.map((k) => norm(k).toLowerCase());
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i].toLowerCase();
    const idx = low.indexOf(c);
    if (idx >= 0) return keys[idx];
  }
  return "";
}

function flagFromISO2(code2: string) {
  const s = upper(code2);
  if (s.length !== 2) return "";
  const A = 0x1f1e6;
  // evitar [...s]
  const chars = s.split("");
  const cp0 = A + (chars[0].charCodeAt(0) - 65);
  const cp1 = A + (chars[1].charCodeAt(0) - 65);
  return String.fromCodePoint(cp0, cp1);
}

// Mapeo mínimo (podés ampliar cuando quieras)
const COUNTRY_TO_ISO2: Record<string, string> = {
  "ARGENTINA": "AR",
  "BRASIL": "BR",
  "BRAZIL": "BR",
  "CHILE": "CL",
  "URUGUAY": "UY",
  "PARAGUAY": "PY",
  "BOLIVIA": "BO",
  "PERU": "PE",
  "PERÚ": "PE",
  "COLOMBIA": "CO",
  "MEXICO": "MX",
  "MÉXICO": "MX",
  "UNITED STATES": "US",
  "ESTADOS UNIDOS": "US",
  "USA": "US",
  "SPAIN": "ES",
  "ESPAÑA": "ES",
  "FRANCE": "FR",
  "ITALY": "IT",
  "GERMANY": "DE",
  "UNITED KINGDOM": "GB",
  "REINO UNIDO": "GB",
  "CHINA": "CN",
  "JAPAN": "JP",
};

function iso2ForCountry(country: string) {
  const k = upper(country);
  return COUNTRY_TO_ISO2[k] || "";
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);
}

export default function CountryRanking({ year, filePath, limit = 12 }: Props) {
  const [rows, setRows] = useState<NRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<string>("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await readXlsxFromPublic(filePath);
        setSheet(r.sheetName || "");

        const keys = Object.keys(r.rows?.[0] ?? {});

        const kYear = pickKey(keys, ["Año", "Ano", "Year"]);
        const kCountry = pickKey(keys, ["PAÍS", "PAÍS ", "Pais", "País", "Country"]);
        const kCont = pickKey(keys, ["Continente", "Continent"]);
        const kAmt = pickKey(keys, ["Importe", "Amount", "Total", "Cantidad", "Qty"]);

        const parsed: NRow[] = (r.rows ?? []).map((raw: any) => {
          const y = num(raw[kYear] ?? raw["Año"] ?? raw["Ano"]);
          const country = norm(raw[kCountry] ?? raw["PAÍS"] ?? raw["PAÍS "] ?? raw["País"] ?? raw["Pais"]);
          const continent = norm(raw[kCont] ?? raw["Continente"] ?? raw["Continent"]);
          const amount = num(raw[kAmt] ?? raw["Importe"] ?? raw["Amount"] ?? raw["Total"]);
          return {
            year: y,
            country,
            continent,
            amount,
          };
        });

        if (alive) setRows(parsed.filter((x) => x.year && (x.country || x.continent)));
      } catch (e) {
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [filePath]);

  const yearRows = useMemo(() => rows.filter((r) => r.year === year), [rows, year]);

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < yearRows.length; i++) {
      const c = yearRows[i].country;
      if (!c) continue;
      m.set(c, (m.get(c) ?? 0) + (yearRows[i].amount ?? 0));
    }
    return m;
  }, [yearRows]);

  const byContinent = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < yearRows.length; i++) {
      const c = yearRows[i].continent;
      if (!c) continue;
      m.set(c, (m.get(c) ?? 0) + (yearRows[i].amount ?? 0));
    }
    return m;
  }, [yearRows]);

  const total = useMemo(() => {
    const vals = Array.from(byCountry.values());
    let t = 0;
    for (let i = 0; i < vals.length; i++) t += vals[i] ?? 0;

    if (t === 0) {
      const v2 = Array.from(byContinent.values());
      for (let i = 0; i < v2.length; i++) t += v2[i] ?? 0;
    }
    return t || 0;
  }, [byCountry, byContinent]);

  const topCountries = useMemo(() => {
    const arr = Array.from(byCountry.entries())
      .map(([k, v]) => ({ k, v }))
      .sort((a, b) => b.v - a.v);
    return arr.slice(0, limit);
  }, [byCountry, limit]);

  const topContinents = useMemo(() => {
    const arr = Array.from(byContinent.entries())
      .map(([k, v]) => ({ k, v }))
      .sort((a, b) => b.v - a.v);
    return arr.slice(0, 6);
  }, [byContinent]);

  const maxCountry = useMemo(() => {
    let m = 0;
    for (let i = 0; i < topCountries.length; i++) m = Math.max(m, topCountries[i].v);
    return m || 1;
  }, [topCountries]);

  return (
    <section className="section" style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <div>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            Nacionalidades
          </div>
          <div className="sectionDesc" style={{ marginTop: 6 }}>
            Ranking por país + distribución por continente (Marriott). Año: <b>{year}</b>
          </div>
        </div>

        <div style={{ opacity: 0.7, fontWeight: 800 }}>
          Sheet: <b>{sheet || "—"}</b>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
        {/* Ranking País */}
        <div className="card" style={{ padding: 18, borderRadius: 22 }}>
          <div style={{ fontWeight: 950 }}>Ranking por país</div>

          {loading ? (
            <div style={{ marginTop: 10, opacity: 0.7, fontWeight: 800 }}>Cargando…</div>
          ) : topCountries.length === 0 ? (
            <div style={{ marginTop: 10, opacity: 0.75, fontWeight: 800 }}>
              Sin datos para {year}. (Archivo: {filePath})
            </div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              {topCountries.map((it) => {
                const w = Math.max(0, Math.min(100, (it.v / maxCountry) * 100));
                const iso2 = iso2ForCountry(it.k);
                const flag = iso2 ? flagFromISO2(iso2) : "🏳️";
                const share = total ? (it.v / total) * 100 : 0;

                return (
                  <div
                    key={it.k}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px minmax(140px,1fr) 1fr minmax(70px,90px)",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontSize: 18, textAlign: "center" }}>{flag}</div>

                    <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {it.k}
                      <div style={{ marginTop: 3, fontSize: 13, opacity: 0.65, fontWeight: 800 }}>
                        {new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(share)}% del total
                      </div>
                    </div>

                    <div style={{ height: 10, borderRadius: 999, background: "rgba(0,0,0,.08)", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${w}%`,
                          height: "100%",
                          borderRadius: 999,
                          background: "linear-gradient(90deg, rgba(95, 198, 242, 1), rgba(167, 120, 243, 1))",
                        }}
                      />
                    </div>

                    <div style={{ textAlign: "right", fontWeight: 950 }}>{fmtMoney(it.v)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Continentes (más chiquito, como pediste) */}
        <div className="card" style={{ padding: 18, borderRadius: 22 }}>
          <div style={{ fontWeight: 950 }}>Distribución por continente</div>

          {loading ? (
            <div style={{ marginTop: 10, opacity: 0.7, fontWeight: 800 }}>Cargando…</div>
          ) : topContinents.length === 0 ? (
            <div style={{ marginTop: 10, opacity: 0.75, fontWeight: 800 }}>Sin datos</div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {topContinents.map((it) => {
                const share = total ? (it.v / total) * 100 : 0;
                return (
                  <div key={it.k} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900, opacity: 0.8 }}>{it.k}</div>
                    <div style={{ fontWeight: 950 }}>
                      {new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(share)}%
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
