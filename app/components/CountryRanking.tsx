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
  month: number; // 1..12
  country: string;
  continent: string;
  value: number;
};

function norm(s: any) {
  return String(s ?? "").trim();
}
function normUpper(s: any) {
  return norm(s).toUpperCase();
}
function toNum(x: any) {
  if (x === null || x === undefined) return 0;
  if (typeof x === "number") return isFinite(x) ? x : 0;
  const s = String(x).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function getMonthNumber(m: any): number {
  // Excel puede traer "Mes" como nombre, número, o "N° Mes"
  const raw = norm(m);
  if (!raw) return 0;
  const n = Number(raw);
  if (isFinite(n) && n >= 1 && n <= 12) return n;

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
  const u = normUpper(raw);
  if (map[u]) return map[u];
  // por si viene "01" / "1" etc.
  if (u.length <= 2) {
    const nn = Number(u);
    if (isFinite(nn) && nn >= 1 && nn <= 12) return nn;
  }
  return 0;
}

// --- ISO2 mapping (keys con espacios deben ir entre comillas) ---
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
  "MÉXICO": "MX",
  "UNITED STATES": "US",
  "ESTADOS UNIDOS": "US",
  USA: "US",
  CANADA: "CA",
  CANADÁ: "CA",
  SPAIN: "ES",
  ESPAÑA: "ES",
  FRANCE: "FR",
  FRANCIA: "FR",
  ITALY: "IT",
  ITALIA: "IT",
  GERMANY: "DE",
  ALEMANIA: "DE",
  UK: "GB",
  "UNITED KINGDOM": "GB",
  INGLATERRA: "GB",
  "REINO UNIDO": "GB",
  CHINA: "CN",
  JAPON: "JP",
  JAPÓN: "JP",
  ISRAEL: "IL",
  TURKEY: "TR",
  TURQUÍA: "TR",
};

function iso2ToFlag(iso2: string) {
  const s = normUpper(iso2);
  if (s.length !== 2) return "";
  const A = 0x1f1e6;
  // NO usar [...s] (iterador). Usamos charAt.
  const c1 = s.charCodeAt(0) - 65;
  const c2 = s.charCodeAt(1) - 65;
  if (c1 < 0 || c1 > 25 || c2 < 0 || c2 > 25) return "";
  return String.fromCodePoint(A + c1, A + c2);
}

function monthLabel(m: number) {
  const labels = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return labels[m] ?? "";
}

export default function CountryRanking({ year, filePath, limit = 12 }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<number>(0); // 0 acumulado

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const res = await readXlsxFromPublic(filePath);
        if (!mounted) return;

        setSheet(res.sheetName || "");

        const raw = res.rows || [];
        if (!raw.length) {
          setRows([]);
          setLoading(false);
          return;
        }

        // Detectar headers habituales
        // Keys en tu ejemplo: Continente, Año, PAÍS , Mes, N° Mes, Importe ...
        const keys = Object.keys(raw[0] || {});
        const keyMap = keys.reduce((acc: Record<string, string>, k: string) => {
          acc[normUpper(k)] = k;
          return acc;
        }, {});

        const kYear =
          keyMap["AÑO"] || keyMap["ANO"] || keyMap["YEAR"] || keyMap["ANIO"] || "";
        const kMonth =
          keyMap["N° MES"] ||
          keyMap["Nº MES"] ||
          keyMap["N MES"] ||
          keyMap["MES"] ||
          "";
        const kCountry = keyMap["PAÍS"] || keyMap["PAIS"] || keyMap["PAÍS "] || keyMap["PAIS "] || "";
        const kCont = keyMap["CONTINENTE"] || "";
        // Valor: puede ser Importe / Total / Qty / Cantidad / etc.
        const kVal =
          keyMap["IMPORTE"] ||
          keyMap["TOTAL"] ||
          keyMap["CANTIDAD"] ||
          keyMap["QTY"] ||
          keyMap["VALOR"] ||
          "";

        const parsed: Row[] = raw
          .map((r: any) => {
            const y = Number(r[kYear]);
            const m = getMonthNumber(r[kMonth] || r["Mes"] || r["MES"]);
            const country = norm(r[kCountry]);
            const cont = norm(r[kCont]);
            const val = toNum(kVal ? r[kVal] : r["Importe"] ?? r["TOTAL"] ?? r["Cantidad"]);
            return {
              year: isFinite(y) ? y : 0,
              month: m || 0,
              country,
              continent: cont,
              value: val,
            };
          })
          .filter((r) => r.year > 0 && r.month >= 0);

        setRows(parsed);
        setLoading(false);
      } catch (e: any) {
        setError(e?.message || "Error cargando nacionalidades");
        setRows([]);
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [filePath]);

  const yearRows = useMemo(() => rows.filter((r) => r.year === year), [rows, year]);

  const monthsAvailable = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < yearRows.length; i++) {
      const m = yearRows[i].month;
      if (m >= 1 && m <= 12) set.add(m);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [yearRows]);

  const filtered = useMemo(() => {
    if (selectedMonth === 0) return yearRows;
    return yearRows.filter((r) => r.month === selectedMonth);
  }, [yearRows, selectedMonth]);

  const byCountry = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 0; i < filtered.length; i++) {
      const c = normUpper(filtered[i].country) || "SIN PAÍS";
      map[c] = (map[c] || 0) + filtered[i].value;
    }
    return map;
  }, [filtered]);

  const byContinent = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 0; i < filtered.length; i++) {
      const c = normUpper(filtered[i].continent) || "OTROS";
      map[c] = (map[c] || 0) + filtered[i].value;
    }
    return map;
  }, [filtered]);

  const total = useMemo(() => {
    const vals = Object.values(byCountry);
    let t = 0;
    for (let i = 0; i < vals.length; i++) t += vals[i];
    // fallback si no hay país, pero sí continente
    if (t === 0) {
      const v2 = Object.values(byContinent);
      for (let i = 0; i < v2.length; i++) t += v2[i];
    }
    return t;
  }, [byCountry, byContinent]);

  const topCountries = useMemo(() => {
    const arr = Object.entries(byCountry)
      .map(([k, v]) => ({ country: k, value: v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, Math.max(3, limit));
    return arr;
  }, [byCountry, limit]);

  const topContinents = useMemo(() => {
    const arr = Object.entries(byContinent)
      .map(([k, v]) => ({ continent: k, value: v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    return arr;
  }, [byContinent]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Cargando nacionalidades…
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 800 }}>Nacionalidades</div>
        <div style={{ marginTop: ".35rem", opacity: 0.8 }}>{error}</div>
      </div>
    );
  }

  if (!yearRows.length) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 900 }}>Nacionalidades</div>
        <div style={{ marginTop: ".35rem", opacity: 0.8 }}>
          Sin datos para {year}. (Archivo: {filePath})
        </div>
        <div style={{ marginTop: ".35rem", fontSize: ".85rem", opacity: 0.7 }}>
          Sheet: {sheet || "—"}
        </div>
      </div>
    );
  }

  // Responsive: 2 columnas en desktop, 1 en mobile
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {/* Filtro mensual */}
      <div
        className="card"
        style={{
          padding: "1rem",
          borderRadius: 18,
          display: "flex",
          gap: ".75rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 900 }}>Nacionalidades {year}</div>
        <div style={{ opacity: 0.65 }}>• Sheet: {sheet || "—"}</div>

        <div style={{ marginLeft: "auto", display: "flex", gap: ".5rem", alignItems: "center" }}>
          <div style={{ fontSize: ".85rem", opacity: 0.8 }}>Mes:</div>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            style={{ padding: ".45rem .6rem", borderRadius: 10 }}
          >
            <option value={0}>Acumulado</option>
            {monthsAvailable.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
          gap: "1rem",
        }}
      >
        {/* Ranking países (más grande) */}
        <div
          className="card"
          style={{
            gridColumn: "span 12",
            padding: "1rem",
            borderRadius: 18,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Ranking por país</div>
              <div style={{ marginTop: ".25rem", opacity: 0.75 }}>
                Total: <b>{Math.round(total).toLocaleString("es-AR")}</b>
              </div>
            </div>
            <div style={{ opacity: 0.7, fontSize: ".9rem" }}>
              {selectedMonth === 0 ? "Acumulado" : `Mes: ${monthLabel(selectedMonth)}`}
            </div>
          </div>

          <div style={{ marginTop: ".8rem", display: "grid", gap: ".5rem" }}>
            {topCountries.map((r, idx) => {
              const iso2 = COUNTRY_TO_ISO2[r.country] || COUNTRY_TO_ISO2[normUpper(r.country)] || "";
              const flag = iso2 ? iso2ToFlag(iso2) : "";
              const pct = total > 0 ? (r.value / total) * 100 : 0;

              return (
                <div
                  key={r.country}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) 120px",
                    gap: ".75rem",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", gap: ".6rem", alignItems: "center", minWidth: 0 }}>
                    <div style={{ width: 28, textAlign: "center", fontWeight: 900, opacity: 0.7 }}>
                      {idx + 1}
                    </div>
                    <div style={{ fontSize: "1.1rem", width: 26, textAlign: "center" }}>{flag}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.country}
                      </div>
                      <div style={{ opacity: 0.7, fontSize: ".85rem" }}>
                        {Math.round(r.value).toLocaleString("es-AR")} • {pct.toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      height: 10,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.08)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, Math.max(0, pct))}%`,
                        borderRadius: 999,
                        background: "linear-gradient(90deg, rgba(99,102,241,.9), rgba(236,72,153,.85))",
                      }}
                    />
                  </div>
                </div>
              );
            })}

            {topCountries.length === 0 && (
              <div style={{ opacity: 0.75, marginTop: ".5rem" }}>
                No hay países en {year} para {selectedMonth === 0 ? "acumulado" : monthLabel(selectedMonth)}.
              </div>
            )}
          </div>
        </div>

        {/* Continentes (más chico) */}
        <div
          className="card"
          style={{
            gridColumn: "span 12",
            padding: "1rem",
            borderRadius: 18,
          }}
        >
          <div style={{ fontWeight: 950, fontSize: "1.0rem" }}>Distribución por continente</div>

          <div style={{ marginTop: ".75rem", display: "grid", gap: ".55rem" }}>
            {topContinents.map((c) => {
              const pct = total > 0 ? (c.value / total) * 100 : 0;
              return (
                <div key={c.continent} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px", gap: ".75rem" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.continent}
                    </div>
                    <div style={{ opacity: 0.7, fontSize: ".85rem" }}>
                      {Math.round(c.value).toLocaleString("es-AR")} • {pct.toFixed(1)}%
                    </div>
                  </div>
                  <div
                    style={{
                      height: 10,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.08)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, Math.max(0, pct))}%`,
                        borderRadius: 999,
                        background: "linear-gradient(90deg, rgba(16,185,129,.85), rgba(59,130,246,.85))",
                      }}
                    />
                  </div>
                </div>
              );
            })}

            {topContinents.length === 0 && <div style={{ opacity: 0.75 }}>Sin continentes para mostrar.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
