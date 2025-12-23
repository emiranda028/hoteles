// app/components/YearComparator.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  formatInt,
  formatMoney,
  formatPct,
  parseFechaSmart,
  readCsvFromPublic,
  safeDiv,
  toNumberSmart,
  toPercent01,
} from "./csvClient";

// Componentes existentes en tu proyecto
import HighlightsCarousel from "./HighlightsCarousel";
import HofSummary from "./HofSummary";
import HofExplorer from "./HofExplorer";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

type GlobalHotel = "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

const JCR_HOTELS: GlobalHotel[] = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
const MAITEI_HOTELS: GlobalHotel[] = ["MAITEI"];

const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function pillStyle(bg: string, fg: string) {
  return {
    background: bg,
    color: fg,
    border: "1px solid rgba(255,255,255,.35)",
    borderRadius: 999,
    padding: ".55rem .9rem",
    fontWeight: 800,
    letterSpacing: ".2px",
    outline: "none",
  } as React.CSSProperties;
}

function selectStyle(bg: string, fg: string) {
  return {
    background: bg,
    color: fg,
    border: "1px solid rgba(255,255,255,.4)",
    borderRadius: 14,
    padding: ".55rem .75rem",
    fontWeight: 800,
    outline: "none",
  } as React.CSSProperties;
}

type HfRow = Record<string, any>;

function pickKey(keys: string[], options: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const map = new Map(keys.map((k) => [norm(k), k]));
  for (const o of options) {
    const hit = map.get(norm(o));
    if (hit) return hit;
  }
  // fallback por includes
  for (const k of keys) {
    const nk = norm(k);
    for (const o of options) {
      const no = norm(o);
      if (nk.includes(no)) return k;
    }
  }
  return null;
}

function normalizeEmpresa(v: any): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function asHotelEmpresa(h: GlobalHotel): string {
  // el CSV trae Empresa con estos valores (según tus capturas)
  if (h === "MARRIOTT") return "MARRIOTT";
  if (h === "SHERATON BCR") return "SHERATON BCR";
  if (h === "SHERATON MDQ") return "SHERATON MDQ";
  return "MAITEI";
}

function getYear(d: Date | null): number | null {
  if (!d) return null;
  const y = d.getFullYear();
  return Number.isFinite(y) ? y : null;
}
function getMonthIdx(d: Date | null): number | null {
  if (!d) return null;
  const m = d.getMonth();
  return Number.isFinite(m) ? m : null;
}

export default function YearComparator() {
  // ====== filtros globales JCR ======
  const [year, setYear] = useState<number>(2024);
  const [baseYear, setBaseYear] = useState<number>(2023);
  const [globalHotel, setGlobalHotel] = useState<GlobalHotel>("MARRIOTT");

  // ====== filtros bloque MAITEI ======
  const [maiteiYear, setMaiteiYear] = useState<number>(2024);
  const [maiteiBaseYear, setMaiteiBaseYear] = useState<number>(2023);
  const [maiteiHotel, setMaiteiHotel] = useState<GlobalHotel>("MAITEI");

  // ====== data H&F para comparativa + ranking ======
  const [hfRows, setHfRows] = useState<HfRow[]>([]);
  const [hfLoading, setHfLoading] = useState(true);
  const [hfErr, setHfErr] = useState("");

  useEffect(() => {
    let alive = true;
    setHfLoading(true);
    setHfErr("");

    readCsvFromPublic(HF_PATH)
      .then((rows) => {
        if (!alive) return;
        setHfRows(rows as HfRow[]);
        setHfLoading(false);
      })
      .catch((e: any) => {
        if (!alive) return;
        setHfErr(e?.message || "Error leyendo H&F");
        setHfLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const hfKeys = useMemo(() => (hfRows[0] ? Object.keys(hfRows[0]) : []), [hfRows]);

  const kEmpresa = useMemo(() => pickKey(hfKeys, ["Empresa"]), [hfKeys]);
  const kFecha = useMemo(() => pickKey(hfKeys, ["Fecha", "Date"]), [hfKeys]);
  const kHof = useMemo(() => pickKey(hfKeys, ["HoF", "Hof"]), [hfKeys]);

  const kOccPct = useMemo(() => pickKey(hfKeys, ['Occ.%', "Occ%", "Occ. %", "Occ"]), [hfKeys]);
  const kADR = useMemo(() => pickKey(hfKeys, ["Average Rate", "ADR", "Avg Rate"]), [hfKeys]);
  const kRoomRev = useMemo(() => pickKey(hfKeys, ["Room Revenue", "RoomRevenue", "Room Rev"]), [hfKeys]);
  const kTotalOcc = useMemo(() => pickKey(hfKeys, ['Total\nOcc.', "Total Occ.", "Total Occ", "TotalOcc"]), [hfKeys]);

  function filterHfFor(hotel: GlobalHotel, y: number): HfRow[] {
    if (!kEmpresa || !kFecha) return [];
    const emp = asHotelEmpresa(hotel);

    return hfRows.filter((r) => {
      const empR = normalizeEmpresa(r[kEmpresa]);
      if (empR !== emp) return false;

      // si querés SOLO History/Forecast podés ajustar acá:
      // por ahora usamos ambos (History + Forecast) porque vos querés que traiga todo
      // pero si te rompe algo, lo volvemos a separar.
      if (kHof && r[kHof]) {
        // lo dejamos pasar igual
      }

      const d = parseFechaSmart(r[kFecha]);
      const yy = getYear(d);
      return yy === y;
    });
  }

  function monthAgg(rows: HfRow[]) {
    // agregación por mes (0-11)
    const byM = Array.from({ length: 12 }, () => ({
      days: 0,
      occPctSum: 0,
      adrSum: 0,
      roomRevSum: 0,
      totalOccSum: 0,
    }));

    for (const r of rows) {
      const d = kFecha ? parseFechaSmart(r[kFecha]) : null;
      const m = getMonthIdx(d);
      if (m === null) continue;

      const occ = kOccPct ? toPercent01(toNumberSmart(r[kOccPct])) : 0;
      const adr = kADR ? toNumberSmart(r[kADR]) : 0;
      const rev = kRoomRev ? toNumberSmart(r[kRoomRev]) : 0;
      const tocc = kTotalOcc ? toNumberSmart(r[kTotalOcc]) : 0;

      byM[m].days += 1;
      byM[m].occPctSum += occ;
      byM[m].adrSum += adr;
      byM[m].roomRevSum += rev;
      byM[m].totalOccSum += tocc;
    }

    return byM.map((m) => ({
      days: m.days,
      occAvg: m.days ? clamp01(m.occPctSum / m.days) : 0,
      adrAvg: m.days ? m.adrSum / m.days : 0,
      roomRev: m.roomRevSum,
      totalOcc: m.totalOccSum,
    }));
  }

  const jcrYearRows = useMemo(() => filterHfFor(globalHotel, year), [hfRows, globalHotel, year, kEmpresa, kFecha]);
  const jcrBaseRows = useMemo(() => filterHfFor(globalHotel, baseYear), [hfRows, globalHotel, baseYear, kEmpresa, kFecha]);

  const jcrYearByMonth = useMemo(() => monthAgg(jcrYearRows), [jcrYearRows, kOccPct, kADR, kRoomRev, kTotalOcc, kFecha]);
  const jcrBaseByMonth = useMemo(() => monthAgg(jcrBaseRows), [jcrBaseRows, kOccPct, kADR, kRoomRev, kTotalOcc, kFecha]);

  const jcrKpis = useMemo(() => {
    const y = jcrYearByMonth.reduce(
      (acc, m) => {
        acc.days += m.days;
        acc.occ += m.occAvg * (m.days || 0);
        acc.adr += m.adrAvg * (m.days || 0);
        acc.rev += m.roomRev;
        acc.occRooms += m.totalOcc;
        return acc;
      },
      { days: 0, occ: 0, adr: 0, rev: 0, occRooms: 0 }
    );

    const occAvg = y.days ? y.occ / y.days : 0;
    const adrAvg = y.days ? y.adr / y.days : 0;

    return {
      occAvg: clamp01(occAvg),
      adrAvg,
      roomRev: y.rev,
      totalOcc: y.occRooms,
    };
  }, [jcrYearByMonth]);

  const jcrRankingMonths = useMemo(() => {
    // ranking de meses por Room Revenue (año seleccionado)
    const items = jcrYearByMonth
      .map((m, idx) => ({
        idx,
        name: monthNames[idx],
        roomRev: m.roomRev,
        occAvg: m.occAvg,
        adrAvg: m.adrAvg,
        totalOcc: m.totalOcc,
      }))
      .filter((x) => x.roomRev > 0 || x.totalOcc > 0 || x.occAvg > 0);

    items.sort((a, b) => b.roomRev - a.roomRev);
    return items.slice(0, 12);
  }, [jcrYearByMonth]);

  // wrappers any para no pelear con Props cuando cambian
  const HighlightsCarouselAny = HighlightsCarousel as any;
  const HofSummaryAny = HofSummary as any;
  const HofExplorerAny = HofExplorer as any;
  const MembershipSummaryAny = MembershipSummary as any;
  const CountryRankingAny = CountryRanking as any;

  const showJcr = globalHotel !== "MAITEI";
  const showMaitei = true;

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      {/* =======================
          BLOQUE JCR (grupo)
      ======================= */}
      <section className="section" id="jcr" style={{ display: showJcr ? "block" : "none" }}>
        {/* Sticky filtros JCR */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            background: "linear-gradient(90deg, #7d0f0f, #b01616)",
            borderRadius: 18,
            padding: "1rem",
            boxShadow: "0 10px 30px rgba(0,0,0,.18)",
          }}
        >
          <div style={{ display: "grid", gap: ".75rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
              <div style={{ color: "white", fontSize: "1.2rem", fontWeight: 950 }}>
                Grupo JCR — Dashboard
              </div>

              <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                <span style={pillStyle("rgba(255,255,255,.12)", "white")}>Filtros globales</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
              <label style={{ color: "white", fontWeight: 900, display: "grid", gap: ".25rem" }}>
                Hotel
                <select
                  value={globalHotel}
                  onChange={(e) => setGlobalHotel(e.target.value as GlobalHotel)}
                  style={selectStyle("rgba(255,255,255,.14)", "white")}
                >
                  <option value="MARRIOTT">MARRIOTT</option>
                  <option value="SHERATON BCR">SHERATON BCR</option>
                  <option value="SHERATON MDQ">SHERATON MDQ</option>
                </select>
              </label>

              <label style={{ color: "white", fontWeight: 900, display: "grid", gap: ".25rem" }}>
                Año
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  style={selectStyle("rgba(255,255,255,.14)", "white")}
                />
              </label>

              <label style={{ color: "white", fontWeight: 900, display: "grid", gap: ".25rem" }}>
                Comparar vs
                <input
                  type="number"
                  value={baseYear}
                  onChange={(e) => setBaseYear(Number(e.target.value))}
                  style={selectStyle("rgba(255,255,255,.14)", "white")}
                />
              </label>
            </div>
          </div>
        </div>

        {/* ====== KPIs (Carrousel) ====== */}
        <div style={{ marginTop: "1rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            KPIs principales (H&F)
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Basado en <b>hf_diario.csv</b> filtrado por Hotel + Año.
          </div>

          <div style={{ marginTop: ".75rem", display: "grid", gap: ".75rem" }}>
            {/* Si tu HighlightsCarousel funciona, lo dejamos. Si no, igual te muestro KPIs locales */}
            <div style={{ display: "none" }}>
              <HighlightsCarouselAny year={year} filePath={HF_PATH} hotelFilter={globalHotel} />
            </div>

            <div
              className="card"
              style={{
                borderRadius: 18,
                padding: "1rem",
                border: "1px solid rgba(255,255,255,.10)",
                background: "rgba(0,0,0,.18)",
              }}
            >
              {hfLoading ? (
                <div style={{ opacity: 0.85 }}>Cargando KPIs…</div>
              ) : hfErr ? (
                <div style={{ opacity: 0.9 }}>Error: {hfErr}</div>
              ) : (
                <div style={{ display: "flex", gap: ".75rem", overflowX: "auto", paddingBottom: ".25rem" }}>
                  <div style={{ minWidth: 220, padding: ".85rem", borderRadius: 16, background: "rgba(255,255,255,.06)" }}>
                    <div style={{ fontWeight: 900, opacity: 0.9 }}>Ocupación prom.</div>
                    <div style={{ fontSize: "1.6rem", fontWeight: 950 }}>{formatPct(jcrKpis.occAvg)}</div>
                    <div style={{ opacity: 0.75, marginTop: ".25rem" }}>Promedio diario (no suma)</div>
                  </div>

                  <div style={{ minWidth: 220, padding: ".85rem", borderRadius: 16, background: "rgba(255,255,255,.06)" }}>
                    <div style={{ fontWeight: 900, opacity: 0.9 }}>ADR prom.</div>
                    <div style={{ fontSize: "1.6rem", fontWeight: 950 }}>{formatMoney(jcrKpis.adrAvg)}</div>
                    <div style={{ opacity: 0.75, marginTop: ".25rem" }}>Promedio diario</div>
                  </div>

                  <div style={{ minWidth: 220, padding: ".85rem", borderRadius: 16, background: "rgba(255,255,255,.06)" }}>
                    <div style={{ fontWeight: 900, opacity: 0.9 }}>Room Revenue</div>
                    <div style={{ fontSize: "1.6rem", fontWeight: 950 }}>{formatMoney(jcrKpis.roomRev)}</div>
                    <div style={{ opacity: 0.75, marginTop: ".25rem" }}>Suma del año</div>
                  </div>

                  <div style={{ minWidth: 220, padding: ".85rem", borderRadius: 16, background: "rgba(255,255,255,.06)" }}>
                    <div style={{ fontWeight: 900, opacity: 0.9 }}>Rooms Occ.</div>
                    <div style={{ fontSize: "1.6rem", fontWeight: 950 }}>{formatInt(jcrKpis.totalOcc)}</div>
                    <div style={{ opacity: 0.75, marginTop: ".25rem" }}>Suma Total Occ.</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ====== Comparativa mensual ====== */}
        <div style={{ marginTop: "1.25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            Comparativa mensual ({year} vs {baseYear})
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Ocupación prom., ADR prom. y Room Revenue por mes.
          </div>

          <div className="card" style={{ marginTop: ".75rem", padding: "1rem", borderRadius: 18 }}>
            {hfLoading ? (
              <div style={{ opacity: 0.85 }}>Cargando comparativa…</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".95rem" }}>
                  <thead>
                    <tr style={{ textAlign: "left", opacity: 0.85 }}>
                      <th style={{ padding: ".5rem .4rem" }}>Mes</th>
                      <th style={{ padding: ".5rem .4rem" }}>Occ {year}</th>
                      <th style={{ padding: ".5rem .4rem" }}>Occ {baseYear}</th>
                      <th style={{ padding: ".5rem .4rem" }}>Δ</th>
                      <th style={{ padding: ".5rem .4rem" }}>ADR {year}</th>
                      <th style={{ padding: ".5rem .4rem" }}>ADR {baseYear}</th>
                      <th style={{ padding: ".5rem .4rem" }}>RoomRev {year}</th>
                      <th style={{ padding: ".5rem .4rem" }}>RoomRev {baseYear}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthNames.map((m, idx) => {
                      const a = jcrYearByMonth[idx];
                      const b = jcrBaseByMonth[idx];
                      const deltaOcc = a.days && b.days ? a.occAvg - b.occAvg : 0;

                      return (
                        <tr key={m} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                          <td style={{ padding: ".55rem .4rem", fontWeight: 900 }}>{m}</td>
                          <td style={{ padding: ".55rem .4rem" }}>{a.days ? formatPct(a.occAvg) : "-"}</td>
                          <td style={{ padding: ".55rem .4rem" }}>{b.days ? formatPct(b.occAvg) : "-"}</td>
                          <td style={{ padding: ".55rem .4rem", fontWeight: 900 }}>{a.days && b.days ? formatPct(deltaOcc) : "-"}</td>
                          <td style={{ padding: ".55rem .4rem" }}>{a.days ? formatMoney(a.adrAvg) : "-"}</td>
                          <td style={{ padding: ".55rem .4rem" }}>{b.days ? formatMoney(b.adrAvg) : "-"}</td>
                          <td style={{ padding: ".55rem .4rem" }}>{a.roomRev ? formatMoney(a.roomRev) : "-"}</td>
                          <td style={{ padding: ".55rem .4rem" }}>{b.roomRev ? formatMoney(b.roomRev) : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* debug liviano si alguna vez no trae filas */}
                {!hfLoading && !hfErr && jcrYearRows.length === 0 && (
                  <div style={{ marginTop: ".85rem", opacity: 0.85 }}>
                    Sin filas H&F para {globalHotel} en {year}. (Empresa detectada: <b>{kEmpresa ?? "?"}</b>, Fecha: <b>{kFecha ?? "?"}</b>)
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ====== Ranking por mes (Room Revenue) ====== */}
        <div style={{ marginTop: "1.25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            Ranking por mes (Room Revenue)
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Ordena los meses del año {year} por mayor Room Revenue (para tener “ranking por mes” de nuevo).
          </div>

          <div className="card" style={{ marginTop: ".75rem", padding: "1rem", borderRadius: 18 }}>
            {hfLoading ? (
              <div style={{ opacity: 0.85 }}>Cargando ranking…</div>
            ) : jcrRankingMonths.length === 0 ? (
              <div style={{ opacity: 0.85 }}>Sin datos.</div>
            ) : (
              <div style={{ display: "grid", gap: ".5rem" }}>
                {jcrRankingMonths.map((x, i) => (
                  <div
                    key={x.idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: ".75rem",
                      padding: ".65rem .75rem",
                      borderRadius: 14,
                      background: "rgba(255,255,255,.06)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: ".65rem" }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 10,
                          display: "grid",
                          placeItems: "center",
                          background: "rgba(255,255,255,.14)",
                          fontWeight: 950,
                        }}
                      >
                        {i + 1}
                      </div>
                      <div style={{ fontWeight: 950 }}>{x.name}</div>
                      <div style={{ opacity: 0.8, fontWeight: 800 }}>
                        Occ {formatPct(x.occAvg)} · ADR {formatMoney(x.adrAvg)}
                      </div>
                    </div>

                    <div style={{ fontWeight: 950 }}>{formatMoney(x.roomRev)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ====== History & Forecast Summary (tu componente) ====== */}
        <div style={{ marginTop: "1.25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            History & Forecast — Resumen
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Detalle por mes / indicadores derivados (según tu componente HofSummary).
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <HofSummaryAny year={year} baseYear={baseYear} filePath={HF_PATH} hotelFilter={globalHotel} />
          </div>
        </div>

        {/* ====== Explorer mensual (tu componente) ====== */}
        <div style={{ marginTop: "1.25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            History & Forecast — Detalle
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Tabla del mes seleccionado (según tu componente HofExplorer).
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <HofExplorerAny year={year} filePath={HF_PATH} hotelFilter={globalHotel} />
          </div>
        </div>

        {/* ====== Membership (JCR) ====== */}
        <div style={{ marginTop: "1.25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            Membership (JCR)
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Cantidades + gráficos. Usa filtros globales de año + hotel (JCR).
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <MembershipSummaryAny
              year={year}
              baseYear={baseYear}
              filePath={MEMBERSHIP_PATH}
              hotelFilter={globalHotel === "MAITEI" ? "MARRIOTT" : globalHotel}
              compactCharts={true}
            />
          </div>
        </div>

        {/* ====== Nacionalidades (solo Marriott) ====== */}
        <div style={{ marginTop: "1.25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
            Nacionalidades
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Ranking por país + distribución por continente. (Archivo Marriott). Usa filtro global de año.
          </div>

          <div style={{ marginTop: ".85rem" }}>
            {/* OJO: CountryRanking en tu repo a veces NO acepta hotelFilter => lo mandamos por any */}
            <CountryRankingAny year={year} filePath={NACIONALIDADES_PATH} />
          </div>
        </div>
      </section>

      {/* =======================
          BLOQUE MAITEI (Gotel)
      ======================= */}
      <section className="section" id="maitei" style={{ display: showMaitei ? "block" : "none" }}>
        <div
          style={{
            borderRadius: 18,
            padding: "1rem",
            background: "linear-gradient(90deg, #0b5f88, #0ea5c6)",
            boxShadow: "0 10px 30px rgba(0,0,0,.14)",
          }}
        >
          <div style={{ display: "grid", gap: ".75rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
              <div style={{ color: "white", fontSize: "1.2rem", fontWeight: 950 }}>
                Maitei — Management (Gotel)
              </div>
              <span style={pillStyle("rgba(255,255,255,.14)", "white")}>Filtros propios</span>
            </div>

            <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
              <label style={{ color: "white", fontWeight: 900, display: "grid", gap: ".25rem" }}>
                Unidad
                <select
                  value={maiteiHotel}
                  onChange={(e) => setMaiteiHotel(e.target.value as GlobalHotel)}
                  style={selectStyle("rgba(255,255,255,.14)", "white")}
                >
                  {MAITEI_HOTELS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ color: "white", fontWeight: 900, display: "grid", gap: ".25rem" }}>
                Año
                <input
                  type="number"
                  value={maiteiYear}
                  onChange={(e) => setMaiteiYear(Number(e.target.value))}
                  style={selectStyle("rgba(255,255,255,.14)", "white")}
                />
              </label>

              <label style={{ color: "white", fontWeight: 900, display: "grid", gap: ".25rem" }}>
                Comparar vs
                <input
                  type="number"
                  value={maiteiBaseYear}
                  onChange={(e) => setMaiteiBaseYear(Number(e.target.value))}
                  style={selectStyle("rgba(255,255,255,.14)", "white")}
                />
              </label>
            </div>
          </div>
        </div>

        {/* A futuro: tus secciones de Maitei */}
        <div style={{ marginTop: "1rem" }} className="card">
          <div style={{ padding: "1rem" }}>
            <div style={{ fontWeight: 950 }}>Bloque Maitei listo</div>
            <div style={{ opacity: 0.85, marginTop: ".35rem" }}>
              Acá enchufamos los mismos módulos (H&F, comparativas, etc.) pero filtrando por MAITEI.
            </div>

            <div style={{ marginTop: ".85rem", display: "grid", gap: ".85rem" }}>
              <HofSummaryAny year={maiteiYear} baseYear={maiteiBaseYear} filePath={HF_PATH} hotelFilter={maiteiHotel} />
              <HofExplorerAny year={maiteiYear} filePath={HF_PATH} hotelFilter={maiteiHotel} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
