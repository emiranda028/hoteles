"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "../lib/xlsxClient";

/**
 * CountryRanking
 * - Lee un XLSX desde /public (filePath)
 * - Filtra por año (year)
 * - Suma por país y por continente
 * - Muestra ranking + banderas + cards (país grande / continente chica)
 *
 * Nota técnica:
 * Evitamos:
 *  - spread sobre iterables ([...s], [...map.values()], etc.)
 *  - for..of sobre iterators (Map.values()) -> porque tu build rompe con target viejo.
 */

type Props = {
  year: number;
  filePath: string; // requerido (tu error venía por esto)
  limit?: number;
  hotelFilter?: string; // opcional (acá no lo usamos, Marriott-only)
};

type Row = {
  year: number;
  month?: number;
  country: string;
  continent: string;
  amount: number;
};

function normKey(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function toInt(v: any): number {
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  const n = parseFloat(
    s
      .replace(/\./g, "") // miles
      .replace(",", ".") // decimal
      .replace(/[^\d.-]/g, "")
  );
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function toNum(v: any): number {
  const s0 = String(v ?? "").trim();
  if (!s0) return 0;

  // Heurística: si la última coma está después del último punto, asumimos coma decimal (EU)
  const lastComma = s0.lastIndexOf(",");
  const lastDot = s0.lastIndexOf(".");
  let s = s0;

  if (lastComma > lastDot) {
    // 5.251.930,33 -> 5251930.33
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // 5,251,930.33 -> 5251930.33
    s = s.replace(/,/g, "");
  }

  const n = parseFloat(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function monthFromAny(v: any): number | undefined {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  // si viene "Enero", "Febrero", etc.
  const m = normKey(s);
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
  if (map[m]) return map[m];

  // si viene número
  const n = parseInt(s, 10);
  if (Number.isFinite(n) && n >= 1 && n <= 12) return n;
  return undefined;
}

function safeFlagEmojiFromISO2(iso2: string): string {
  const s = String(iso2 ?? "").trim().toUpperCase();
  if (s.length !== 2) return "";
  const A = 0x1f1e6;
  const c0 = s.charCodeAt(0) - 65;
  const c1 = s.charCodeAt(1) - 65;
  if (c0 < 0 || c0 > 25 || c1 < 0 || c1 > 25) return "";
  // evitamos spread
  return String.fromCodePoint(A + c0, A + c1);
}

function normalizeCountryName(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeContinentName(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

const ISO2_BY_COUNTRY: Record<string, string> = {
  // Español
  "ARGENTINA": "AR",
  "BRASIL": "BR",
  "CHILE": "CL",
  "URUGUAY": "UY",
  "PARAGUAY": "PY",
  "BOLIVIA": "BO",
  "PERÚ": "PE",
  "PERU": "PE",
  "ECUADOR": "EC",
  "COLOMBIA": "CO",
  "VENEZUELA": "VE",
  "MÉXICO": "MX",
  "MEXICO": "MX",
  "ESPAÑA": "ES",
  "SPAIN": "ES",
  "FRANCIA": "FR",
  "ITALIA": "IT",
  "ALEMANIA": "DE",
  "REINO UNIDO": "GB",
  "INGLATERRA": "GB",
  "ESTADOS UNIDOS": "US",
  "USA": "US",
  "EEUU": "US",

  // Inglés
  "UNITED STATES": "US",
  "UNITED KINGDOM": "GB",
  "GERMANY": "DE",
  "FRANCE": "FR",
  "ITALY": "IT",
  "PORTUGAL": "PT",
  "CHINA": "CN",
  "JAPAN": "JP",
  "CANADA": "CA",
  "AUSTRALIA": "AU",
  "NEW ZEALAND": "NZ",
};

function guessISO2(country: string): string {
  const key = String(country ?? "").trim().toUpperCase();
  if (!key) return "";
  return ISO2_BY_COUNTRY[key] ?? "";
}

export default function CountryRanking({ year, filePath, limit = 12 }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<{ sheetName: string; sheetNames: string[]; keys: string[] }>({
    sheetName: "",
    sheetNames: [],
    keys: [],
  });
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");

    (async () => {
      try {
        const res = await readXlsxFromPublic(filePath);
        const raw = res.rows ?? [];
        const keys = Object.keys(raw[0] ?? {});
        if (!alive) return;

        // Detección de columnas según tu XLSX real:
        // Headers vistos: ["Año","Mes","PAÍS ","Importe","Continente"]
        const keyMap = keys.reduce((acc: Record<string, string>, k) => {
          acc[normKey(k)] = k;
          return acc;
        }, {});

        const kYear = keyMap["año"] || keyMap["ano"] || keyMap["year"];
        const kMonth = keyMap["mes"] || keyMap["month"];
        const kCountry = keyMap["país"] || keyMap["pais"] || keyMap["país "] || keyMap["pais "] || keyMap["country"];
        const kAmount = keyMap["importe"] || keyMap["amount"] || keyMap["cantidad"] || keyMap["qty"];
        const kCont = keyMap["continente"] || keyMap["continent"];

        const parsed: Row[] = [];
        for (let i = 0; i < raw.length; i++) {
          const r: any = raw[i];

          const y = toInt(kYear ? r[kYear] : undefined);
          if (!Number.isFinite(y)) continue;

          const m = monthFromAny(kMonth ? r[kMonth] : undefined);
          const country = normalizeCountryName(kCountry ? r[kCountry] : "");
          const cont = normalizeContinentName(kCont ? r[kCont] : "");
          const amount = toNum(kAmount ? r[kAmount] : 0);

          parsed.push({
            year: y,
            month: m,
            country: country || "Sin país",
            continent: cont || "Sin continente",
            amount: amount || 0,
          });
        }

        setRows(parsed);
        setInfo({ sheetName: res.sheetName, sheetNames: res.sheetNames, keys });
      } catch (e: any) {
        setError(String(e?.message ?? e));
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [filePath]);

  const yearsAvailable = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < rows.length; i++) set.add(rows[i].year);
    const arr = Array.from(set);
    arr.sort((a, b) => b - a);
    return arr;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => r.year === year);
  }, [rows, year]);

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < filtered.length; i++) {
      const k = filtered[i].country || "Sin país";
      const prev = m.get(k) ?? 0;
      m.set(k, prev + (filtered[i].amount || 0));
    }
    return m;
  }, [filtered]);

  const byContinent = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < filtered.length; i++) {
      const k = filtered[i].continent || "Sin continente";
      const prev = m.get(k) ?? 0;
      m.set(k, prev + (filtered[i].amount || 0));
    }
    return m;
  }, [filtered]);

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
    const arr = Array.from(byCountry.entries()).map(([country, amount]) => ({ country, amount }));
    arr.sort((a, b) => b.amount - a.amount);
    return arr.slice(0, limit);
  }, [byCountry, limit]);

  const contList = useMemo(() => {
    const arr = Array.from(byContinent.entries()).map(([continent, amount]) => ({ continent, amount }));
    arr.sort((a, b) => b.amount - a.amount);
    return arr;
  }, [byContinent]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        Cargando nacionalidades…
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        <div style={{ fontWeight: 800 }}>Error</div>
        <div style={{ marginTop: ".35rem", opacity: 0.85 }}>{error}</div>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        <div style={{ fontWeight: 900 }}>Sin datos</div>
        <div style={{ marginTop: ".35rem", opacity: 0.85 }}>
          No hay filas para <b>{year}</b>. (Archivo: <code>{filePath}</code>)
        </div>
        <div style={{ marginTop: ".6rem", fontSize: ".9rem", opacity: 0.8 }}>
          Años disponibles: {yearsAvailable.length ? yearsAvailable.join(", ") : "—"}
        </div>
        <div style={{ marginTop: ".6rem", fontSize: ".85rem", opacity: 0.7 }}>
          Hoja: <b>{info.sheetName || "—"}</b> · Keys ejemplo: {info.keys.slice(0, 10).join(", ")}
        </div>
      </div>
    );
  }

  // Layout responsive:
  // - En desktop: País (grande) + Continente (chico)
  // - En mobile: apila
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: "1rem" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)",
          gap: "1rem",
        }}
        className="countryGrid"
      >
        {/* País (grande) */}
        <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem" }}>
            <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Ranking por país</div>
            <div style={{ fontSize: ".9rem", opacity: 0.8 }}>
              Total {total.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
            </div>
          </div>

          <div style={{ marginTop: ".85rem", display: "grid", gap: ".55rem" }}>
            {topCountries.map((it, idx) => {
              const iso2 = guessISO2(it.country);
              const flag = iso2 ? safeFlagEmojiFromISO2(iso2) : "";
              const pct = total > 0 ? (it.amount / total) * 100 : 0;

              return (
                <div
                  key={it.country + idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "42px minmax(0,1fr) 120px",
                    gap: ".75rem",
                    alignItems: "center",
                    padding: ".65rem .75rem",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,.08)",
                    background: "rgba(255,255,255,.03)",
                  }}
                >
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(255,255,255,.06)",
                      fontWeight: 950,
                      fontSize: "1.05rem",
                    }}
                    title={iso2 ? iso2 : undefined}
                  >
                    {flag || String(idx + 1)}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {idx + 1}. {it.country}
                    </div>
                    <div style={{ marginTop: ".35rem", height: 8, borderRadius: 999, background: "rgba(255,255,255,.07)" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.max(2, Math.min(100, pct))}%`,
                          borderRadius: 999,
                          background: "linear-gradient(90deg, rgba(124,92,255,.95), rgba(24,214,255,.85))",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 950 }}>
                      {it.amount.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                    </div>
                    <div style={{ fontSize: ".85rem", opacity: 0.8 }}>{pct.toFixed(1)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Continente (chico) */}
        <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
          <div style={{ fontWeight: 950, fontSize: "1.0rem" }}>Distribución por continente</div>
          <div style={{ marginTop: ".85rem", display: "grid", gap: ".55rem" }}>
            {contList.map((it, idx) => {
              const pct = total > 0 ? (it.amount / total) * 100 : 0;
              return (
                <div
                  key={it.continent + idx}
                  style={{
                    padding: ".65rem .75rem",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,.08)",
                    background: "rgba(255,255,255,.03)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem" }}>
                    <div style={{ fontWeight: 900, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {it.continent}
                    </div>
                    <div style={{ fontWeight: 950 }}>{pct.toFixed(1)}%</div>
                  </div>
                  <div style={{ marginTop: ".4rem", height: 8, borderRadius: 999, background: "rgba(255,255,255,.07)" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.max(2, Math.min(100, pct))}%`,
                        borderRadius: 999,
                        background: "linear-gradient(90deg, rgba(24,214,255,.85), rgba(124,92,255,.95))",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CSS responsive mínima (sin tocar tu global.css) */}
      <style jsx>{`
        @media (max-width: 920px) {
          .countryGrid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}
