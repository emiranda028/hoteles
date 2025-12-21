"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  filePath: string; // "/data/jcr_nacionalidades.xlsx"
  limit?: number;
};

type Row = {
  continente: string;
  anio: number;
  pais: string;
  mes: string;
  nMes: number;
  importe: number;
};

function toNumAny(v: any) {
  if (v === null || v === undefined) return 0;
  const raw = String(v).trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\./g, "").replace(/,/g, ".").replace(/[^\d.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function toIntAny(v: any) {
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function normalizeKey(s: any) {
  return String(s || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isoToFlag(code: string) {
  const c = (code || "").toUpperCase();
  if (c.length !== 2) return "";
  const A = 0x1f1e6;
  const c1 = c.charCodeAt(0) - 65;
  const c2 = c.charCodeAt(1) - 65;
  if (c1 < 0 || c1 > 25 || c2 < 0 || c2 > 25) return "";
  return String.fromCodePoint(A + c1, A + c2);
}

const COUNTRY_TO_ISO: Record<string, string> = {
  "ARGENTINA": "AR",
  "BRASIL": "BR",
  "BRAZIL": "BR",
  "CHILE": "CL",
  "URUGUAY": "UY",
  "PARAGUAY": "PY",
  "BOLIVIA": "BO",
  "PERU": "PE",
  "COLOMBIA": "CO",
  "MEXICO": "MX",
  "UNITED STATES": "US",
  "ESTADOS UNIDOS": "US",
  "EEUU": "US",
  "USA": "US",
  "ESPANA": "ES",
  "SPAIN": "ES",
  "FRANCIA": "FR",
  "FRANCE": "FR",
  "ALEMANIA": "DE",
  "GERMANY": "DE",
  "REINO UNIDO": "GB",
  "UNITED KINGDOM": "GB",
  "INGLATERRA": "GB",
  "ITALIA": "IT",
  "ITALY": "IT",
  "PORTUGAL": "PT",
};

function guessIso(paisRaw: string) {
  const k = normalizeKey(paisRaw);
  return COUNTRY_TO_ISO[k] || "";
}

export default function CountryRanking({ year, filePath, limit = 10 }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr("");

    readXlsxFromPublic(filePath)
      .then(({ rows }) => {
        if (!mounted) return;

        const parsed: Row[] = (rows || []).map((r: any) => {
          const continente = String(r["Continente"] ?? r["CONTINENTE"] ?? "").trim();
          const anio = toIntAny(r["Año"] ?? r["AÑO"] ?? r["Anio"] ?? r["anio"]);
          const pais = String(r["PAÍS "] ?? r["PAÍS"] ?? r["PAIS"] ?? r["Pais"] ?? "").trim();
          const mes = String(r["Mes"] ?? "").trim();
          const nMes = toIntAny(r["N° Mes"] ?? r["N Mes"] ?? r["N°Mes"] ?? r["N_Mes"]);
          const importe = toNumAny(r["Importe Date"] ?? r["Importe"] ?? r["IMPORTE"] ?? 0);

          return { continente, anio, pais, mes, nMes, importe };
        });

        setRows(parsed);
        setLoading(false);
      })
      .catch((e: any) => {
        if (!mounted) return;
        setErr(e?.message || "Error leyendo XLSX");
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [filePath]);

  const yearRows = useMemo(() => rows.filter((r) => r.anio === year), [rows, year]);

  const byCountry = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of yearRows) {
      const key = r.pais || "SIN PAIS";
      map.set(key, (map.get(key) || 0) + (r.importe || 0));
    }
    return map;
  }, [yearRows]);

  const byContinent = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of yearRows) {
      const key = r.continente || "SIN CONTINENTE";
      map.set(key, (map.get(key) || 0) + (r.importe || 0));
    }
    return map;
  }, [yearRows]);

  const total = useMemo(() => {
    return Array.from(byCountry.values()).reduce((a, b) => a + b, 0) || Array.from(byContinent.values()).reduce((a, b) => a + b, 0);
  }, [byCountry, byContinent]);

  const topCountries = useMemo(() => {
    const arr = Array.from(byCountry.entries())
      .map(([pais, val]) => ({ pais, val }))
      .sort((a, b) => b.val - a.val)
      .slice(0, limit);

    return arr;
  }, [byCountry, limit]);

  const continents = useMemo(() => {
    const arr = Array.from(byContinent.entries())
      .map(([cont, val]) => ({ cont, val }))
      .sort((a, b) => b.val - a.val);
    return arr;
  }, [byContinent]);

  if (loading) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Cargando nacionalidades…</div>;
  if (err) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Error: {err}</div>;

  if (yearRows.length === 0) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Sin datos — No hay filas para {year}. (Archivo: {filePath})
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: ".85rem" }}>
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: ".5rem" }}>
          <div style={{ fontWeight: 950 }}>Nacionalidades — {year}</div>
          <div style={{ opacity: 0.75 }}>Total: {total.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</div>
        </div>
      </div>

      <div style={{ display: "grid", gap: ".85rem", gridTemplateColumns: "minmax(0, 1.7fr) minmax(0, 1fr)" }} className="natGrid">
        {/* Países (grande) */}
        <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
          <div style={{ fontWeight: 950, marginBottom: ".6rem" }}>Ranking por país</div>

          <div style={{ display: "grid", gap: ".55rem" }}>
            {topCountries.map((c) => {
              const pct = total ? (c.val / total) * 100 : 0;
              const iso = guessIso(c.pais);
              const flag = iso ? isoToFlag(iso) : "🏳️";
              return (
                <div key={c.pais} style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: ".65rem", alignItems: "center" }}>
                  <div style={{ fontSize: "1.15rem" }}>{flag}</div>
                  <div style={{ display: "grid", gap: ".25rem" }}>
                    <div style={{ fontWeight: 900 }}>{c.pais}</div>
                    <div style={{ height: 10, background: "rgba(0,0,0,.06)", borderRadius: 999 }}>
                      <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #22c55e, #0ea5e9)" }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 950 }}>{pct.toFixed(1).replace(".", ",")}%</div>
                    <div style={{ opacity: 0.75, fontSize: ".9rem" }}>{c.val.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Continentes (chico) */}
        <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
          <div style={{ fontWeight: 950, marginBottom: ".6rem" }}>Distribución por continente</div>
          <div style={{ display: "grid", gap: ".55rem" }}>
            {continents.map((c) => {
              const pct = total ? (c.val / total) * 100 : 0;
              return (
                <div key={c.cont} style={{ display: "grid", gap: ".25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem" }}>
                    <div style={{ fontWeight: 900 }}>{c.cont}</div>
                    <div style={{ fontWeight: 950 }}>{pct.toFixed(1).replace(".", ",")}%</div>
                  </div>
                  <div style={{ height: 10, background: "rgba(0,0,0,.06)", borderRadius: 999 }}>
                    <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #a855f7, #ec4899)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 1000px) {
          .natGrid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
