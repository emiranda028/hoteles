"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  filePath: string;
  /** nacionalidades es SOLO Marriott -> no uses hotelFilter */
};

type Row = {
  continente: string;
  pais: string;
  year: number;
  month: number; // 1-12
  amount: number;
};

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function norm(s: any) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function toNumber(v: any): number {
  const s = norm(v);
  if (!s) return 0;

  // quita separadores raros (miles) y convierte coma decimal a punto si corresponde
  // ejemplo "22.441,71" -> "22441.71"
  const cleaned = s
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.-]/g, "");

  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toInt(v: any): number {
  const n = Math.round(toNumber(v));
  return Number.isFinite(n) ? n : 0;
}

function normalizePaisName(p: string) {
  const up = norm(p).toUpperCase();
  return up
    .replace(/Á/g, "A")
    .replace(/É/g, "E")
    .replace(/Í/g, "I")
    .replace(/Ó/g, "O")
    .replace(/Ú/g, "U")
    .replace(/Ü/g, "U")
    .replace(/Ñ/g, "N");
}

/**
 * Mapa: país -> ISO2 (minimo para banderas)
 * OJO: keys con espacios van SIEMPRE entre comillas.
 */
const ISO2: Record<string, string> = {
  ARGENTINA: "AR",
  BRASIL: "BR",
  BRAZIL: "BR",
  URUGUAY: "UY",
  CHILE: "CL",
  PARAGUAY: "PY",
  BOLIVIA: "BO",
  PERU: "PE",
  COLOMBIA: "CO",
  ECUADOR: "EC",
  VENEZUELA: "VE",
  MEXICO: "MX",
  "MEXICO D.F.": "MX",
  "UNITED STATES": "US",
  "ESTADOS UNIDOS": "US",
  EEUU: "US",
  USA: "US",
  CANADA: "CA",
  ESPANA: "ES",
  SPAIN: "ES",
  FRANCIA: "FR",
  FRANCE: "FR",
  ITALIA: "IT",
  ITALY: "IT",
  ALEMANIA: "DE",
  GERMANY: "DE",
  "REINO UNIDO": "GB",
  "UNITED KINGDOM": "GB",
  INGLATERRA: "GB",
  PORTUGAL: "PT",
  HOLANDA: "NL",
  NETHERLANDS: "NL",
  SUIZA: "CH",
  SWITZERLAND: "CH",
  AUSTRIA: "AT",
  BELGICA: "BE",
  BELGIUM: "BE",
  SUECIA: "SE",
  SWEDEN: "SE",
  NORUEGA: "NO",
  NORWAY: "NO",
  DINAMARCA: "DK",
  DENMARK: "DK",
  IRLANDA: "IE",
  IRELAND: "IE",
  AUSTRALIA: "AU",
  JAPON: "JP",
  JAPAN: "JP",
  CHINA: "CN",
  INDIA: "IN",
};

function flagEmojiFromISO2(iso2: string) {
  const s = (iso2 || "").toUpperCase();
  if (s.length !== 2) return "";
  const A = 0x1f1e6;

  // sin spread ni for..of sobre string (evitamos target ES2015)
  const c0 = s.charCodeAt(0);
  const c1 = s.charCodeAt(1);
  if (!(c0 >= 65 && c0 <= 90 && c1 >= 65 && c1 <= 90)) return "";

  return String.fromCodePoint(A + (c0 - 65), A + (c1 - 65));
}

function formatInt(n: number) {
  return new Intl.NumberFormat("es-AR").format(Math.round(n || 0));
}

export default function CountryRanking({ year, filePath }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readXlsxFromPublic(filePath)
      .then(({ rows: raw }) => {
        if (!alive) return;

        const parsed: Row[] = [];

        for (let i = 0; i < raw.length; i++) {
          const r = raw[i] ?? {};
          // headers esperados: Continente, Año, PAÍS , Mes, N° Mes, Importe
          const continente = norm(r["Continente"] ?? r["CONTINENTE"] ?? r["continent"] ?? "");
          const pais = norm(r["PAÍS "] ?? r["PAÍS"] ?? r["PAIS"] ?? r["País"] ?? r["Pais"] ?? r["Country"] ?? "");
          const y = toInt(r["Año"] ?? r["ANO"] ?? r["Year"] ?? r["year"]);
          const m = toInt(r["N° Mes"] ?? r["N°Mes"] ?? r["Mes N"] ?? r["MesNum"] ?? r["month"] ?? r["Month"]);
          const imp = toNumber(r["Importe"] ?? r["IMPORTE"] ?? r["Amount"] ?? r["Total"] ?? 0);

          if (!y || !m || !pais) continue;

          parsed.push({
            continente: continente || "—",
            pais,
            year: y,
            month: Math.min(12, Math.max(1, m)),
            amount: imp,
          });
        }

        setRows(parsed);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message || "Error leyendo XLSX");
        setRows([]);
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  const yearRows = useMemo(() => rows.filter((r) => r.year === year), [rows, year]);

  const byCountry = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 0; i < yearRows.length; i++) {
      const k = yearRows[i].pais;
      map[k] = (map[k] || 0) + (yearRows[i].amount || 0);
    }
    return map;
  }, [yearRows]);

  const byContinent = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 0; i < yearRows.length; i++) {
      const k = yearRows[i].continente || "—";
      map[k] = (map[k] || 0) + (yearRows[i].amount || 0);
    }
    return map;
  }, [yearRows]);

  const total = useMemo(() => {
    let t = 0;
    const keys = Object.keys(byCountry);
    for (let i = 0; i < keys.length; i++) t += byCountry[keys[i]] || 0;
    return t;
  }, [byCountry]);

  const topCountries = useMemo(() => {
    const entries = Object.entries(byCountry).sort((a, b) => (b[1] || 0) - (a[1] || 0));
    return entries.slice(0, 12);
  }, [byCountry]);

  const topContinents = useMemo(() => {
    const entries = Object.entries(byContinent).sort((a, b) => (b[1] || 0) - (a[1] || 0));
    return entries.slice(0, 6);
  }, [byContinent]);

  // ranking por mes: top país del mes
  const topByMonth = useMemo(() => {
    // month -> (pais->amount)
    const bucket: Record<number, Record<string, number>> = {};
    for (let i = 0; i < yearRows.length; i++) {
      const r = yearRows[i];
      const m = r.month;
      if (!bucket[m]) bucket[m] = {};
      bucket[m][r.pais] = (bucket[m][r.pais] || 0) + (r.amount || 0);
    }

    const out: { month: number; pais: string; amount: number }[] = [];
    for (let m = 1; m <= 12; m++) {
      const mp = bucket[m];
      if (!mp) continue;
      let bestPais = "";
      let bestVal = 0;
      const keys = Object.keys(mp);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const v = mp[k] || 0;
        if (v > bestVal) {
          bestVal = v;
          bestPais = k;
        }
      }
      if (bestPais) out.push({ month: m, pais: bestPais, amount: bestVal });
    }
    return out;
  }, [yearRows]);

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
        <b>Error:</b> {err}
      </div>
    );
  }

  if (yearRows.length === 0) {
    const yearsAvail = Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => a - b);
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 900 }}>Nacionalidades</div>
        <div style={{ marginTop: ".25rem" }}>
          Sin datos para <b>{year}</b>. (Archivo: {filePath})
        </div>
        <div style={{ marginTop: ".35rem", opacity: 0.85 }}>
          Años disponibles: {yearsAvail.length ? yearsAvail.join(", ") : "—"}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {/* Top + Totales */}
      <div
        className="card"
        style={{
          borderRadius: 18,
          padding: "1rem",
          display: "grid",
          gap: ".75rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: "1.1rem" }}>Ranking por país — {year}</div>
            <div style={{ opacity: 0.85, marginTop: ".15rem" }}>Total nominal: <b>{formatInt(total)}</b></div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: ".75rem",
          }}
        >
          {topCountries.map(([pais, val]) => {
            const share = total > 0 ? (val / total) * 100 : 0;
            const iso2 = ISO2[normalizePaisName(pais)] || "";
            const flag = flagEmojiFromISO2(iso2);

            return (
              <div
                key={pais}
                style={{
                  borderRadius: 16,
                  padding: ".75rem",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: ".6rem" }}>
                  <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {flag ? <span style={{ marginRight: ".4rem" }}>{flag}</span> : null}
                    {pais}
                  </div>
                  <div style={{ fontWeight: 900 }}>{share.toFixed(1)}%</div>
                </div>

                <div style={{ marginTop: ".3rem", fontSize: ".95rem", opacity: 0.9 }}>
                  {formatInt(val)} <span style={{ opacity: 0.75 }}>({val.toFixed ? "" : ""})</span>
                </div>

                <div
                  style={{
                    marginTop: ".45rem",
                    height: 8,
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.10)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(100, share))}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: "linear-gradient(90deg, rgba(120,170,255,0.95), rgba(160,90,255,0.95))",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Continentes (más chico) */}
      <div
        className="card"
        style={{
          borderRadius: 18,
          padding: "1rem",
          display: "grid",
          gap: ".6rem",
        }}
      >
        <div style={{ fontWeight: 950 }}>Distribución por continente</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: ".6rem",
          }}
        >
          {topContinents.map(([cont, val]) => {
            const share = total > 0 ? (val / total) * 100 : 0;
            return (
              <div
                key={cont}
                style={{
                  borderRadius: 14,
                  padding: ".65rem",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem" }}>
                  <div style={{ fontWeight: 900 }}>{cont}</div>
                  <div style={{ fontWeight: 900 }}>{share.toFixed(1)}%</div>
                </div>
                <div style={{ marginTop: ".2rem", opacity: 0.85 }}>{formatInt(val)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ranking por mes */}
      <div className="card" style={{ borderRadius: 18, padding: "1rem" }}>
        <div style={{ fontWeight: 950 }}>Top país por mes</div>
        <div style={{ marginTop: ".6rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.9 }}>
                <th style={{ padding: ".5rem .4rem" }}>Mes</th>
                <th style={{ padding: ".5rem .4rem" }}>País</th>
                <th style={{ padding: ".5rem .4rem" }}>Total</th>
                <th style={{ padding: ".5rem .4rem" }}>%</th>
              </tr>
            </thead>
            <tbody>
              {topByMonth.map((r) => {
                const iso2 = ISO2[normalizePaisName(r.pais)] || "";
                const flag = flagEmojiFromISO2(iso2);
                const share = total > 0 ? (r.amount / total) * 100 : 0;

                return (
                  <tr key={r.month} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <td style={{ padding: ".55rem .4rem" }}>{MONTHS[r.month - 1]}</td>
                    <td style={{ padding: ".55rem .4rem", fontWeight: 850 }}>
                      {flag ? <span style={{ marginRight: ".4rem" }}>{flag}</span> : null}
                      {r.pais}
                    </td>
                    <td style={{ padding: ".55rem .4rem" }}>{formatInt(r.amount)}</td>
                    <td style={{ padding: ".55rem .4rem" }}>{share.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
