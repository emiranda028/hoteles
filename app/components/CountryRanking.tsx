"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  filePath: string;
  limit?: number;
  /** Opcional (para no romper si YearComparator lo pasa). En nacionalidades no lo usamos. */
  hotelFilter?: string;
};

type Row = Record<string, any>;

function normStr(v: any): string {
  return String(v ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function normKey(k: any): string {
  return normStr(k).toLowerCase();
}

function toNumber(v: any): number {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const s = normStr(v)
    .replace(/\./g, "") // miles
    .replace(/,/g, "."); // decimales
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

/** Excel serial date -> JS Date (1900 system). */
function excelSerialToDate(serial: number): Date | null {
  if (!isFinite(serial)) return null;
  // Excel bug 1900 leap year is typically ignored in modern conversions;
  // this simple conversion works well for typical dashboards.
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400; // seconds
  const d = new Date(utcValue * 1000);
  return isFinite(d.getTime()) ? d : null;
}

function getYearFromAny(v: any): number | null {
  if (v == null || v === "") return null;

  // If already a year
  const n = toNumber(v);
  if (n >= 1900 && n <= 2100) return Math.trunc(n);

  // Excel serials (e.g., 46004)
  if (n > 3000 && n < 80000) {
    const d = excelSerialToDate(n);
    if (!d) return null;
    return d.getUTCFullYear();
  }

  // Date string
  const s = normStr(v);
  const d2 = new Date(s);
  if (isFinite(d2.getTime())) return d2.getFullYear();

  return null;
}

function formatInt(n: number): string {
  try {
    return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(Math.round(n));
  }
}

function formatPct(n: number): string {
  const v = isFinite(n) ? n : 0;
  return `${v.toFixed(1)}%`;
}

function normalizeCountryName(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/** Map a country name to ISO2 for emoji flag. Keep keys QUOTED when containing spaces/accents. */
const COUNTRY_TO_ISO2: Record<string, string> = {
  "ARGENTINA": "AR",
  "URUGUAY": "UY",
  "BRASIL": "BR",
  "BRAZIL": "BR",
  "CHILE": "CL",
  "PARAGUAY": "PY",
  "BOLIVIA": "BO",
  "PERU": "PE",
  "PERÚ": "PE",
  "ECUADOR": "EC",
  "COLOMBIA": "CO",
  "VENEZUELA": "VE",

  "MEXICO": "MX",
  "MÉXICO": "MX",
  "USA": "US",
  "EEUU": "US",
  "ESTADOS UNIDOS": "US",
  "UNITED STATES": "US",

  "CANADA": "CA",
  "CANADÁ": "CA",

  "ESPAÑA": "ES",
  "SPAIN": "ES",
  "ITALIA": "IT",
  "ITALY": "IT",
  "FRANCIA": "FR",
  "FRANCE": "FR",
  "ALEMANIA": "DE",
  "GERMANY": "DE",
  "SUIZA": "CH",
  "SWITZERLAND": "CH",
  "REINO UNIDO": "GB",
  "UNITED KINGDOM": "GB",
  "INGLATERRA": "GB",
  "PORTUGAL": "PT",
  "HOLANDA": "NL",
  "NETHERLANDS": "NL",
  "BÉLGICA": "BE",
  "BELGICA": "BE",
  "BELGIUM": "BE",

  "CHINA": "CN",
  "JAPON": "JP",
  "JAPÓN": "JP",
  "JAPAN": "JP",
  "COREA": "KR",
  "COREA DEL SUR": "KR",
  "SOUTH KOREA": "KR",
  "INDIA": "IN",

  "AUSTRALIA": "AU",
  "NUEVA ZELANDA": "NZ",
  "NEW ZEALAND": "NZ",
};

function iso2ToFlagEmoji(iso2: string): string {
  const s = normStr(iso2).toUpperCase();
  if (s.length !== 2) return "";
  const A = 0x1f1e6;
  const c0 = s.charCodeAt(0);
  const c1 = s.charCodeAt(1);
  if (c0 < 65 || c0 > 90 || c1 < 65 || c1 > 90) return "";
  return String.fromCodePoint(A + (c0 - 65), A + (c1 - 65));
}

function getFlagForCountry(countryName: string): string {
  const key = normalizeCountryName(countryName);
  const iso2 = COUNTRY_TO_ISO2[key];
  return iso2 ? iso2ToFlagEmoji(iso2) : "🏳️";
}

function pickKey(rows: Row[], candidates: string[]): string | null {
  if (!rows.length) return null;
  const keys = Object.keys(rows[0] ?? {});
  const keySet = new Map<string, string>();
  for (const k of keys) keySet.set(normKey(k), k);

  for (const cand of candidates) {
    const found = keySet.get(normKey(cand));
    if (found) return found;
  }
  return null;
}

function guessValueKey(rows: Row[]): string | null {
  // Prefer these if present
  const candidates = [
    "Cantidad",
    "CANTIDAD",
    "Qty",
    "QTY",
    "Total",
    "TOTAL",
    "Importe",
    "IMPORTE",
    "Total Occ.",
    "Total Occ",
    "TOTAL OCC.",
    "TOTAL OCC",
    "Total Occ.\"",
  ];
  const k = pickKey(rows, candidates);
  if (k) return k;

  // Otherwise, choose the most numeric-looking column (fallback)
  if (!rows.length) return null;
  const keys = Object.keys(rows[0] ?? {});
  let best: string | null = null;
  let bestScore = -1;

  for (const k2 of keys) {
    let score = 0;
    for (let i = 0; i < Math.min(rows.length, 50); i++) {
      const n = toNumber(rows[i]?.[k2]);
      if (n !== 0) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = k2;
    }
  }
  return best;
}

const MONTHS = [
  { n: 1, label: "Ene" },
  { n: 2, label: "Feb" },
  { n: 3, label: "Mar" },
  { n: 4, label: "Abr" },
  { n: 5, label: "May" },
  { n: 6, label: "Jun" },
  { n: 7, label: "Jul" },
  { n: 8, label: "Ago" },
  { n: 9, label: "Sep" },
  { n: 10, label: "Oct" },
  { n: 11, label: "Nov" },
  { n: 12, label: "Dic" },
];

export default function CountryRanking({ year, filePath, limit = 10 }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Ranking por mes (selector)
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readXlsxFromPublic(filePath)
      .then((res) => {
        if (!alive) return;
        setRows((res?.rows ?? []) as Row[]);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message ?? String(e));
        setRows([]);
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  const detected = useMemo(() => {
    const yearKey =
      pickKey(rows, ["Año", "AÑO", "Anio", "ANIO", "Year", "YEAR"]) ?? null;

    const countryKey =
      pickKey(rows, ["País", "PAÍS", "PAIS", "PAÍS ", "PAIS ", "Country", "COUNTRY"]) ??
      null;

    const contKey =
      pickKey(rows, ["Continente", "CONTINENTE", "Continent", "CONTINENT"]) ?? null;

    const monthKey =
      pickKey(rows, ["N° Mes", "N° MES", "N Mes", "Mes", "MES", "Month", "MONTH"]) ?? null;

    const valueKey = guessValueKey(rows);

    return { yearKey, countryKey, contKey, monthKey, valueKey };
  }, [rows]);

  const normalized = useMemo(() => {
    const { yearKey, countryKey, contKey, monthKey, valueKey } = detected;
    if (!rows.length || !yearKey || !countryKey) return [];

    const out = [];
    for (const r of rows) {
      const y = getYearFromAny(r[yearKey]);
      if (!y) continue;

      const country = normStr(r[countryKey]);
      if (!country) continue;

      const cont = contKey ? normStr(r[contKey]) : "";
      const mRaw = monthKey ? r[monthKey] : "";
      let m = toNumber(mRaw);
      if (!m && typeof mRaw === "string") {
        // si viene "Enero", etc.
        const ms = normStr(mRaw).toLowerCase();
        const idx = MONTHS.findIndex((x) => x.label.toLowerCase() === ms.slice(0, 3));
        if (idx >= 0) m = MONTHS[idx].n;
      }

      const val = valueKey ? toNumber(r[valueKey]) : 1;

      out.push({
        year: y,
        month: m >= 1 && m <= 12 ? m : null,
        country,
        continent: cont,
        value: val,
      });
    }
    return out;
  }, [rows, detected]);

  const yearRows = useMemo(() => normalized.filter((r) => r.year === year), [normalized, year]);

  const byCountry = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of yearRows) {
      const key = normalizeCountryName(r.country);
      map.set(key, (map.get(key) ?? 0) + (r.value || 0));
    }
    return map;
  }, [yearRows]);

  const byContinent = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of yearRows) {
      const key = normStr(r.continent) || "Sin continente";
      map.set(key, (map.get(key) ?? 0) + (r.value || 0));
    }
    return map;
  }, [yearRows]);

  const total = useMemo(() => {
    const vals = Array.from(byCountry.values());
    let t = 0;
    for (const v of vals) t += v;
    return t;
  }, [byCountry]);

  const topCountries = useMemo(() => {
    const arr = Array.from(byCountry.entries()).map(([k, v]) => ({ key: k, value: v }));
    arr.sort((a, b) => b.value - a.value);
    return arr.slice(0, Math.max(1, limit));
  }, [byCountry, limit]);

  const continentBreakdown = useMemo(() => {
    const arr = Array.from(byContinent.entries()).map(([k, v]) => ({ key: k, value: v }));
    arr.sort((a, b) => b.value - a.value);
    return arr;
  }, [byContinent]);

  const monthRows = useMemo(() => {
    const filtered = yearRows.filter((r) => r.month === month);
    const map = new Map<string, number>();
    for (const r of filtered) {
      const key = normalizeCountryName(r.country);
      map.set(key, (map.get(key) ?? 0) + (r.value || 0));
    }
    const arr = Array.from(map.entries()).map(([k, v]) => ({ key: k, value: v }));
    arr.sort((a, b) => b.value - a.value);
    return arr.slice(0, Math.max(1, limit));
  }, [yearRows, month, limit]);

  const monthTotal = useMemo(() => {
    let t = 0;
    for (const it of monthRows) t += it.value;
    return t;
  }, [monthRows]);

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
        <div style={{ fontWeight: 900 }}>Error</div>
        <div style={{ marginTop: ".25rem", opacity: 0.9 }}>{err}</div>
      </div>
    );
  }

  if (!yearRows.length) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 900 }}>Nacionalidades</div>
        <div style={{ marginTop: ".25rem", opacity: 0.9 }}>
          Sin datos para {year}. (Archivo: {filePath})
        </div>
        <div style={{ marginTop: ".5rem", fontSize: ".9rem", opacity: 0.75 }}>
          Detectado: año={detected.yearKey ?? "—"} · país={detected.countryKey ?? "—"} ·
          continente={detected.contKey ?? "—"} · mes={detected.monthKey ?? "—"} ·
          valor={detected.valueKey ?? "—"}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {/* Topline */}
      <div
        className="card"
        style={{
          padding: "1rem",
          borderRadius: 22,
          display: "grid",
          gap: ".4rem",
        }}
      >
        <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Nacionalidades · {year}</div>
        <div style={{ opacity: 0.85, fontSize: ".95rem" }}>
          Total año: <b>{formatInt(total)}</b>
        </div>
      </div>

      {/* Layout responsive: 1 col mobile, 2 col desktop */}
      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          alignItems: "start",
        }}
      >
        {/* Ranking países */}
        <div
          className="card"
          style={{
            padding: "1rem",
            borderRadius: 22,
          }}
        >
          <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Ranking por país</div>
          <div style={{ marginTop: ".35rem", opacity: 0.8, fontSize: ".92rem" }}>
            Top {limit} · nominal + porcentaje
          </div>

          <div style={{ marginTop: ".85rem", display: "grid", gap: ".65rem" }}>
            {topCountries.map((it, idx) => {
              const pct = total > 0 ? (it.value / total) * 100 : 0;
              const flag = getFlagForCountry(it.key);
              return (
                <div
                  key={it.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: ".75rem",
                    padding: ".75rem",
                    borderRadius: 18,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                      <span style={{ opacity: 0.85 }}>{idx + 1}.</span>
                      <span>{flag}</span>
                      <span style={{ wordBreak: "break-word" }}>{it.key}</span>
                    </div>

                    <div style={{ marginTop: ".3rem", fontSize: ".95rem", opacity: 0.9 }}>
                      {formatInt(it.value)}{" "}
                      <span style={{ opacity: 0.75 }}>({formatPct(pct)})</span>
                    </div>

                    {/* barra */}
                    <div
                      style={{
                        marginTop: ".5rem",
                        height: 10,
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.08)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, pct))}%`,
                          height: "100%",
                          borderRadius: 999,
                          background: "linear-gradient(90deg, rgba(80,170,255,.9), rgba(180,90,255,.9))",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ textAlign: "right", opacity: 0.75, fontSize: ".9rem" }}>
                    {formatPct(pct)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Continentes + ranking por mes */}
        <div style={{ display: "grid", gap: "1rem" }}>
          {/* Continentes */}
          <div
            className="card"
            style={{
              padding: "1rem",
              borderRadius: 22,
            }}
          >
            <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Distribución por continente</div>
            <div style={{ marginTop: ".85rem", display: "grid", gap: ".6rem" }}>
              {continentBreakdown.map((it) => {
                const pct = total > 0 ? (it.value / total) * 100 : 0;
                return (
                  <div
                    key={it.key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: ".75rem",
                      padding: ".7rem",
                      borderRadius: 18,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900, wordBreak: "break-word" }}>{it.key}</div>
                      <div style={{ marginTop: ".25rem", opacity: 0.85, fontSize: ".92rem" }}>
                        {formatInt(it.value)}{" "}
                        <span style={{ opacity: 0.75 }}>({formatPct(pct)})</span>
                      </div>

                      <div
                        style={{
                          marginTop: ".45rem",
                          height: 10,
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.08)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, pct))}%`,
                            height: "100%",
                            borderRadius: 999,
                            background: "linear-gradient(90deg, rgba(80,170,255,.9), rgba(180,90,255,.9))",
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ textAlign: "right", opacity: 0.75, fontSize: ".9rem" }}>
                      {formatPct(pct)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ranking por mes */}
          <div
            className="card"
            style={{
              padding: "1rem",
              borderRadius: 22,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Ranking por mes</div>
                <div style={{ marginTop: ".25rem", opacity: 0.8, fontSize: ".92rem" }}>
                  Seleccioná mes · top {limit} + nominal + %
                </div>
              </div>

              <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                <div style={{ opacity: 0.75, fontSize: ".9rem" }}>Mes</div>
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  style={{
                    padding: ".45rem .6rem",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "rgba(0,0,0,0.25)",
                    color: "inherit",
                    fontWeight: 800,
                  }}
                >
                  {MONTHS.map((m) => (
                    <option key={m.n} value={m.n} style={{ color: "#111" }}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginTop: ".75rem", opacity: 0.85, fontSize: ".95rem" }}>
              Total mes: <b>{formatInt(monthTotal)}</b>
            </div>

            <div style={{ marginTop: ".85rem", display: "grid", gap: ".65rem" }}>
              {monthRows.map((it, idx) => {
                const pct = monthTotal > 0 ? (it.value / monthTotal) * 100 : 0;
                const flag = getFlagForCountry(it.key);
                return (
                  <div
                    key={`${month}-${it.key}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: ".75rem",
                      padding: ".75rem",
                      borderRadius: 18,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900, display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                        <span style={{ opacity: 0.85 }}>{idx + 1}.</span>
                        <span>{flag}</span>
                        <span style={{ wordBreak: "break-word" }}>{it.key}</span>
                      </div>

                      <div style={{ marginTop: ".3rem", fontSize: ".95rem", opacity: 0.9 }}>
                        {formatInt(it.value)}{" "}
                        <span style={{ opacity: 0.75 }}>({formatPct(pct)})</span>
                      </div>

                      <div
                        style={{
                          marginTop: ".5rem",
                          height: 10,
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.08)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, pct))}%`,
                            height: "100%",
                            borderRadius: 999,
                            background: "linear-gradient(90deg, rgba(80,170,255,.9), rgba(180,90,255,.9))",
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ textAlign: "right", opacity: 0.75, fontSize: ".9rem" }}>
                      {formatPct(pct)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: "1rem", fontSize: ".85rem", opacity: 0.7 }}>
              Detectado: año={detected.yearKey ?? "—"} · país={detected.countryKey ?? "—"} ·
              continente={detected.contKey ?? "—"} · mes={detected.monthKey ?? "—"} · valor=
              {detected.valueKey ?? "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
