"use client";

import React, { useEffect, useMemo, useState } from "react";
import MembershipSummary, { MembershipHotelFilter } from "./MembershipSummary";
import CountryRanking from "./CountryRanking";
import HofExplorer from "./HofExplorer";

type HofRow = {
  empresa: string;
  fecha: Date | null;
  year: number;
  month: number; // 1-12
  rooms_occupied: number;
  room_revenue: number;
  guests: number;
};

type Totals = {
  rooms: number;
  revenue: number;
  guests: number;
  adr: number; // revenue/rooms
  occ01: number; // rooms/available (si hay available)
};

const DEFAULT_YEAR = 2025;
const BASE_YEAR = 2024;

const HOF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

// Nombres EXACTOS como vienen en tu H&F
const JCR_HOTELS = ["MARRIOTT", "SHERATON MDQ", "SHERATON BCR"] as const;
const GOTEL_HOTELS = ["MAITEI"] as const;

type GlobalHotel = "JCR" | (typeof JCR_HOTELS)[number] | "MAITEI";

const AVAIL_PER_DAY: Record<string, number> = {
  MARRIOTT: 0, // si querés que la ocupación sea real, cargamos disponibilidades acá
  "SHERATON MDQ": 0,
  "SHERATON BCR": 0,
  MAITEI: 98, // lo que me dijiste
};

// ---------- helpers formato ----------
function fmtInt(n: number) {
  return new Intl.NumberFormat("es-AR").format(Math.round(n || 0));
}
function fmtMoney2(n: number) {
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}
function fmtMoney0(n: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n || 0);
}
function fmtPct01(v: number) {
  const p = (v || 0) * 100;
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(p)}%`;
}
function deltaPct(cur: number, base: number) {
  if (!base) return null;
  return (cur - base) / base;
}
function deltaPP(cur01: number, base01: number) {
  return (cur01 - base01) * 100;
}
function fmtDeltaPct(cur: number, base: number) {
  const d = deltaPct(cur, base);
  if (d === null) return "—";
  const p = d * 100;
  const sign = p >= 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(p)}%`;
}
function fmtDeltaPP(cur01: number, base01: number) {
  const pp = deltaPP(cur01, base01);
  const sign = pp >= 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(pp)} p.p.`;
}

// ---------- CSV loader (simple, robust) ----------
function parseNum(x: any) {
  if (typeof x === "number") return x;
  const s = String(x ?? "").trim();
  if (!s) return 0;
  // soporta "1.234,56" o "1234.56"
  const norm = s.includes(",") && s.includes(".")
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

function parseDateAny(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  const s = String(v).trim();
  if (!s) return null;

  // ISO
  const d1 = new Date(s);
  if (!isNaN(d1.getTime())) return d1;

  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    const d2 = new Date(yy, mm - 1, dd);
    return isNaN(d2.getTime()) ? null : d2;
  }

  return null;
}

async function fetchCsv(path: string): Promise<HofRow[]> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (${res.status})`);
  const text = await res.text();

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];

  const header = lines[0].split(",").map((h) => h.trim());
  const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  const iEmpresa = idx("empresa");
  const iFecha = idx("fecha");
  const iYear = idx("year");
  const iMonth = idx("month");
  const iRooms = idx("rooms_occupied");
  const iRev = idx("room_revenue");
  const iGuests = idx("guests");

  const out: HofRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const empresa = cols[iEmpresa] ? String(cols[iEmpresa]).trim() : "";
    if (!empresa) continue;

    const fecha = iFecha >= 0 ? parseDateAny(cols[iFecha]) : null;
    const year = iYear >= 0 ? parseNum(cols[iYear]) : (fecha ? fecha.getFullYear() : 0);
    const month = iMonth >= 0 ? parseNum(cols[iMonth]) : (fecha ? fecha.getMonth() + 1 : 0);

    out.push({
      empresa,
      fecha,
      year: Number(year) || 0,
      month: Number(month) || 0,
      rooms_occupied: iRooms >= 0 ? parseNum(cols[iRooms]) : 0,
      room_revenue: iRev >= 0 ? parseNum(cols[iRev]) : 0,
      guests: iGuests >= 0 ? parseNum(cols[iGuests]) : 0,
    });
  }

  return out;
}

function useHofRows(path: string) {
  const [rows, setRows] = useState<HofRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let ok = true;
    setLoading(true);
    setError("");

    fetchCsv(path)
      .then((r) => {
        if (!ok) return;
        setRows(r);
        setLoading(false);
      })
      .catch((e) => {
        if (!ok) return;
        setError(String(e?.message ?? e));
        setRows([]);
        setLoading(false);
      });

    return () => {
      ok = false;
    };
  }, [path]);

  return { rows, loading, error };
}

// ---------- agregación ----------
function annualTotals(rows: HofRow[], year: number, hotels: readonly string[]): Totals {
  const subset = rows.filter((r) => r.year === year && hotels.includes(r.empresa));

  const rooms = subset.reduce((a, r) => a + (r.rooms_occupied || 0), 0);
  const revenue = subset.reduce((a, r) => a + (r.room_revenue || 0), 0);
  const guests = subset.reduce((a, r) => a + (r.guests || 0), 0);
  const adr = rooms > 0 ? revenue / rooms : 0;

  // available (por día * días distintos con data)
  const seenDay = new Set<string>();
  const daysByHotel = new Map<string, number>();

  for (let i = 0; i < subset.length; i++) {
    const r = subset[i];
    const d = r.fecha ? r.fecha.getDate() : 0;
    const key = `${r.empresa}-${r.year}-${r.month}-${d}`;
    if (!d) continue;
    if (seenDay.has(key)) continue;
    seenDay.add(key);
    daysByHotel.set(r.empresa, (daysByHotel.get(r.empresa) || 0) + 1);
  }

  let available = 0;
  for (let i = 0; i < hotels.length; i++) {
    const h = hotels[i];
    const d = daysByHotel.get(h) || 0;
    const perDay = AVAIL_PER_DAY[h] || 0;
    available += d * perDay;
  }

  const occ01 = available > 0 ? rooms / available : 0;

  return { rooms, revenue, guests, adr, occ01 };
}

// ---------- UI components ----------
function KpiCard(props: { label: string; value: string; sub?: string; tone?: "a" | "b" | "c" | "d" }) {
  const tone = props.tone ?? "a";
  return (
    <div className={`kpiCard tone-${tone}`}>
      <div className="kpiLabel">{props.label}</div>
      <div className="kpiValue">{props.value}</div>
      {props.sub ? <div className="kpiSub">{props.sub}</div> : null}
    </div>
  );
}

function BigCarousel4(props: {
  title: string;
  subtitle?: string;
  year: number;
  baseYear: number;
  cur: Totals;
  base: Totals;
}) {
  const { cur, base } = props;

  return (
    <div className="bigCarousel">
      <div className="bigCarouselHead">
        <div>
          <div className="bigTitle">{props.title}</div>
          {props.subtitle ? <div className="bigSub">{props.subtitle}</div> : null}
        </div>
        <div className="bigRight">
          <span className="pill">{props.year}</span>
          <span className="pill ghost">vs {props.baseYear}</span>
        </div>
      </div>

      <div className="bigGrid">
        <KpiCard
          tone="a"
          label="Rooms occupied"
          value={fmtInt(cur.rooms)}
          sub={`${fmtDeltaPct(cur.rooms, base.rooms)} vs ${props.baseYear}`}
        />
        <KpiCard
          tone="b"
          label="Recaudación (Room Revenue)"
          value={fmtMoney2(cur.revenue)}
          sub={`${fmtDeltaPct(cur.revenue, base.revenue)} vs ${props.baseYear}`}
        />
        <KpiCard
          tone="c"
          label="Huéspedes"
          value={fmtInt(cur.guests)}
          sub={`${fmtDeltaPct(cur.guests, base.guests)} vs ${props.baseYear}`}
        />
        <KpiCard
          tone="d"
          label="Tarifa promedio (ADR)"
          value={fmtMoney2(cur.adr)}
          sub={`${fmtDeltaPct(cur.adr, base.adr)} vs ${props.baseYear}`}
        />
      </div>
    </div>
  );
}

// ---------- MAIN ----------
export default function YearComparator() {
  const [year, setYear] = useState<number>(DEFAULT_YEAR);
  const [globalHotel, setGlobalHotel] = useState<GlobalHotel>("JCR");

  const { rows: hofRows, loading: hofLoading, error: hofError } = useHofRows(HOF_PATH);

  const yearsAvailable = useMemo(() => {
    const s = new Set<number>();
    for (let i = 0; i < hofRows.length; i++) s.add(hofRows[i].year);
    const arr = Array.from(s).filter(Boolean).sort((a, b) => a - b);
    return arr.length ? arr : [BASE_YEAR, DEFAULT_YEAR];
  }, [hofRows]);

  // KPIs JCR (siempre suma de 3 hoteles)
  const jcrCur = useMemo(() => annualTotals(hofRows, year, JCR_HOTELS), [hofRows, year]);
  const jcrBase = useMemo(() => annualTotals(hofRows, BASE_YEAR, JCR_HOTELS), [hofRows]);

  // KPIs Maitei
  const gotelCur = useMemo(() => annualTotals(hofRows, year, GOTEL_HOTELS), [hofRows, year]);
  const gotelBase = useMemo(() => annualTotals(hofRows, BASE_YEAR, GOTEL_HOTELS), [hofRows]);

  // membership hotelFilter (NO acepta MAITEI)
  const membershipHotelFilter: MembershipHotelFilter =
    globalHotel === "MAITEI" ? "JCR" : (globalHotel as MembershipHotelFilter);

  // para H&F JCR, si globalHotel es un hotel específico, arrancamos ahí
  const defaultHotelJcr = globalHotel === "JCR" ? "MARRIOTT" : globalHotel === "MAITEI" ? "MARRIOTT" : globalHotel;

  return (
    <section className="section" id="comparador">
      {/* ===== 1) CARROUSELES JCR ===== */}
      <BigCarousel4
        title="VISTA EJECUTIVA — Grupo JCR"
        subtitle="4 KPIs principales (suma Marriott + Sheraton MDQ + Sheraton BCR)"
        year={year}
        baseYear={BASE_YEAR}
        cur={jcrCur}
        base={jcrBase}
      />

      {/* ===== FILTROS GLOBALES (AÑO + HOTEL) ===== */}
      <div className="stickyControls" style={{ marginTop: "1rem" }}>
        <div className="stickyLeft">
          <div className="stickyTitle">Filtros globales</div>
          <div className="stickyHint">
            Aplican a: Carrouseles, Comparativa, Membership. Nacionalidades usa solo el año (Marriott).
          </div>
        </div>

        <div className="stickyRight">
          <div className="toggleGroup">
            <div className="toggleLabel">Año</div>
            <div className="toggle">
              {yearsAvailable.map((y) => (
                <button
                  key={y}
                  className={`toggleBtn ${year === y ? "active" : ""}`}
                  onClick={() => setYear(y)}
                  type="button"
                >
                  {y}
                </button>
              ))}
            </div>
          </div>

          <div className="toggleGroup">
            <div className="toggleLabel">Hotel</div>
            <div className="toggle">
              <button
                className={`toggleBtn ${globalHotel === "JCR" ? "active" : ""}`}
                onClick={() => setGlobalHotel("JCR")}
                type="button"
              >
                JCR
              </button>
              <button
                className={`toggleBtn ${globalHotel === "MARRIOTT" ? "active" : ""}`}
                onClick={() => setGlobalHotel("MARRIOTT")}
                type="button"
              >
                Marriott
              </button>
              <button
                className={`toggleBtn ${globalHotel === "SHERATON MDQ" ? "active" : ""}`}
                onClick={() => setGlobalHotel("SHERATON MDQ")}
                type="button"
              >
                Sheraton MDQ
              </button>
              <button
                className={`toggleBtn ${globalHotel === "SHERATON BCR" ? "active" : ""}`}
                onClick={() => setGlobalHotel("SHERATON BCR")}
                type="button"
              >
                Sheraton BCR
              </button>
              <button
                className={`toggleBtn ${globalHotel === "MAITEI" ? "active" : ""}`}
                onClick={() => setGlobalHotel("MAITEI")}
                type="button"
              >
                Maitei
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 2) COMPARATIVA JCR ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Comparativa (JCR) — {year} vs {BASE_YEAR}
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Resumen interanual del grupo (CSV H&F).
        </div>

        <div className="cardRow" style={{ marginTop: ".85rem" }}>
          <div className="card">
            <div className="cardTitle">Rooms occupied</div>
            <div className="cardValue">{fmtInt(jcrCur.rooms)}</div>
            <div className="delta">{fmtDeltaPct(jcrCur.rooms, jcrBase.rooms)} vs {BASE_YEAR}</div>
          </div>

          <div className="card">
            <div className="cardTitle">Room Revenue</div>
            <div className="cardValue">{fmtMoney2(jcrCur.revenue)}</div>
            <div className="delta">{fmtDeltaPct(jcrCur.revenue, jcrBase.revenue)} vs {BASE_YEAR}</div>
          </div>

          <div className="card">
            <div className="cardTitle">Huéspedes</div>
            <div className="cardValue">{fmtInt(jcrCur.guests)}</div>
            <div className="delta">{fmtDeltaPct(jcrCur.guests, jcrBase.guests)} vs {BASE_YEAR}</div>
          </div>

          <div className="card">
            <div className="cardTitle">ADR</div>
            <div className="cardValue">{fmtMoney2(jcrCur.adr)}</div>
            <div className="delta">{fmtDeltaPct(jcrCur.adr, jcrBase.adr)} vs {BASE_YEAR}</div>
          </div>

          <div className="card">
            <div className="cardTitle">Ocupación (si hay disponibilidad)</div>
            <div className="cardValue">{jcrCur.occ01 ? fmtPct01(jcrCur.occ01) : "—"}</div>
            <div className="delta">{jcrBase.occ01 ? fmtDeltaPP(jcrCur.occ01, jcrBase.occ01) : "Sin base"} vs {BASE_YEAR}</div>
          </div>
        </div>
      </div>

      {/* ===== 3) H&F (según hotel global) ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          H&F — Explorador
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Filtros por hotel + año/mes/trimestre. Incluye detalle mensual y ranking por mes.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          {globalHotel === "MAITEI" ? (
            <HofExplorer
              filePath={HOF_PATH}
              allowedHotels={Array.from(GOTEL_HOTELS)}
              defaultHotel="MAITEI"
              defaultYear={year}
              title="GOTEL Management — Maitei"
            />
          ) : (
            <HofExplorer
              filePath={HOF_PATH}
              allowedHotels={Array.from(JCR_HOTELS)}
              defaultHotel={defaultHotelJcr}
              defaultYear={year}
              title="Grupo JCR — H&F"
            />
          )}
        </div>
      </div>

      {/* ===== 4) MEMBERSHIP (JCR) ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Membership (JCR)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Cantidades + gráficos. Usa filtro global de año + hotel (JCR/MARRIOTT/SHERATONS).
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <MembershipSummary
            year={year}
            baseYear={BASE_YEAR}
            filePath={MEMBERSHIP_PATH}
            hotelFilter={membershipHotelFilter}
          />
        </div>
      </div>

      {/* ===== 5) NACIONALIDADES (solo Marriott) ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Nacionalidades — Marriott
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Ranking por país + distribución por continente. Usa filtro global de año.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <CountryRanking year={year} filePath={NACIONALIDADES_PATH} />
        </div>
      </div>

      {/* ===== 6) CARROUSELES MAITEI ===== */}
      <div style={{ marginTop: "1.5rem" }}>
        <BigCarousel4
          title="VISTA EJECUTIVA — Maitei (GOTEL Management)"
          subtitle="4 KPIs principales (solo Maitei)"
          year={year}
          baseYear={BASE_YEAR}
          cur={gotelCur}
          base={gotelBase}
        />
      </div>

      {hofLoading ? (
        <div className="card" style={{ marginTop: "1rem" }}>
          <div className="cardTitle">Cargando H&F…</div>
          <div className="cardNote">Leyendo {HOF_PATH}</div>
        </div>
      ) : null}

      {hofError ? (
        <div className="card" style={{ marginTop: "1rem", border: "1px solid rgba(255,0,0,.25)" }}>
          <div className="cardTitle">Error cargando H&F</div>
          <div className="cardNote">{hofError}</div>
        </div>
      ) : null}

      {/* ===== estilos locales responsive ===== */}
      <style jsx>{`
        .bigCarousel {
          border-radius: 24px;
          padding: 18px;
          background: linear-gradient(135deg, rgba(45, 95, 255, 0.14), rgba(0, 0, 0, 0.08));
          border: 1px solid rgba(255, 255, 255, 0.09);
          overflow: hidden;
        }
        .bigCarouselHead {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }
        .bigTitle {
          font-weight: 950;
          font-size: 1.25rem;
          letter-spacing: -0.02em;
        }
        .bigSub {
          margin-top: 4px;
          opacity: 0.78;
          font-size: 0.95rem;
        }
        .bigRight {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .pill {
          font-size: 0.85rem;
          font-weight: 800;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.10);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .pill.ghost {
          background: transparent;
        }
        .bigGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }
        .kpiCard {
          border-radius: 18px;
          padding: 14px;
          background: rgba(0, 0, 0, 0.20);
          border: 1px solid rgba(255, 255, 255, 0.08);
          min-height: 92px;
        }
        .kpiLabel {
          font-size: 0.9rem;
          opacity: 0.85;
          font-weight: 800;
        }
        .kpiValue {
          font-size: 1.35rem;
          font-weight: 950;
          margin-top: 6px;
          letter-spacing: -0.02em;
        }
        .kpiSub {
          margin-top: 6px;
          font-size: 0.85rem;
          opacity: 0.8;
        }
        .tone-a { background: linear-gradient(135deg, rgba(94, 232, 255, .18), rgba(0,0,0,.22)); }
        .tone-b { background: linear-gradient(135deg, rgba(255, 171, 94, .16), rgba(0,0,0,.22)); }
        .tone-c { background: linear-gradient(135deg, rgba(137, 255, 170, .16), rgba(0,0,0,.22)); }
        .tone-d { background: linear-gradient(135deg, rgba(210, 160, 255, .16), rgba(0,0,0,.22)); }

        .stickyControls {
          position: sticky;
          top: 72px;
          z-index: 30;
          border-radius: 18px;
          padding: 12px 12px;
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(10px);
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .stickyLeft {
          min-width: 240px;
        }
        .stickyTitle {
          font-weight: 950;
          font-size: 1rem;
        }
        .stickyHint {
          margin-top: 2px;
          opacity: 0.8;
          font-size: 0.85rem;
        }
        .stickyRight {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .toggleGroup {
          display: grid;
          gap: 6px;
        }
        .toggleLabel {
          font-size: 0.85rem;
          opacity: 0.85;
          font-weight: 800;
        }
        .toggle {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .toggleBtn {
          border-radius: 999px;
          padding: 8px 12px;
          font-weight: 900;
          font-size: 0.85rem;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          cursor: pointer;
        }
        .toggleBtn.active {
          background: rgba(255, 255, 255, 0.16);
        }

        .sectionTitle {
          font-weight: 950;
        }
        .sectionDesc {
          opacity: 0.78;
        }

        .cardRow {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
        }
        .card {
          border-radius: 18px;
          padding: 14px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .cardTitle {
          font-weight: 900;
          opacity: 0.85;
          font-size: 0.9rem;
        }
        .cardValue {
          font-size: 1.15rem;
          font-weight: 950;
          margin-top: 6px;
          letter-spacing: -0.01em;
        }
        .delta {
          margin-top: 6px;
          opacity: 0.8;
          font-size: 0.85rem;
        }
        .cardNote {
          opacity: 0.8;
          margin-top: 6px;
          font-size: 0.9rem;
        }

        /* responsive */
        @media (max-width: 980px) {
          .bigGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .cardRow { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .stickyControls { top: 62px; }
        }
        @media (max-width: 520px) {
          .bigGrid { grid-template-columns: 1fr; }
          .cardRow { grid-template-columns: 1fr; }
          .bigTitle { font-size: 1.1rem; }
          .kpiValue { font-size: 1.2rem; }
        }
      `}</style>
    </section>
  );
}
