// app/components/YearComparator.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CsvRow,
  formatInt,
  formatMoney,
  formatPct01,
  getMonthKey,
  getRowDate,
  getRowYear,
  mean,
  readCsvFromPublic,
  safeDiv,
  toNumberSmart,
  weekdayNameEs,
} from "./useCsvClient";

type Props = {
  filePath: string;
  year: number;
  baseYear: number;
  hotelFilter: string; // "" => todos / "MAITEI" / "MARRIOTT" / "SHERATON BCR" / "SHERATON MDQ"
};

type Agg = {
  occ01: number; // 0..1
  roomRevenue: number;
  adr: number;
  totalOcc: number;
  days: number;
};

function pick(row: CsvRow, keys: string[]): any {
  for (const k of keys) {
    if (row[k] !== undefined) return row[k];
  }
  return undefined;
}

// Normaliza headers raros con saltos de línea
function getTotalOcc(row: CsvRow): number {
  const v =
    pick(row, ['"Total\nOcc."', '"Total\r\nOcc."', "Total Occ.", "Total Occ", "Total\nOcc.", "Total\nOcc"]) ?? 0;
  return toNumberSmart(v);
}

function getOccPct(row: CsvRow): number {
  const v = pick(row, ["Occ.%", "Occ %", "Occ%", "Occ. %", "Occ"]);
  return toNumberSmart(v);
}

function getRoomRevenue(row: CsvRow): number {
  const v = pick(row, ["Room Revenue", "RoomRevenue", "Room_Revenue"]);
  return toNumberSmart(v);
}

function getADR(row: CsvRow): number {
  const v = pick(row, ["Average Rate", "ADR", "Avg Rate", "AverageRate"]);
  return toNumberSmart(v);
}

function aggregate(rows: CsvRow[]): Agg {
  const days = rows.length;

  // Occ.% no se suma (eso te daba 3800%). Se promedia.
  const occPcts = rows.map(getOccPct).filter((n) => n > 0);
  const occ01 = occPcts.length ? mean(occPcts) / 100 : 0;

  const roomRevenue = rows.reduce((s, r) => s + getRoomRevenue(r), 0);

  const totalOcc = rows.reduce((s, r) => s + getTotalOcc(r), 0);

  // ADR ponderado por totalOcc si existe, sino promedio simple
  const adrArr = rows.map(getADR).filter((n) => n > 0);
  const adr =
    totalOcc > 0
      ? safeDiv(
          rows.reduce((s, r) => s + getADR(r) * getTotalOcc(r), 0),
          totalOcc
        )
      : adrArr.length
      ? mean(adrArr)
      : 0;

  return { occ01, roomRevenue, adr, totalOcc, days };
}

function diffPct(cur: number, base: number): number {
  if (base === 0) return cur === 0 ? 0 : 1;
  return (cur - base) / base;
}

function badge(delta: number): { txt: string; good: boolean } {
  const p = (delta * 100).toFixed(1);
  if (delta > 0) return { txt: `▲ ${p}%`, good: true };
  if (delta < 0) return { txt: `▼ ${Math.abs(Number(p)).toFixed(1)}%`, good: false };
  return { txt: `= 0.0%`, good: true };
}

function cardStyle(bg: string): React.CSSProperties {
  return {
    borderRadius: 18,
    padding: "1rem",
    border: "1px solid rgba(255,255,255,.10)",
    background: bg,
    boxShadow: "0 18px 40px rgba(0,0,0,.28)",
  };
}

function kpiPill(label: string): React.CSSProperties {
  return {
    padding: ".35rem .6rem",
    borderRadius: 999,
    fontSize: ".8rem",
    border: "1px solid rgba(255,255,255,.18)",
    background: "rgba(255,255,255,.06)",
    display: "inline-flex",
    gap: ".4rem",
    alignItems: "center",
  };
}

const monthLabel: Record<string, string> = {
  "01": "Ene",
  "02": "Feb",
  "03": "Mar",
  "04": "Abr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Ago",
  "09": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dic",
};

export default function YearComparator({ filePath, year, baseYear, hotelFilter }: Props) {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // carousel
  const [slide, setSlide] = useState(0);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readCsvFromPublic(filePath)
      .then((r) => {
        if (!alive) return;
        setRows(r.rows);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message ?? "Error leyendo CSV");
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  const filteredAll = useMemo(() => {
    const hf = rows;

    // filtro por Empresa exacto
    const byHotel =
      !hotelFilter || hotelFilter.trim() === ""
        ? hf
        : hf.filter((r) => String(r["Empresa"] ?? "").trim().toUpperCase() === hotelFilter.trim().toUpperCase());

    return byHotel;
  }, [rows, hotelFilter]);

  const rowsY = useMemo(() => filteredAll.filter((r) => getRowYear(r) === Number(year)), [filteredAll, year]);
  const rowsB = useMemo(
    () => filteredAll.filter((r) => getRowYear(r) === Number(baseYear)),
    [filteredAll, baseYear]
  );

  const aggY = useMemo(() => aggregate(rowsY), [rowsY]);
  const aggB = useMemo(() => aggregate(rowsB), [rowsB]);

  const monthly = useMemo(() => {
    const map = new Map<string, CsvRow[]>();
    for (const r of rowsY) {
      const mk = getMonthKey(r);
      if (!mk) continue;
      if (!map.has(mk)) map.set(mk, []);
      map.get(mk)!.push(r);
    }
    // sort asc
    const keys = [...map.keys()].sort((a, b) => (a < b ? -1 : 1));
    return keys.map((k) => ({ key: k, rows: map.get(k)! }));
  }, [rowsY]);

  const rankingMes = useMemo(() => {
    // Ranking de meses por Room Revenue (podés cambiar a Occ% o ADR)
    const items = monthly.map((m) => {
      const a = aggregate(m.rows);
      return { key: m.key, ...a };
    });
    return items.sort((a, b) => b.roomRevenue - a.roomRevenue);
  }, [monthly]);

  const rankingDia = useMemo(() => {
    const map = new Map<string, CsvRow[]>();
    for (const r of rowsY) {
      const d = getRowDate(r);
      if (!d) continue;
      const wd = weekdayNameEs(d);
      if (!map.has(wd)) map.set(wd, []);
      map.get(wd)!.push(r);
    }
    const items = [...map.entries()].map(([day, rr]) => {
      const a = aggregate(rr);
      return { day, ...a };
    });

    // orden por revenue desc
    items.sort((a, b) => b.roomRevenue - a.roomRevenue);

    return items;
  }, [rowsY]);

  // ===== Carousel slides =====
  const slides = useMemo(() => {
    const hotelTxt = hotelFilter?.trim() ? hotelFilter : "Todos (Grupo)";
    return [
      {
        title: `Ocupación promedio ${year}`,
        value: formatPct01(aggY.occ01),
        sub: `Base ${baseYear}: ${formatPct01(aggB.occ01)} · ${badge(diffPct(aggY.occ01, aggB.occ01)).txt}`,
      },
      {
        title: `Room Revenue ${year}`,
        value: formatMoney(aggY.roomRevenue),
        sub: `Base ${baseYear}: ${formatMoney(aggB.roomRevenue)} · ${badge(diffPct(aggY.roomRevenue, aggB.roomRevenue)).txt}`,
      },
      {
        title: `ADR ${year}`,
        value: formatMoney(aggY.adr),
        sub: `Base ${baseYear}: ${formatMoney(aggB.adr)} · ${badge(diffPct(aggY.adr, aggB.adr)).txt}`,
      },
      {
        title: `Rooms Occ. (suma) ${year}`,
        value: formatInt(aggY.totalOcc),
        sub: `Base ${baseYear}: ${formatInt(aggB.totalOcc)} · ${badge(diffPct(aggY.totalOcc, aggB.totalOcc)).txt}`,
      },
      {
        title: `Período`,
        value: hotelTxt,
        sub: `${rowsY.length} filas ${year} · ${rowsB.length} filas ${baseYear}`,
      },
    ];
  }, [aggY, aggB, year, baseYear, hotelFilter, rowsY.length, rowsB.length]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSlide((s) => (s + 1) % slides.length);
    }, 3200);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [slides.length]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Cargando History & Forecast…
      </div>
    );
  }

  if (err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Error leyendo H&F: {err}
      </div>
    );
  }

  // Fondo por grupo
  const isMaitei = hotelFilter?.trim().toUpperCase() === "MAITEI";
  const accent = isMaitei
    ? "linear-gradient(135deg, rgba(0,150,255,.35), rgba(0,60,120,.45))"
    : "linear-gradient(135deg, rgba(255,60,60,.32), rgba(100,0,0,.50))";

  const headerTitle = isMaitei ? "Grupo GOTEL — Maitei" : "Grupo JCR — Gestión Hotelera";
  const headerHotel = hotelFilter?.trim() ? hotelFilter : "Todos";

  const deltaOcc = badge(diffPct(aggY.occ01, aggB.occ01));
  const deltaRev = badge(diffPct(aggY.roomRevenue, aggB.roomRevenue));
  const deltaAdr = badge(diffPct(aggY.adr, aggB.adr));

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {/* ===== Encabezado informe ===== */}
      <div style={cardStyle(accent)}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "1.25rem", fontWeight: 950 }}>{headerTitle}</div>
            <div style={{ opacity: 0.85, marginTop: ".25rem" }}>
              Informe de gestión LTELC · {headerHotel} · {year} vs {baseYear}
            </div>
          </div>

          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
            <span style={kpiPill("pill")}>
              <b>Año</b> {year}
            </span>
            <span style={kpiPill("pill")}>
              <b>Base</b> {baseYear}
            </span>
            <span style={kpiPill("pill")}>
              <b>Filas</b> {formatInt(rowsY.length)}
            </span>
          </div>
        </div>

        {/* Contacto LTELC */}
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".25rem", opacity: 0.9 }}>
          <div style={{ fontWeight: 900 }}>LTELC Consultora</div>
          <div>Correo: agencialtelc@gmail.com</div>
          <div>Web: www.lotengoenlacabeza.com.ar</div>
        </div>
      </div>

      {/* ===== Carrousel KPIs ===== */}
      <div style={{ ...cardStyle("rgba(255,255,255,.04)"), padding: "0" }}>
        <div
          style={{
            borderRadius: 18,
            padding: "1rem",
            background: accent,
            border: "1px solid rgba(255,255,255,.10)",
          }}
        >
          <div style={{ fontSize: ".9rem", opacity: 0.9, fontWeight: 800 }}>KPIs destacados (auto)</div>

          <div style={{ marginTop: ".65rem", display: "grid", gap: ".25rem" }}>
            <div style={{ fontSize: "1.2rem", fontWeight: 950 }}>{slides[slide].title}</div>
            <div style={{ fontSize: "2rem", fontWeight: 950, lineHeight: 1.1 }}>{slides[slide].value}</div>
            <div style={{ opacity: 0.9 }}>{slides[slide].sub}</div>
          </div>

          <div style={{ marginTop: ".85rem", display: "flex", gap: ".35rem" }}>
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                style={{
                  height: 10,
                  width: i === slide ? 28 : 10,
                  borderRadius: 99,
                  border: "0",
                  background: i === slide ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.35)",
                  cursor: "pointer",
                }}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ===== Comparativa principal ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(220px, 1fr))", gap: "1rem" }}>
        <div style={cardStyle("rgba(255,255,255,.04)")}>
          <div style={{ fontWeight: 950 }}>Ocupación promedio</div>
          <div style={{ marginTop: ".35rem", fontSize: "1.6rem", fontWeight: 950 }}>{formatPct01(aggY.occ01)}</div>
          <div style={{ opacity: 0.85, marginTop: ".25rem" }}>
            Base {baseYear}: {formatPct01(aggB.occ01)} ·{" "}
            <span style={{ fontWeight: 900, color: deltaOcc.good ? "#8CFFB5" : "#FF9A9A" }}>{deltaOcc.txt}</span>
          </div>
        </div>

        <div style={cardStyle("rgba(255,255,255,.04)")}>
          <div style={{ fontWeight: 950 }}>Room Revenue</div>
          <div style={{ marginTop: ".35rem", fontSize: "1.6rem", fontWeight: 950 }}>{formatMoney(aggY.roomRevenue)}</div>
          <div style={{ opacity: 0.85, marginTop: ".25rem" }}>
            Base {baseYear}: {formatMoney(aggB.roomRevenue)} ·{" "}
            <span style={{ fontWeight: 900, color: deltaRev.good ? "#8CFFB5" : "#FF9A9A" }}>{deltaRev.txt}</span>
          </div>
        </div>

        <div style={cardStyle("rgba(255,255,255,.04)")}>
          <div style={{ fontWeight: 950 }}>ADR</div>
          <div style={{ marginTop: ".35rem", fontSize: "1.6rem", fontWeight: 950 }}>{formatMoney(aggY.adr)}</div>
          <div style={{ opacity: 0.85, marginTop: ".25rem" }}>
            Base {baseYear}: {formatMoney(aggB.adr)} ·{" "}
            <span style={{ fontWeight: 900, color: deltaAdr.good ? "#8CFFB5" : "#FF9A9A" }}>{deltaAdr.txt}</span>
          </div>
        </div>
      </div>

      {/* ===== H&F por mes (tabla compacta) ===== */}
      <div style={cardStyle("rgba(255,255,255,.04)")}>
        <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>History & Forecast — por mes ({year})</div>
        <div style={{ opacity: 0.8, marginTop: ".25rem" }}>Agregación por mes (promedios correctos).</div>

        <div style={{ marginTop: ".85rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".95rem" }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.9 }}>
                <th style={{ padding: ".5rem .4rem" }}>Mes</th>
                <th style={{ padding: ".5rem .4rem" }}>Occ.%</th>
                <th style={{ padding: ".5rem .4rem" }}>Room Rev</th>
                <th style={{ padding: ".5rem .4rem" }}>ADR</th>
                <th style={{ padding: ".5rem .4rem" }}>Rooms Occ.</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => {
                const a = aggregate(m.rows);
                const [yy, mm] = m.key.split("-");
                const label = `${monthLabel[mm] ?? mm} ${yy}`;
                return (
                  <tr key={m.key} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                    <td style={{ padding: ".6rem .4rem", fontWeight: 900 }}>{label}</td>
                    <td style={{ padding: ".6rem .4rem" }}>{formatPct01(a.occ01)}</td>
                    <td style={{ padding: ".6rem .4rem" }}>{formatMoney(a.roomRevenue)}</td>
                    <td style={{ padding: ".6rem .4rem" }}>{formatMoney(a.adr)}</td>
                    <td style={{ padding: ".6rem .4rem" }}>{formatInt(a.totalOcc)}</td>
                  </tr>
                );
              })}
              {!monthly.length && (
                <tr>
                  <td style={{ padding: ".75rem .4rem", opacity: 0.85 }} colSpan={5}>
                    No hay meses para {year} con el filtro actual.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Ranking de meses ===== */}
      <div style={cardStyle("rgba(255,255,255,.04)")}>
        <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Ranking de meses (por Room Revenue)</div>
        <div style={{ opacity: 0.8, marginTop: ".25rem" }}>Top meses para priorizar decisiones comerciales.</div>

        <div style={{ marginTop: ".85rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".95rem" }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.9 }}>
                <th style={{ padding: ".5rem .4rem" }}>#</th>
                <th style={{ padding: ".5rem .4rem" }}>Mes</th>
                <th style={{ padding: ".5rem .4rem" }}>Room Rev</th>
                <th style={{ padding: ".5rem .4rem" }}>Occ.%</th>
                <th style={{ padding: ".5rem .4rem" }}>ADR</th>
              </tr>
            </thead>
            <tbody>
              {rankingMes.slice(0, 12).map((m, idx) => {
                const [yy, mm] = m.key.split("-");
                const label = `${monthLabel[mm] ?? mm} ${yy}`;
                return (
                  <tr key={m.key} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                    <td style={{ padding: ".6rem .4rem", fontWeight: 900 }}>{idx + 1}</td>
                    <td style={{ padding: ".6rem .4rem", fontWeight: 900 }}>{label}</td>
                    <td style={{ padding: ".6rem .4rem" }}>{formatMoney(m.roomRevenue)}</td>
                    <td style={{ padding: ".6rem .4rem" }}>{formatPct01(m.occ01)}</td>
                    <td style={{ padding: ".6rem .4rem" }}>{formatMoney(m.adr)}</td>
                  </tr>
                );
              })}
              {!rankingMes.length && (
                <tr>
                  <td style={{ padding: ".75rem .4rem", opacity: 0.85 }} colSpan={5}>
                    No hay ranking disponible para {year}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Ranking de días de semana ===== */}
      <div style={cardStyle("rgba(255,255,255,.04)")}>
        <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Ranking por día de la semana (para detectar dónde mejorar)</div>
        <div style={{ opacity: 0.8, marginTop: ".25rem" }}>Ordenado por Room Revenue del año seleccionado.</div>

        <div style={{ marginTop: ".85rem", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".95rem" }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.9 }}>
                <th style={{ padding: ".5rem .4rem" }}>#</th>
                <th style={{ padding: ".5rem .4rem" }}>Día</th>
                <th style={{ padding: ".5rem .4rem" }}>Room Rev</th>
                <th style={{ padding: ".5rem .4rem" }}>Occ.%</th>
                <th style={{ padding: ".5rem .4rem" }}>ADR</th>
              </tr>
            </thead>
            <tbody>
              {rankingDia.map((d, idx) => (
                <tr key={d.day} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                  <td style={{ padding: ".6rem .4rem", fontWeight: 900 }}>{idx + 1}</td>
                  <td style={{ padding: ".6rem .4rem", fontWeight: 900, textTransform: "capitalize" }}>{d.day}</td>
                  <td style={{ padding: ".6rem .4rem" }}>{formatMoney(d.roomRevenue)}</td>
                  <td style={{ padding: ".6rem .4rem" }}>{formatPct01(d.occ01)}</td>
                  <td style={{ padding: ".6rem .4rem" }}>{formatMoney(d.adr)}</td>
                </tr>
              ))}
              {!rankingDia.length && (
                <tr>
                  <td style={{ padding: ".75rem .4rem", opacity: 0.85 }} colSpan={5}>
                    No hay filas suficientes para calcular ranking por día.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
