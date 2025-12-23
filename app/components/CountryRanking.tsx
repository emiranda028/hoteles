"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  filePath: string;
};

function pickKey(keys: string[], candidates: string[]): string | null {
  const lower = new Map(keys.map((k) => [k.toLowerCase(), k]));
  for (const c of candidates) {
    const hit = lower.get(c.toLowerCase());
    if (hit) return hit;
  }
  for (const c of candidates) {
    const cLow = c.toLowerCase();
    const found = keys.find((k) => k.toLowerCase().includes(cLow));
    if (found) return found;
  }
  return null;
}

function norm(v: any) {
  return String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function toNum(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (!s) return 0;
  const cleaned = s.replace(/\./g, "").replace(",", ".").replace("%", "");
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

function formatInt(n: number) {
  return Math.round(n).toLocaleString("es-AR");
}

export default function CountryRanking({ year, filePath }: Props) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [rows, setRows] = useState<any[]>([]);
  const [info, setInfo] = useState<{ sheet: string; keys: string[] } | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readXlsxFromPublic(filePath)
      .then((r) => {
        if (!alive) return;
        const keys = r.rows?.[0] ? Object.keys(r.rows[0]) : [];
        setInfo({ sheet: r.sheet, keys });
        setRows(r.rows ?? []);
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

  const computed = useMemo(() => {
    if (!rows.length) return { ranking: [] as { country: string; value: number }[], byCont: [] as { cont: string; value: number }[] };

    const keys = Object.keys(rows[0] ?? {});
    const kYear = pickKey(keys, ["Año", "Ano", "Year"]);
    const kCountry = pickKey(keys, ["PAÍS", "PAIS", "Pais", "Country"]);
    const kCont = pickKey(keys, ["Continente", "Continent"]);
    const kValue = pickKey(keys, ["Importe", "Valor", "Total", "Cantidad", "Qty"]);

    const filtered = rows.filter((r) => {
      const y = toNum(kYear ? r[kYear] : r["Año"]);
      return y === year;
    });

    const byCountry = new Map<string, number>();
    const byCont = new Map<string, number>();

    for (const r of filtered) {
      const c = norm(kCountry ? r[kCountry] : r["PAÍS"]);
      const cont = norm(kCont ? r[kCont] : r["Continente"]);
      const val = toNum(kValue ? r[kValue] : r["Importe"]);

      if (c) byCountry.set(c, (byCountry.get(c) ?? 0) + val);
      if (cont) byCont.set(cont, (byCont.get(cont) ?? 0) + val);
    }

    const ranking = Array.from(byCountry.entries())
      .map(([country, value]) => ({ country, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);

    const byContArr = Array.from(byCont.entries())
      .map(([cont, value]) => ({ cont, value }))
      .sort((a, b) => b.value - a.value);

    return { ranking, byCont: byContArr };
  }, [rows, year]);

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
        <div style={{ color: "crimson" }}>Error: {err}</div>
      </div>
    );
  }

  if (!computed.ranking.length) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 900 }}>Nacionalidades</div>
        <div style={{ marginTop: ".35rem", opacity: 0.85 }}>
          Sin datos para {year}. (Archivo: {filePath})
        </div>
        {info ? (
          <div style={{ marginTop: ".6rem", fontSize: ".9rem", opacity: 0.75 }}>
            Sheet: {info.sheet} · Keys ejemplo: {info.keys.slice(0, 12).join(", ")}
          </div>
        ) : null}
      </div>
    );
  }

  const total = computed.ranking.reduce((a, x) => a + x.value, 0);

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Ranking por país ({year})</div>

        <div style={{ marginTop: ".75rem", display: "grid", gap: ".5rem" }}>
          {computed.ranking.map((x) => {
            const pct = total > 0 ? x.value / total : 0;
            return (
              <div key={x.country} style={{ display: "grid", gap: ".25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                  <div style={{ fontWeight: 800 }}>{x.country}</div>
                  <div style={{ fontWeight: 900 }}>
                    {formatInt(x.value)} <span style={{ opacity: 0.75 }}>({(pct * 100).toFixed(1).replace(".", ",")}%)</span>
                  </div>
                </div>

                <div style={{ height: 10, background: "rgba(255,255,255,.08)", borderRadius: 999 }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, pct * 100)}%`,
                      borderRadius: 999,
                      background: "rgba(255,255,255,.35)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 900 }}>Distribución por continente ({year})</div>
        <div style={{ marginTop: ".6rem", display: "grid", gap: ".35rem" }}>
          {computed.byCont.map((x) => (
            <div key={x.cont} style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
              <div>{x.cont}</div>
              <div style={{ fontWeight: 900 }}>{formatInt(x.value)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
