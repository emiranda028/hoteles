"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

// ========= Types =========
type Props = {
  year: number;
  filePath: string;                 // ej: "/data/jcr_nacionalidades.xlsx"
  hotelFilter?: string;             // "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ"
  limit?: number;                   // default 12
};

type Row = {
  date: Date | null;
  year: number | null;
  hotel: string;         // Empresa/Hotel
  country: string;       // País/Nacionalidad
  continent: string;     // Continente
  qty: number;           // Cantidad
};

// ========= Helpers =========
function normKey(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function safeNum(v: any) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;

  // soporta "22.441,71" y "22441.71"
  const normalized =
    s.indexOf(",") >= 0 && s.indexOf(".") >= 0
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(",", ".");

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function parseDateAny(v: any): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v ?? "").trim();
  if (!s) return null;

  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // yyyy-mm-dd
  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

function stripWeirdSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

// Emoji flag from ISO2 (NO spread, NO iterators)
function flagFromISO2(code: string) {
  const s = stripWeirdSpaces(code || "").toUpperCase();
  if (s.length !== 2) return "";
  const A = 0x1f1e6;
  const c0 = s.charCodeAt(0);
  const c1 = s.charCodeAt(1);
  if (c0 < 65 || c0 > 90 || c1 < 65 || c1 > 90) return "";
  return String.fromCodePoint(A + (c0 - 65), A + (c1 - 65));
}

// Muy “pragmático”: mapeo manual de países comunes a ISO2 para banderas
const COUNTRY_TO_ISO2: Record<string, string> = {
  "ARGENTINA": "AR",
  "ARG": "AR",
  "BRASIL": "BR",
  "BRAZIL": "BR",
  "CHILE": "CL",
  "URUGUAY": "UY",
  "PARAGUAY": "PY",
  "BOLIVIA": "BO",
  "PERU": "PE",
  "COLOMBIA": "CO",
  "MEXICO": "MX",
  "MÉXICO": "MX",
  "UNITED STATES": "US",
  "ESTADOS UNIDOS": "US",
  "USA": "US",
  "ESPANA": "ES",
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
  "CANADA": "CA",
  "CANADÁ": "CA",
  "PORTUGAL": "PT",
  "CHINA": "CN",
  "JAPON": "JP",
  "JAPÓN": "JP",
  "JAPAN": "JP",
  "AUSTRALIA": "AU",
};

function isoFromCountry(country: string) {
  const k = stripWeirdSpaces(country || "").toUpperCase();
  return COUNTRY_TO_ISO2[k] || "";
}

// ========= XLSX reader =========
async function readXlsx(path: string) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (status ${res.status})`);
  const buffer = await res.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  const sheetNames = wb.SheetNames || [];
  if (sheetNames.length === 0) return { rows: [] as any[], sheet: "" };

  // elegimos la hoja con más filas/columnas “reales”
  let bestSheet = sheetNames[0];
  let bestRows: any[] = [];
  let bestScore = -1;

  for (let i = 0; i < sheetNames.length; i++) {
    const name = sheetNames[i];
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];

    const keys = Object.keys(rows[0] ?? {});
    const keySet = new Set(keys.map((k) => normKey(k)));

    let score = keys.length + Math.min(rows.length, 200) / 10;
    if (keySet.has("empresa") || keySet.has("hotel")) score += 30;
    if (keySet.has("pais") || keySet.has("nacionalidad") || keySet.has("country")) score += 30;
    if (keySet.has("continente") || keySet.has("continent")) score += 15;
    if (keySet.has("cantidad") || keySet.has("qty") || keySet.has("cantidad pax")) score += 20;
    if (keySet.has("fecha") || keySet.has("date")) score += 10;

    if (score > bestScore) {
      bestScore = score;
      bestSheet = name;
      bestRows = rows;
    }
  }

  return { rows: bestRows, sheet: bestSheet };
}

function pickField(obj: any, candidates: string[]) {
  const keys = Object.keys(obj ?? {});
  const map: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) map[normKey(keys[i])] = keys[i];

  for (let i = 0; i < candidates.length; i++) {
    const c = normKey(candidates[i]);
    if (map[c]) return obj[map[c]];
  }
  return "";
}

// ========= Component =========
export default function CountryRanking({ year, filePath, hotelFilter, limit = 12 }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Nacionalidades: vos pediste que NO necesite filtro hotel porque es solo Marriott.
  // Igual lo dejo opcional: si viene, filtra; si no, muestra todo.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);

    readXlsx(filePath)
      .then(({ rows: raw }) => {
        if (!alive) return;

        const parsed: Row[] = (raw || []).map((r: any) => {
          const dt = parseDateAny(pickField(r, ["Fecha", "date", "Día", "Dia"]));
          const yy = dt ? dt.getFullYear() : null;

          const hotel = stripWeirdSpaces(
            String(pickField(r, ["Empresa", "Hotel", "empresa", "hotel"]) || "")
          ).toUpperCase();

          const country = stripWeirdSpaces(
            String(pickField(r, ["País", "Pais", "Nacionalidad", "Country", "country"]) || "")
          );

          const continent = stripWeirdSpaces(
            String(pickField(r, ["Continente", "continent", "Continent"]) || "")
          );

          const qty = safeNum(pickField(r, ["Cantidad", "qty", "Qty", "Pax", "Huéspedes", "Huespedes"]));

          return { date: dt, year: yy, hotel, country, continent, qty };
        });

        setRows(parsed);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(String(e?.message || e));
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  const filtered = useMemo(() => {
    const y = year;
    const hf = (hotelFilter || "").toUpperCase();

    // filtro por año
    let out = rows.filter((r) => r.year === y);

    // filtro hotel opcional
    if (hf && hf !== "ALL") {
      if (hf === "JCR") {
        // en nacionalidades, si llegara a venir “JCR”, lo interpretamos como Marriott + Sheratons
        const allow = new Set(["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"]);
        out = out.filter((r) => allow.has(r.hotel));
      } else {
        out = out.filter((r) => r.hotel === hf);
      }
    }

    // limpiamos rows sin qty
    out = out.filter((r) => r.qty > 0);

    return out;
  }, [rows, year, hotelFilter]);

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < filtered.length; i++) {
      const r = filtered[i];
      const k = stripWeirdSpaces(r.country || "—") || "—";
      m.set(k, (m.get(k) || 0) + r.qty);
    }
    return m;
  }, [filtered]);

  const byContinent = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < filtered.length; i++) {
      const r = filtered[i];
      const k = stripWeirdSpaces(r.continent || "—") || "—";
      m.set(k, (m.get(k) || 0) + r.qty);
    }
    return m;
  }, [filtered]);

  const total = useMemo(() => {
    // NO for..of values()
    const vals = Array.from(byCountry.values());
    let t = 0;
    for (let i = 0; i < vals.length; i++) t += vals[i];

    // fallback a continente si no hay país
    if (t === 0) {
      const vals2 = Array.from(byContinent.values());
      for (let i = 0; i < vals2.length; i++) t += vals2[i];
    }
    return t;
  }, [byCountry, byContinent]);

  const topCountries = useMemo(() => {
    const arr = Array.from(byCountry.entries())
      .map(([country, qty]) => ({ country, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit);
    return arr;
  }, [byCountry, limit]);

  const continents = useMemo(() => {
    const arr = Array.from(byContinent.entries())
      .map(([continent, qty]) => ({ continent, qty }))
      .sort((a, b) => b.qty - a.qty);
    return arr;
  }, [byContinent]);

  function fmtInt(n: number) {
    return (n || 0).toLocaleString("es-AR");
  }
  function fmtPct(x: number) {
    if (!Number.isFinite(x)) return "—";
    return (x * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%";
  }

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
        <div style={{ fontWeight: 800 }}>Error cargando nacionalidades</div>
        <div style={{ opacity: 0.8, marginTop: 6 }}>{err}</div>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 800 }}>Sin datos</div>
        <div style={{ opacity: 0.8, marginTop: 6 }}>
          No hay filas para {year}. (Archivo: {filePath})
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {/* Layout responsive: País grande + Continente chico */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: "1rem",
        }}
      >
        {/* Ranking País */}
        <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Ranking por país</div>
              <div style={{ opacity: 0.75, marginTop: 4 }}>
                Total {fmtInt(total)} · Año {year}
              </div>
            </div>
          </div>

          <div style={{ marginTop: "1rem", display: "grid", gap: ".55rem" }}>
            {topCountries.map((c, idx) => {
              const iso = isoFromCountry(c.country);
              const flag = iso ? flagFromISO2(iso) : "";
              const share = total > 0 ? c.qty / total : 0;

              return (
                <div
                  key={`${c.country}-${idx}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "26px minmax(0,1fr) 80px",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: "1.2rem", textAlign: "center" }}>{flag || "🌍"}</div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {idx + 1}. {c.country || "—"}
                      </div>
                      <div style={{ opacity: 0.8, fontWeight: 700 }}>{fmtPct(share)}</div>
                    </div>
                    <div style={{ height: 10, background: "rgba(0,0,0,.06)", borderRadius: 999, overflow: "hidden", marginTop: 6 }}>
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(2, share * 100))}%`,
                          height: "100%",
                          background: "linear-gradient(90deg, rgba(161,0,28,1), rgba(255,87,87,1))",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ textAlign: "right", fontWeight: 900 }}>{fmtInt(c.qty)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Continente (más chico) */}
        <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
          <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Distribución por continente</div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>Compacto</div>

          <div style={{ marginTop: "1rem", display: "grid", gap: ".55rem" }}>
            {continents.map((c) => {
              const share = total > 0 ? c.qty / total : 0;
              return (
                <div key={c.continent} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px", gap: 10, alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.continent || "—"}
                      </div>
                      <div style={{ opacity: 0.8, fontWeight: 700 }}>{fmtPct(share)}</div>
                    </div>
                    <div style={{ height: 10, background: "rgba(0,0,0,.06)", borderRadius: 999, overflow: "hidden", marginTop: 6 }}>
                      <div style={{ width: `${Math.min(100, Math.max(2, share * 100))}%`, height: "100%", background: "rgba(0,0,0,.35)" }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontWeight: 900 }}>{fmtInt(c.qty)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
