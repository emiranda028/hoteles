"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  /** Año “actual” (filtro global) */
  year: number;
  /** Año base para comparación (opcional) */
  baseYear?: number;
  /** Ruta en /public (obligatoria para evitar “sin datos”) */
  filePath: string;

  /** Si querés filtrar por hotel puntualmente */
  hotel?: string;
  /** Si querés restringir hoteles válidos (ej JCR) */
  allowedHotels?: string[];

  /** Cantidad de países a mostrar en ranking */
  limit?: number;
};

type Row = Record<string, any>;

type Detected = {
  kHotel?: string;
  kCountry?: string;
  kContinent?: string;
  kQty?: string;
  kDate?: string;
  kYear?: string;
};

function normKey(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toNum(v: any) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const s = String(v ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function toYearFromDateLike(v: any): number | null {
  if (!v) return null;

  // Si ya es Date
  if (v instanceof Date && !isNaN(v.getTime())) return v.getFullYear();

  const s = String(v).trim();
  if (!s) return null;

  // “2025”
  if (/^\d{4}$/.test(s)) return Number(s);

  // “dd/mm/yyyy” o “dd-mm-yy”
  // Buscamos 4 dígitos de año
  const m4 = s.match(/(19|20)\d{2}/);
  if (m4) return Number(m4[0]);

  // Si es serial excel (número)
  const asNum = Number(s);
  if (isFinite(asNum) && asNum > 20000 && asNum < 60000) {
    // Excel serial date (aprox)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + asNum * 86400000);
    return d.getUTCFullYear();
  }

  return null;
}

function detectColumns(rows: Row[]): Detected {
  const det: Detected = {};
  if (!rows || rows.length === 0) return det;

  const keys = Object.keys(rows[0] ?? {});
  const nk = keys.map((k) => ({ raw: k, n: normKey(k) }));

  const pick = (cands: string[]) => {
    for (const cand of cands) {
      const hit = nk.find((x) => x.n === cand);
      if (hit) return hit.raw;
    }
    // contains fallback
    for (const cand of cands) {
      const hit = nk.find((x) => x.n.includes(cand));
      if (hit) return hit.raw;
    }
    return undefined;
  };

  det.kHotel = pick(["empresa", "hotel", "property", "propiedad"]);
  det.kCountry = pick(["pais", "país", "country", "nacionalidad", "nationality"]);
  det.kContinent = pick(["continente", "continent", "region"]);
  det.kQty = pick(["cantidad", "qty", "pax", "huespedes", "huéspedes", "guests", "cantidadpax"]);
  det.kDate = pick(["fecha", "date", "dia", "día"]);
  det.kYear = pick(["ano", "año", "year"]);

  return det;
}

function normalizeHotelName(h: string) {
  const n = normKey(h);
  if (!n) return "";
  if (n.includes("marriott")) return "MARRIOTT";
  if (n.includes("bariloche") || n.includes("bcr")) return "SHERATON BCR";
  if (n.includes("mdq") || n.includes("mar del plata")) return "SHERATON MDQ";
  if (n.includes("maitei")) return "MAITEI";
  return String(h).trim().toUpperCase();
}

function normalizeCountryName(c: string) {
  // Dejamos el texto lindo (Title Case simple)
  const s = String(c ?? "").trim();
  if (!s) return "";
  return s
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function safeUpperAscii(s: string) {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Bandera sin iteradores: usamos charCodeAt en posiciones 0 y 1
 * (evitamos `[...s]`).
 */
function iso2ToFlag(iso2: string) {
  const s = safeUpperAscii(iso2);
  if (!s || s.length < 2) return "";
  const a = 0x1f1e6;
  const c0 = s.charCodeAt(0);
  const c1 = s.charCodeAt(1);
  if (c0 < 65 || c0 > 90 || c1 < 65 || c1 > 90) return "";
  return String.fromCodePoint(a + (c0 - 65), a + (c1 - 65));
}

const COUNTRY_TO_ISO2: Record<string, string> = {
  // ES
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
  ECUADOR: "EC",
  VENEZUELA: "VE",
  MEXICO: "MX",
  MÉXICO: "MX",
  PANAMA: "PA",
  PANAMÁ: "PA",
  CUBA: "CU",
  DOMINICANA: "DO",
  "REPUBLICA DOMINICANA": "DO",
  "REPÚBLICA DOMINICANA": "DO",

  // EN / others
  USA: "US",
  "UNITED STATES": "US",
  "UNITED STATES OF AMERICA": "US",
  "ESTADOS UNIDOS": "US",
  SPAIN: "ES",
  ESPANA: "ES",
  ESPAÑA: "ES",
  ITALY: "IT",
  ITALIA: "IT",
  FRANCE: "FR",
  FRANCIA: "FR",
  GERMANY: "DE",
  ALEMANIA: "DE",
  UK: "GB",
  "UNITED KINGDOM": "GB",
  INGLATERRA: "GB",
  ENGLAND: "GB",
  "GREAT BRITAIN": "GB",
  CANADA: "CA",
  CANADÁ: "CA",
  AUSTRALIA: "AU",
  CHINA: "CN",
  JAPON: "JP",
  JAPÓN: "JP",
  "KOREA": "KR",
  "COREA": "KR",
};

function countryToFlag(country: string) {
  const key = safeUpperAscii(country);
  const iso2 = COUNTRY_TO_ISO2[key];
  return iso2 ? iso2ToFlag(iso2) : "";
}

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("es-AR");
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return (part / total) * 100;
}

function fmtPct(n: number) {
  return `${n.toFixed(1).replace(".", ",")}%`;
}

function normalizeContinent(c: string) {
  const n = normKey(c);
  if (!n) return "";
  if (n.includes("america") && n.includes("sur")) return "América del Sur";
  if (n.includes("america") && (n.includes("norte") || n.includes("north"))) return "América del Norte";
  if (n.includes("america") && n.includes("central")) return "América Central";
  if (n.includes("europ")) return "Europa";
  if (n.includes("asia")) return "Asia";
  if (n.includes("afric")) return "África";
  if (n.includes("oceani")) return "Oceanía";
  return String(c).trim();
}

export default function CountryRanking({
  year,
  baseYear,
  filePath,
  hotel,
  allowedHotels,
  limit = 12,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [det, setDet] = useState<Detected>({});
  const [sheetInfo, setSheetInfo] = useState<{ sheetName: string; sheetNames: string[] }>({
    sheetName: "",
    sheetNames: [],
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const r = await readXlsxFromPublic(filePath);
        if (!alive) return;

        const d = detectColumns(r.rows);
        setDet(d);
        setSheetInfo({ sheetName: r.sheetName, sheetNames: r.sheetNames });
        setRows(r.rows ?? []);
      } catch (e) {
        console.error(e);
        if (!alive) return;
        setRows([]);
        setDet({});
        setSheetInfo({ sheetName: "", sheetNames: [] });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [filePath]);

  const normalizedHotelFilter = useMemo(() => {
    if (!hotel) return "";
    if (hotel === "JCR") return "JCR";
    return normalizeHotelName(hotel);
  }, [hotel]);

  const allowedSet = useMemo(() => {
    if (!allowedHotels || allowedHotels.length === 0) return null;
    const s = new Set<string>();
    for (let i = 0; i < allowedHotels.length; i++) s.add(normalizeHotelName(allowedHotels[i]));
    return s;
  }, [allowedHotels]);

  const filtered = useMemo(() => {
    if (!rows || rows.length === 0) return [];

    const kHotel = det.kHotel;
    const kCountry = det.kCountry;
    const kContinent = det.kContinent;
    const kQty = det.kQty;
    const kDate = det.kDate;
    const kYear = det.kYear;

    const out: Array<{
      hotel: string;
      year: number;
      country: string;
      continent: string;
      qty: number;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rawHotel = kHotel ? String(r[kHotel] ?? "") : "";
      const hNorm = normalizeHotelName(rawHotel);

      // allowedHotels
      if (allowedSet && !allowedSet.has(hNorm)) continue;

      // filtro hotel específico (si viene)
      if (normalizedHotelFilter && normalizedHotelFilter !== "JCR") {
        if (hNorm !== normalizedHotelFilter) continue;
      } else if (normalizedHotelFilter === "JCR") {
        // JCR = suma de 3 hoteles (Marriott + Sheraton BCR + Sheraton MDQ)
        if (hNorm !== "MARRIOTT" && hNorm !== "SHERATON BCR" && hNorm !== "SHERATON MDQ") continue;
      }

      // Año
      let y: number | null = null;
      if (kYear) y = toYearFromDateLike(r[kYear]);
      if (!y && kDate) y = toYearFromDateLike(r[kDate]);
      if (!y) continue;

      // Country / Continent
      const rawCountry = kCountry ? String(r[kCountry] ?? "").trim() : "";
      const rawCont = kContinent ? String(r[kContinent] ?? "").trim() : "";

      const country = normalizeCountryName(rawCountry);
      const continent = normalizeContinent(rawCont);

      // Cantidad
      const qty = kQty ? toNum(r[kQty]) : 0;

      // Si qty 0 y no hay país/continente, descartamos fila “basura”
      if (!qty || qty <= 0) continue;
      if (!country && !continent) continue;

      out.push({
        hotel: hNorm,
        year: y,
        country,
        continent,
        qty,
      });
    }

    return out;
  }, [rows, det, allowedSet, normalizedHotelFilter]);

  const yearsAvailable = useMemo(() => {
    const m: Record<number, true> = {};
    for (let i = 0; i < filtered.length; i++) m[filtered[i].year] = true;
    const arr = Object.keys(m)
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    return arr;
  }, [filtered]);

  const curYearRows = useMemo(() => filtered.filter((r) => r.year === year), [filtered, year]);
  const baseRows = useMemo(
    () => (baseYear ? filtered.filter((r) => r.year === baseYear) : []),
    [filtered, baseYear]
  );

  const byCountry = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 0; i < curYearRows.length; i++) {
      const c = curYearRows[i].country || "Sin país";
      map[c] = (map[c] ?? 0) + curYearRows[i].qty;
    }
    return map;
  }, [curYearRows]);

  const byContinent = useMemo(() => {
    const map: Record<string, number> = {};
    for (let i = 0; i < curYearRows.length; i++) {
      const c = curYearRows[i].continent || "Sin continente";
      map[c] = (map[c] ?? 0) + curYearRows[i].qty;
    }
    return map;
  }, [curYearRows]);

  const total = useMemo(() => {
    let t = 0;
    const vals = Object.values(byCountry);
    for (let i = 0; i < vals.length; i++) t += vals[i];

    // fallback si no hay país pero sí continente
    if (!t) {
      const v2 = Object.values(byContinent);
      for (let i = 0; i < v2.length; i++) t += v2[i];
    }
    return t;
  }, [byCountry, byContinent]);

  const topCountries = useMemo(() => {
    const entries = Object.entries(byCountry)
      .filter(([k]) => k && k !== "Sin país")
      .sort((a, b) => b[1] - a[1]);
    return entries.slice(0, limit);
  }, [byCountry, limit]);

  const contList = useMemo(() => {
    const entries = Object.entries(byContinent)
      .filter(([k]) => k && k !== "Sin continente")
      .sort((a, b) => b[1] - a[1]);
    return entries;
  }, [byContinent]);

  const debug = useMemo(() => {
    const keys = rows && rows[0] ? Object.keys(rows[0]) : [];
    return {
      sheet: sheetInfo.sheetName || "—",
      years: yearsAvailable.length ? yearsAvailable.join(", ") : "—",
      detected: {
        hotel: det.kHotel ?? "—",
        country: det.kCountry ?? "—",
        continent: det.kContinent ?? "—",
        qty: det.kQty ?? "—",
        fecha: det.kDate ?? det.kYear ?? "—",
      },
      keysPreview: keys.slice(0, 12).join(", "),
      curCount: curYearRows.length,
      total,
    };
  }, [rows, sheetInfo, det, yearsAvailable, curYearRows.length, total]);

  if (loading) {
    return <div style={{ padding: "0.75rem 0.25rem" }}>Cargando nacionalidades…</div>;
  }

  if (!filtered.length) {
    return (
      <div style={{ padding: "0.5rem 0.25rem" }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Nacionalidades — Sin datos</div>
        <div style={{ opacity: 0.85 }}>
          Esto suele pasar si el Excel no está en <code>public</code> o si los headers cambiaron.
        </div>
        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
          <div>
            <b>Sheet:</b> {debug.sheet}
          </div>
          <div>
            <b>Años disponibles:</b> {debug.years}
          </div>
          <div>
            <b>Detectado:</b> hotel={debug.detected.hotel} · país={debug.detected.country} · continente=
            {debug.detected.continent} · qty={debug.detected.qty} · fecha/año={debug.detected.fecha}
          </div>
          <div>
            <b>Keys ejemplo:</b> {debug.keysPreview || "—"}
          </div>
        </div>
      </div>
    );
  }

  const titleScope =
    normalizedHotelFilter === "JCR"
      ? "Grupo JCR"
      : normalizedHotelFilter
      ? normalizedHotelFilter
      : "Todos";

  const baseText =
    baseYear && baseYear !== year ? `· vs ${baseYear}` : "";

  return (
    <div style={{ width: "100%" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 950, fontSize: 16 }}>
          Nacionalidades ({titleScope}) — {year} {baseText}
        </div>
        <div style={{ opacity: 0.75, fontSize: 13 }}>
          Total huéspedes: <b>{fmtInt(total)}</b>
        </div>
      </div>

      {/* Layout responsive: Países grande / Continentes chico */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.8fr) minmax(0, 1fr)",
          gap: "1rem",
          marginTop: "0.9rem",
        }}
      >
        {/* Ranking Países (GRANDE) */}
        <div
          className="card"
          style={{
            padding: "1rem",
            borderRadius: 18,
            minWidth: 0,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Ranking por país</div>

          <div style={{ display: "grid", gap: 10 }}>
            {topCountries.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No hay países en {year}.</div>
            ) : (
              topCountries.map(([country, qty], idx) => {
                const flag = countryToFlag(country);
                const share = pct(qty, total);
                return (
                  <div
                    key={`${country}-${idx}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px 1fr auto",
                      gap: "0.75rem",
                      alignItems: "center",
                      padding: "0.65rem 0.75rem",
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,.08)",
                      background: "rgba(255,255,255,.03)",
                      minWidth: 0,
                    }}
                  >
                    <div style={{ fontSize: 18, textAlign: "center" }}>{flag || "🏳️"}</div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 850, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {idx + 1}. {country}
                      </div>
                      <div style={{ marginTop: 6, height: 8, borderRadius: 999, background: "rgba(255,255,255,.10)" }}>
                        <div
                          style={{
                            width: `${Math.max(2, Math.min(100, share))}%`,
                            height: "100%",
                            borderRadius: 999,
                            background: "linear-gradient(90deg, rgba(99,102,241,.95), rgba(34,197,94,.95))",
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 900 }}>{fmtInt(qty)}</div>
                      <div style={{ opacity: 0.75, fontSize: 12 }}>{fmtPct(share)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Continentes (MÁS CHICO) */}
        <div
          className="card"
          style={{
            padding: "1rem",
            borderRadius: 18,
            minWidth: 0,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Distribución por continente</div>

          {contList.length === 0 ? (
            <div style={{ opacity: 0.75 }}>Sin continentes para {year}.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {contList.map(([cont, qty]) => {
                const share = pct(qty, total);
                return (
                  <div
                    key={cont}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: "0.75rem",
                      alignItems: "center",
                      padding: "0.65rem 0.75rem",
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,.08)",
                      background: "rgba(255,255,255,.03)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 850, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {cont}
                      </div>
                      <div style={{ marginTop: 6, height: 8, borderRadius: 999, background: "rgba(255,255,255,.10)" }}>
                        <div
                          style={{
                            width: `${Math.max(2, Math.min(100, share))}%`,
                            height: "100%",
                            borderRadius: 999,
                            background: "linear-gradient(90deg, rgba(59,130,246,.95), rgba(236,72,153,.95))",
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 900 }}>{fmtInt(qty)}</div>
                      <div style={{ opacity: 0.75, fontSize: 12 }}>{fmtPct(share)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Debug chiquito */}
      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
        <span style={{ fontWeight: 800 }}>Fuente:</span> {debug.sheet} ·{" "}
        <span style={{ fontWeight: 800 }}>Rows:</span> {debug.curCount} ·{" "}
        <span style={{ fontWeight: 800 }}>Detectado:</span> hotel={debug.detected.hotel} · país={debug.detected.country} · continente={debug.detected.continent} · qty={debug.detected.qty}
      </div>

      {/* Responsive: en mobile bajamos a una columna */}
      <style jsx>{`
        @media (max-width: 900px) {
          div[style*="grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr)"] {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}
