// app/components/CountryRanking.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";
import { getYearSafe, normStr, normUpper, toNumber } from "./dataUtils";

type Props = {
  year: number;
  filePath: string; // "/data/jcr_nacionalidades.xlsx"
  limit?: number;
};

type Row = {
  fecha: any;
  pais: string;
  continente: string;
  cantidad: number;
};

function fmtInt(n: number) {
  return new Intl.NumberFormat("es-AR").format(Math.round(n || 0));
}

// Mapeo básico país -> ISO2 (para emoji bandera)
const ISO2: Record<string, string> = {
  // LATAM
  "ARGENTINA": "AR",
  "BRASIL": "BR",
  "BRAZIL": "BR",
  "CHILE": "CL",
  "URUGUAY": "UY",
  "PARAGUAY": "PY",
  "BOLIVIA": "BO",
  "PERU": "PE",
  "PERÚ": "PE",
  "COLOMBIA": "CO",
  "VENEZUELA": "VE",
  "ECUADOR": "EC",
  "MEXICO": "MX",
  "MÉXICO": "MX",
  "PANAMA": "PA",
  "PANAMÁ": "PA",
  // NA / EU
  "UNITED STATES": "US",
  "ESTADOS UNIDOS": "US",
  "USA": "US",
  "CANADA": "CA",
  "CANADÁ": "CA",
  "SPAIN": "ES",
  "ESPAÑA": "ES",
  "FRANCE": "FR",
  "FRANCIA": "FR",
  "ITALY": "IT",
  "ITALIA": "IT",
  "GERMANY": "DE",
  "ALEMANIA": "DE",
  "UNITED KINGDOM": "GB",
  "REINO UNIDO": "GB",
  "PORTUGAL": "PT",
  // otros comunes
  "ISRAEL": "IL",
  "CHINA": "CN",
  "JAPAN": "JP",
  "JAPÓN": "JP",
  "AUSTRALIA": "AU",
};

function flagEmojiFromISO2(code: string): string {
  const s = normUpper(code);
  if (s.length !== 2) return "";
  const A = 0x1f1e6;
  const c1 = s.charCodeAt(0) - 65;
  const c2 = s.charCodeAt(1) - 65;
  if (c1 < 0 || c1 > 25 || c2 < 0 || c2 > 25) return "";
  return String.fromCodePoint(A + c1, A + c2);
}

function flagForCountry(country: string) {
  const key = normUpper(country);
  const iso2 = ISO2[key];
  return iso2 ? flagEmojiFromISO2(iso2) : "🏳️";
}

export default function CountryRanking({ year, filePath, limit = 12 }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [debug, setDebug] = useState<{ sheetName: string; sheetNames: string[]; keys: string[] }>({
    sheetName: "",
    sheetNames: [],
    keys: [],
  });

  useEffect(() => {
    let alive = true;
    setLoading(true);

    readXlsxFromPublic(filePath)
      .then(({ rows: raw, sheetName, sheetNames }) => {
        if (!alive) return;

        const keys = Object.keys(raw?.[0] ?? {});
        setDebug({ sheetName, sheetNames, keys });

        // headers flexibles
        const keyFecha =
          keys.find((k) => ["FECHA", "DATE"].includes(normUpper(k))) ?? "Fecha";

        const keyPais =
          keys.find((k) =>
            ["PAIS", "PAÍS", "NACIONALIDAD", "COUNTRY"].includes(normUpper(k))
          ) ?? "País";

        const keyCont =
          keys.find((k) =>
            ["CONTINENTE", "CONTINENT", "REGION"].includes(normUpper(k))
          ) ?? "Continente";

        const keyQty =
          keys.find((k) => ["CANTIDAD", "QTY", "TOTAL"].includes(normUpper(k))) ?? "Cantidad";

        const mapped: Row[] = (raw ?? []).map((r: any) => ({
          fecha: r[keyFecha],
          pais: normStr(r[keyPais]),
          continente: normStr(r[keyCont]),
          cantidad: toNumber(r[keyQty]),
        }));

        setRows(mapped);
      })
      .catch(() => {
        if (!alive) return;
        setRows([]);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  const filtered = useMemo(() => {
    return rows.filter((r) => getYearSafe(r.fecha) === year);
  }, [rows, year]);

  const byCountry = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      const k = normStr(r.pais) || "OTROS";
      map.set(k, (map.get(k) || 0) + (r.cantidad || 0));
    });
    return map;
  }, [filtered]);

  const byContinent = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      const k = normStr(r.continente) || "Sin continente";
      map.set(k, (map.get(k) || 0) + (r.cantidad || 0));
    });
    return map;
  }, [filtered]);

  const total = useMemo(() => {
    const vals = Array.from(byCountry.values());
    const t1 = vals.reduce((a, b) => a + b, 0);
    if (t1 > 0) return t1;
    const vals2 = Array.from(byContinent.values());
    return vals2.reduce((a, b) => a + b, 0);
  }, [byCountry, byContinent]);

  const topCountries = useMemo(() => {
    const list = Array.from(byCountry.entries())
      .map(([k, v]) => ({ k, v }))
      .sort((a, b) => b.v - a.v)
      .slice(0, limit);
    return list;
  }, [byCountry, limit]);

  const contList = useMemo(() => {
    const list = Array.from(byContinent.entries())
      .map(([k, v]) => ({ k, v }))
      .sort((a, b) => b.v - a.v);
    return list;
  }, [byContinent]);

  const hasData = filtered.length > 0 && total > 0;

  return (
    <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
      {loading ? (
        <div style={{ opacity: 0.8 }}>Cargando nacionalidades…</div>
      ) : !hasData ? (
        <div style={{ opacity: 0.9 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Sin datos</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            No hay filas para <strong>{year}</strong>. (Archivo: <code>{filePath}</code>)
            <br />
            Sheet: <code>{debug.sheetName}</code> · Keys ejemplo: {debug.keys.slice(0, 12).join(", ") || "—"}
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 14,
            alignItems: "start",
          }}
        >
          {/* Países (grande) */}
          <div style={{ border: "1px solid rgba(255,255,255,.10)", borderRadius: 18, padding: "1rem", background: "rgba(255,255,255,.03)" }}>
            <div style={{ fontWeight: 950, marginBottom: 10 }}>Ranking por país</div>

            <div style={{ display: "grid", gap: 10 }}>
              {topCountries.map((it, idx) => {
                const p = total ? (it.v / total) * 100 : 0;
                return (
                  <div
                    key={it.k}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "44px 1fr auto",
                      gap: 10,
                      alignItems: "center",
                      padding: ".65rem .7rem",
                      borderRadius: 16,
                      background: "rgba(255,255,255,.04)",
                      border: "1px solid rgba(255,255,255,.08)",
                    }}
                  >
                    <div style={{ fontSize: 22, textAlign: "center" }}>{flagForCountry(it.k)}</div>

                    <div>
                      <div style={{ fontWeight: 900 }}>{idx + 1}. {it.k}</div>
                      <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden", marginTop: 6 }}>
                        <div style={{ width: `${Math.min(100, p)}%`, height: "100%", borderRadius: 999, background: "linear-gradient(135deg,#06b6d4,#22c55e)" }} />
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 950, fontSize: 14 }}>{fmtInt(it.v)}</div>
                      <div style={{ opacity: 0.8, fontSize: 12 }}>{p.toFixed(1)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Continente (más chico) */}
          <div style={{ border: "1px solid rgba(255,255,255,.10)", borderRadius: 18, padding: "1rem", background: "rgba(255,255,255,.03)" }}>
            <div style={{ fontWeight: 950, marginBottom: 10 }}>Distribución por continente</div>

            <div style={{ display: "grid", gap: 10 }}>
              {contList.slice(0, 8).map((it) => {
                const p = total ? (it.v / total) * 100 : 0;
                return (
                  <div key={it.k} style={{ display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 850 }}>{it.k}</div>
                      <div style={{ fontWeight: 950 }}>{fmtInt(it.v)} · {p.toFixed(1)}%</div>
                    </div>
                    <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(100, p)}%`, height: "100%", borderRadius: 999, background: "linear-gradient(135deg,#a855f7,#f97316)" }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              Total {year}: <strong>{fmtInt(total)}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
