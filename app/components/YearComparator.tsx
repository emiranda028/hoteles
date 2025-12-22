"use client";

import React, { useEffect, useMemo, useState } from "react";
import HofExplorer from "./HofExplorer";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";
import { readCsvFromPublic } from "./csvClient";

const DEFAULT_YEAR = 2025;
const DEFAULT_BASE_YEAR = 2024;

const JCR_HOTELS = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
const GOTEL_HOTELS = ["MAITEI"];

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

const AVAIL_PER_DAY: Record<string, number> = {
  MARRIOTT: 300,
  "SHERATON MDQ": 194,
  "SHERATON BCR": 161,
  MAITEI: 98,
};

const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR");
const fmtMoney0 = (n: number) => Math.round(n).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const fmtMoney2 = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct1 = (p01: number) => (p01 * 100).toFixed(1).replace(".", ",") + "%";

function normHotel(x: any) {
  return String(x ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function parseMoneyES(v: any) {
  if (v == null) return 0;
  const s0 = String(v).trim();
  if (!s0) return 0;

  const s = s0.replace(/\s/g, "");
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  if (hasComma && !hasDot) return Number(s.replace(",", ".")) || 0;
  return Number(s) || 0;
}

function parseAnyDate(v: any): Date | null {
  if (!v && v !== 0) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  // dd/mm/yyyy
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

type HfRow = {
  hotel: string;
  date: Date;
  year: number;
  rooms: number;
  revenue: number;
  guests: number;
};

type Agg = {
  rooms: number;
  revenue: number;
  guests: number;
  days: number;
  availableRooms: number;
  occ01: number;
  adr: number;
};

function aggFor(rows: HfRow[], hotelList: string[], year: number): Agg | null {
  const list = rows.filter((r) => hotelList.includes(r.hotel) && r.year === year);
  if (!list.length) return null;

  const rooms = list.reduce((a, r) => a + (Number.isFinite(r.rooms) ? r.rooms : 0), 0);
  const revenue = list.reduce((a, r) => a + (Number.isFinite(r.revenue) ? r.revenue : 0), 0);
  const guests = list.reduce((a, r) => a + (Number.isFinite(r.guests) ? r.guests : 0), 0);

  // availability ponderada por hotel: sum(availPerDay(hotel) * daysHotel)
  const daysByHotel = new Map<string, number>();
  for (const r of list) daysByHotel.set(r.hotel, (daysByHotel.get(r.hotel) ?? 0) + 1);

  let availableRooms = 0;
  for (const [h, days] of daysByHotel.entries()) {
    availableRooms += (AVAIL_PER_DAY[h] ?? 0) * days;
  }

  const days = list.length;
  const occ01 = availableRooms > 0 ? rooms / availableRooms : 0;
  const adr = rooms > 0 ? revenue / rooms : 0;

  return { rooms, revenue, guests, days, availableRooms, occ01, adr };
}

function deltaPct(cur: number, base: number) {
  if (!base) return null;
  return ((cur / base) - 1) * 100;
}

export default function YearComparator() {
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [baseYear, setBaseYear] = useState(DEFAULT_BASE_YEAR);

  // hoteles seleccionados por bloque
  const [hotelJcr, setHotelJcr] = useState<string>(JCR_HOTELS[0]);
  const [hotelMaitei, setHotelMaitei] = useState<string>(GOTEL_HOTELS[0]);

  const [hf, setHf] = useState<HfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readCsvFromPublic(HF_PATH)
      .then(({ rows }) => {
        if (!alive) return;

        const parsed: HfRow[] = (rows ?? [])
          .map((r: any) => {
            const hotel = normHotel(r.Empresa ?? r.empresa ?? r.Hotel ?? r.hotel);
            const d = parseAnyDate(r.Fecha ?? r.fecha ?? r.Date ?? r.date);
            if (!hotel || !d) return null;

            const rooms = Number(String(r['Total Occ.'] ?? r['Total\nOcc.'] ?? r.RoomsOcc ?? r.roomsOcc ?? 0).replace(/\./g,"").replace(",", ".")) || 0;
            const revenue = parseMoneyES(r["Room Revenue"] ?? r["Room\nRevenue"] ?? r.RoomRevenue ?? r.revenue ?? 0);
            const guests = Number(String(r["Adl. & Chl."] ?? r["Adl.\n&\nChl."] ?? r.Guests ?? r.guests ?? 0).replace(/\./g,"").replace(",", ".")) || 0;

            return { hotel, date: d, year: d.getFullYear(), rooms, revenue, guests } as HfRow;
          })
          .filter(Boolean) as HfRow[];

        setHf(parsed);

        // si el año por default no existe, lo ajustamos
        const years = Array.from(new Set(parsed.map((x) => x.year))).sort((a, b) => a - b);
        if (years.length) {
          if (!years.includes(year)) setYear(years[years.length - 1]);
          if (!years.includes(baseYear)) setBaseYear(years[0]);
        }
      })
      .catch((e) => {
        console.error(e);
        setErr(String(e?.message ?? e));
        setHf([]);
      })
      .finally(() => setLoading(false));

    return () => {
      alive = false;
    };
  }, []);

  const yearsAvailable = useMemo(() => {
    const set = new Set<number>();
    hf.forEach((r) => set.add(r.year));
    return Array.from(set).sort((a, b) => a - b);
  }, [hf]);

  const jcrAgg = useMemo(() => aggFor(hf, JCR_HOTELS, year), [hf, year]);
  const jcrAggBase = useMemo(() => aggFor(hf, JCR_HOTELS, baseYear), [hf, baseYear]);

  const gotelAgg = useMemo(() => aggFor(hf, GOTEL_HOTELS, year), [hf, year]);
  const gotelAggBase = useMemo(() => aggFor(hf, GOTEL_HOTELS, baseYear), [hf, baseYear]);

  return (
    <section className="section" id="comparador">
      <div style={{ display: "grid", gap: ".75rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.35rem", fontWeight: 950 }}>
          Comparador anual (H&F + Membership + Nacionalidades)
        </div>

        <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
          <div style={{ display: "grid", gap: ".75rem", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
            <div>
              <div style={{ fontSize: ".85rem", opacity: 0.75 }}>Año</div>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: "100%", padding: ".55rem", borderRadius: 12 }}>
                {yearsAvailable.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: ".85rem", opacity: 0.75 }}>Año base</div>
              <select value={baseYear} onChange={(e) => setBaseYear(Number(e.target.value))} style={{ width: "100%", padding: ".55rem", borderRadius: 12 }}>
                {yearsAvailable.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {loading && <div style={{ marginTop: ".9rem", opacity: 0.8 }}>Cargando H&F…</div>}
          {!loading && err && <div style={{ marginTop: ".9rem", color: "#b91c1c" }}>{err}</div>}
        </div>

        {/* ====== CARROUSEL / KPIs JCR ====== */}
        <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
          <div style={{ fontWeight: 950, fontSize: "1.1rem" }}>JCR — KPIs (consolidado)</div>

          {!jcrAgg && <div style={{ marginTop: ".75rem", opacity: 0.8 }}>Sin datos JCR para {year}.</div>}

          {jcrAgg && (
            <div style={{ display: "grid", gap: ".75rem", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginTop: ".8rem" }}>
              <div className="kpi">
                <div className="kpiLabel">Ocupación</div>
                <div className="kpiValue">{fmtPct1(jcrAgg.occ01)}</div>
                <div className="kpiHint">
                  Δ vs {baseYear}:{" "}
                  {jcrAggBase ? (
                    (() => {
                      const d = (jcrAgg.occ01 - jcrAggBase.occ01) * 100;
                      return `${d >= 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")} p.p.`;
                    })()
                  ) : "—"}
                </div>
              </div>

              <div className="kpi">
                <div className="kpiLabel">Rooms</div>
                <div className="kpiValue">{fmtInt(jcrAgg.rooms)}</div>
                <div className="kpiHint">
                  Δ%: {jcrAggBase ? (() => {
                    const d = deltaPct(jcrAgg.rooms, jcrAggBase.rooms);
                    return d === null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")}%`;
                  })() : "—"}
                </div>
              </div>

              <div className="kpi">
                <div className="kpiLabel">Revenue</div>
                <div className="kpiValue">{fmtMoney0(jcrAgg.revenue)}</div>
                <div className="kpiHint">
                  Δ%: {jcrAggBase ? (() => {
                    const d = deltaPct(jcrAgg.revenue, jcrAggBase.revenue);
                    return d === null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")}%`;
                  })() : "—"}
                </div>
              </div>

              <div className="kpi">
                <div className="kpiLabel">ADR</div>
                <div className="kpiValue">{fmtMoney2(jcrAgg.adr)}</div>
                <div className="kpiHint">
                  Δ%: {jcrAggBase ? (() => {
                    const d = deltaPct(jcrAgg.adr, jcrAggBase.adr);
                    return d === null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")}%`;
                  })() : "—"}
                </div>
              </div>

              <div className="kpi">
                <div className="kpiLabel">Huéspedes</div>
                <div className="kpiValue">{fmtInt(jcrAgg.guests)}</div>
              </div>
            </div>
          )}
        </div>

        {/* ====== H&F Explorer JCR ====== */}
        <HofExplorer
          title="H&F — Explorer (JCR)"
          filePath={HF_PATH}
          allowedHotels={JCR_HOTELS}
          year={year}
          onYearChange={setYear}
          hotel={hotelJcr}
          onHotelChange={setHotelJcr}
        />

        {/* ====== MEMBERSHIP ====== */}
        <MembershipSummary
          year={year}
          baseYear={baseYear}
          allowedHotels={JCR_HOTELS}
          filePath={MEMBERSHIP_PATH}
          title="Membership (JCR)"
        />

        {/* ====== NACIONALIDADES ====== */}
        <CountryRanking
          year={year}
          filePath={NACIONALIDADES_PATH}
          title="Nacionalidades (JCR)"
        />

        {/* ====== MAITEI / GOTEL ====== */}
        <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
          <div style={{ fontWeight: 950, fontSize: "1.1rem" }}>GOTEL — MAITEI (separado)</div>

          {!gotelAgg && <div style={{ marginTop: ".75rem", opacity: 0.8 }}>Sin datos MAITEI para {year}.</div>}

          {gotelAgg && (
            <div style={{ display: "grid", gap: ".75rem", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginTop: ".8rem" }}>
              <div className="kpi">
                <div className="kpiLabel">Ocupación</div>
                <div className="kpiValue">{fmtPct1(gotelAgg.occ01)}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">Rooms</div>
                <div className="kpiValue">{fmtInt(gotelAgg.rooms)}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">Revenue</div>
                <div className="kpiValue">{fmtMoney0(gotelAgg.revenue)}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">ADR</div>
                <div className="kpiValue">{fmtMoney2(gotelAgg.adr)}</div>
              </div>
            </div>
          )}
        </div>

        <HofExplorer
          title="H&F — Explorer (MAITEI)"
          filePath={HF_PATH}
          allowedHotels={GOTEL_HOTELS}
          year={year}
          onYearChange={setYear}
          hotel={hotelMaitei}
          onHotelChange={setHotelMaitei}
        />
      </div>
    </section>
  );
}
