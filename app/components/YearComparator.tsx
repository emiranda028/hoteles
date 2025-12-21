"use client";

import { useEffect, useMemo, useState } from "react";
import HofExplorer from "./HofExplorer";
import MembershipSummary, { MembershipHotelFilter } from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

/**
 * YearComparator (final)
 * - Filtros globales: AÑO + HOTEL
 * - KPI carrousel (JCR o Maitei según hotel global)
 * - Comparativa año vs baseYear
 * - H&F (respeta filtro hotel global)
 * - Membership (solo JCR: JCR/MARRIOTT/SHERATON BCR/SHERATON MDQ)
 * - Nacionalidades (solo Marriott): filtra SOLO por año, sin filtro hotel
 */

const DEFAULT_YEAR = 2025;
const DEFAULT_BASE_YEAR = 2024;

type GlobalHotel = "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

const JCR_HOTELS = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
const GOTEL_HOTELS = ["MAITEI"];

const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const HF_PATH = "/data/hf_diario.csv";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

const availPerDayByHotel: Record<string, number> = {
  MARRIOTT: 300,
  "SHERATON MDQ": 194,
  "SHERATON BCR": 161,
  MAITEI: 98,
};

// ---------- helpers formato ----------
const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR");
const fmtMoney = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct01 = (p01: number) => (p01 * 100).toFixed(1).replace(".", ",") + "%";
const fmtPP = (pp: number) => pp.toFixed(1).replace(".", ",") + " p.p.";

function parseNumLoose(v: any): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normHotel(raw: any) {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s.includes("MARRIOTT")) return "MARRIOTT";
  if (s.includes("BARILOCHE") || s.includes("BCR")) return "SHERATON BCR";
  if (s.includes("MAR DEL PLATA") || s.includes("MDQ")) return "SHERATON MDQ";
  if (s.includes("MAITEI")) return "MAITEI";
  return s;
}

function parseDateLoose(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  const s = String(v).trim();
  if (!s) return null;

  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;

  const m1 = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]) - 1;
    const yy = Number(m1[3].length === 2 ? "20" + m1[3] : m1[3]);
    const d = new Date(yy, mm, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m2) {
    const dd = Number(m2[1]);
    const mm = Number(m2[2]) - 1;
    const yyRaw = String(m2[3]);
    const yy = Number(yyRaw.length === 2 ? "20" + yyRaw : yyRaw);
    const d = new Date(yy, mm, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

// ---------- CSV (hf_diario) ----------
type HfRow = {
  hotel: string;
  dt: Date;
  year: number;
  month: number;
  roomsOcc: number; // Total Occ.
  guests: number; // Adl. & Chl.
  revenue: number; // Room Revenue
};

async function fetchText(path: string) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (status ${res.status})`);
  return await res.text();
}

function parseHfCsv(text: string): HfRow[] {
  if (!text?.trim()) return [];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = lines[0].split(";").map((h) => h.replace(/^"|"$/g, "").trim());
  const idx = (name: string) => headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));

  const iEmpresa = idx("Empresa");
  const iFecha = idx("Fecha");
  const iDate = idx("Date");
  const iOcc = idx("Total");
  const iRevenue = idx("Room Revenue");
  const iGuests = idx("Adl.");

  const out: HfRow[] = [];

  for (let li = 1; li < lines.length; li++) {
    const cols = lines[li].split(";").map((c) => c.replace(/^"|"$/g, "").trim());

    const hotelRaw = iEmpresa >= 0 ? cols[iEmpresa] : "";
    const hotel = normHotel(hotelRaw);
    if (!hotel) continue;

    const dateRaw = (iFecha >= 0 && cols[iFecha]) ? cols[iFecha] : (iDate >= 0 ? cols[iDate] : "");
    const dt = parseDateLoose(dateRaw);
    if (!dt) continue;

    const roomsOcc = iOcc >= 0 ? parseNumLoose(cols[iOcc]) : 0;
    const revenue = iRevenue >= 0 ? parseNumLoose(cols[iRevenue]) : 0;
    const guests = iGuests >= 0 ? parseNumLoose(cols[iGuests]) : 0;

    const year = dt.getFullYear();
    const month = dt.getMonth() + 1;

    out.push({ hotel, dt, year, month, roomsOcc, guests, revenue });
  }

  return out;
}

// ---------- agregaciones ----------
type Agg = {
  rooms: number;
  guests: number;
  revenue: number;
  adr: number;
  occ01: number;
  availableRooms: number;
  daysCounted: number;
};

function calcAgg(rows: HfRow[], hotels: string[], year: number): Agg {
  const byHotel = new Map<string, HfRow[]>();
  for (const r of rows) {
    if (r.year !== year) continue;
    if (!hotels.includes(r.hotel)) continue;
    if (!byHotel.has(r.hotel)) byHotel.set(r.hotel, []);
    byHotel.get(r.hotel)!.push(r);
  }

  let rooms = 0;
  let guests = 0;
  let revenue = 0;
  let availableRooms = 0;
  let daysCounted = 0;

  for (const hotel of hotels) {
    const list = byHotel.get(hotel) ?? [];
    if (list.length === 0) continue;

    const daySet = new Set<number>();
    for (const r of list) {
      rooms += r.roomsOcc;
      guests += r.guests;
      revenue += r.revenue;
      daySet.add(new Date(r.dt.getFullYear(), r.dt.getMonth(), r.dt.getDate()).getTime());
    }

    const days = daySet.size;
    daysCounted += days;

    const availPerDay = availPerDayByHotel[hotel] ?? 0;
    availableRooms += availPerDay * days;
  }

  const adr = rooms > 0 ? revenue / rooms : 0;
  const occ01 = availableRooms > 0 ? rooms / availableRooms : 0;

  return { rooms, guests, revenue, adr, occ01, availableRooms, daysCounted };
}

// ---------- animación números ----------
function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const to = target;

    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

function BigCarousel4(props: {
  title: string;
  subtitle: string;
  kpis: Array<{
    label: string;
    value: string;
    sub: string;
    delta?: string;
    deltaClass?: "up" | "down" | "flat";
  }>;
}) {
  return (
    <div className="card" style={{ padding: "1.25rem", overflow: "hidden" }}>
      <div style={{ display: "grid", gap: ".25rem" }}>
        <div className="cardTitle" style={{ fontSize: "1.2rem" }}>{props.title}</div>
        <div className="cardNote">{props.subtitle}</div>
      </div>

      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "1rem",
        }}
        className="gridKpi4"
      >
        {props.kpis.map((k) => (
          <div
            key={k.label}
            style={{
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,.07)",
              background: "rgba(0,0,0,.02)",
              padding: "1rem",
              minHeight: 140,
              display: "grid",
              gap: ".35rem",
            }}
          >
            <div style={{ color: "var(--muted)", fontWeight: 700 }}>{k.label}</div>
            <div style={{ fontSize: "2.1rem", fontWeight: 900, lineHeight: 1.05 }}>{k.value}</div>

            {k.delta ? (
              <div className={`delta ${k.deltaClass ?? "flat"}`} style={{ width: "fit-content" }}>
                {k.delta}
              </div>
            ) : null}

            <div style={{ color: "var(--muted)", fontSize: ".95rem" }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <style jsx>{`
        @media (max-width: 980px) {
          .gridKpi4 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 520px) {
          .gridKpi4 {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

export default function YearComparator() {
  const [year, setYear] = useState<number>(DEFAULT_YEAR);
  const [baseYear, setBaseYear] = useState<number>(DEFAULT_BASE_YEAR);

  const [globalHotel, setGlobalHotel] = useState<GlobalHotel>("JCR");

  const [hfRows, setHfRows] = useState<HfRow[]>([]);
  const [hfErr, setHfErr] = useState<string>("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setHfErr("");
        const text = await fetchText(HF_PATH);
        if (!alive) return;
        setHfRows(parseHfCsv(text));
      } catch (e: any) {
        if (!alive) return;
        setHfRows([]);
        setHfErr(String(e?.message ?? e));
      }
    })();
    return () => { alive = false; };
  }, []);

  const yearsAvailable = useMemo(() => {
    const set = new Set<number>();
    for (const r of hfRows) set.add(r.year);
    const arr = Array.from(set).sort((a, b) => b - a);
    return arr.length ? arr : [2026, 2025, 2024, 2023, 2022];
  }, [hfRows]);

  const hotelsForGlobal = useMemo(() => {
    if (globalHotel === "JCR") return JCR_HOTELS;
    if (globalHotel === "MAITEI") return GOTEL_HOTELS;
    return [globalHotel];
  }, [globalHotel]);

  const scopeLabel = globalHotel === "MAITEI" ? "Maitei" : (globalHotel === "JCR" ? "Grupo JCR" : globalHotel);

  const curAgg = useMemo(() => calcAgg(hfRows, hotelsForGlobal, year), [hfRows, hotelsForGlobal, year]);
  const baseAgg = useMemo(() => calcAgg(hfRows, hotelsForGlobal, baseYear), [hfRows, hotelsForGlobal, baseYear]);

  const dRooms = baseAgg.rooms > 0 ? (curAgg.rooms / baseAgg.rooms - 1) * 100 : 0;
  const dGuests = baseAgg.guests > 0 ? (curAgg.guests / baseAgg.guests - 1) * 100 : 0;
  const dRev = baseAgg.revenue > 0 ? (curAgg.revenue / baseAgg.revenue - 1) * 100 : 0;
  const dAdr = baseAgg.adr > 0 ? (curAgg.adr / baseAgg.adr - 1) * 100 : 0;
  const dOccPP = (curAgg.occ01 - baseAgg.occ01) * 100;

  const roomsAnim = useCountUp(curAgg.rooms);
  const guestsAnim = useCountUp(curAgg.guests);
  const revAnim = useCountUp(curAgg.revenue);
  const adrAnim = useCountUp(curAgg.adr);

  const kpis = useMemo(() => {
    const deltaClass = (v: number): "up" | "down" | "flat" =>
      v > 0.0001 ? "up" : v < -0.0001 ? "down" : "flat";

    return [
      {
        label: "Rooms occupied",
        value: fmtInt(roomsAnim),
        delta: `${dRooms >= 0 ? "+" : ""}${dRooms.toFixed(1).replace(".", ",")}% vs ${baseYear}`,
        deltaClass: deltaClass(dRooms),
        sub: `${fmtInt(baseAgg.rooms)} → ${fmtInt(curAgg.rooms)}`,
      },
      {
        label: "Room Revenue (USD)",
        value: fmtMoney(revAnim),
        delta: `${dRev >= 0 ? "+" : ""}${dRev.toFixed(1).replace(".", ",")}% vs ${baseYear}`,
        deltaClass: deltaClass(dRev),
        sub: `${fmtMoney(baseAgg.revenue)} → ${fmtMoney(curAgg.revenue)}`,
      },
      {
        label: "Huéspedes",
        value: fmtInt(guestsAnim),
        delta: `${dGuests >= 0 ? "+" : ""}${dGuests.toFixed(1).replace(".", ",")}% vs ${baseYear}`,
        deltaClass: deltaClass(dGuests),
        sub: `${fmtInt(baseAgg.guests)} → ${fmtInt(curAgg.guests)}`,
      },
      {
        label: "ADR (USD)",
        value: fmtMoney(adrAnim),
        delta: `${dAdr >= 0 ? "+" : ""}${dAdr.toFixed(1).replace(".", ",")}% vs ${baseYear}`,
        deltaClass: deltaClass(dAdr),
        sub: `${fmtMoney(baseAgg.adr)} → ${fmtMoney(curAgg.adr)}`,
      },
    ];
  }, [roomsAnim, guestsAnim, revAnim, adrAnim, dRooms, dRev, dGuests, dAdr, baseYear, baseAgg, curAgg]);

  const occLine = useMemo(() => {
    return {
      cur: fmtPct01(curAgg.occ01),
      base: fmtPct01(baseAgg.occ01),
      pp: `${dOccPP >= 0 ? "+" : ""}${fmtPP(dOccPP)}`,
    };
  }, [curAgg.occ01, baseAgg.occ01, dOccPP]);

  // membership: MAITEI no aplica => forzamos JCR
  const membershipHotelFilter: MembershipHotelFilter =
    globalHotel === "MAITEI" ? "JCR" : (globalHotel as MembershipHotelFilter);

  return (
    <section className="section" id="comparador">
      {/* HEADER + FILTROS */}
      <div className="sectionHeader" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="sectionKicker">Vista ejecutiva</div>
          <h2 className="sectionTitle">Informe dinámico</h2>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Todo con filtros globales. Nacionalidades es solo Marriott (solo año).
          </div>
        </div>

        <div style={{ display: "grid", gap: ".45rem", justifyItems: "end" }}>
          <div style={{ color: "var(--muted)", fontSize: ".9rem", fontWeight: 700 }}>
            Filtro global de hotel
          </div>

          <div className="pillRow" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
            {(["JCR","MARRIOTT","SHERATON BCR","SHERATON MDQ","MAITEI"] as GlobalHotel[]).map((h) => (
              <button
                key={h}
                type="button"
                className={`pill ${h === globalHotel ? "active" : ""}`}
                onClick={() => setGlobalHotel(h)}
              >
                {h}
              </button>
            ))}
          </div>

          <div style={{ color: "var(--muted)", fontSize: ".9rem", fontWeight: 700, marginTop: ".35rem" }}>
            Filtro global de año
          </div>

          <div className="pillRow" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
            {yearsAvailable.map((y) => (
              <button
                key={y}
                type="button"
                className={`pill ${y === year ? "active" : ""}`}
                onClick={() => setYear(y)}
              >
                {y}
              </button>
            ))}
          </div>

          <div style={{ color: "var(--muted)", fontSize: ".9rem", fontWeight: 700, marginTop: ".2rem" }}>
            Año base comparativo
          </div>

          <div className="pillRow" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
            {yearsAvailable
              .filter((y) => y !== year)
              .map((y) => (
                <button
                  key={y}
                  type="button"
                  className={`pill ${y === baseYear ? "active" : ""}`}
                  onClick={() => setBaseYear(y)}
                >
                  {y}
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* KPI CARROUSEL */}
      <div style={{ display: "grid", gap: "1rem" }}>
        <BigCarousel4
          title={`${scopeLabel} — KPIs anuales`}
          subtitle={`Año ${year} vs ${baseYear} · Ocupación: ${occLine.base} → ${occLine.cur} (${occLine.pp})`}
          kpis={kpis}
        />

        {hfErr ? (
          <div className="card" style={{ padding: "1rem" }}>
            <div className="delta down">{hfErr}</div>
            <div className="cardNote" style={{ marginTop: ".35rem" }}>
              Revisá que exista <code>public/data/hf_diario.csv</code>.
            </div>
          </div>
        ) : null}
      </div>

      {/* COMPARATIVA */}
      <div className="card" style={{ padding: "1.15rem", marginTop: "1rem" }}>
        <div className="cardTitle">Comparativa {scopeLabel}: {year} vs {baseYear}</div>
        <div className="cardNote" style={{ marginTop: ".35rem" }}>
          Disponibilidad fija (rooms/día): Marriott 300 · Sheraton MDQ 194 · Sheraton BCR 161 · Maitei 98.
        </div>
      </div>

      {/* H&F EXPLORER (respeta hotel global) */}
      <div style={{ marginTop: "1rem" }}>
        <HofExplorer
          filePath={HF_PATH}
          allowedHotels={hotelsForGlobal}
          title={`H&F — ${scopeLabel}`}
          defaultYear={year}
        />
      </div>

      {/* MEMBERSHIP (siempre JCR; con filtro hotel global excepto MAITEI) */}
      <div style={{ marginTop: "1rem" }}>
        <MembershipSummary
          year={year}
          baseYear={baseYear}
          allowedHotels={JCR_HOTELS}
          filePath={MEMBERSHIP_PATH}
          title="Membership (JCR)"
          hotelFilter={membershipHotelFilter}
          compactCharts={true}
        />
      </div>

      {/* NACIONALIDADES (solo Marriott, solo año) */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Nacionalidades
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Ranking por país + distribución por continente. (Archivo Marriott). Usa filtro global de año.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <CountryRanking year={year} filePath={NACIONALIDADES_PATH} />
        </div>
      </div>
    </section>
  );
}
