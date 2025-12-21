"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

/**
 * CountryRanking
 * - Lee un XLSX desde /public (ej: /data/jcr_nacionalidades.xlsx)
 * - Filtra por año (props.year)
 * - (Opcional) filtra por hotel (props.hotelFilter). En tu caso, nacionalidades es solo Marriott, podés pasar "".
 * - Devuelve ranking por país y una distribución por continente.
 *
 * Nota importante para Vercel/TS target:
 * - Evitamos: for..of en Map.values() y spread de iterators [...map.values()]
 * - Usamos Array.from(map.values()) para no depender de downlevelIteration / target ES2015.
 */

type Props = {
  year: number;
  filePath: string;
  hotelFilter?: string; // opcional; para nacionalidades puede ser "".
  limit?: number; // top N países
};

type Row = {
  hotel: string;
  year: number;
  country: string;
  continent: string;
  qty: number;
};

function norm(s: any) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function asNumber(v: any) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseExcelDate(v: any): Date | null {
  // XLSX puede traer Date real, número serial, o string.
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  if (typeof v === "number") {
    // Excel serial -> JS Date (aprox)
    // Excel epoch: 1899-12-30
    const d = new Date(Date.UTC(1899, 11, 30));
    d.setUTCDate(d.getUTCDate() + v);
    if (!isNaN(d.getTime())) return d;
  }

  const s = String(v).trim();
  if (!s) return null;

  // Intento Date() directo
  const d1 = new Date(s);
  if (!isNaN(d1.getTime())) return d1;

  // Intento dd/mm/yyyy o dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    const d2 = new Date(yy, mm - 1, dd);
    if (!isNaN(d2.getTime())) return d2;
  }

  return null;
}

/**
 * Convertir "AR" -> 🇦🇷 sin usar spread de string [...s] (downlevelIteration)
 */
function iso2ToFlag(iso2: string) {
  const s = norm(iso2);
  if (s.length !== 2) return "";
  const A = 0x1f1e6;
  const c0 = s.charCodeAt(0) - 65;
  const c1 = s.charCodeAt(1) - 65;
  if (c0 < 0 || c0 > 25 || c1 < 0 || c1 > 25) return "";
  return String.fromCodePoint(A + c0, A + c1);
}

/**
 * Mapa mínimo de país->ISO2 (si en el excel viene "ESTADOS UNIDOS", etc.)
 * Importante: claves con espacios deben ir entre comillas.
 */
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
  "UNITED STATES": "US",
  "ESTADOS UNIDOS": "US",
  USA: "US",
  "UNITED KINGDOM": "GB",
  REINO_UNIDO: "GB",
  "REINO UNIDO": "GB",
  SPAIN: "ES",
  ESPAÑA: "ES",
  FRANCE: "FR",
  FRANCIA: "FR",
  ITALY: "IT",
  ITALIA: "IT",
  GERMANY: "DE",
  ALEMANIA: "DE",
  CANADA: "CA",
  CANADÁ: "CA",
  AUSTRALIA: "AU",
  "NEW ZEALAND": "NZ",
};

function resolveISO2(countryNameOrIso: string) {
  const c = norm(countryNameOrIso);
  if (c.length === 2) return c;
  return COUNTRY_TO_ISO2[c] ?? "";
}

export default function CountryRanking({
  year,
  filePath,
  hotelFilter = "",
  limit = 12,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [debug, setDebug] = useState<{
    sheetName: string;
    sheetNames: string[];
    keysExample: string[];
    detected: { hotel?: string; country?: string; continent?: string; qty?: string; date?: string };
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const { rows: raw, sheetName, sheetNames } = await readXlsxFromPublic(filePath);

        const keys = Object.keys(raw?.[0] ?? {});
        const keySet = keys.map((k) => String(k).trim());

        // Detectar columnas por nombre (flexible)
        const findKey = (candidates: string[]) => {
          const lower = keys.map((k) => String(k).trim().toLowerCase());
          for (const cand of candidates) {
            const i = lower.indexOf(cand.toLowerCase());
            if (i >= 0) return keys[i];
          }
          return "";
        };

        const kHotel = findKey(["empresa", "hotel", "property"]);
        const kCountry = findKey(["pais", "país", "country", "nacionalidad", "nationality"]);
        const kContinent = findKey(["continente", "continent", "region"]);
        const kQty = findKey(["cantidad", "qty", "count", "pax", "huespedes", "huéspedes"]);
        const kFecha = findKey(["fecha", "date", "dia", "día"]);

        const parsed: Row[] = (raw ?? []).map((r: any) => {
          const dt = parseExcelDate(kFecha ? r[kFecha] : null);
          const y = dt ? dt.getFullYear() : Number(r["Año"] ?? r["Year"] ?? 0);

          return {
            hotel: norm(kHotel ? r[kHotel] : ""),
            year: Number.isFinite(y) ? y : 0,
            country: norm(kCountry ? r[kCountry] : ""),
            continent: norm(kContinent ? r[kContinent] : ""),
            qty: asNumber(kQty ? r[kQty] : 0),
          };
        });

        if (!mounted) return;

        setRows(parsed);
        setDebug({
          sheetName,
          sheetNames,
          keysExample: keySet.slice(0, 14),
          detected: {
            hotel: kHotel || "—",
            country: kCountry || "—",
            continent: kContinent || "—",
            qty: kQty || "—",
            date: kFecha || "—",
          },
        });
      } catch (e) {
        if (!mounted) return;
        setRows([]);
        setDebug(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [filePath]);

  const filtered = useMemo(() => {
    const y = Number(year);
    const hf = norm(hotelFilter);

    return rows.filter((r) => {
      if (r.year !== y) return false;
      if (hf) {
        // hotelFilter puede venir como "MARRIOTT" o "JCR" o vacío.
        // Nacionalidades: suele ser Marriott. Si no querés filtrar, pasá "".
        if (!r.hotel) return false;
        if (!r.hotel.includes(hf)) return false;
      }
      return true;
    });
  }, [rows, year, hotelFilter]);

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < filtered.length; i++) {
      const r = filtered[i];
      const key = r.country || "SIN PAÍS";
      const prev = m.get(key) ?? 0;
      m.set(key, prev + (r.qty || 0));
    }
    return m;
  }, [filtered]);

  const byContinent = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < filtered.length; i++) {
      const r = filtered[i];
      const key = r.continent || "OTROS";
      const prev = m.get(key) ?? 0;
      m.set(key, prev + (r.qty || 0));
    }
    return m;
  }, [filtered]);

  const total = useMemo(() => {
    const vals = Array.from(byCountry.values());
    let t = 0;
    for (let i = 0; i < vals.length; i++) t += vals[i];

    if (t === 0) {
      const vals2 = Array.from(byContinent.values());
      for (let i = 0; i < vals2.length; i++) t += vals2[i];
    }
    return t;
  }, [byCountry, byContinent]);

  const countryList = useMemo(() => {
    const arr = Array.from(byCountry.entries()).map(([country, qty]) => ({
      country,
      qty,
      iso2: resolveISO2(country),
    }));
    arr.sort((a, b) => b.qty - a.qty);
    return arr.slice(0, limit);
  }, [byCountry, limit]);

  const continentList = useMemo(() => {
    const arr = Array.from(byContinent.entries()).map(([continent, qty]) => ({ continent, qty }));
    arr.sort((a, b) => b.qty - a.qty);
    return arr;
  }, [byContinent]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        Cargando nacionalidades…
      </div>
    );
  }

  if (!filtered.length) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        <div style={{ fontWeight: 800 }}>Sin datos</div>
        <div style={{ marginTop: ".35rem", opacity: 0.75 }}>
          No hay filas para {year}. (Archivo: {filePath})
        </div>
        {debug ? (
          <div style={{ marginTop: ".75rem", fontSize: 12, opacity: 0.75, lineHeight: 1.4 }}>
            <div>
              <b>Hoja elegida:</b> {debug.sheetName}
            </div>
            <div>
              <b>Detectado:</b> hotel={debug.detected.hotel} · country={debug.detected.country} ·
              continent={debug.detected.continent} · qty={debug.detected.qty} · fecha={debug.detected.date}
            </div>
            <div style={{ marginTop: ".25rem" }}>
              <b>Keys ejemplo:</b> {debug.keysExample.join(", ")}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {/* Layout responsive: en desktop 2 columnas, en mobile 1 columna */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: "1rem",
        }}
      >
        {/* Países (grande) */}
        <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem" }}>
            <div style={{ fontWeight: 950, fontSize: "1.1rem" }}>Ranking por país</div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>
              Total: <b>{total.toLocaleString("es-AR")}</b>
            </div>
          </div>

          <div style={{ marginTop: ".75rem", display: "grid", gap: ".5rem" }}>
            {countryList.map((c, idx) => {
              const pct = total > 0 ? (c.qty / total) * 100 : 0;
              const flag = c.iso2 ? iso2ToFlag(c.iso2) : "";
              return (
                <div
                  key={c.country + idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px minmax(0,1fr) 110px",
                    alignItems: "center",
                    gap: ".75rem",
                    padding: ".6rem .75rem",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.04)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 900,
                      opacity: 0.9,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 12,
                      height: 36,
                      background: "rgba(255,255,255,0.06)",
                    }}
                    title={`#${idx + 1}`}
                  >
                    {flag ? <span style={{ fontSize: 18 }}>{flag}</span> : <span>#{idx + 1}</span>}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.country}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                      {c.qty.toLocaleString("es-AR")} · {pct.toFixed(1)}%
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        height: 8,
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.08)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          height: "100%",
                          borderRadius: 999,
                          background: "linear-gradient(90deg, rgba(99,102,241,0.9), rgba(236,72,153,0.9))",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ textAlign: "right", fontWeight: 950 }}>
                    {pct.toFixed(1)}%
                    <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 700 }}>participación</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Continentes (chico) */}
        <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
          <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Distribución por continente</div>

          <div style={{ marginTop: ".75rem", display: "grid", gap: ".5rem" }}>
            {continentList.map((c) => {
              const pct = total > 0 ? (c.qty / total) * 100 : 0;
              return (
                <div
                  key={c.continent}
                  style={{
                    padding: ".65rem .75rem",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem" }}>
                    <div style={{ fontWeight: 900 }}>{c.continent}</div>
                    <div style={{ fontWeight: 950 }}>{pct.toFixed(1)}%</div>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                    {c.qty.toLocaleString("es-AR")} personas
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      height: 8,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.08)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, pct)}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: "linear-gradient(90deg, rgba(34,197,94,0.85), rgba(59,130,246,0.85))",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {debug ? (
            <div style={{ marginTop: "1rem", fontSize: 12, opacity: 0.65, lineHeight: 1.35 }}>
              <div>
                <b>Hoja:</b> {debug.sheetName}
              </div>
              <div>
                <b>Detectado:</b> hotel={debug.detected.hotel} · country={debug.detected.country} ·
                continent={debug.detected.continent} · qty={debug.detected.qty} · fecha={debug.detected.date}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Responsive tweak: si tu CSS tiene container grande, esto ya queda ok.
          Si querés 2 columnas en desktop:
          podés cambiar arriba gridTemplateColumns a "minmax(0,1.8fr) minmax(0,1fr)" con media query en CSS.
      */}
    </div>
  );
}
