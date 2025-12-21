"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./readXlsxFromPublic";

type Props = {
  year: number;
  filePath: string;
  baseYear?: number; // opcional (si querés comparar)
  limit?: number; // top N
  hotelFilter?: string; // opcional: "JCR"|"MARRIOTT"|"SHERATON BCR"|"SHERATON MDQ"
};

type Row = Record<string, any>;

function normStr(v: any) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function upperNoAccents(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function toNumber(v: any): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  // soporta "1.234" y "1,234" y "1.234,56"
  const cleaned = s
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function yearFromAnyDate(value: any): number | null {
  if (!value) return null;

  // Date real
  if (value instanceof Date && !isNaN(value.getTime())) return value.getFullYear();

  // Excel serial date (XLSX a veces lo deja como número)
  if (typeof value === "number" && value > 20000 && value < 60000) {
    // Excel epoch 1899-12-30
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.getFullYear();
  }

  // string
  const s = String(value).trim();
  if (!s) return null;

  // intenta parseo directo
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getFullYear();

  // dd/mm/yyyy o dd-mm-yyyy
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const yyyy = m[3].length === 2 ? Number("20" + m[3]) : Number(m[3]);
    if (yyyy > 1900 && yyyy < 2100) return yyyy;
  }

  // yyyy-mm-dd
  const m2 = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m2) {
    const yyyy = Number(m2[1]);
    if (yyyy > 1900 && yyyy < 2100) return yyyy;
  }

  return null;
}

function pickKeyByCandidates(sample: Row, candidates: string[]) {
  const keys = Object.keys(sample || {});
  const map = new Map<string, string>();
  keys.forEach((k) => map.set(upperNoAccents(k), k));

  for (const cand of candidates) {
    const found = map.get(upperNoAccents(cand));
    if (found) return found;
  }
  return "";
}

function countryToISO2(countryRaw: string): string {
  const c = upperNoAccents(countryRaw);

  // IMPORTANTÍSIMO: keys con espacios SIEMPRE entre comillas
  const MAP: Record<string, string> = {
    ARGENTINA: "AR",
    BRASIL: "BR",
    BRAZIL: "BR",
    CHILE: "CL",
    URUGUAY: "UY",
    PARAGUAY: "PY",
    PERU: "PE",
    PERÚ: "PE",
    BOLIVIA: "BO",
    ECUADOR: "EC",
    COLOMBIA: "CO",
    VENEZUELA: "VE",
    MEXICO: "MX",
    "MÉXICO": "MX",
    "UNITED STATES": "US",
    "ESTADOS UNIDOS": "US",
    USA: "US",
    ESPANA: "ES",
    "ESPAÑA": "ES",
    SPAIN: "ES",
    ITALIA: "IT",
    ITALY: "IT",
    FRANCIA: "FR",
    FRANCE: "FR",
    ALEMANIA: "DE",
    GERMANY: "DE",
    "REINO UNIDO": "GB",
    "UNITED KINGDOM": "GB",
    UK: "GB",
    "GRAN BRETAÑA": "GB",
  };

  return MAP[c] || "";
}

function iso2ToFlagEmoji(iso2: string) {
  const s = upperNoAccents(iso2).slice(0, 2);
  if (s.length !== 2) return "";
  const A = 0x1f1e6;
  const c0 = s.charCodeAt(0) - 65;
  const c1 = s.charCodeAt(1) - 65;
  if (c0 < 0 || c0 > 25 || c1 < 0 || c1 > 25) return "";
  return String.fromCodePoint(A + c0, A + c1);
}

export default function CountryRanking({
  year,
  filePath,
  baseYear = 2024,
  limit = 12,
  hotelFilter,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");

    (async () => {
      try {
        const r = await readXlsxFromPublic(filePath);
        if (!alive) return;
        setRows(r.rows || []);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Error cargando archivo");
        setRows([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [filePath]);

  const meta = useMemo(() => {
    const sample = rows[0] || {};

    const hotelKey = pickKeyByCandidates(sample, ["Hotel", "Empresa", "Property", "Propiedad"]);
    const countryKey = pickKeyByCandidates(sample, [
      "Pais",
      "País",
      "Nacionalidad",
      "Nacionalidad País",
      "Country",
      "Nationality",
    ]);
    const continentKey = pickKeyByCandidates(sample, ["Continente", "Continent"]);
    const qtyKey = pickKeyByCandidates(sample, ["Cantidad", "Qty", "Cantidad Pax", "Pax", "Guests"]);
    const dateKey = pickKeyByCandidates(sample, ["Fecha", "Date", "Día", "Dia", "Day"]);

    return { hotelKey, countryKey, continentKey, qtyKey, dateKey, sampleKeys: Object.keys(sample) };
  }, [rows]);

  function hotelMatches(h: string, filter?: string) {
    if (!filter) return true;
    const H = upperNoAccents(h);
    const F = upperNoAccents(filter);

    if (F === "JCR" || F === "GRUPO JCR") return true;

    if (F.includes("MARRIOTT")) return H.includes("MARRIOTT");
    if (F.includes("SHERATON BCR") || F.includes("BCR")) return H.includes("BCR");
    if (F.includes("SHERATON MDQ") || F.includes("MDQ")) return H.includes("MDQ");

    return H.includes(F);
  }

  const filteredRows = useMemo(() => {
    if (!rows.length) return [];

    const { hotelKey, dateKey } = meta;
    const out: Row[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const hotelVal = hotelKey ? normStr(r[hotelKey]) : "";
      if (!hotelMatches(hotelVal, hotelFilter)) continue;

      const y = dateKey ? yearFromAnyDate(r[dateKey]) : null;
      if (y !== year) continue;

      out.push(r);
    }
    return out;
  }, [rows, meta, year, hotelFilter]);

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    const { countryKey, qtyKey } = meta;
    if (!countryKey || !qtyKey) return m;

    for (let i = 0; i < filteredRows.length; i++) {
      const r = filteredRows[i];
      const c = normStr(r[countryKey]);
      if (!c) continue;
      const v = toNumber(r[qtyKey]);
      m.set(c, (m.get(c) || 0) + v);
    }
    return m;
  }, [filteredRows, meta]);

  const byContinent = useMemo(() => {
    const m = new Map<string, number>();
    const { continentKey, qtyKey } = meta;
    if (!continentKey || !qtyKey) return m;

    for (let i = 0; i < filteredRows.length; i++) {
      const r = filteredRows[i];
      const c = normStr(r[continentKey]);
      if (!c) continue;
      const v = toNumber(r[qtyKey]);
      m.set(c, (m.get(c) || 0) + v);
    }
    return m;
  }, [filteredRows, meta]);

  const total = useMemo(() => {
    let t = 0;

    // NO usar for..of sobre iterators (downlevelIteration)
    Array.from(byCountry.values()).forEach((v) => (t += v));
    if (t === 0) {
      Array.from(byContinent.values()).forEach((v) => (t += v));
    }
    return t;
  }, [byCountry, byContinent]);

  const topCountries = useMemo(() => {
    const list = Array.from(byCountry.entries())
      .map(([country, value]) => ({ country, value }))
      .sort((a, b) => b.value - a.value);

    return list.slice(0, limit);
  }, [byCountry, limit]);

  const topContinents = useMemo(() => {
    const list = Array.from(byContinent.entries())
      .map(([continent, value]) => ({ continent, value }))
      .sort((a, b) => b.value - a.value);

    return list;
  }, [byContinent]);

  const titleHotel = useMemo(() => {
    const f = (hotelFilter || "").trim();
    if (!f || upperNoAccents(f) === "JCR") return "JCR";
    return f.toUpperCase();
  }, [hotelFilter]);

  if (loading) {
    return (
      <div style={{ padding: "1rem" }}>
        <div style={{ fontWeight: 900 }}>Nacionalidades</div>
        <div style={{ marginTop: ".35rem", opacity: 0.75 }}>Cargando archivo…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "1rem" }}>
        <div style={{ fontWeight: 900 }}>Nacionalidades</div>
        <div style={{ marginTop: ".35rem", color: "#b00020" }}>{error}</div>
        <div style={{ marginTop: ".5rem", opacity: 0.75, fontSize: 12 }}>
          Archivo: <code>{filePath}</code>
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div style={{ padding: "1rem" }}>
        <div style={{ fontWeight: 900 }}>Nacionalidades</div>
        <div style={{ marginTop: ".35rem", opacity: 0.75 }}>Sin filas en el archivo.</div>
        <div style={{ marginTop: ".5rem", opacity: 0.75, fontSize: 12 }}>
          Archivo: <code>{filePath}</code>
        </div>
      </div>
    );
  }

  if (!filteredRows.length) {
    return (
      <div style={{ padding: "1rem" }}>
        <div style={{ fontWeight: 900 }}>Nacionalidades ({titleHotel})</div>
        <div style={{ marginTop: ".35rem", opacity: 0.75 }}>
          Sin datos para <b>{year}</b>.
        </div>
        <div style={{ marginTop: ".6rem", opacity: 0.8, fontSize: 12 }}>
          Detectado: hotel=<b>{meta.hotelKey || "—"}</b> · país=<b>{meta.countryKey || "—"}</b> ·
          continente=<b>{meta.continentKey || "—"}</b> · qty=<b>{meta.qtyKey || "—"}</b> · fecha=
          <b>{meta.dateKey || "—"}</b>
        </div>
        <div style={{ marginTop: ".4rem", opacity: 0.7, fontSize: 12 }}>
          Keys ejemplo: {meta.sampleKeys.slice(0, 12).join(", ")}
        </div>
        <div style={{ marginTop: ".4rem", opacity: 0.7, fontSize: 12 }}>
          Archivo: <code>{filePath}</code>
        </div>
      </div>
    );
  }

  // UI responsive simple: 2 columnas en desktop, 1 en mobile
  return (
    <div style={{ padding: "1rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: ".75rem" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: "1.15rem" }}>Nacionalidades ({titleHotel})</div>
          <div style={{ marginTop: ".25rem", opacity: 0.75 }}>
            Ranking por país + distribución por continente · Año {year}
          </div>
        </div>

        <div style={{ textAlign: "right", minWidth: 160 }}>
          <div style={{ fontWeight: 900, fontSize: "1.05rem" }}>{total.toLocaleString("es-AR")}</div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>Total (según qty)</div>
        </div>
      </div>

      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: "1rem",
        }}
      >
        {/* TOP PAISES */}
        <div
          style={{
            border: "1px solid rgba(0,0,0,.08)",
            borderRadius: 18,
            padding: "1rem",
            overflow: "hidden",
          }}
        >
          <div style={{ fontWeight: 950, marginBottom: ".65rem" }}>Top países</div>

          <div style={{ display: "grid", gap: ".5rem" }}>
            {topCountries.map((it) => {
              const pct = total > 0 ? (it.value / total) * 100 : 0;
              const iso2 = countryToISO2(it.country);
              const flag = iso2 ? iso2ToFlagEmoji(iso2) : "";
              return (
                <div key={it.country} style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: ".75rem" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                      <div style={{ width: 26, textAlign: "center" }}>{flag}</div>
                      <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {it.country}
                      </div>
                      <div style={{ opacity: 0.7, fontSize: 12 }}>{pct.toFixed(1)}%</div>
                    </div>
                    <div
                      style={{
                        marginTop: ".25rem",
                        height: 10,
                        borderRadius: 999,
                        background: "rgba(0,0,0,.06)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          height: "100%",
                          borderRadius: 999,
                          background: "linear-gradient(90deg, rgba(140,0,50,.85), rgba(255,140,0,.8))",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    <div style={{ fontWeight: 900 }}>{it.value.toLocaleString("es-AR")}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CONTINENTES */}
        <div
          style={{
            border: "1px solid rgba(0,0,0,.08)",
            borderRadius: 18,
            padding: "1rem",
          }}
        >
          <div style={{ fontWeight: 950, marginBottom: ".65rem" }}>Continentes</div>

          <div style={{ display: "grid", gap: ".45rem" }}>
            {topContinents.map((it) => {
              const pct = total > 0 ? (it.value / total) * 100 : 0;
              return (
                <div key={it.continent} style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: ".75rem" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem" }}>
                      <div style={{ fontWeight: 850, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {it.continent}
                      </div>
                      <div style={{ opacity: 0.75, fontSize: 12 }}>{pct.toFixed(1)}%</div>
                    </div>
                    <div
                      style={{
                        marginTop: ".25rem",
                        height: 8,
                        borderRadius: 999,
                        background: "rgba(0,0,0,.06)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          height: "100%",
                          borderRadius: 999,
                          background: "linear-gradient(90deg, rgba(0,140,120,.85), rgba(0,100,255,.75))",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    <div style={{ fontWeight: 900 }}>{it.value.toLocaleString("es-AR")}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: ".85rem", opacity: 0.7, fontSize: 12 }}>
            Archivo: <code>{filePath}</code>
          </div>
        </div>
      </div>
    </div>
  );
}
