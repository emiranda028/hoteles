"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  filePath: string;
};

type Row = {
  year: number;
  country: string;
  continent: string;
  qty: number;
};

function parseNumberES(v: any) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function yearFromDateLike(v: any): number {
  if (typeof v === "number" && v > 1900 && v < 2100) return Math.floor(v);
  const s = String(v ?? "").trim();
  const m4 = s.match(/(19|20)\d{2}/);
  if (m4) return Number(m4[0]);
  return 0;
}

function normText(x: any) {
  return String(x ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeCountryName(s: string) {
  // normalizar mayúsculas/acentos mínimo
  return normText(s).toUpperCase();
}

// ISO2 básico para banderas (comillas en keys con espacios!)
const COUNTRY_TO_ISO2: Record<string, string> = {
  ARGENTINA: "AR",
  BRASIL: "BR",
  BRAZIL: "BR",
  CHILE: "CL",
  URUGUAY: "UY",
  PARAGUAY: "PY",
  BOLIVIA: "BO",
  PERU: "PE",
  COLOMBIA: "CO",
  MEXICO: "MX",
  "MÉXICO": "MX",
  "UNITED STATES": "US",
  "ESTADOS UNIDOS": "US",
  USA: "US",
  SPAIN: "ES",
  "ESPAÑA": "ES",
  FRANCE: "FR",
  ITALY: "IT",
  "UNITED KINGDOM": "GB",
  ENGLAND: "GB",
  GERMANY: "DE",
  "SOUTH AFRICA": "ZA",
  CHINA: "CN",
  JAPAN: "JP",
};

// sin iterar strings con spread: charAt
function iso2ToFlag(iso2: string) {
  const s = String(iso2 ?? "").toUpperCase().trim();
  if (s.length !== 2) return "";
  const A = 0x1f1e6;
  const c1 = s.charCodeAt(0) - 65;
  const c2 = s.charCodeAt(1) - 65;
  if (c1 < 0 || c1 > 25 || c2 < 0 || c2 > 25) return "";
  return String.fromCodePoint(A + c1, A + c2);
}

function fmtInt(n: number) {
  return (n ?? 0).toLocaleString("es-AR");
}

export default function CountryRanking({ year, filePath }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr("");

        const { rows: raw } = await readXlsxFromPublic(filePath);
        const keys = Object.keys(raw?.[0] ?? {});
        const keyLC = keys.map((k) => String(k).trim().toLowerCase());

        // Detectar columnas: país / continente / cantidad / fecha o año
        const countryKey =
          keys[keyLC.indexOf("pais")] ??
          keys[keyLC.indexOf("país")] ??
          keys[keyLC.indexOf("country")] ??
          keys.find((k) => String(k).toLowerCase().includes("pais")) ??
          "";

        const contKey =
          keys[keyLC.indexOf("continente")] ??
          keys[keyLC.indexOf("continent")] ??
          keys.find((k) => String(k).toLowerCase().includes("contin")) ??
          "";

        const qtyKey =
          keys[keyLC.indexOf("cantidad")] ??
          keys[keyLC.indexOf("qty")] ??
          keys.find((k) => String(k).toLowerCase().includes("cant")) ??
          "";

        const dateKey =
          keys[keyLC.indexOf("fecha")] ??
          keys[keyLC.indexOf("date")] ??
          keys[keyLC.indexOf("año")] ??
          keys[keyLC.indexOf("anio")] ??
          keys[keyLC.indexOf("year")] ??
          keys.find((k) => String(k).toLowerCase().includes("fec")) ??
          keys.find((k) => String(k).toLowerCase().includes("año")) ??
          keys.find((k) => String(k).toLowerCase().includes("anio")) ??
          "";

        if (!qtyKey || (!countryKey && !contKey) || !dateKey) {
          setRows([]);
          setErr(
            `Headers no detectados. Detectado: country=${countryKey || "—"} · continent=${contKey || "—"} · qty=${
              qtyKey || "—"
            } · fecha/año=${dateKey || "—"}`
          );
          return;
        }

        const parsed: Row[] = [];
        for (const r of raw) {
          const y = yearFromDateLike(r[dateKey]);
          if (!y) continue;

          const qty = parseNumberES(r[qtyKey]);
          if (!qty) continue;

          const country = countryKey ? normText(r[countryKey]) : "";
          const continent = contKey ? normText(r[contKey]) : "";

          // Esta tabla ES SOLO Marriott (según lo que definiste),
          // así que NO filtramos por hotel.
          parsed.push({
            year: y,
            country,
            continent,
            qty,
          });
        }

        setRows(parsed);
      } catch (e: any) {
        setErr(String(e?.message ?? e));
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [filePath]);

  const rowsYear = useMemo(() => rows.filter((r) => r.year === year), [rows, year]);

  const byCountry = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rowsYear) {
      const c = normalizeCountryName(r.country || "");
      if (!c) continue;
      map[c] = (map[c] ?? 0) + r.qty;
    }
    return map;
  }, [rowsYear]);

  const byContinent = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rowsYear) {
      const c = normText(r.continent || "").toUpperCase();
      if (!c) continue;
      map[c] = (map[c] ?? 0) + r.qty;
    }
    return map;
  }, [rowsYear]);

  const total = useMemo(() => {
    let t = 0;
    Object.values(byCountry).forEach((v) => (t += v));
    if (t === 0) Object.values(byContinent).forEach((v) => (t += v));
    return t;
  }, [byCountry, byContinent]);

  const topCountries = useMemo(() => {
    const list = Object.entries(byCountry)
      .map(([k, v]) => ({ country: k, qty: v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 12);
    return list;
  }, [byCountry]);

  const continentsList = useMemo(() => {
    const list = Object.entries(byContinent)
      .map(([k, v]) => ({ continent: k, qty: v }))
      .sort((a, b) => b.qty - a.qty);
    return list;
  }, [byContinent]);

  const noData = !loading && rowsYear.length === 0;

  return (
    <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
      <div style={{ display: "flex", gap: "1rem", alignItems: "baseline", flexWrap: "wrap" }}>
        <div style={{ fontSize: "1.15rem", fontWeight: 950 }}>Nacionalidades</div>
        <div style={{ opacity: 0.75 }}>Año {year} · (Marriott)</div>
        <div style={{ marginLeft: "auto", opacity: 0.7, fontSize: ".9rem" }}>
          Total: <b>{fmtInt(total)}</b>
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: ".75rem", opacity: 0.75 }}>Cargando nacionalidades…</div>
      ) : err ? (
        <div style={{ marginTop: ".75rem", color: "crimson" }}>{err}</div>
      ) : noData ? (
        <div style={{ marginTop: ".75rem", opacity: 0.75 }}>Sin datos para {year}.</div>
      ) : (
        <div
          style={{
            marginTop: "1rem",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 360px)",
            gap: "1rem",
            alignItems: "start",
          }}
        >
          {/* Países (GRANDE) */}
          <div
            style={{
              borderRadius: 20,
              padding: "1rem",
              border: "1px solid rgba(0,0,0,0.06)",
              background: "rgba(0,0,0,0.02)",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: ".75rem" }}>Ranking por país</div>

            <div style={{ display: "grid", gap: ".55rem" }}>
              {topCountries.map((it, idx) => {
                const iso2 = COUNTRY_TO_ISO2[it.country] ?? "";
                const flag = iso2 ? iso2ToFlag(iso2) : "🏳️";
                const pct = total > 0 ? (it.qty / total) * 100 : 0;

                return (
                  <div
                    key={it.country}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "38px 1fr 90px 140px",
                      gap: ".6rem",
                      alignItems: "center",
                      padding: ".55rem .65rem",
                      borderRadius: 14,
                      background: "white",
                      border: "1px solid rgba(0,0,0,0.06)",
                    }}
                  >
                    <div style={{ fontSize: "1.25rem" }}>{flag}</div>

                    <div style={{ fontWeight: 900 }}>
                      {idx + 1}. {it.country}
                    </div>

                    <div style={{ textAlign: "right", fontWeight: 900 }}>{fmtInt(it.qty)}</div>

                    <div
                      style={{
                        height: 10,
                        borderRadius: 999,
                        background: "rgba(0,0,0,0.08)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(0, Math.min(100, pct))}%`,
                          height: "100%",
                          borderRadius: 999,
                          background: "linear-gradient(90deg, #111827, #9ca3af)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Continentes (CHICO) */}
          <div
            style={{
              borderRadius: 20,
              padding: "1rem",
              border: "1px solid rgba(0,0,0,0.06)",
              background: "rgba(0,0,0,0.02)",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: ".75rem" }}>Por continente</div>

            <div style={{ display: "grid", gap: ".55rem" }}>
              {continentsList.map((it) => {
                const pct = total > 0 ? (it.qty / total) * 100 : 0;
                return (
                  <div
                    key={it.continent}
                    style={{
                      padding: ".6rem .7rem",
                      borderRadius: 14,
                      background: "white",
                      border: "1px solid rgba(0,0,0,0.06)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem" }}>
                      <div style={{ fontWeight: 900 }}>{it.continent}</div>
                      <div style={{ fontWeight: 900 }}>{fmtInt(it.qty)}</div>
                    </div>
                    <div style={{ marginTop: ".45rem", height: 10, borderRadius: 999, background: "rgba(0,0,0,0.08)" }}>
                      <div
                        style={{
                          width: `${Math.max(0, Math.min(100, pct))}%`,
                          height: "100%",
                          borderRadius: 999,
                          background: "linear-gradient(90deg, #60a5fa, #34d399)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <style jsx>{`
            @media (max-width: 900px) {
              div[style*="grid-template-columns: minmax(0, 1fr) minmax(0, 360px)"] {
                grid-template-columns: 1fr !important;
              }
              div[style*="grid-template-columns: 38px 1fr 90px 140px"] {
                grid-template-columns: 32px 1fr 80px !important;
              }
              div[style*="grid-template-columns: 38px 1fr 90px 140px"] > div:last-child {
                display: none;
              }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
