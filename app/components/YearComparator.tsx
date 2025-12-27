"use client";

import React, { useMemo, useState } from "react";
import { computeKpis, groupByMonth, KpiCards, useHofDataset } from "./HofDataProvider";
import { formatMoneyUSD0, formatPct01, formatInt } from "./useCsvClient";

const HOF_PATH = "/data/history_forecast.csv"; // AJUSTÁ a tu path real en /public

type HofTab = "History" | "Forecast" | "All";

function Pill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="pill"
      style={{
        border: "1px solid rgba(255,255,255,.18)",
        background: active ? "rgba(255,255,255,.14)" : "rgba(0,0,0,.12)",
        color: "white",
        padding: ".45rem .75rem",
        borderRadius: 999,
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export default function YearComparator() {
  // Fase 1: Marriott solo, estable
  const HOTEL = "MARRIOTT";

  const { loading, err, data } = useHofDataset(HOF_PATH);

  const yearsAvailable = useMemo(() => {
    const ys = new Set<number>();
    for (const r of data?.rows ?? []) if (r.empresa === HOTEL && r.year) ys.add(r.year);
    return Array.from(ys).sort((a, b) => b - a);
  }, [data]);

  const [year, setYear] = useState<number>(2024);
  const [baseYear, setBaseYear] = useState<number>(2023);
  const [hofTab, setHofTab] = useState<HofTab>("History");
  const [month, setMonth] = useState<number>(0); // 0 = todo el año

  const filtered = useMemo(() => {
    const rows = (data?.rows ?? []).filter((r) => r.empresa === HOTEL);

    const byYear = rows.filter((r) => r.year === year);
    const byBase = rows.filter((r) => r.year === baseYear);

    const applyTab = (rs: typeof rows) => {
      if (hofTab === "All") return rs;
      return rs.filter((r) => (r.hof ?? "").toLowerCase() === hofTab.toLowerCase());
    };

    const applyMonth = (rs: typeof rows) => {
      if (!month) return rs;
      return rs.filter((r) => r.month === month);
    };

    return {
      current: applyMonth(applyTab(byYear)),
      base: applyMonth(applyTab(byBase)),
    };
  }, [data, year, baseYear, hofTab, month]);

  const kpis = useMemo(() => computeKpis(filtered.current), [filtered.current]);
  const baseKpis = useMemo(() => computeKpis(filtered.base), [filtered.base]);

  const monthAgg = useMemo(() => groupByMonth(filtered.current), [filtered.current]);

  if (loading) {
    return (
      <section className="section" style={{ padding: "1.25rem" }}>
        <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
          Cargando H&F…
        </div>
      </section>
    );
  }

  if (err) {
    return (
      <section className="section" style={{ padding: "1.25rem" }}>
        <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
          Error leyendo H&F: {err}
        </div>
      </section>
    );
  }

  const hasData = filtered.current.length > 0;

  return (
    <section className="section" id="comparador" style={{ padding: "1.25rem" }}>
      <div
        className="card"
        style={{
          borderRadius: 22,
          padding: "1rem 1rem 1.15rem",
          background: "linear-gradient(135deg, rgba(170,0,0,.85), rgba(120,0,0,.65))",
          color: "white",
          border: "1px solid rgba(255,255,255,.18)",
          position: "sticky",
          top: 10,
          zIndex: 20,
        }}
      >
        <div style={{ fontSize: "1.3rem", fontWeight: 950 }}>H&F — {HOTEL}</div>

        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: ".75rem", alignItems: "center" }}>
          <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
            <span style={{ opacity: 0.9, fontWeight: 800 }}>Año</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ padding: ".35rem .5rem", borderRadius: 10, fontWeight: 800 }}
            >
              {(yearsAvailable.length ? yearsAvailable : [year]).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
            <span style={{ opacity: 0.9, fontWeight: 800 }}>Vs</span>
            <select
              value={baseYear}
              onChange={(e) => setBaseYear(Number(e.target.value))}
              style={{ padding: ".35rem .5rem", borderRadius: 10, fontWeight: 800 }}
            >
              {(yearsAvailable.length ? yearsAvailable : [baseYear]).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
            <span style={{ opacity: 0.9, fontWeight: 800 }}>HoF</span>
            <Pill active={hofTab === "History"} onClick={() => setHofTab("History")}>
              History
            </Pill>
            <Pill active={hofTab === "Forecast"} onClick={() => setHofTab("Forecast")}>
              Forecast
            </Pill>
            <Pill active={hofTab === "All"} onClick={() => setHofTab("All")}>
              Todo
            </Pill>
          </div>

          <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
            <span style={{ opacity: 0.9, fontWeight: 800 }}>Mes</span>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              style={{ padding: ".35rem .5rem", borderRadius: 10, fontWeight: 800 }}
            >
              <option value={0}>Año completo</option>
              {Array.from({ length: 12 }).map((_, i) => {
                const m = i + 1;
                return (
                  <option key={m} value={m}>
                    {m}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div style={{ marginTop: ".55rem", opacity: 0.9, fontWeight: 700 }}>
          Filas actuales: {filtered.current.length} · Filas base: {filtered.base.length}
        </div>
      </div>

      <div style={{ marginTop: "1rem" }}>
        {!hasData ? (
          <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
            Sin datos para {HOTEL} en {year} con filtros actuales.
            <div style={{ marginTop: ".35rem", opacity: 0.85 }}>
              Años disponibles detectados: {yearsAvailable.join(", ") || "(sin detectar)"}
            </div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: ".75rem", fontSize: "1.15rem", fontWeight: 950 }}>
              KPIs (promedios/sumas) — {year} vs {baseYear}
            </div>

            <KpiCards kpis={kpis} />

            <div style={{ marginTop: ".6rem" }} className="card">
              <div style={{ padding: ".85rem 1rem", borderRadius: 18 }}>
                <div style={{ fontWeight: 900, marginBottom: ".35rem" }}>
                  Comparativa rápida ({year} vs {baseYear})
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: ".5rem" }}>
                  <div>
                    <div style={{ opacity: 0.8 }}>Ocupación</div>
                    <div style={{ fontWeight: 900 }}>
                      {formatPct01(kpis.avgOcc)} vs {formatPct01(baseKpis.avgOcc)}
                    </div>
                  </div>
                  <div>
                    <div style={{ opacity: 0.8 }}>Revenue</div>
                    <div style={{ fontWeight: 900 }}>
                      {formatMoneyUSD0(kpis.totalRevenue)} vs {formatMoneyUSD0(baseKpis.totalRevenue)}
                    </div>
                  </div>
                  <div>
                    <div style={{ opacity: 0.8 }}>ADR aprox</div>
                    <div style={{ fontWeight: 900 }}>
                      {formatMoneyUSD0(kpis.approxADR)} vs {formatMoneyUSD0(baseKpis.approxADR)}
                    </div>
                  </div>
                  <div>
                    <div style={{ opacity: 0.8 }}>Rooms sold</div>
                    <div style={{ fontWeight: 900 }}>
                      {formatInt(kpis.totalRoomsSold)} vs {formatInt(baseKpis.totalRoomsSold)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: "1rem" }}>
              <div style={{ fontSize: "1.15rem", fontWeight: 950, marginBottom: ".5rem" }}>
                Ranking / Resumen mensual (año {year})
              </div>

              <div className="card" style={{ borderRadius: 18, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "rgba(0,0,0,.08)" }}>
                      <th style={{ textAlign: "left", padding: ".6rem .75rem" }}>Mes</th>
                      <th style={{ textAlign: "right", padding: ".6rem .75rem" }}>Días</th>
                      <th style={{ textAlign: "right", padding: ".6rem .75rem" }}>Ocupación prom</th>
                      <th style={{ textAlign: "right", padding: ".6rem .75rem" }}>Revenue</th>
                      <th style={{ textAlign: "right", padding: ".6rem .75rem" }}>ADR aprox</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthAgg.map((m) => (
                      <tr key={m.month} style={{ borderTop: "1px solid rgba(0,0,0,.08)" }}>
                        <td style={{ padding: ".55rem .75rem", fontWeight: 900 }}>{m.month}</td>
                        <td style={{ padding: ".55rem .75rem", textAlign: "right" }}>{m.days}</td>
                        <td style={{ padding: ".55rem .75rem", textAlign: "right" }}>{formatPct01(m.kpis.avgOcc)}</td>
                        <td style={{ padding: ".55rem .75rem", textAlign: "right" }}>{formatMoneyUSD0(m.kpis.totalRevenue)}</td>
                        <td style={{ padding: ".55rem .75rem", textAlign: "right" }}>{formatMoneyUSD0(m.kpis.approxADR)}</td>
                      </tr>
                    ))}
                    {monthAgg.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ padding: ".75rem", opacity: 0.85 }}>
                          Sin filas para armar ranking mensual con los filtros actuales.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: ".9rem", opacity: 0.85, fontSize: ".95rem" }}>
                Nota (Fase 1): la ocupación se calcula como <b>promedio diario de Occ.%</b> para asegurar valores válidos (≤ 100%).
                En Fase 2 la pasamos a ponderada si definimos “rooms available” con precisión.
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
