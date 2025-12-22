// app/components/YearComparator.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import HighlightsCarousel from "./HighlightsCarousel";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";
import { normalizeHofRows, readCsvFromPublic, HofNormalized, toNumberLoose, toPercentNumber } from "./csvClient";

/* =========================
   Config de paths
========================= */
const HOF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

/* =========================
   Hoteles / grupos
========================= */
type GlobalHotel = "ALL" | "JCR" | "MARRIOTT" | "SHERATON_BCR" | "SHERATON_MDQ" | "SHERATONS" | "MAITEI";

const HOTEL_LABEL: Record<GlobalHotel, string> = {
  ALL: "Todos",
  JCR: "Grupo JCR (3 hoteles)",
  MARRIOTT: "Marriott",
  SHERATON_BCR: "Sheraton BCR",
  SHERATON_MDQ: "Sheraton MDQ",
  SHERATONS: "Sheratons (BCR + MDQ)",
  MAITEI: "Maitei (Gotel)",
};

const HOTEL_LIST: Record<GlobalHotel, string[]> = {
  ALL: ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ", "MAITEI"],
  JCR: ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"],
  MARRIOTT: ["MARRIOTT"],
  SHERATON_BCR: ["SHERATON BCR"],
  SHERATON_MDQ: ["SHERATON MDQ"],
  SHERATONS: ["SHERATON BCR", "SHERATON MDQ"],
  MAITEI: ["MAITEI"],
};

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/* =========================
   Utils
========================= */
function fmtNumber(n: number | null | undefined, digits = 0) {
  if (!Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("es-AR", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
function fmtMoney(n: number | null | undefined) {
  if (!Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function pct(n: number | null | undefined, digits = 1) {
  if (!Number.isFinite(Number(n))) return "—";
  const v = Math.max(0, Math.min(100, Number(n)));
  return `${fmtNumber(v, digits)}%`;
}

function upper(s: any) {
  return String(s ?? "").trim().toUpperCase();
}

function filterByHotelYear(rows: HofNormalized[], year: number, hotel: GlobalHotel) {
  const set = new Set(HOTEL_LIST[hotel].map((h) => upper(h)));
  return rows.filter((r) => r.year === year && set.has(upper(r.empresa)));
}

function aggregateMonthly(rows: HofNormalized[]) {
  // Por mes: promedios de occ/adr y sumas de revenue/roomsOcc
  const byMonth: Record<number, { occVals: number[]; adrVals: number[]; roomRev: number; roomsOcc: number; n: number }> = {};
  for (let m = 1; m <= 12; m++) {
    byMonth[m] = { occVals: [], adrVals: [], roomRev: 0, roomsOcc: 0, n: 0 };
  }

  rows.forEach((r) => {
    const m = r.month;
    if (!m || m < 1 || m > 12) return;
    byMonth[m].n += 1;

    if (Number.isFinite(r.occPct as number)) byMonth[m].occVals.push(r.occPct as number);
    if (Number.isFinite(r.adr as number)) byMonth[m].adrVals.push(r.adr as number);

    if (Number.isFinite(r.roomRevenue as number)) byMonth[m].roomRev += r.roomRevenue as number;
    if (Number.isFinite(r.roomsOcc as number)) byMonth[m].roomsOcc += r.roomsOcc as number;
  });

  const result = [];
  for (let m = 1; m <= 12; m++) {
    const occAvg = byMonth[m].occVals.length ? byMonth[m].occVals.reduce((a, b) => a + b, 0) / byMonth[m].occVals.length : null;
    const adrAvg = byMonth[m].adrVals.length ? byMonth[m].adrVals.reduce((a, b) => a + b, 0) / byMonth[m].adrVals.length : null;
    const revpar = (occAvg !== null && adrAvg !== null) ? (adrAvg * occAvg) / 100 : null;

    result.push({
      month: m,
      monthLabel: MONTHS[m - 1],
      n: byMonth[m].n,
      occAvg,
      adrAvg,
      revpar,
      roomRev: byMonth[m].roomRev || null,
      roomsOcc: byMonth[m].roomsOcc || null,
    });
  }
  return result;
}

function sumSafe(arr: Array<number | null | undefined>) {
  const vals = arr.filter((x): x is number => Number.isFinite(x as number));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0);
}

/* =========================
   UI helpers (responsive)
========================= */
function SectionTitle({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={{ display: "grid", gap: ".25rem" }}>
      <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
        {title}
      </div>
      {desc ? (
        <div className="sectionDesc" style={{ opacity: 0.75 }}>
          {desc}
        </div>
      ) : null}
    </div>
  );
}

function ResponsiveGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
        gap: "1rem",
      }}
    >
      {children}
    </div>
  );
}

function Col({ span, children }: { span: number; children: React.ReactNode }) {
  // span 12 = full. En mobile todo full.
  return (
    <div
      style={{
        gridColumn: "span 12 / span 12",
      }}
      className={`col-span-${span}`}
    >
      {children}
      <style jsx>{`
        @media (min-width: 900px) {
          .col-span-${span} {
            grid-column: span ${span} / span ${span};
          }
        }
      `}</style>
    </div>
  );
}

/* =========================
   Component principal
========================= */
export default function YearComparator() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [baseYear, setBaseYear] = useState<number>(currentYear - 1);
  const [globalHotel, setGlobalHotel] = useState<GlobalHotel>("JCR");

  const [hofRows, setHofRows] = useState<HofNormalized[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  // Carga CSV una sola vez
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr("");

    readCsvFromPublic(HOF_PATH)
      .then((raw) => normalizeHofRows(raw))
      .then((norm) => {
        if (!mounted) return;
        setHofRows(norm);
        setLoading(false);
      })
      .catch((e: any) => {
        if (!mounted) return;
        setErr(String(e?.message ?? e));
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Años disponibles reales (para que el filtro no quede “fijo” en un año inexistente)
  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    hofRows.forEach((r) => {
      if (typeof r.year === "number") ys.add(r.year);
    });
    return Array.from(ys).sort((a, b) => b - a);
  }, [hofRows]);

  // Si el año elegido no existe, lo acomoda
  useEffect(() => {
    if (!availableYears.length) return;
    if (!availableYears.includes(year)) setYear(availableYears[0]);
    if (!availableYears.includes(baseYear)) setBaseYear(availableYears[1] ?? (availableYears[0] - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableYears]);

  // Filtrados
  const yearRows = useMemo(() => filterByHotelYear(hofRows, year, globalHotel), [hofRows, year, globalHotel]);
  const baseRows = useMemo(() => filterByHotelYear(hofRows, baseYear, globalHotel), [hofRows, baseYear, globalHotel]);

  const monthlyYear = useMemo(() => aggregateMonthly(yearRows), [yearRows]);
  const monthlyBase = useMemo(() => aggregateMonthly(baseRows), [baseRows]);

  const totalsYear = useMemo(() => {
    const occVals = yearRows.map((r) => r.occPct).filter((v): v is number => Number.isFinite(v as number));
    const adrVals = yearRows.map((r) => r.adr).filter((v): v is number => Number.isFinite(v as number));

    const occAvg = occVals.length ? occVals.reduce((a, b) => a + b, 0) / occVals.length : null;
    const adrAvg = adrVals.length ? adrVals.reduce((a, b) => a + b, 0) / adrVals.length : null;
    const revpar = (occAvg !== null && adrAvg !== null) ? (adrAvg * occAvg) / 100 : null;

    const roomRev = sumSafe(yearRows.map((r) => r.roomRevenue));
    const roomsOcc = sumSafe(yearRows.map((r) => r.roomsOcc));
    return { occAvg, adrAvg, revpar, roomRev, roomsOcc, n: yearRows.length };
  }, [yearRows]);

  const totalsBase = useMemo(() => {
    const occVals = baseRows.map((r) => r.occPct).filter((v): v is number => Number.isFinite(v as number));
    const adrVals = baseRows.map((r) => r.adr).filter((v): v is number => Number.isFinite(v as number));

    const occAvg = occVals.length ? occVals.reduce((a, b) => a + b, 0) / occVals.length : null;
    const adrAvg = adrVals.length ? adrVals.reduce((a, b) => a + b, 0) / adrVals.length : null;
    const revpar = (occAvg !== null && adrAvg !== null) ? (adrAvg * occAvg) / 100 : null;

    const roomRev = sumSafe(baseRows.map((r) => r.roomRevenue));
    const roomsOcc = sumSafe(baseRows.map((r) => r.roomsOcc));
    return { occAvg, adrAvg, revpar, roomRev, roomsOcc, n: baseRows.length };
  }, [baseRows]);

  const delta = useMemo(() => {
    const dOcc = (totalsYear.occAvg !== null && totalsBase.occAvg !== null) ? totalsYear.occAvg - totalsBase.occAvg : null;
    const dAdr = (totalsYear.adrAvg !== null && totalsBase.adrAvg !== null) ? totalsYear.adrAvg - totalsBase.adrAvg : null;
    const dRevPar = (totalsYear.revpar !== null && totalsBase.revpar !== null) ? totalsYear.revpar - totalsBase.revpar : null;
    const dRoomRev = (totalsYear.roomRev !== null && totalsBase.roomRev !== null) ? totalsYear.roomRev - totalsBase.roomRev : null;
    return { dOcc, dAdr, dRevPar, dRoomRev };
  }, [totalsYear, totalsBase]);

  // Ranking por mes (Room Revenue)
  const rankingByMonth = useMemo(() => {
    const items = monthlyYear
      .map((m) => ({
        month: m.month,
        monthLabel: m.monthLabel,
        roomRev: m.roomRev ?? 0,
        occAvg: m.occAvg ?? 0,
        n: m.n,
      }))
      .filter((x) => x.n > 0);

    const byRevenue = [...items].sort((a, b) => b.roomRev - a.roomRev).slice(0, 6);
    const byOcc = [...items].sort((a, b) => b.occAvg - a.occAvg).slice(0, 6);

    return { byRevenue, byOcc };
  }, [monthlyYear]);

  // Membership hotel filter (regla: membership aplica filtro hotel, y soporta JCR/Sheratons/MARRIOTT)
  const membershipHotelFilter = useMemo(() => {
    // Membership se calcula para JCR/MARRIOTT/SHERATONS. Si estás en MAITEI no tiene sentido, lo mando a JCR.
    if (globalHotel === "MAITEI") return "JCR";
    if (globalHotel === "SHERATON_BCR" || globalHotel === "SHERATON_MDQ" || globalHotel === "SHERATONS") return "SHERATONS";
    if (globalHotel === "MARRIOTT") return "MARRIOTT";
    if (globalHotel === "JCR") return "JCR";
    return "JCR"; // ALL -> muestro JCR como default
  }, [globalHotel]);

  const jcrHotels = HOTEL_LIST["JCR"];
  const sherHotels = HOTEL_LIST["SHERATONS"];

  return (
    <section className="section" id="comparador">
      {/* ===== Encabezado + filtros ===== */}
      <div style={{ display: "grid", gap: ".75rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.45rem", fontWeight: 950 }}>
          Comparador anual (H&amp;F + Membership + Nacionalidades)
        </div>
        <div className="sectionDesc" style={{ opacity: 0.75 }}>
          Todo filtra por <b>Año</b> y <b>Hotel</b>. Nacionalidades usa solo Marriott (por archivo).
        </div>

        <div
          className="card"
          style={{
            padding: "1rem",
            borderRadius: 22,
            display: "grid",
            gap: ".75rem",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
              gap: ".75rem",
              alignItems: "end",
            }}
          >
            <div style={{ gridColumn: "span 12 / span 12" }}>
              <div style={{ fontSize: ".9rem", opacity: 0.8, marginBottom: ".25rem" }}>Hotel</div>
              <select
                value={globalHotel}
                onChange={(e) => setGlobalHotel(e.target.value as GlobalHotel)}
                style={{ width: "100%", padding: ".6rem .7rem", borderRadius: 14 }}
              >
                {Object.keys(HOTEL_LABEL).map((k) => (
                  <option key={k} value={k}>
                    {HOTEL_LABEL[k as GlobalHotel]}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ gridColumn: "span 6 / span 6" }}>
              <div style={{ fontSize: ".9rem", opacity: 0.8, marginBottom: ".25rem" }}>Año</div>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                style={{ width: "100%", padding: ".6rem .7rem", borderRadius: 14 }}
              >
                {availableYears.length
                  ? availableYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))
                  : [currentYear, currentYear - 1, currentYear - 2].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
              </select>
            </div>

            <div style={{ gridColumn: "span 6 / span 6" }}>
              <div style={{ fontSize: ".9rem", opacity: 0.8, marginBottom: ".25rem" }}>Comparar contra</div>
              <select
                value={baseYear}
                onChange={(e) => setBaseYear(Number(e.target.value))}
                style={{ width: "100%", padding: ".6rem .7rem", borderRadius: 14 }}
              >
                {availableYears.length
                  ? availableYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))
                  : [currentYear - 1, currentYear - 2, currentYear - 3].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", opacity: 0.75, fontSize: ".9rem" }}>
            <span>Archivo H&amp;F: <b>{HOF_PATH}</b></span>
            <span>Filtrando empresas: <b>{HOTEL_LIST[globalHotel].join(" + ")}</b></span>
          </div>
        </div>
      </div>

      {/* ===== 1) CARROUSELES KPI (por grupo) ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <SectionTitle title="KPIs principales (carrouseles)" desc="Promedios y sumas correctas (sin % imposibles)." />

        <div style={{ marginTop: ".85rem", display: "grid", gap: "1rem" }}>
          <HighlightsCarousel
            filePath={HOF_PATH}
            year={year}
            hotelList={jcrHotels}
            title={`Grupo JCR — KPIs ${year}`}
            variant="jcr"
          />

          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "minmax(0,1fr)" }}>
            <HighlightsCarousel
              filePath={HOF_PATH}
              year={year}
              hotelList={HOTEL_LIST["MARRIOTT"]}
              title={`MARRIOTT — KPIs ${year}`}
              variant="marriott"
            />

            <HighlightsCarousel
              filePath={HOF_PATH}
              year={year}
              hotelList={sherHotels}
              title={`SHERATONS (BCR+MDQ) — KPIs ${year}`}
              variant="sheratons"
            />

            <HighlightsCarousel
              filePath={HOF_PATH}
              year={year}
              hotelList={HOTEL_LIST["MAITEI"]}
              title={`MAITEI (Gotel) — KPIs ${year}`}
              variant="maitei"
            />
          </div>
        </div>
      </div>

      {/* ===== 2) DETALLE MENSUAL H&F (tabla) ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <SectionTitle
          title="H&F — detalle mensual"
          desc="Ocupación/ADR/RevPAR (prom.) + Room Revenue/Rooms Occ (sum). Filtra por hotel y año."
        />

        <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 22 }}>
          {loading ? (
            <div>Cargando H&amp;F…</div>
          ) : err ? (
            <div>Error: {err}</div>
          ) : yearRows.length === 0 ? (
            <div>Sin filas H&amp;F para {HOTEL_LABEL[globalHotel]} en {year}. (Chequeá columna Empresa)</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", opacity: 0.75, fontSize: ".9rem" }}>
                <span>Filas año: <b>{totalsYear.n}</b></span>
                <span>Filas base: <b>{totalsBase.n}</b></span>
              </div>

              <div style={{ overflowX: "auto", marginTop: ".75rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                  <thead>
                    <tr style={{ textAlign: "left", opacity: 0.8 }}>
                      <th style={{ padding: ".5rem .4rem" }}>Mes</th>
                      <th style={{ padding: ".5rem .4rem" }}>Ocupación</th>
                      <th style={{ padding: ".5rem .4rem" }}>ADR</th>
                      <th style={{ padding: ".5rem .4rem" }}>RevPAR</th>
                      <th style={{ padding: ".5rem .4rem" }}>Room Rev</th>
                      <th style={{ padding: ".5rem .4rem" }}>Rooms Occ</th>
                      <th style={{ padding: ".5rem .4rem" }}>Filas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyYear.map((m) => (
                      <tr key={m.month} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                        <td style={{ padding: ".55rem .4rem", fontWeight: 900 }}>{m.monthLabel}</td>
                        <td style={{ padding: ".55rem .4rem" }}>{pct(m.occAvg)}</td>
                        <td style={{ padding: ".55rem .4rem" }}>{fmtMoney(m.adrAvg)}</td>
                        <td style={{ padding: ".55rem .4rem" }}>{fmtMoney(m.revpar)}</td>
                        <td style={{ padding: ".55rem .4rem" }}>{fmtMoney(m.roomRev)}</td>
                        <td style={{ padding: ".55rem .4rem" }}>{fmtNumber(m.roomsOcc)}</td>
                        <td style={{ padding: ".55rem .4rem", opacity: 0.75 }}>{m.n}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: "1px solid rgba(255,255,255,.15)" }}>
                      <td style={{ padding: ".65rem .4rem", fontWeight: 950 }}>Total/Prom</td>
                      <td style={{ padding: ".65rem .4rem", fontWeight: 900 }}>{pct(totalsYear.occAvg)}</td>
                      <td style={{ padding: ".65rem .4rem", fontWeight: 900 }}>{fmtMoney(totalsYear.adrAvg)}</td>
                      <td style={{ padding: ".65rem .4rem", fontWeight: 900 }}>{fmtMoney(totalsYear.revpar)}</td>
                      <td style={{ padding: ".65rem .4rem", fontWeight: 900 }}>{fmtMoney(totalsYear.roomRev)}</td>
                      <td style={{ padding: ".65rem .4rem", fontWeight: 900 }}>{fmtNumber(totalsYear.roomsOcc)}</td>
                      <td style={{ padding: ".65rem .4rem", opacity: 0.75 }}>{totalsYear.n}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== 3) COMPARATIVA (AÑO vs BASE) ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <SectionTitle title={`Comparativa ${year} vs ${baseYear}`} desc="Delta mensual y delta total (para no perder lo que ya tenías)." />

        <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 22 }}>
          {(!totalsYear.n || !totalsBase.n) ? (
            <div>Sin datos suficientes para comparativa con los filtros actuales.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
                <div style={{ padding: ".75rem .9rem", borderRadius: 16, border: "1px solid rgba(255,255,255,.10)" }}>
                  <div style={{ opacity: 0.75, fontSize: ".85rem" }}>Δ Ocupación</div>
                  <div style={{ fontWeight: 950, fontSize: "1.2rem" }}>{delta.dOcc !== null ? `${fmtNumber(delta.dOcc, 1)} pp` : "—"}</div>
                </div>
                <div style={{ padding: ".75rem .9rem", borderRadius: 16, border: "1px solid rgba(255,255,255,.10)" }}>
                  <div style={{ opacity: 0.75, fontSize: ".85rem" }}>Δ ADR</div>
                  <div style={{ fontWeight: 950, fontSize: "1.2rem" }}>{delta.dAdr !== null ? fmtMoney(delta.dAdr) : "—"}</div>
                </div>
                <div style={{ padding: ".75rem .9rem", borderRadius: 16, border: "1px solid rgba(255,255,255,.10)" }}>
                  <div style={{ opacity: 0.75, fontSize: ".85rem" }}>Δ RevPAR</div>
                  <div style={{ fontWeight: 950, fontSize: "1.2rem" }}>{delta.dRevPar !== null ? fmtMoney(delta.dRevPar) : "—"}</div>
                </div>
                <div style={{ padding: ".75rem .9rem", borderRadius: 16, border: "1px solid rgba(255,255,255,.10)" }}>
                  <div style={{ opacity: 0.75, fontSize: ".85rem" }}>Δ Room Revenue</div>
                  <div style={{ fontWeight: 950, fontSize: "1.2rem" }}>{delta.dRoomRev !== null ? fmtMoney(delta.dRoomRev) : "—"}</div>
                </div>
              </div>

              <div style={{ overflowX: "auto", marginTop: "1rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                  <thead>
                    <tr style={{ textAlign: "left", opacity: 0.8 }}>
                      <th style={{ padding: ".5rem .4rem" }}>Mes</th>
                      <th style={{ padding: ".5rem .4rem" }}>{year} Occ</th>
                      <th style={{ padding: ".5rem .4rem" }}>{baseYear} Occ</th>
                      <th style={{ padding: ".5rem .4rem" }}>Δ pp</th>
                      <th style={{ padding: ".5rem .4rem" }}>{year} Room Rev</th>
                      <th style={{ padding: ".5rem .4rem" }}>{baseYear} Room Rev</th>
                      <th style={{ padding: ".5rem .4rem" }}>Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyYear.map((m) => {
                      const b = monthlyBase.find((x) => x.month === m.month);
                      const dOcc = (m.occAvg !== null && b?.occAvg !== null) ? (m.occAvg - (b?.occAvg ?? 0)) : null;
                      const dRev = (m.roomRev !== null && b?.roomRev !== null) ? (m.roomRev - (b?.roomRev ?? 0)) : null;

                      return (
                        <tr key={m.month} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                          <td style={{ padding: ".55rem .4rem", fontWeight: 900 }}>{m.monthLabel}</td>
                          <td style={{ padding: ".55rem .4rem" }}>{pct(m.occAvg)}</td>
                          <td style={{ padding: ".55rem .4rem" }}>{pct(b?.occAvg ?? null)}</td>
                          <td style={{ padding: ".55rem .4rem", fontWeight: 900 }}>{dOcc !== null ? `${fmtNumber(dOcc, 1)} pp` : "—"}</td>
                          <td style={{ padding: ".55rem .4rem" }}>{fmtMoney(m.roomRev)}</td>
                          <td style={{ padding: ".55rem .4rem" }}>{fmtMoney(b?.roomRev ?? null)}</td>
                          <td style={{ padding: ".55rem .4rem", fontWeight: 900 }}>{dRev !== null ? fmtMoney(dRev) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== 4) RANKING POR MES ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <SectionTitle title="Ranking por mes" desc="Top meses por Room Revenue y por Ocupación (prom.)." />

        <div style={{ marginTop: ".85rem" }}>
          <ResponsiveGrid>
            <Col span={6}>
              <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
                <div style={{ fontWeight: 950 }}>Top meses por Room Revenue ({year})</div>
                <div style={{ marginTop: ".75rem", display: "grid", gap: ".5rem" }}>
                  {rankingByMonth.byRevenue.length ? rankingByMonth.byRevenue.map((x, idx) => (
                    <div key={x.month} style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", alignItems: "center" }}>
                      <div style={{ fontWeight: 900 }}>{idx + 1}. {x.monthLabel}</div>
                      <div style={{ fontWeight: 950 }}>{fmtMoney(x.roomRev)}</div>
                    </div>
                  )) : <div style={{ opacity: 0.75 }}>Sin ranking (sin filas por mes).</div>}
                </div>
              </div>
            </Col>

            <Col span={6}>
              <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
                <div style={{ fontWeight: 950 }}>Top meses por Ocupación ({year})</div>
                <div style={{ marginTop: ".75rem", display: "grid", gap: ".5rem" }}>
                  {rankingByMonth.byOcc.length ? rankingByMonth.byOcc.map((x, idx) => (
                    <div key={x.month} style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", alignItems: "center" }}>
                      <div style={{ fontWeight: 900 }}>{idx + 1}. {x.monthLabel}</div>
                      <div style={{ fontWeight: 950 }}>{pct(x.occAvg)}</div>
                    </div>
                  )) : <div style={{ opacity: 0.75 }}>Sin ranking (sin filas por mes).</div>}
                </div>
              </div>
            </Col>
          </ResponsiveGrid>
        </div>
      </div>

      {/* ===== 5) MEMBERSHIP (usa filtros globales) ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <SectionTitle title="Membership (JCR)" desc="Cantidades + gráficos. Usa filtro global de año + hotel (JCR/MARRIOTT/SHERATONS)." />

        <div style={{ marginTop: ".85rem" }}>
          <MembershipSummary
            year={year}
            baseYear={baseYear}
            allowedHotels={jcrHotels}
            filePath={MEMBERSHIP_PATH}
            title={`Membership (${membershipHotelFilter}) — Acumulado ${year} · vs ${baseYear}`}
            hotelFilter={membershipHotelFilter as any}
            compactCharts={true}
          />
        </div>
      </div>

      {/* ===== 6) NACIONALIDADES (solo Marriott) ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <SectionTitle title="Nacionalidades" desc="Ranking por país + distribución por continente. (Archivo Marriott). Usa filtro global de año." />

        <div style={{ marginTop: ".85rem" }}>
          <CountryRanking year={year} filePath={NACIONALIDADES_PATH} />
        </div>
      </div>

      {/* ===== Debug útil (lo podés borrar después) ===== */}
      <div style={{ marginTop: "1.25rem", opacity: 0.65, fontSize: ".85rem" }}>
        Debug: yearRows={yearRows.length} · baseRows={baseRows.length} · hoteles={HOTEL_LIST[globalHotel].join(", ")}
      </div>
    </section>
  );
}
