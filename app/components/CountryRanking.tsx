"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  filePath: string;
  limit?: number;
};

type Row = {
  year: number;
  country: string;
  continent: string;
  qty: number;
};

function normStr(v: any) {
  return String(v ?? "").trim();
}

function upperClean(v: any) {
  return normStr(v).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function parseNumLoose(v: any): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function yearFromAny(v: any): number {
  if (typeof v === "number" && v > 1900 && v < 2100) return Math.floor(v);
  const s = String(v ?? "").trim();
  if (!s) return 0;

  const m = s.match(/(19\d{2}|20\d{2})/);
  if (m) return Number(m[1]);

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getFullYear();

  return 0;
}

// convierte "US" => 🇺🇸 sin usar spread
function iso2Flag(iso2: string) {
  const s = upperClean(iso2);
  if (!s || s.length !== 2) return "";
  const A = 0x1f1e6;
  const chars = Array.from(s); // evita downlevelIteration
  const cp0 = A + (chars[0].charCodeAt(0) - 65);
  const cp1 = A + (chars[1].charCodeAt(0) - 65);
  if (!Number.isFinite(cp0) || !Number.isFinite(cp1)) return "";
  try {
    return String.fromCodePoint(cp0, cp1);
  } catch {
    return "";
  }
}

const COUNTRY_TO_ISO2: Record<string, string> = {
  "ARGENTINA": "AR",
  "BRASIL": "BR",
  "BRAZIL": "BR",
  "URUGUAY": "UY",
  "CHILE": "CL",
  "PARAGUAY": "PY",
  "BOLIVIA": "BO",
  "PERU": "PE",
  "COLOMBIA": "CO",
  "MEXICO": "MX",
  "MEXICO.": "MX",
  "MEXICO ": "MX",
  "MEXICO (MX)": "MX",
  "MEXICO DF": "MX",
  "MEXICO CITY": "MX",
  "MÉXICO": "MX",
  "UNITED STATES": "US",
  "ESTADOS UNIDOS": "US",
  "USA": "US",
  "UNITED KINGDOM": "GB",
  "REINO UNIDO": "GB",
  "ENGLAND": "GB",
  "SPAIN": "ES",
  "ESPAÑA": "ES",
  "FRANCE": "FR",
  "ITALY": "IT",
  "ALEMANIA": "DE",
  "GERMANY": "DE",
  "PORTUGAL": "PT",
  "CHINA": "CN",
  "JAPAN": "JP",
  "CANADA": "CA",
  "AUSTRALIA": "AU",
};

function guessIso2(countryName: string) {
  const key = upperClean(countryName);
  if (!key) return "";
  return COUNTRY_TO_ISO2[key] ?? "";
}

function pickKeyInsensitive(obj: any, candidates: string[]) {
  if (!obj) return "";
  const keys = Object.keys(obj);
  const lowerMap = new Map<string, string>();
  for (const k of keys) lowerMap.set(String(k).trim().toLowerCase(), k);

  for (const c of candidates) {
    const hit = lowerMap.get(c.toLowerCase());
    if (hit) return hit;
  }
  return "";
}

export default function CountryRanking({ year, filePath, limit = 12 }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{ sheet?: string; keys?: string[]; err?: string }>({});

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setMeta({});
        const rr = await readXlsxFromPublic(filePath);

        const raw = rr.rows ?? [];
        const keys = raw.length ? Object.keys(raw[0] ?? {}) : [];

        // Heurística de headers típica:
        // País: "País", "Pais", "Country", "Nacionalidad"
        // Continente: "Continente", "Continent"
        // Cantidad: "Cantidad", "Qty", "Total", "Count"
        // Año: "Año", "Anio", "Year"
        const kCountry = pickKeyInsensitive(raw[0], ["pais", "país", "country", "nacionalidad", "nacionalidades"]);
        const kCont = pickKeyInsensitive(raw[0], ["continente", "continent", "region"]);
        const kQty = pickKeyInsensitive(raw[0], ["cantidad", "qty", "total", "count", "cant"]);
        const kYear = pickKeyInsensitive(raw[0], ["año", "anio", "year", "fecha", "date"]);

        const parsed: Row[] = raw
          .map((r: any) => {
            const country = normStr(kCountry ? r[kCountry] : r["Pais"] ?? r["País"] ?? r["Country"]);
            const continent = normStr(kCont ? r[kCont] : r["Continente"] ?? r["Continent"]);
            const qty = parseNumLoose(kQty ? r[kQty] : r["Cantidad"] ?? r["Qty"] ?? r["Total"]);
            const y = yearFromAny(kYear ? r[kYear] : r["Año"] ?? r["Anio"] ?? r["Year"] ?? r["Fecha"]);

            return {
              year: y,
              country: country || "SIN PAÍS",
              continent: continent || "SIN CONTINENTE",
              qty,
            };
          })
          .filter((r) => r.qty > 0 && r.year > 0);

        if (!alive) return;
        setRows(parsed);
        setMeta({ sheet: rr.sheetName, keys });
      } catch (e: any) {
        if (!alive) return;
        setRows([]);
        setMeta({ err: String(e?.message ?? e) });
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [filePath]);

  const yearRows = useMemo(() => rows.filter((r) => r.year === year), [rows, year]);

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of yearRows) {
      const k = r.country.trim() || "SIN PAÍS";
      m.set(k, (m.get(k) ?? 0) + r.qty);
    }
    return m;
  }, [yearRows]);

  const byContinent = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of yearRows) {
      const k = r.continent.trim() || "SIN CONTINENTE";
      m.set(k, (m.get(k) ?? 0) + r.qty);
    }
    return m;
  }, [yearRows]);

  const total = useMemo(() => {
    let t = 0;
    // evita for..of sobre values()
    const vals1 = Array.from(byCountry.values());
    for (let i = 0; i < vals1.length; i++) t += vals1[i];
    if (t === 0) {
      const vals2 = Array.from(byContinent.values());
      for (let i = 0; i < vals2.length; i++) t += vals2[i];
    }
    return t;
  }, [byCountry, byContinent]);

  const topCountries = useMemo(() => {
    const list = Array.from(byCountry.entries())
      .map(([country, qty]) => ({ country, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit);

    return list;
  }, [byCountry, limit]);

  const contList = useMemo(() => {
    return Array.from(byContinent.entries())
      .map(([continent, qty]) => ({ continent, qty }))
      .sort((a, b) => b.qty - a.qty);
  }, [byContinent]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        <div className="cardTitle">Nacionalidades</div>
        <div className="cardNote" style={{ marginTop: ".35rem" }}>
          Cargando archivo: <code>{filePath}</code>
        </div>
      </div>
    );
  }

  if (meta.err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        <div className="cardTitle">Nacionalidades</div>
        <div className="delta down" style={{ marginTop: ".5rem" }}>
          {meta.err}
        </div>
      </div>
    );
  }

  if (!yearRows.length || total === 0) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        <div className="cardTitle">Nacionalidades</div>
        <div className="cardNote" style={{ marginTop: ".35rem" }}>
          Sin datos para {year}. (Archivo: <code>{filePath}</code>)
        </div>

        <div className="cardNote" style={{ marginTop: ".5rem" }}>
          Sheet: <code>{meta.sheet ?? "—"}</code>
        </div>

        <div className="cardNote" style={{ marginTop: ".25rem" }}>
          Keys ejemplo: <code>{(meta.keys ?? []).slice(0, 12).join(", ")}</code>
        </div>
      </div>
    );
  }

  // Responsive layout:
  // - En desktop: ranking grande + continente chico
  // - En mobile: stack
  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, .8fr)",
        }}
        className="gridResponsive2"
      >
        {/* Ranking (más grande) */}
        <div className="card" style={{ padding: "1rem", borderRadius: 22, overflow: "hidden" }}>
          <div className="cardTitle">Ranking por país — {year}</div>
          <div className="cardNote" style={{ marginTop: ".25rem" }}>
            Total: <b>{total.toLocaleString("es-AR")}</b>
          </div>

          <div style={{ marginTop: ".85rem", display: "grid", gap: ".6rem" }}>
            {topCountries.map((c, idx) => {
              const iso2 = guessIso2(c.country);
              const flag = iso2 ? iso2Flag(iso2) : "";
              const pct = total > 0 ? (c.qty / total) * 100 : 0;

              return (
                <div
                  key={c.country}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "32px minmax(0, 1fr) 90px",
                    gap: ".75rem",
                    alignItems: "center",
                    padding: ".65rem .75rem",
                    borderRadius: 16,
                    border: "1px solid rgba(0,0,0,.06)",
                    background: "rgba(0,0,0,.02)",
                  }}
                >
                  <div style={{ fontSize: "1.2rem", textAlign: "center" }}>{flag || "🏳️"}</div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {idx + 1}. {c.country}
                    </div>

                    <div style={{ marginTop: ".25rem" }}>
                      <div
                        style={{
                          height: 8,
                          borderRadius: 99,
                          background: "rgba(0,0,0,.08)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.max(2, Math.min(100, pct))}%`,
                            borderRadius: 99,
                            background: "linear-gradient(90deg, rgba(99,102,241,.9), rgba(236,72,153,.85))",
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ color: "var(--muted)", fontSize: ".9rem", marginTop: ".25rem" }}>
                      {pct.toFixed(1).replace(".", ",")}% del total
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 950 }}>{c.qty.toLocaleString("es-AR")}</div>
                    <div style={{ color: "var(--muted)", fontSize: ".85rem" }}>personas</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Continentes (más chico) */}
        <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
          <div className="cardTitle">Distribución por continente</div>

          <div style={{ marginTop: ".85rem", display: "grid", gap: ".6rem" }}>
            {contList.map((c) => {
              const pct = total > 0 ? (c.qty / total) * 100 : 0;
              return (
                <div key={c.continent} style={{ display: "grid", gap: ".25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem" }}>
                    <div style={{ fontWeight: 900, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.continent}
                    </div>
                    <div style={{ fontWeight: 900 }}>{pct.toFixed(1).replace(".", ",")}%</div>
                  </div>

                  <div style={{ height: 8, borderRadius: 99, background: "rgba(0,0,0,.08)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.max(2, Math.min(100, pct))}%`,
                        borderRadius: 99,
                        background: "linear-gradient(90deg, rgba(16,185,129,.9), rgba(59,130,246,.85))",
                      }}
                    />
                  </div>

                  <div style={{ color: "var(--muted)", fontSize: ".85rem" }}>
                    {c.qty.toLocaleString("es-AR")} personas
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CSS helper responsive (sin tocar tu CSS global) */}
      <style jsx>{`
        @media (max-width: 900px) {
          .gridResponsive2 {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
