"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  filePath: string; // "/data/jcr_nacionalidades.xlsx"
  limit?: number;
  baseYear?: number; // opcional si querés comparar
};

type Row = {
  ["Año"]?: any;
  ["PAÍS"]?: any;
  ["PAÍS "]?: any;
  ["PAÍS  "]?: any;
  ["Pais"]?: any;
  ["País"]?: any;
  ["Continente"]?: any;
  ["Mes"]?: any;
  ["N° Mes"]?: any;
  ["N° Mes "]?: any;
  ["Importe"]?: any;
};

function toNumber(x: any) {
  if (x === null || x === undefined) return 0;
  const s = String(x).trim();
  if (!s) return 0;
  const cleaned = s
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(s: any) {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCountryName(raw: string) {
  const s = normalizeText(raw).toUpperCase();
  return s
    .replace(/\./g, "")
    .replace(/Á/g, "A")
    .replace(/É/g, "E")
    .replace(/Í/g, "I")
    .replace(/Ó/g, "O")
    .replace(/Ú/g, "U")
    .replace(/Ü/g, "U")
    .replace(/Ñ/g, "N");
}

// Mapa básico (extensible) país->ISO2 para bandera emoji
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
  "COLOMBIA": "CO",
  "MEXICO": "MX",
  "MÉXICO": "MX",
  "ESPAÑA": "ES",
  "SPAIN": "ES",
  "FRANCIA": "FR",
  "FRANCE": "FR",
  "ITALIA": "IT",
  "ITALY": "IT",
  "ALEMANIA": "DE",
  "GERMANY": "DE",
  "REINO UNIDO": "GB",
  "UNITED KINGDOM": "GB",
  "INGLATERRA": "GB",
  "EEUU": "US",
  "ESTADOS UNIDOS": "US",
  "USA": "US",
  "UNITED STATES": "US",
  "CANADA": "CA",
  "CHINA": "CN",
  "JAPON": "JP",
  "JAPÓN": "JP",
};

function iso2ToFlag(iso2: string) {
  const s = String(iso2 ?? "").trim().toUpperCase();
  if (s.length !== 2) return "";
  const A = 0x1f1e6;
  const c0 = s.charCodeAt(0) - 65;
  const c1 = s.charCodeAt(1) - 65;
  if (c0 < 0 || c0 > 25 || c1 < 0 || c1 > 25) return "";
  return String.fromCodePoint(A + c0, A + c1);
}

function getCountry(r: Row) {
  return (
    normalizeText(r["PAÍS"] ?? r["PAÍS "] ?? r["PAÍS  "] ?? r["Pais"] ?? r["País"]) || "SIN DATO"
  );
}

function getContinent(r: Row) {
  return normalizeText(r["Continente"]) || "SIN DATO";
}

function getYear(r: Row) {
  const y = toNumber(r["Año"]);
  return y || null;
}

function getMonthNum(r: Row) {
  const n = toNumber(r["N° Mes"] ?? r["N° Mes "]);
  if (n >= 1 && n <= 12) return n;
  // fallback: Mes como texto
  const m = normalizeText(r["Mes"]).toLowerCase();
  const map: Record<string, number> = {
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    setiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12,
  };
  return map[m] ?? null;
}

export default function CountryRanking({ year, filePath, limit = 12 }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);

    readXlsxFromPublic(filePath)
      .then((res) => {
        if (!alive) return;
        setRows((res.rows ?? []) as Row[]);
      })
      .catch((e: any) => {
        if (!alive) return;
        setErr(e?.message ?? "Error leyendo XLSX");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  const yearRows = useMemo(() => {
    return (rows ?? []).filter((r) => getYear(r) === year);
  }, [rows, year]);

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of yearRows) {
      const c = getCountry(r);
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  }, [yearRows]);

  const byContinent = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of yearRows) {
      const c = getContinent(r);
      m.set(c, (m.get(c) ?? 0) + 1);
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
    const arr = Array.from(byCountry.entries())
      .map(([k, v]) => ({ country: k, qty: v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit);

    return arr;
  }, [byCountry, limit]);

  // Ranking mensual: top país por mes (1..12)
  const topByMonth = useMemo(() => {
    const monthMap = new Map<number, Map<string, number>>();
    for (const r of yearRows) {
      const mn = getMonthNum(r);
      if (!mn) continue;
      if (!monthMap.has(mn)) monthMap.set(mn, new Map<string, number>());
      const m = monthMap.get(mn)!;
      const c = getCountry(r);
      m.set(c, (m.get(c) ?? 0) + 1);
    }

    const out: { month: number; country: string; qty: number }[] = [];
    for (let mn = 1; mn <= 12; mn++) {
      const m = monthMap.get(mn);
      if (!m) continue;
      let bestC = "";
      let bestV = 0;
      for (const [c, v] of Array.from(m.entries())) {
        if (v > bestV) {
          bestV = v;
          bestC = c;
        }
      }
      if (bestC) out.push({ month: mn, country: bestC, qty: bestV });
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
        Error: {err}
      </div>
    );
  }

  if (!yearRows.length) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Sin datos para {year}. (Archivo: {filePath})
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {/* TOP PAÍSES (cards grandes) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: ".75rem",
        }}
      >
        {topCountries.map((r) => {
          const iso2 = COUNTRY_TO_ISO2[normalizeCountryName(r.country)] ?? "";
          const flag = iso2 ? iso2ToFlag(iso2) : "🏳️";
          const pct = total ? (r.qty / total) * 100 : 0;

          return (
            <div key={r.country} className="card" style={{ padding: ".9rem", borderRadius: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
                <div style={{ fontSize: "1.35rem" }}>{flag}</div>
                <div style={{ fontWeight: 900 }}>{r.country}</div>
              </div>

              <div style={{ marginTop: ".55rem", display: "flex", justifyContent: "space-between" }}>
                <div style={{ opacity: 0.8, fontSize: ".85rem" }}>Total</div>
                <div style={{ fontWeight: 900 }}>{r.qty.toLocaleString("es-AR")}</div>
              </div>

              <div style={{ marginTop: ".35rem", display: "flex", justifyContent: "space-between" }}>
                <div style={{ opacity: 0.8, fontSize: ".85rem" }}>Participación</div>
                <div style={{ fontWeight: 900 }}>{pct.toFixed(1)}%</div>
              </div>

              <div
                style={{
                  marginTop: ".6rem",
                  height: 10,
                  borderRadius: 999,
                  background: "rgba(255,255,255,.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, pct))}%`,
                    height: "100%",
                    background: "rgba(255,255,255,.55)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* CONTINENTES (cards chicas) */}
      <div
        className="card"
        style={{
          padding: "1rem",
          borderRadius: 18,
        }}
      >
        <div style={{ fontWeight: 950, marginBottom: ".65rem" }}>Distribución por continente</div>
        <div style={{ display: "grid", gap: ".4rem" }}>
          {Array.from(byContinent.entries())
            .map(([k, v]) => ({ k, v }))
            .sort((a, b) => b.v - a.v)
            .map(({ k, v }) => {
              const pct = total ? (v / total) * 100 : 0;
              return (
                <div
                  key={k}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: ".6rem",
                    alignItems: "center",
                  }}
                >
                  <div style={{ opacity: 0.9 }}>{k}</div>
                  <div style={{ fontWeight: 900 }}>
                    {v.toLocaleString("es-AR")} · {pct.toFixed(1)}%
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* RANKING MENSUAL */}
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 950, marginBottom: ".65rem" }}>Top país por mes</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: ".6rem",
          }}
        >
          {topByMonth.map((r) => {
            const iso2 = COUNTRY_TO_ISO2[normalizeCountryName(r.country)] ?? "";
            const flag = iso2 ? iso2ToFlag(iso2) : "🏳️";
            return (
              <div
                key={r.month}
                style={{
                  padding: ".75rem",
                  borderRadius: 16,
                  background: "rgba(255,255,255,.06)",
                }}
              >
                <div style={{ fontSize: ".8rem", opacity: 0.85 }}>Mes {r.month}</div>
                <div style={{ fontWeight: 900, marginTop: ".15rem" }}>
                  {flag} {r.country}
                </div>
                <div style={{ marginTop: ".2rem", opacity: 0.85 }}>{r.qty.toLocaleString("es-AR")}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
