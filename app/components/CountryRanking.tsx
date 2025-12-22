"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  filePath: string;
  title?: string;
};

type Row = { year: number; country: string; guests: number };

function safeNum(x: any) {
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  const s = String(x ?? "").trim();
  if (!s) return 0;
  const norm = s.replace(/\./g, "").replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normCountryKey(name: string) {
  return stripAccents(name)
    .toUpperCase()
    .replace(/\u00A0/g, " ")
    .replace(/[().]/g, " ")
    .replace(/[-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function normName(name: string) {
  return name.trim().replace(/\u00A0/g, " ").replace(/\s+/g, " ");
}

function flagEmojiFromISO2(iso2?: string) {
  if (!iso2 || iso2.length !== 2) return "🏳️";
  const codePoints = iso2
    .toUpperCase()
    .split("")
    .map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// Mapa mínimo (lo podés ampliar)
const COUNTRY_TO_ISO2: Record<string, string> = {
  ARGENTINA: "AR",
  URUGUAY: "UY",
  BRASIL: "BR",
  CHILE: "CL",
  PARAGUAY: "PY",
  BOLIVIA: "BO",
  PERU: "PE",
  "PERÚ": "PE",
  COLOMBIA: "CO",
  ECUADOR: "EC",
  VENEZUELA: "VE",
  MEXICO: "MX",
  "MÉXICO": "MX",
  "ESTADOS UNIDOS": "US",
  USA: "US",
  "EE.UU.": "US",
  EEUU: "US",
  CANADA: "CA",
  "CANADÁ": "CA",
  ESPAÑA: "ES",
  ESPANA: "ES",
  ITALIA: "IT",
  FRANCIA: "FR",
  ALEMANIA: "DE",
  GERMANY: "DE",
  "REINO UNIDO": "GB",
  "UNITED KINGDOM": "GB",
  INGLATERRA: "GB",
  IRLANDA: "IE",
  PORTUGAL: "PT",
  SUIZA: "CH",
  AUSTRIA: "AT",
  HOLANDA: "NL",
  "PAISES BAJOS": "NL",
  "PAÍSES BAJOS": "NL",
};

const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR");
const fmtPct1 = (p01: number) => (p01 * 100).toFixed(1).replace(".", ",") + "%";

export default function CountryRanking({ year, filePath, title = "Nacionalidades" }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readXlsxFromPublic(filePath)
      .then(({ rows }) => {
        if (!alive) return;

        // Buscamos columnas típicas de tu sheet
        const parsed: Row[] = (rows as any[])
          .map((r: any) => {
            const yy = Number(r.Año ?? r.ANO ?? r.Year ?? r.year);
            const country = normName(String(r["PAÍS "] ?? r["PAÍS"] ?? r["PAIS"] ?? r["País"] ?? r["Pais"] ?? r["Country"] ?? "").trim());
            const guests = safeNum(r.Importe ?? r.Total ?? r.Huespedes ?? r.Huéspedes ?? r.Guests ?? 0);

            if (!yy || !country) return null;
            return { year: yy, country, guests } as Row;
          })
          .filter(Boolean) as Row[];

        setRows(parsed);
      })
      .catch((e) => {
        console.error(e);
        setErr(String(e?.message ?? e));
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => {
      alive = false;
    };
  }, [filePath]);

  const top = useMemo(() => {
    const map = new Map<string, number>();
    rows
      .filter((r) => r.year === year)
      .forEach((r) => map.set(r.country, (map.get(r.country) ?? 0) + (r.guests ?? 0)));

    const total = Array.from(map.values()).reduce((a, b) => a + b, 0);

    const list = Array.from(map.entries())
      .map(([country, guests]) => ({ country, guests, share: total ? guests / total : 0 }))
      .sort((a, b) => b.guests - a.guests)
      .slice(0, 15);

    return { list, total };
  }, [rows, year]);

  return (
    <section className="section" style={{ marginTop: "1rem" }}>
      <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 900 }}>{title}</div>

      <div className="card" style={{ padding: "1rem", borderRadius: 18, marginTop: ".75rem" }}>
        {loading && <div style={{ opacity: 0.8 }}>Cargando nacionalidades…</div>}
        {!loading && err && <div style={{ color: "#b91c1c" }}>{err}</div>}

        {!loading && !err && !top.list.length && (
          <div style={{ opacity: 0.8 }}>Sin datos para {year}.</div>
        )}

        {!loading && !err && top.list.length > 0 && (
          <>
            <div style={{ display: "flex", gap: ".6rem", alignItems: "baseline" }}>
              <div style={{ fontWeight: 900, fontSize: "1.05rem" }}>Top países</div>
              <div style={{ opacity: 0.75 }}>Total: {fmtInt(top.total)}</div>
            </div>

            <div style={{ display: "grid", gap: ".5rem", marginTop: ".8rem" }}>
              {top.list.map((it) => {
                const key = normCountryKey(it.country);
                const iso2 = COUNTRY_TO_ISO2[key];
                const flag = flagEmojiFromISO2(iso2);

                return (
                  <div
                    key={it.country}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto",
                      gap: ".6rem",
                      alignItems: "center",
                      padding: ".55rem .65rem",
                      borderRadius: 14,
                      background: "rgba(0,0,0,.03)",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>
                      <span style={{ marginRight: ".5rem" }}>{flag}</span>
                      {it.country}
                    </div>

                    <div style={{ opacity: 0.85 }}>{fmtInt(it.guests)}</div>
                    <div style={{ fontWeight: 900 }}>{fmtPct1(it.share)}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
