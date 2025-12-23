"use client";

import React, { useEffect, useMemo, useState } from "react";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";
import { readCsvFromPublic, toNumberSmart, safeDiv, toPercent01, formatPct, formatMoney } from "./csvClient";

type GlobalHotel = "MARRIOTT" | "SHERATON MDQ" | "SHERATON BCR" | "MAITEI";

/** Ajustá si cambia el inventario por hotel */
const ROOMS_PER_DAY: Record<GlobalHotel, number> = {
  MARRIOTT: 300,
  "SHERATON MDQ": 194,
  "SHERATON BCR": 161,
  MAITEI: 98,
};

const MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

function normHotel(v: any): string {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function parseAnyDate(v: any): Date | null {
  if (v === null || v === undefined) return null;

  // Excel serial
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel epoch (1900 system). Using 1899-12-30 works for most exports.
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + v * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }

  if (v instanceof Date && !isNaN(v.getTime())) return v;

  const s = String(v).trim();
  if (!s) return null;

  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // dd-mm-yy or dd-mm-yyyy
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (m2) {
    const dd = Number(m2[1]);
    const mm = Number(m2[2]);
    let yy = Number(m2[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

function pickKey(keys: string[], candidates: string[]): string | null {
  const lower = new Map(keys.map((k) => [k.toLowerCase(), k]));
  for (const c of candidates) {
    const hit = lower.get(c.toLowerCase());
    if (hit) return hit;
  }
  // fallback parcial
  for (const c of candidates) {
    const cLow = c.toLowerCase();
    const found = keys.find((k) => k.toLowerCase().includes(cLow));
    if (found) return found;
  }
  return null;
}

type HfRow = {
  date: Date;
  year: number;
  month: number;
  hotel: GlobalHotel;
  roomsOcc: number;
  revenue: number;
  guests: number;
};

type Agg = {
  days: number;
  availableRooms: number;
  roomsOcc: number;
  revenue: number;
  guests: number;
  occ01: number;
  adr: number;
  revpar: number;
  dblOcc: number;
};

function aggregate(list: HfRow[], hotel: GlobalHotel): Agg | null {
  if (!list.length) return null;

  const days = list.length;
  const availableRooms = (ROOMS_PER_DAY[hotel] ?? 0) * days;

  const roomsOcc = list.reduce((a, r) => a + (Number.isFinite(r.roomsOcc) ? r.roomsOcc : 0), 0);
  const revenue = list.reduce((a, r) => a + (Number.isFinite(r.revenue) ? r.revenue : 0), 0);
  const guests = list.reduce((a, r) => a + (Number.isFinite(r.guests) ? r.guests : 0), 0);

  const occ01 = availableRooms > 0 ? roomsOcc / availableRooms : 0;
  const adr = roomsOcc > 0 ? revenue / roomsOcc : 0;
  const revpar = availableRooms > 0 ? revenue / availableRooms : 0;
  const dblOcc = roomsOcc > 0 ? guests / roomsOcc : 0;

  return { days, availableRooms, roomsOcc, revenue, guests, occ01, adr, revpar, dblOcc };
}

function kpiCard(label: string, value: string, sub?: string) {
  return (
    <div
      className="card"
      style={{
        minWidth: 230,
        padding: "0.9rem 1rem",
        borderRadius: 18,
        display: "grid",
        gap: ".25rem",
      }}
    >
      <div style={{ fontSize: ".9rem", opacity: 0.8 }}>{label}</div>
      <div style={{ fontSize: "1.35rem", fontWeight: 950, lineHeight: 1.1 }}>{value}</div>
      {sub ? <div style={{ fontSize: ".9rem", opacity: 0.7 }}>{sub}</div> : null}
    </div>
  );
}

export default function YearComparator() {
  const [globalHotel, setGlobalHotel] = useState<GlobalHotel>("MARRIOTT");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [baseYear, setBaseYear] = useState<number>(new Date().getFullYear() - 1);

  const [hfRows, setHfRows] = useState<HfRow[]>([]);
  const [hfLoading, setHfLoading] = useState(true);
  const [hfErr, setHfErr] = useState("");

  // ===== Carga H&F CSV =====
  useEffect(() => {
    let alive = true;
    setHfLoading(true);
    setHfErr("");

    readCsvFromPublic(HF_PATH)
      .then((rows) => {
        if (!alive) return;

        const keys = rows?.[0] ? Object.keys(rows[0]) : [];

        const kHotel = pickKey(keys, ["Empresa", "Hotel"]);
        const kDate = pickKey(keys, ["Fecha", "Date"]);
        const kRoomsOcc = pickKey(keys, ["Total Occ.", "Total\nOcc.", "Total Occ", "Occupied", "Rooms Occ", "RoomsOcc"]);
        const kRevenue = pickKey(keys, ["Room Revenue", "Room\nRevenue", "RoomRevenue", "Revenue", "Room Rev"]);
        const kGuests = pickKey(keys, ["Adl. & Chl.", "Adl.\n&\nChl.", "Guests", "Pax", "Personas"]);

        const parsed: HfRow[] = (rows ?? [])
          .map((r: any) => {
            const rawHotel = kHotel ? r[kHotel] : r.Empresa ?? r.Hotel;
            const h = normHotel(rawHotel) as GlobalHotel;

            if (!["MARRIOTT", "SHERATON MDQ", "SHERATON BCR", "MAITEI"].includes(h)) return null;

            const d = parseAnyDate(kDate ? r[kDate] : r.Fecha ?? r.Date);
            if (!d) return null;

            const roomsOcc = toNumberSmart(kRoomsOcc ? r[kRoomsOcc] : r["Total Occ."] ?? r["Total\nOcc."]);
            const revenue = toNumberSmart(kRevenue ? r[kRevenue] : r["Room Revenue"] ?? r["Room\nRevenue"]);
            const guests = toNumberSmart(kGuests ? r[kGuests] : r["Adl. & Chl."] ?? r["Adl.\n&\nChl."]);

            return {
              date: d,
              year: d.getFullYear(),
              month: d.getMonth() + 1,
              hotel: h,
              roomsOcc,
              revenue,
              guests,
            } as HfRow;
          })
          .filter(Boolean) as HfRow[];

        setHfRows(parsed);

        // set year defaults con data real si el CSV no tiene el año actual
        const years = Array.from(new Set(parsed.map((x) => x.year))).sort((a, b) => a - b);
        if (years.length) {
          const maxY = years[years.length - 1];
          if (!years.includes(year)) setYear(maxY);
          if (!years.includes(baseYear)) setBaseYear(Math.max(years[0], maxY - 1));
        }
      })
      .catch((e) => {
        console.error(e);
        setHfErr(String(e?.message ?? e));
        setHfRows([]);
      })
      .finally(() => setHfLoading(false));

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const yearsAvailable = useMemo(() => {
    const ys = Array.from(new Set(hfRows.filter((r) => r.hotel === globalHotel).map((r) => r.year)));
    return ys.sort((a, b) => a - b);
  }, [hfRows, globalHotel]);

  const rowsHotelYear = useMemo(() => {
    return hfRows.filter((r) => r.hotel === globalHotel && r.year === year);
  }, [hfRows, globalHotel, year]);

  const rowsHotelBase = useMemo(() => {
    return hfRows.filter((r) => r.hotel === globalHotel && r.year === baseYear);
  }, [hfRows, globalHotel, baseYear]);

  const aggYear = useMemo(() => aggregate(rowsHotelYear, globalHotel), [rowsHotelYear, globalHotel]);
  const aggBase = useMemo(() => aggregate(rowsHotelBase, globalHotel), [rowsHotelBase, globalHotel]);

  // ===== Ranking por mes (tabla) =====
  const byMonth = useMemo(() => {
    const map = new Map<number, HfRow[]>();
    for (const r of rowsHotelYear) {
      if (!map.has(r.month)) map.set(r.month, []);
      map.get(r.month)!.push(r);
    }

    const out = Array.from({ length: 12 }).map((_, idx) => {
      const m = idx + 1;
      const list = map.get(m) ?? [];
      const a = aggregate(list, globalHotel);
      return {
        month: m,
        label: MONTHS_ES[idx],
        roomsOcc: a?.roomsOcc ?? 0,
        revenue: a?.revenue ?? 0,
        occ01: a?.occ01 ?? 0,
        adr: a?.adr ?? 0,
        revpar: a?.revpar ?? 0,
      };
    });

    return out;
  }, [rowsHotelYear, globalHotel]);

  // ===== Comparativa (mes a mes: año vs base) =====
  const compareByMonth = useMemo(() => {
    const mk = (list: HfRow[]) => {
      const m = new Map<number, HfRow[]>();
      for (const r of list) {
        if (!m.has(r.month)) m.set(r.month, []);
        m.get(r.month)!.push(r);
      }
      return m;
    };

    const cur = mk(rowsHotelYear);
    const base = mk(rowsHotelBase);

    return Array.from({ length: 12 }).map((_, idx) => {
      const month = idx + 1;

      const aCur = aggregate(cur.get(month) ?? [], globalHotel);
      const aBase = aggregate(base.get(month) ?? [], globalHotel);

      const occCur = aCur?.occ01 ?? 0;
      const occBase = aBase?.occ01 ?? 0;

      const adrCur = aCur?.adr ?? 0;
      const adrBase = aBase?.adr ?? 0;

      const revCur = aCur?.revenue ?? 0;
      const revBase = aBase?.revenue ?? 0;

      const roomsCur = aCur?.roomsOcc ?? 0;
      const roomsBase = aBase?.roomsOcc ?? 0;

      const revparCur = aCur?.revpar ?? 0;
      const revparBase = aBase?.revpar ?? 0;

      return {
        month,
        label: MONTHS_ES[idx],
        occCur,
        occBase,
        occDelta: occCur - occBase,
        adrCur,
        adrBase,
        adrDelta: adrCur - adrBase,
        revCur,
        revBase,
        revDelta: revCur - revBase,
        roomsCur,
        roomsBase,
        roomsDelta: roomsCur - roomsBase,
        revparCur,
        revparBase,
        revparDelta: revparCur - revparBase,
      };
    });
  }, [rowsHotelYear, rowsHotelBase, globalHotel]);

  // ===== UI helpers =====
  const hotels: GlobalHotel[] = ["MARRIOTT", "SHERATON MDQ", "SHERATON BCR", "MAITEI"];

  return (
    <section className="section" id="comparador" style={{ display: "grid", gap: "1.25rem" }}>
      {/* ===== Encabezado + filtros ===== */}
      <div style={{ display: "grid", gap: ".75rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.35rem", fontWeight: 950 }}>
          Informe Hoteles — History &amp; Forecast
        </div>
        <div className="sectionDesc" style={{ marginTop: "-.15rem" }}>
          Filtros globales: <b>Hotel</b> + <b>Año</b> (y Base para comparativa). MAITEI separado. Sheraton BCR/MDQ separados.
        </div>

        <div
          className="card"
          style={{
            padding: ".9rem 1rem",
            borderRadius: 18,
            display: "grid",
            gap: ".75rem",
          }}
        >
          <div style={{ display: "grid", gap: ".6rem" }}>
            <div style={{ display: "grid", gap: ".35rem" }}>
              <div style={{ fontSize: ".9rem", opacity: 0.8 }}>Hotel</div>
              <select
                value={globalHotel}
                onChange={(e) => setGlobalHotel(e.target.value as GlobalHotel)}
                style={{ padding: ".55rem .65rem", borderRadius: 12 }}
              >
                {hotels.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: ".6rem",
              }}
            >
              <div style={{ display: "grid", gap: ".35rem" }}>
                <div style={{ fontSize: ".9rem", opacity: 0.8 }}>Año</div>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  style={{ padding: ".55rem .65rem", borderRadius: 12 }}
                >
                  {yearsAvailable.length ? (
                    yearsAvailable.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))
                  ) : (
                    <option value={year}>{year}</option>
                  )}
                </select>
              </div>

              <div style={{ display: "grid", gap: ".35rem" }}>
                <div style={{ fontSize: ".9rem", opacity: 0.8 }}>Base (comparativa)</div>
                <select
                  value={baseYear}
                  onChange={(e) => setBaseYear(Number(e.target.value))}
                  style={{ padding: ".55rem .65rem", borderRadius: 12 }}
                >
                  {yearsAvailable.length ? (
                    yearsAvailable.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))
                  ) : (
                    <option value={baseYear}>{baseYear}</option>
                  )}
                </select>
              </div>
            </div>
          </div>

          {hfLoading ? <div style={{ opacity: 0.8 }}>Cargando H&amp;F…</div> : null}
          {hfErr ? <div style={{ color: "crimson" }}>Error: {hfErr}</div> : null}
        </div>
      </div>

      {/* ===== KPIs (carrousel responsive) ===== */}
      <div>
        <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
          KPIs principales ({globalHotel} · {year})
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Calculados con base en CSV: ocupación, ADR, RevPAR, doble ocupación, rooms y revenue.
        </div>

        <div
          style={{
            marginTop: ".85rem",
            display: "flex",
            gap: ".75rem",
            overflowX: "auto",
            paddingBottom: ".35rem",
          }}
        >
          {aggYear ? (
            <>
              {kpiCard("Ocupación", formatPct(toPercent01(aggYear.occ01)), `Rooms occ: ${Math.round(aggYear.roomsOcc).toLocaleString("es-AR")}`)}
              {kpiCard("ADR", formatMoney(aggYear.adr), `Revenue: ${formatMoney(aggYear.revenue)}`)}
              {kpiCard("RevPAR", formatMoney(aggYear.revpar), `Available rooms: ${Math.round(aggYear.availableRooms).toLocaleString("es-AR")}`)}
              {kpiCard("Doble ocupación", aggYear.dblOcc.toFixed(2).replace(".", ","), `Guests: ${Math.round(aggYear.guests).toLocaleString("es-AR")}`)}
            </>
          ) : (
            <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
              Sin filas H&amp;F para {globalHotel} en {year}.
            </div>
          )}
        </div>
      </div>

      {/* ===== Ranking por mes (vuelve) ===== */}
      <div>
        <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
          Ranking por mes (H&amp;F)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Mes a mes para {globalHotel} en {year}.
        </div>

        <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 18, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.85 }}>
                <th style={{ padding: ".5rem .4rem" }}>Mes</th>
                <th style={{ padding: ".5rem .4rem" }}>Occ%</th>
                <th style={{ padding: ".5rem .4rem" }}>ADR</th>
                <th style={{ padding: ".5rem .4rem" }}>RevPAR</th>
                <th style={{ padding: ".5rem .4rem" }}>Rooms Occ</th>
                <th style={{ padding: ".5rem .4rem" }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {byMonth.map((m) => (
                <tr key={m.month} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                  <td style={{ padding: ".55rem .4rem", fontWeight: 800 }}>{m.label}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{formatPct(toPercent01(m.occ01))}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{formatMoney(m.adr)}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{formatMoney(m.revpar)}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{Math.round(m.roomsOcc).toLocaleString("es-AR")}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{formatMoney(m.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Comparativa (vuelve) ===== */}
      <div>
        <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
          Comparativa {year} vs {baseYear}
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Diferencias por mes (ocupación, ADR, RevPAR, rooms y revenue).
        </div>

        <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 18, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.85 }}>
                <th style={{ padding: ".5rem .4rem" }}>Mes</th>
                <th style={{ padding: ".5rem .4rem" }}>Occ {year}</th>
                <th style={{ padding: ".5rem .4rem" }}>Occ {baseYear}</th>
                <th style={{ padding: ".5rem .4rem" }}>Δ Occ</th>
                <th style={{ padding: ".5rem .4rem" }}>ADR Δ</th>
                <th style={{ padding: ".5rem .4rem" }}>RevPAR Δ</th>
                <th style={{ padding: ".5rem .4rem" }}>Rooms Δ</th>
                <th style={{ padding: ".5rem .4rem" }}>Revenue Δ</th>
              </tr>
            </thead>
            <tbody>
              {compareByMonth.map((m) => (
                <tr key={m.month} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                  <td style={{ padding: ".55rem .4rem", fontWeight: 800 }}>{m.label}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{formatPct(toPercent01(m.occCur))}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{formatPct(toPercent01(m.occBase))}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{formatPct(toPercent01(m.occDelta))}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{formatMoney(m.adrDelta)}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{formatMoney(m.revparDelta)}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{Math.round(m.roomsDelta).toLocaleString("es-AR")}</td>
                  <td style={{ padding: ".55rem .4rem" }}>{formatMoney(m.revDelta)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: ".75rem", opacity: 0.8, fontSize: ".9rem" }}>
            Nota: Δ Occ se expresa en puntos porcentuales (ej: +2,3%).
          </div>
        </div>
      </div>

      {/* ===== Membership (JCR) ===== */}
      <div style={{ marginTop: ".25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
          Membership (JCR)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Filtro global de año + hotel (JCR/MARRIOTT/SHERATON MDQ/SHERATON BCR/MAITEI).
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <MembershipSummary year={year} baseYear={baseYear} filePath={MEMBERSHIP_PATH} globalHotel={globalHotel} compactCharts />
        </div>
      </div>

      {/* ===== Nacionalidades ===== */}
      <div style={{ marginTop: ".25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
          Nacionalidades
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Archivo Marriott. Usa filtro global de año (sin filtro de hotel).
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <CountryRanking year={year} filePath={NACIONALIDADES_PATH} />
        </div>
      </div>
    </section>
  );
}
