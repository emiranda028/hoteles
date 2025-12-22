// app/components/CountryRanking.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic, XlsxRow } from "./xlsxClient";

type Props = {
  year: number;
  filePath: string; // /data/jcr_nacionalidades.xlsx
};

type Row = {
  continent: string;
  year: number;
  month: number;
  country: string;
  value: number;
};

const COUNTRY_TO_ISO2: Record<string, string> = {
  ARGENTINA: "AR",
  BRASIL: "BR",
  BRAZIL: "BR",
  CHILE: "CL",
  COLOMBIA: "CO",
  MEXICO: "MX",
  "MÉXICO": "MX",
  "UNITED STATES": "US",
  "ESTADOS UNIDOS": "US",
  USA: "US",
  EEUU: "US",
  SPAIN: "ES",
  "ESPAÑA": "ES",
  ESPANA: "ES",
  FRANCE: "FR",
  ALEMANIA: "DE",
  GERMANY: "DE",
  "REINO UNIDO": "GB",
  "UNITED KINGDOM": "GB",
  INGLATERRA: "GB",
  ITALIA: "IT",
  ITALY: "IT",
  URUGUAY: "UY",
  PARAGUAY: "PY",
  PERU: "PE",
  "PERÚ": "PE",
  BOLIVIA: "BO",
  "CANADÁ": "CA",
  CANADA: "CA",
};

function normalizeCountryName(s: any) {
  return (s ?? "")
    .toString()
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function flagFromIso2(iso2: string): string {
  const cc = iso2.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  const A = 0x1f1e6;
  const code1 = A + (cc.charCodeAt(0) - 65);
  const code2 = A + (cc.charCodeAt(1) - 65);
  return String.fromCodePoint(code1, code2);
}

function numSmart(v: any): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = (v ?? "").toString().trim();
  if (!s) return 0;

  const raw = s.replace(/\s/g, "");
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  let norm = raw;
  if (hasComma && hasDot) norm = norm.replace(/\./g, "").replace(",", ".");
  else if (hasComma) norm = norm.replace(",", ".");

  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

export default function CountryRanking({ year, filePath }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readXlsxFromPublic(filePath, { sheetName: "País Origen 2018 a 2025" })
      .then(({ rows }) => {
        if (!alive) return;

        const keys = Object.keys(rows?.[0] ?? {});
        const kCont = keys.find((k) => normalizeCountryName(k) === "CONTINENTE") ?? "Continente";
        const kYear = keys.find((k) => normalizeCountryName(k) === "ANO" || normalizeCountryName(k) === "AÑO") ?? "Año";
        const kMonthN = keys.find((k) => normalizeCountryName(k).includes("N") && normalizeCountryName(k).includes("MES")) ?? "N° Mes";
        const kCountry = keys.find((k) => normalizeCountryName(k).includes("PAIS")) ?? "PAÍS ";
        const kVal = keys.find((k) => normalizeCountryName(k).includes("IMPORTE") || normalizeCountryName(k).includes("CANT")) ?? "Importe";

        const parsed: Row[] = (rows as XlsxRow[])
          .map((r) => {
            const continent = (r[kCont] ?? "").toString().trim();
            const yy = Number((r[kYear] ?? "").toString().trim());
            const mm = Number((r[kMonthN] ?? "").toString().trim());
            const country = (r[kCountry] ?? "").toString().trim();
            const value = numSmart(r[kVal]);

            return {
              continent,
              year: Number.isFinite(yy) ? yy : 0,
              month: Number.isFinite(mm) ? mm : 0,
              country,
              value,
            };
          })
          .filter((r) => r.year > 0 && r.month >= 1 && r.month <= 12 && r.country);

        setRows(parsed);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message ?? "Error leyendo nacionalidades");
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  const yearRows = useMemo(() => rows.filter((r) => r.year === year), [rows, year]);

  const total = useMemo(() => yearRows.reduce((acc, r) => acc + (r.value || 0), 0), [yearRows]);

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of yearRows) {
      const key = normalizeCountryName(r.country);
      m.set(key, (m.get(key) ?? 0) + (r.value || 0));
    }
    return m;
  }, [yearRows]);

  const byContinent = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of yearRows) {
      const key = (r.continent ?? "").toString().trim() || "Sin continente";
      m.set(key, (m.get(key) ?? 0) + (r.value || 0));
    }
    return m;
  }, [yearRows]);

  const top = useMemo(() => {
    const arr = Array.from(byCountry.entries()).map(([k, v]) => ({ countryKey: k, value: v }));
    arr.sort((a, b) => b.value - a.value);
    return arr.slice(0, 10);
  }, [byCountry]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Cargando nacionalidades…
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

  if (yearRows.length === 0) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Sin datos para {year}. (Archivo: {filePath})
      </div>
    );
  }

  const fmtInt = (n: number) => new Intl.NumberFormat("es-AR").format(Math.round(n));
  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {/* Ranking */}
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 950, marginBottom: ".5rem" }}>
          Ranking por país — {year}{" "}
          <span style={{ opacity: 0.7, fontWeight: 800 }}>({fmtInt(total)} total)</span>
        </div>

        <div style={{ display: "grid", gap: ".5rem" }}>
          {top.map((it) => {
            const iso2 = COUNTRY_TO_ISO2[it.countryKey] ?? "";
            const flag = iso2 ? flagFromIso2(iso2) : "";
            const share = total > 0 ? it.value / total : 0;

            return (
              <div
                key={it.countryKey}
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr auto",
                  alignItems: "center",
                  gap: ".75rem",
                  padding: ".6rem .65rem",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,.08)",
                }}
              >
                <div style={{ fontSize: "1.35rem", textAlign: "center" }}>{flag || "🏳️"}</div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {it.countryKey}
                  </div>
                  <div style={{ opacity: 0.8, fontSize: ".9rem" }}>
                    {fmtInt(it.value)} <span style={{ opacity: 0.65 }}>· {fmtPct(share)}</span>
                  </div>
                </div>

                <div style={{ fontWeight: 950 }}>{fmtPct(share)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Distribución por continente */}
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 950, marginBottom: ".5rem" }}>Distribución por continente — {year}</div>

        <div style={{ display: "grid", gap: ".5rem" }}>
          {Array.from(byContinent.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([cont, val]) => {
              const share = total > 0 ? val / total : 0;
              return (
                <div
                  key={cont}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: ".75rem",
                    padding: ".6rem .65rem",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,.08)",
                  }}
                >
                  <div style={{ fontWeight: 850 }}>{cont}</div>
                  <div style={{ fontWeight: 950 }}>
                    {fmtInt(val)} <span style={{ opacity: 0.7 }}>· {fmtPct(share)}</span>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
