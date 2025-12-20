"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Props = {
  year: number;
  filePath?: string; // default: /data/jcr_nacionalidades.xlsx
  hotelFilter?: string; // "JCR" o hotel
  limit?: number;
};

type Row = {
  hotel: string;
  country: string;
  continent: string;
  qty: number;
  date: Date | null;
  year: number | null;
};

type ReadResult = {
  rows: any[];
  sheetName: string;
  sheetNames: string[];
};

function normStr(s: any) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function pick(obj: Record<string, any>, candidates: string[]) {
  const keys = Object.keys(obj);
  const lower = new Map(keys.map((k) => [k.toLowerCase(), k]));
  for (const cand of candidates) {
    const k = lower.get(cand.toLowerCase());
    if (k != null) return obj[k];
  }
  return "";
}

function safeNum(v: any): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const out = s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(out);
  return Number.isFinite(n) ? n : 0;
}

function parseDateLoose(v: any): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;

  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    const yyyy = Number(m1[3]);
    const d = new Date(yyyy, mm - 1, dd);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  const t = Date.parse(s);
  if (Number.isFinite(t)) return new Date(t);
  return null;
}

function scoreRows(rows: any[]) {
  if (!rows || rows.length === 0) return 0;
  const keys = Object.keys(rows[0] ?? {});
  const set = new Set(keys.map((k) => String(k).trim().toLowerCase()));
  let score = keys.length;

  // señales típicas
  if (set.has("empresa") || set.has("hotel")) score += 40;
  if (set.has("pais") || set.has("country")) score += 30;
  if (set.has("continente") || set.has("continent")) score += 20;
  if (set.has("cantidad") || set.has("qty") || set.has("count")) score += 25;
  if (set.has("fecha") || set.has("date")) score += 15;

  score += Math.min(rows.length, 300) / 10;
  return score;
}

async function readXlsxFromPublic(path: string): Promise<ReadResult> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (status ${res.status})`);
  const buffer = await res.arrayBuffer();

  const wb = XLSX.read(buffer, { type: "array" });
  const sheetNames = wb.SheetNames ?? [];
  if (sheetNames.length === 0) return { rows: [], sheetName: "", sheetNames: [] };

  let bestSheet = sheetNames[0];
  let bestRows: any[] = [];
  let bestScore = -1;

  for (const name of sheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];
    const s = scoreRows(rows);
    if (s > bestScore) {
      bestScore = s;
      bestSheet = name;
      bestRows = rows;
    }
  }

  return { rows: bestRows, sheetName: bestSheet, sheetNames };
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);
}

/**
 * Bandera: espera ISO2 (AR, US, BR...).
 * Evita `[...s]` por downlevelIteration.
 */
function iso2ToFlag(iso2: string) {
  const s = String(iso2 ?? "").trim().toUpperCase();
  if (s.length !== 2) return "";
  const A = 0x1f1e6;
  const c0 = s.charCodeAt(0);
  const c1 = s.charCodeAt(1);
  if (c0 < 65 || c0 > 90 || c1 < 65 || c1 > 90) return "";
  return String.fromCodePoint(A + (c0 - 65), A + (c1 - 65));
}

function countryToIso2(country: string) {
  // mapping mínimo; si querés, lo expandimos después
  const c = normStr(country);
  const map: Record<string, string> = {
    ARGENTINA: "AR",
    BRASIL: "BR",
    BRAZIL: "BR",
    URUGUAY: "UY",
    CHILE: "CL",
    PARAGUAY: "PY",
    BOLIVIA: "BO",
    PERU: "PE",
    PERÚ: "PE",
    COLOMBIA: "CO",
    MEXICO: "MX",
    MÉXICO: "MX",
    UNITED STATES: "US",
    ESTADOS UNIDOS: "US",
    USA: "US",
    SPAIN: "ES",
    ESPAÑA: "ES",
    ITALY: "IT",
    ITALIA: "IT",
    FRANCE: "FR",
    FRANCIA: "FR",
    GERMANY: "DE",
    ALEMANIA: "DE",
    UK: "GB",
    UNITED KINGDOM: "GB",
    REINO UNIDO: "GB",
  };
  return map[c] ?? "";
}

export default function CountryRanking({
  year,
  filePath = "/data/jcr_nacionalidades.xlsx",
  hotelFilter = "JCR",
  limit = 12,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string>("");
  const [keysExample, setKeysExample] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        setLoading(true);
        setErr("");
        const rr = await readXlsxFromPublic(filePath);
        const k0 = rr.rows[0] ? Object.keys(rr.rows[0]) : [];
        if (alive) setKeysExample(k0);

        const mapped = rr.rows.map((r: any) => {
          const hotel = normStr(pick(r, ["Empresa", "empresa", "Hotel", "hotel", "Property"]));
          const country = String(pick(r, ["Pais", "país", "País", "Country", "country"])).trim();
          const continent = String(pick(r, ["Continente", "continente", "Continent", "continent"])).trim();
          const qty = safeNum(pick(r, ["Cantidad", "cantidad", "Qty", "qty", "Count", "count"]));
          const dt = parseDateLoose(pick(r, ["Fecha", "fecha", "Date", "date"]));
          const yy = dt ? dt.getFullYear() : null;

          return { hotel, country, continent, qty, date: dt, year: yy } as Row;
        });

        const clean = mapped.filter((x) => x.country && x.qty && x.year);
        if (alive) setRows(clean);
      } catch (e: any) {
        console.error(e);
        if (alive) {
          setRows([]);
          setErr(String(e?.message ?? e));
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [filePath]);

  const filtered = useMemo(() => {
    const hf = normStr(hotelFilter);
    return rows.filter((r) => {
      if (r.year !== year) return false;
      if (hf !== "JCR" && hf !== normStr(r.hotel)) return false;
      return true;
    });
  }, [rows, year, hotelFilter]);

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const key = String(r.country ?? "").trim();
      m.set(key, (m.get(key) ?? 0) + (r.qty || 0));
    }
    return Array.from(m.entries())
      .map(([country, qty]) => ({ country, qty }))
      .sort((a, b) => b.qty - a.qty);
  }, [filtered]);

  const byContinent = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const key = String(r.continent ?? "").trim() || "—";
      m.set(key, (m.get(key) ?? 0) + (r.qty || 0));
    }
    return Array.from(m.entries())
      .map(([continent, qty]) => ({ continent, qty }))
      .sort((a, b) => b.qty - a.qty);
  }, [filtered]);

  const total = useMemo(() => filtered.reduce((a, r) => a + (r.qty || 0), 0), [filtered]);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: ".6rem", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>
          Nacionalidades — {hotelFilter === "JCR" ? "JCR total" : hotelFilter} · Año {year}
        </div>
        <div style={{ fontWeight: 900, opacity: 0.8 }}>
          Total huéspedes con nacionalidad: {loading ? "—" : fmtInt(total)}
        </div>
      </div>

      <div style={{ marginTop: ".5rem", opacity: 0.85, fontWeight: 750 }}>
        {loading ? (
          "Cargando..."
        ) : err ? (
          `Error: ${err}`
        ) : byCountry.length === 0 ? (
          <>
            Sin datos para {year}.{" "}
            <span style={{ opacity: 0.8 }}>
              Keys detectadas: {keysExample.slice(0, 12).join(", ")}
            </span>
          </>
        ) : (
          "Ranking por país + distribución por continente."
        )}
      </div>

      {/* Layout: Países grande, Continente chico */}
      <div
        style={{
          marginTop: ".9rem",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 0.55fr)",
          gap: 12,
        }}
      >
        {/* Países */}
        <div
          style={{
            borderRadius: 22,
            padding: "1rem",
            background: "rgba(255,255,255,.75)",
            border: "1px solid rgba(2,6,23,.10)",
            boxShadow: "0 10px 30px rgba(2,6,23,.06)",
            overflow: "hidden",
          }}
        >
          <div style={{ fontWeight: 950, marginBottom: ".6rem" }}>Top países</div>

          <div style={{ display: "grid", gap: 10 }}>
            {byCountry.slice(0, limit).map((x, idx) => {
              const iso2 = countryToIso2(x.country);
              const flag = iso2 ? iso2ToFlag(iso2) : "";
              const share = total ? x.qty / total : 0;

              return (
                <div
                  key={`${x.country}-${idx}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "42px 1fr auto",
                    gap: 10,
                    alignItems: "center",
                    padding: ".7rem .75rem",
                    borderRadius: 18,
                    background: "rgba(2,6,23,.03)",
                    border: "1px solid rgba(2,6,23,.06)",
                  }}
                >
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 14,
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(59,130,246,.12)",
                      border: "1px solid rgba(59,130,246,.25)",
                      fontWeight: 950,
                      fontSize: "1.1rem",
                    }}
                    title={iso2 || x.country}
                  >
                    {flag || "🏳️"}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {idx + 1}. {x.country}
                      </div>
                      <div style={{ fontWeight: 950 }}>{fmtInt(x.qty)}</div>
                    </div>

                    <div style={{ height: 8, borderRadius: 999, background: "rgba(2,6,23,.10)", overflow: "hidden", marginTop: 6 }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.round(share * 100)}%`,
                          background: "rgba(59,130,246,.55)",
                          borderRadius: 999,
                        }}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      padding: ".25rem .55rem",
                      borderRadius: 999,
                      background: "rgba(34,197,94,.14)",
                      border: "1px solid rgba(34,197,94,.25)",
                      fontWeight: 950,
                      fontSize: ".82rem",
                      whiteSpace: "nowrap",
                    }}
                    title="Participación sobre el total"
                  >
                    {(share * 100).toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Continentes (más chico) */}
        <div
          style={{
            borderRadius: 22,
            padding: "1rem",
            background: "rgba(255,255,255,.75)",
            border: "1px solid rgba(2,6,23,.10)",
            boxShadow: "0 10px 30px rgba(2,6,23,.06)",
          }}
        >
          <div style={{ fontWeight: 950, marginBottom: ".6rem" }}>Continentes</div>

          <div style={{ display: "grid", gap: 10 }}>
            {byContinent.slice(0, 8).map((x) => {
              const share = total ? x.qty / total : 0;
              return (
                <div
                  key={x.continent}
                  style={{
                    padding: ".65rem .7rem",
                    borderRadius: 18,
                    background: "rgba(2,6,23,.03)",
                    border: "1px solid rgba(2,6,23,.06)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 950 }}>{x.continent}</div>
                    <div style={{ fontWeight: 950 }}>{fmtInt(x.qty)}</div>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: "rgba(2,6,23,.10)", overflow: "hidden", marginTop: 6 }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.round(share * 100)}%`,
                        background: "rgba(147,51,234,.55)",
                        borderRadius: 999,
                      }}
                    />
                  </div>
                  <div style={{ marginTop: 6, fontWeight: 900, opacity: 0.8 }}>{(share * 100).toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Responsive */}
      <style jsx>{`
        @media (max-width: 900px) {
          div[style*="grid-template-columns: minmax(0, 1fr) minmax(260px, 0.55fr)"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
