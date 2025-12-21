"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  filePath: string;
  limit?: number;
};

type Row = {
  year: number;
  monthNum: number; // 1-12
  monthName: string;
  country: string;
  continent: string;
  amount: number;
};

const MONTHS = ["Año", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function norm(s: any) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function toNumber(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  // soporta 1.234,56 y 1234.56
  const cleaned = s
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toInt(v: any) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function iso2FlagEmoji(iso2: string) {
  const code = (iso2 || "").toUpperCase().trim();
  if (code.length !== 2) return "🏳️";
  const A = 0x1f1e6;
  const c1 = code.charCodeAt(0) - 65;
  const c2 = code.charCodeAt(1) - 65;
  if (c1 < 0 || c1 > 25 || c2 < 0 || c2 > 25) return "🏳️";
  return String.fromCodePoint(A + c1, A + c2);
}

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
  ESPAÑA: "ES",
  SPAIN: "ES",
  ITALIA: "IT",
  ITALY: "IT",
  FRANCIA: "FR",
  FRANCE: "FR",
  ALEMANIA: "DE",
  GERMANY: "DE",
  REINO UNIDO: "GB",
  UNITED KINGDOM: "GB",
  INGLATERRA: "GB",
  EEUU: "US",
  USA: "US",
  "UNITED STATES": "US",
  "ESTADOS UNIDOS": "US",
  CANADA: "CA",
  CANADÁ: "CA",
  CHINA: "CN",
  JAPON: "JP",
  JAPÓN: "JP",
  INDIA: "IN",
  AUSTRALIA: "AU",
};

function flagForCountry(country: string) {
  const key = norm(country).toUpperCase();
  const iso2 = COUNTRY_TO_ISO2[key];
  return iso2 ? iso2FlagEmoji(iso2) : "🏳️";
}

function fmtMoney(n: number) {
  try {
    return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(Math.round(n));
  }
}
function fmtPct(n: number) {
  try {
    return new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 }).format(n);
  } catch {
    return `${(n * 100).toFixed(1)}%`;
  }
}

export default function CountryRanking({ year, filePath, limit = 10 }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<number>(0); // 0 = año

  useEffect(() => {
    let alive = true;
    setLoading(true);

    (async () => {
      try {
        const { rows: raw } = await readXlsxFromPublic(filePath);

        const parsed: Row[] = (raw || []).map((r: any) => {
          const yy = toInt(r["Año"] ?? r["ANO"] ?? r["Year"] ?? r["year"]);
          const cont = norm(r["Continente"] ?? r["CONTINENTE"]);
          const pais = norm(r["PAÍS "] ?? r["PAÍS"] ?? r["PAIS"] ?? r["País"] ?? r["Pais"]);
          const mes = norm(r["Mes"] ?? r["MES"]);
          const nMes = toInt(r["N° Mes"] ?? r["Nº Mes"] ?? r["N Mes"] ?? r["N°Mes"] ?? r["Mes N"] ?? r["month"]);
          const imp = toNumber(r["Importe"] ?? r["IMPORTE"] ?? r["Amount"] ?? r["amount"]);

          return {
            year: yy,
            monthNum: nMes >= 1 && nMes <= 12 ? nMes : 0,
            monthName: mes || (nMes >= 1 && nMes <= 12 ? MONTHS[nMes] : ""),
            country: pais,
            continent: cont,
            amount: imp,
          };
        });

        if (alive) {
          setRows(parsed.filter((r) => r.year && r.country));
          setLoading(false);
        }
      } catch (e) {
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

  const yearRows = useMemo(() => rows.filter((r) => r.year === year), [rows, year]);

  const byCountry = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 0; i < yearRows.length; i++) {
      const c = yearRows[i].country || "—";
      map[c] = (map[c] || 0) + (yearRows[i].amount || 0);
    }
    return map;
  }, [yearRows]);

  const total = useMemo(() => {
    const vals = Object.values(byCountry);
    let t = 0;
    for (let i = 0; i < vals.length; i++) t += vals[i] || 0;
    return t;
  }, [byCountry]);

  const topCountries = useMemo(() => {
    const entries = Object.entries(byCountry)
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .slice(0, limit)
      .map(([country, amount]) => ({ country, amount }));
    return entries;
  }, [byCountry, limit]);

  const byContinent = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 0; i < yearRows.length; i++) {
      const k = yearRows[i].continent || "—";
      map[k] = (map[k] || 0) + (yearRows[i].amount || 0);
    }
    return map;
  }, [yearRows]);

  const continentsSorted = useMemo(() => {
    return Object.entries(byContinent).sort((a, b) => (b[1] || 0) - (a[1] || 0));
  }, [byContinent]);

  const monthRows = useMemo(() => {
    if (selectedMonth === 0) return yearRows;
    return yearRows.filter((r) => r.monthNum === selectedMonth);
  }, [yearRows, selectedMonth]);

  const monthTop = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 0; i < monthRows.length; i++) {
      const c = monthRows[i].country || "—";
      map[c] = (map[c] || 0) + (monthRows[i].amount || 0);
    }
    const t = Object.values(map).reduce((acc, v) => acc + (v || 0), 0);
    const list = Object.entries(map)
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .slice(0, 8)
      .map(([country, amount]) => ({
        country,
        amount,
        pct: t > 0 ? amount / t : 0,
      }));
    return { list, total: t };
  }, [monthRows]);

  if (loading) {
    return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Cargando nacionalidades…</div>;
  }

  if (!yearRows.length) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 900 }}>Nacionalidades</div>
        <div style={{ marginTop: ".35rem", opacity: 0.8 }}>
          Sin datos para {year}. (Archivo: {filePath})
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {/* Header */}
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: "1.1rem" }}>Ranking por país</div>
            <div style={{ marginTop: ".2rem", opacity: 0.8 }}>
              Total año {year}: <b>{fmtMoney(total)}</b>
            </div>
          </div>

          {/* Tabs meses */}
          <div style={{ display: "flex", gap: ".25rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {MONTHS.map((m, idx) => (
              <button
                key={m}
                onClick={() => setSelectedMonth(idx)}
                style={{
                  border: "1px solid rgba(0,0,0,.2)",
                  padding: ".35rem .55rem",
                  borderRadius: 10,
                  background: selectedMonth === idx ? "rgba(0,0,0,.07)" : "white",
                  fontWeight: selectedMonth === idx ? 900 : 650,
                  cursor: "pointer",
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid principal */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, .8fr)", gap: "1rem" }}>
        {/* Top países */}
        <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
          <div style={{ fontWeight: 950, marginBottom: ".75rem" }}>
            Top países ({selectedMonth === 0 ? "Año" : MONTHS[selectedMonth]})
          </div>

          <div style={{ display: "grid", gap: ".55rem" }}>
            {(selectedMonth === 0 ? topCountries.map((x) => ({ ...x, pct: total > 0 ? x.amount / total : 0 })) : monthTop.list).map((x, i) => {
              const pct = (x as any).pct ?? 0;
              const amount = (x as any).amount ?? 0;
              const country = (x as any).country ?? "—";

              return (
                <div key={`${country}-${i}`} style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr) 90px", gap: ".6rem", alignItems: "center" }}>
                  <div style={{ fontSize: "1.1rem" }}>{flagForCountry(country)}</div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem" }}>
                      <div style={{ fontWeight: 850, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {country}
                      </div>
                      <div style={{ fontWeight: 800, opacity: 0.8 }}>{fmtPct(pct)}</div>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: "rgba(0,0,0,.08)", overflow: "hidden", marginTop: ".25rem" }}>
                      <div style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%`, height: "100%", background: "rgba(0,0,0,.35)" }} />
                    </div>
                  </div>

                  <div style={{ textAlign: "right", fontWeight: 900 }}>{fmtMoney(amount)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Continentes */}
        <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
          <div style={{ fontWeight: 950, marginBottom: ".75rem" }}>Distribución por continente</div>
          <div style={{ display: "grid", gap: ".6rem" }}>
            {continentsSorted.map(([cont, amount]) => {
              const pct = total > 0 ? amount / total : 0;
              return (
                <div key={cont}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem" }}>
                    <div style={{ fontWeight: 850 }}>{cont}</div>
                    <div style={{ fontWeight: 800, opacity: 0.85 }}>{fmtPct(pct)}</div>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: "rgba(0,0,0,.08)", overflow: "hidden", marginTop: ".25rem" }}>
                    <div style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%`, height: "100%", background: "rgba(0,0,0,.35)" }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: ".9rem", opacity: 0.75, fontSize: ".9rem" }}>
            * Importes según archivo de nacionalidades (Marriott).
          </div>
        </div>
      </div>
    </div>
  );
}
