// app/components/MembershipSummary.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient"; // (usa el que ya tenés)
import {
  GlobalHotel,
  hotelMatches,
  getYearSafe,
  getMonthSafe,
  monthNameEs,
  normalizeHotel,
  normStr,
  normUpper,
  toNumber,
} from "./dataUtils";

type Props = {
  year: number;
  baseYear?: number;
  filePath: string; // ej "/data/jcr_membership.xlsx"
  hotelFilter: GlobalHotel; // global
  title?: string;
};

type Row = {
  empresa: string; // hotel
  bonboy: string; // tipo membresía
  cantidad: number;
  fecha: any;
};

function fmtInt(n: number) {
  return new Intl.NumberFormat("es-AR").format(Math.round(n || 0));
}

function pct(cur: number, base: number) {
  if (!base || base === 0) return null;
  return ((cur - base) / base) * 100;
}

// colores fijos por membresía (ajustalos si querés)
function colorForKey(k: string) {
  const s = normUpper(k);
  if (s.includes("AMBASSADOR")) return "linear-gradient(135deg,#4f46e5,#0ea5e9)";
  if (s.includes("TITANIUM")) return "linear-gradient(135deg,#111827,#6b7280)";
  if (s.includes("PLATINUM")) return "linear-gradient(135deg,#0f766e,#14b8a6)";
  if (s.includes("GOLD")) return "linear-gradient(135deg,#b45309,#f59e0b)";
  if (s.includes("SILVER")) return "linear-gradient(135deg,#334155,#94a3b8)";
  if (s.includes("MEMBER")) return "linear-gradient(135deg,#1f2937,#9ca3af)";
  return "linear-gradient(135deg,#1d4ed8,#22c55e)";
}

export default function MembershipSummary({
  year,
  baseYear = year - 1,
  filePath,
  hotelFilter,
  title = "Membership",
}: Props) {
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

        // mapeo flexible de headers
        const keyEmpresa =
          keys.find((k) => normUpper(k) === "EMPRESA" || normUpper(k) === "HOTEL") ?? "Empresa";
        const keyMemb =
          keys.find((k) => normUpper(k) === "BONBOY" || normUpper(k).includes("MEMBERSHIP")) ??
          "Bonboy";
        const keyQty =
          keys.find((k) => normUpper(k) === "CANTIDAD" || normUpper(k).includes("QTY")) ??
          "Cantidad";
        const keyFecha =
          keys.find((k) => normUpper(k) === "FECHA" || normUpper(k) === "DATE") ?? "Fecha";

        const mapped: Row[] = (raw ?? []).map((r: any) => ({
          empresa: normalizeHotel(r[keyEmpresa]),
          bonboy: normStr(r[keyMemb]),
          cantidad: toNumber(r[keyQty]),
          fecha: r[keyFecha],
        }));

        setRows(mapped.filter((r) => r.empresa && r.bonboy));
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

  const filteredYear = useMemo(() => {
    return rows.filter((r) => {
      if (!hotelMatches(r.empresa, hotelFilter)) return false;
      const y = getYearSafe(r.fecha);
      return y === year;
    });
  }, [rows, hotelFilter, year]);

  const filteredBase = useMemo(() => {
    return rows.filter((r) => {
      if (!hotelMatches(r.empresa, hotelFilter)) return false;
      const y = getYearSafe(r.fecha);
      return y === baseYear;
    });
  }, [rows, hotelFilter, baseYear]);

  // total anual (suma cantidades)
  const totalCur = useMemo(
    () => filteredYear.reduce((acc, r) => acc + (r.cantidad || 0), 0),
    [filteredYear]
  );
  const totalBase = useMemo(
    () => filteredBase.reduce((acc, r) => acc + (r.cantidad || 0), 0),
    [filteredBase]
  );

  // por mes (1..12)
  const byMonth = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => 0);
    filteredYear.forEach((r) => {
      const m = getMonthSafe(r.fecha);
      if (!m || m < 1 || m > 12) return;
      arr[m - 1] += r.cantidad || 0;
    });
    return arr;
  }, [filteredYear]);

  const byMonthBase = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => 0);
    filteredBase.forEach((r) => {
      const m = getMonthSafe(r.fecha);
      if (!m || m < 1 || m > 12) return;
      arr[m - 1] += r.cantidad || 0;
    });
    return arr;
  }, [filteredBase]);

  // composición por membresía (año actual)
  const composition = useMemo(() => {
    const map = new Map<string, number>();
    filteredYear.forEach((r) => {
      const k = normStr(r.bonboy) || "OTROS";
      map.set(k, (map.get(k) || 0) + (r.cantidad || 0));
    });
    const list = Array.from(map.entries())
      .map(([k, v]) => ({ k, v }))
      .sort((a, b) => b.v - a.v);
    return list;
  }, [filteredYear]);

  const variation = useMemo(() => pct(totalCur, totalBase), [totalCur, totalBase]);

  const hasData = filteredYear.length > 0;

  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            {title} ({hotelFilter})
          </div>
          <div className="sectionDesc" style={{ marginTop: 4 }}>
            Acumulado {year} · vs {baseYear}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div className="pill" style={{ padding: ".45rem .7rem", borderRadius: 999, border: "1px solid rgba(255,255,255,.12)" }}>
            Año: <strong>{year}</strong>
          </div>
          <div className="pill" style={{ padding: ".45rem .7rem", borderRadius: 999, border: "1px solid rgba(255,255,255,.12)" }}>
            Hotel: <strong>{hotelFilter}</strong>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: ".9rem", padding: "1rem", borderRadius: 22 }}>
        {loading ? (
          <div style={{ opacity: 0.8 }}>Cargando membership…</div>
        ) : !hasData ? (
          <div style={{ opacity: 0.9 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Sin datos</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>
              Archivo: <code>{filePath}</code>
              <br />
              Sheet: <code>{debug.sheetName}</code> (hojas: {debug.sheetNames.join(", ") || "—"})
              <br />
              Keys ejemplo: {debug.keys.slice(0, 12).join(", ") || "—"}
            </div>
            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>
              Si el año existe pero igual da 0: es casi siempre por formato de fecha (string / serial). Ya lo estamos normalizando;
              si sigue, revisamos el header de Fecha/Cantidad/Bonboy.
            </div>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              <div className="kpiCard" style={{ borderRadius: 18, padding: "1rem", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.10)" }}>
                <div style={{ opacity: 0.8, fontSize: 13 }}>Total {year}</div>
                <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{fmtInt(totalCur)}</div>
              </div>

              <div className="kpiCard" style={{ borderRadius: 18, padding: "1rem", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.10)" }}>
                <div style={{ opacity: 0.8, fontSize: 13 }}>Total {baseYear}</div>
                <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{fmtInt(totalBase)}</div>
              </div>

              <div className="kpiCard" style={{ borderRadius: 18, padding: "1rem", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.10)" }}>
                <div style={{ opacity: 0.8, fontSize: 13 }}>Variación</div>
                <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>
                  {variation === null ? "Sin base" : `${variation >= 0 ? "+" : ""}${variation.toFixed(1)}%`}
                </div>
              </div>
            </div>

            {/* Tabla mensual + mini barras */}
            <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
              <div style={{ border: "1px solid rgba(255,255,255,.10)", borderRadius: 18, padding: "1rem", background: "rgba(255,255,255,.03)" }}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Evolución mensual</div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: "left", opacity: 0.8 }}>
                        <th style={{ padding: "8px 6px" }}>Mes</th>
                        <th style={{ padding: "8px 6px" }}>Total</th>
                        <th style={{ padding: "8px 6px" }}>{baseYear}</th>
                        <th style={{ padding: "8px 6px" }}>Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byMonth.map((v, i) => {
                        const b = byMonthBase[i] || 0;
                        const delta = b ? ((v - b) / b) * 100 : null;
                        return (
                          <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                            <td style={{ padding: "8px 6px" }}>{monthNameEs(i + 1)}</td>
                            <td style={{ padding: "8px 6px", fontWeight: 800 }}>{fmtInt(v)}</td>
                            <td style={{ padding: "8px 6px", opacity: 0.9 }}>{fmtInt(b)}</td>
                            <td style={{ padding: "8px 6px", opacity: 0.9 }}>
                              {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`}
                            </td>
                          </tr>
                        );
                      })}
                      <tr style={{ borderTop: "1px solid rgba(255,255,255,.12)" }}>
                        <td style={{ padding: "10px 6px", fontWeight: 950 }}>Total</td>
                        <td style={{ padding: "10px 6px", fontWeight: 950 }}>{fmtInt(totalCur)}</td>
                        <td style={{ padding: "10px 6px", fontWeight: 950 }}>{fmtInt(totalBase)}</td>
                        <td style={{ padding: "10px 6px", fontWeight: 950 }}>
                          {variation === null ? "—" : `${variation >= 0 ? "+" : ""}${variation.toFixed(1)}%`}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Composición */}
              <div style={{ border: "1px solid rgba(255,255,255,.10)", borderRadius: 18, padding: "1rem", background: "rgba(255,255,255,.03)" }}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Composición</div>

                <div style={{ display: "grid", gap: 10 }}>
                  {composition.slice(0, 10).map((it) => {
                    const p = totalCur ? (it.v / totalCur) * 100 : 0;
                    return (
                      <div key={it.k} style={{ display: "grid", gap: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ fontWeight: 850, fontSize: 13, opacity: 0.95 }}>{it.k}</div>
                          <div style={{ fontWeight: 900, fontSize: 13 }}>{fmtInt(it.v)} · {p.toFixed(1)}%</div>
                        </div>
                        <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${Math.min(100, p)}%`,
                              height: "100%",
                              borderRadius: 999,
                              background: colorForKey(it.k),
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
