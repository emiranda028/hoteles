"use client";

import { useEffect, useMemo, useState } from "react";

import HofExplorer from "./HofExplorer";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";
import WorldGuestsMap from "./WorldGuestsMap";

/**
 * YearComparator.tsx
 * - Estructura final:
 *   1) Carrouseles JCR (4 KPIs grandes) + selector de año global
 *   2) Comparativa año seleccionado vs base (baseYear)
 *   3) H&F Explorer (JCR) con filtros internos + ranking por mes (lo maneja HofExplorer)
 *   4) Membership (tabs: JCR consolidado + por hotel) + mismo año global
 *   5) Nacionalidades (ranking + mapa) + mismo año global
 *   6) Carrouseles Maitei (GOTEL) + mismo año global
 *   7) H&F Explorer (MAITEI)
 */

// ====== CONFIG ======
const DEFAULT_YEAR = 2025;
const BASE_YEAR = 2024;

const JCR_HOTELS = ["MARRIOTT", "SHERATON MDQ", "SHERATON BCR"];
const GOTEL_HOTELS = ["MAITEI"];

// disponibilidad fija por día
const AVAIL_PER_DAY: Record<string, number> = {
  MARRIOTT: 300,
  "SHERATON MDQ": 194,
  "SHERATON BCR": 161,
  MAITEI: 98,
};

// archivos
const HF_CSV_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_XLSX_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_XLSX_PATH = "/data/jcr_nacionalidades.xlsx";

// ====== helpers ======
type HofRow = Record<string, any>;

function toUpperTrim(v: any) {
  return String(v ?? "").toUpperCase().trim();
}

function parseEsNumber(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const s = String(v).trim();
  if (!s) return 0;

  // casos: "22.441,71" -> 22441.71
  //        "59,40%" -> 59.40
  const cleaned = s
    .replace(/\./g, "") // miles
    .replace(",", ".") // decimal
    .replace("%", "")
    .trim();

  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

function parseYearFromAnyDate(v: any): number | null {
  if (!v) return null;

  // En tu CSV viene una columna "Fecha" tipo "1/6/2022"
  // y también "Date" tipo "01-06-22 Wed"
  const tryDate = (x: any) => {
    const d = x instanceof Date ? x : new Date(x);
    return isNaN(d.getTime()) ? null : d.getFullYear();
  };

  // si parece dd/mm/yyyy, parse manual
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return Number(m[3]);

  // si parece dd-mm-yy ...
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2})/);
  if (m2) {
    const yy = Number(m2[3]);
    const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
    return yyyy;
  }

  return tryDate(v);
}

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("es-AR");
}

function fmtMoney(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtMoney2(n: number) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct01(p01: number) {
  return (p01 * 100).toFixed(1).replace(".", ",") + "%";
}

function clamp(n: number, a: number, b: number) {
  return Math.min(Math.max(n, a), b);
}

function deltaPct(cur: number, base: number) {
  if (!base) return 0;
  return ((cur / base) - 1) * 100;
}

function deltaPP(cur01: number, base01: number) {
  return (cur01 - base01) * 100;
}

function arrow(d: number) {
  return d >= 0 ? "▲" : "▼";
}

function sign(d: number) {
  return d >= 0 ? "+" : "";
}

function niceTitleCaseHotel(h: string) {
  // solo para mostrar
  if (h === "SHERATON MDQ") return "Sheraton Mar del Plata";
  if (h === "SHERATON BCR") return "Sheraton Bariloche";
  if (h === "MARRIOTT") return "Marriott Buenos Aires";
  if (h === "MAITEI") return "Maitei";
  return h;
}

type Agg = {
  year: number;
  hotels: string[];
  daysByHotel: Record<string, number>;
  availableRooms: number; // sum(availPerDay * days)
  roomsOccupied: number; // sum(deductIndiv + deductGroup)
  guests: number; // sum(Adl & Chl.)
  revenue: number; // sum(Room Revenue)
  adr: number; // revenue / roomsOccupied
  occ01: number; // roomsOccupied / availableRooms
};

function computeAgg(rows: HofRow[], year: number, hotels: string[]): Agg {
  const hotelSet = new Set(hotels.map(toUpperTrim));
  const daysByHotel: Record<string, number> = {};
  const daySeen: Record<string, Set<string>> = {};

  let roomsOccupied = 0;
  let guests = 0;
  let revenue = 0;

  for (const r of rows) {
    const h = toUpperTrim(r.Empresa ?? r.empresa ?? r.Hotel ?? r.hotel);
    if (!hotelSet.has(h)) continue;

    const y = parseYearFromAnyDate(r.Fecha ?? r.fecha ?? r.Date ?? r.date);
    if (y !== year) continue;

    // Para contar días: usamos "Fecha" si existe (dd/mm/yyyy) porque es consistente
    const dayKey = String(r.Fecha ?? r.fecha ?? r.Date ?? r.date ?? "").trim();
    if (!daySeen[h]) daySeen[h] = new Set<string>();
    if (dayKey) daySeen[h].add(dayKey);

    // rooms occupied: Deduct Indiv + Deduct Group (coincide con Total Occ)
    const deductIndiv = parseEsNumber(r["Deduct\nIndiv."] ?? r["Deduct Indiv."] ?? r["Deduct Indiv"] ?? r["Deduct\nIndiv"] ?? r.DeductIndiv ?? r.deduct_indiv);
    const deductGroup = parseEsNumber(r["Deduct\nGroup"] ?? r["Deduct Group"] ?? r["Deduct Group."] ?? r.DeductGroup ?? r.deduct_group);
    roomsOccupied += deductIndiv + deductGroup;

    // huéspedes
    guests += parseEsNumber(r["Adl. &\nChl."] ?? r["Adl. & Chl."] ?? r["Adl. & Chl"] ?? r.AdlChl ?? r["Adl.&Chl."] ?? r["Adl. & Chl. "]);

    // revenue
    revenue += parseEsNumber(r["Room Revenue"] ?? r["Room\nRevenue"] ?? r["RoomRevenue"] ?? r.room_revenue);

    // no usamos Average Rate directo (mejor ADR ponderado)
  }

  // días por hotel
  for (const h of hotels) {
    const key = toUpperTrim(h);
    daysByHotel[key] = daySeen[key]?.size ?? 0;
  }

  // disponibilidad total: sum(availPerDay[h] * days[h])
  let availableRooms = 0;
  for (const h of hotels) {
    const key = toUpperTrim(h);
    const avail = AVAIL_PER_DAY[key] ?? 0;
    const days = daysByHotel[key] ?? 0;
    availableRooms += avail * days;
  }

  const adr = roomsOccupied > 0 ? revenue / roomsOccupied : 0;
  const occ01 = availableRooms > 0 ? roomsOccupied / availableRooms : 0;

  return {
    year,
    hotels: hotels.map(toUpperTrim),
    daysByHotel,
    availableRooms,
    roomsOccupied,
    guests,
    revenue,
    adr,
    occ01,
  };
}

// ====== UI pieces ======
function BigCarousel4(props: {
  title: string;
  year: number;
  baseYear: number;
  kpis: {
    label: string;
    value: string;
    sub: string;
    deltaLabel: string;
    deltaClass: string;
  }[];
}) {
  const { title, kpis } = props;

  return (
    <div className="card" style={{ padding: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <div className="sectionKicker">Vista ejecutiva</div>
          <div className="sectionTitle" style={{ marginTop: ".15rem" }}>{title}</div>
        </div>
      </div>

      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "0.9rem",
        }}
      >
        {kpis.map((k) => (
          <div
            key={k.label}
            style={{
              borderRadius: "16px",
              padding: "1rem",
              border: "1px solid rgba(255,255,255,.08)",
              background: "linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02))",
              minHeight: 132,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div style={{ color: "var(--muted)", fontSize: ".85rem", fontWeight: 700, letterSpacing: ".02em" }}>
              {k.label}
            </div>

            <div style={{ fontSize: "2rem", fontWeight: 900, lineHeight: 1.05, marginTop: ".35rem" }}>
              {k.value}
            </div>

            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: ".75rem", marginTop: ".55rem" }}>
              <div style={{ color: "var(--muted)", fontSize: ".85rem" }}>{k.sub}</div>
              <div
                className={`delta ${k.deltaClass}`}
                style={{ margin: 0, fontSize: ".9rem", fontWeight: 800, whiteSpace: "nowrap" }}
              >
                {k.deltaLabel}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function YearToggle({
  years,
  year,
  setYear,
}: {
  years: number[];
  year: number;
  setYear: (y: number) => void;
}) {
  return (
    <div className="stickyControls" style={{ marginTop: "1rem" }}>
      <div>
        <div className="stickyTitle">Año</div>
        <div className="stickyHint">Este filtro aplica a H&F, Membership y Nacionalidades.</div>
      </div>

      <div className="toggle">
        {years.map((y) => (
          <button
            key={y}
            type="button"
            className={`toggleBtn ${year === y ? "active" : ""}`}
            onClick={() => setYear(y)}
          >
            {y}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function YearComparator() {
  const baseYear = BASE_YEAR;

  // año global (afecta membership/nacionalidades/h&f)
  const [year, setYear] = useState<number>(DEFAULT_YEAR);

  // datos H&F (csv) para construir carrouseles (JCR + MAITEI)
  const [hofRows, setHofRows] = useState<HofRow[]>([]);
  const [hofError, setHofError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch(HF_CSV_PATH, { cache: "no-store" });
        if (!res.ok) throw new Error(`No se pudo cargar ${HF_CSV_PATH} (status ${res.status})`);
        const text = await res.text();

        // CSV separador ; y headers con saltos de línea
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length < 2) {
          if (alive) setHofRows([]);
          return;
        }

        const split = (line: string) => {
          // split simple por ; (tu archivo no viene con comillas complejas)
          return line.split(";");
        };

        const rawHeaders = split(lines[0]);
        const headers = rawHeaders.map((h) => String(h ?? "").replace(/^"|"$/g, "").trim());

        const rows: HofRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = split(lines[i]);
          if (cols.length < 5) continue;

          const obj: HofRow = {};
          for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = (cols[j] ?? "").replace(/^"|"$/g, "");
          }
          rows.push(obj);
        }

        if (alive) {
          setHofRows(rows);
          setHofError(null);
        }
      } catch (e: any) {
        if (alive) setHofError(e?.message ?? "Error cargando CSV");
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  // años detectados desde CSV (para toggle)
  const yearsDetected = useMemo(() => {
    const set = new Set<number>();
    for (const r of hofRows) {
      const y = parseYearFromAnyDate(r.Fecha ?? r.fecha ?? r.Date ?? r.date);
      if (y) set.add(y);
    }
    const list = Array.from(set).sort((a, b) => a - b);
    // si no detecta aún, ponemos algunos por default
    if (list.length === 0) return [2022, 2023, 2024, 2025];
    return list;
  }, [hofRows]);

  // asegurar que el año seleccionado exista (si todavía no cargó, no toca)
  useEffect(() => {
    if (yearsDetected.length && !yearsDetected.includes(year)) {
      setYear(yearsDetected[yearsDetected.length - 1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearsDetected.join(",")]);

  // aggregations
  const jcrAggCur = useMemo(() => computeAgg(hofRows, year, JCR_HOTELS), [hofRows, year]);
  const jcrAggBase = useMemo(() => computeAgg(hofRows, baseYear, JCR_HOTELS), [hofRows, baseYear]);

  const maiteiAggCur = useMemo(() => computeAgg(hofRows, year, GOTEL_HOTELS), [hofRows, year]);
  const maiteiAggBase = useMemo(() => computeAgg(hofRows, baseYear, GOTEL_HOTELS), [hofRows, baseYear]);

  // KPI strings JCR
  const jcrKpis = useMemo(() => {
    const roomsCur = jcrAggCur.roomsOccupied;
    const roomsBase = jcrAggBase.roomsOccupied;

    const revCur = jcrAggCur.revenue;
    const revBase = jcrAggBase.revenue;

    const guestsCur = jcrAggCur.guests;
    const guestsBase = jcrAggBase.guests;

    const adrCur = jcrAggCur.adr;
    const adrBase = jcrAggBase.adr;

    const dRooms = deltaPct(roomsCur, roomsBase);
    const dRev = deltaPct(revCur, revBase);
    const dGuests = deltaPct(guestsCur, guestsBase);
    const dAdr = deltaPct(adrCur, adrBase);

    const cls = (d: number) => (d >= 0 ? "up" : "down");

    return [
      {
        label: "Rooms occupied",
        value: fmtInt(roomsCur),
        sub: `${fmtInt(roomsBase)} → ${fmtInt(roomsCur)}`,
        deltaLabel: `${arrow(dRooms)} ${sign(dRooms)}${dRooms.toFixed(1).replace(".", ",")}%`,
        deltaClass: cls(dRooms),
      },
      {
        label: "Room Revenue",
        value: fmtMoney(revCur),
        sub: `${fmtMoney(revBase)} → ${fmtMoney(revCur)}`,
        deltaLabel: `${arrow(dRev)} ${sign(dRev)}${dRev.toFixed(1).replace(".", ",")}%`,
        deltaClass: cls(dRev),
      },
      {
        label: "Huéspedes",
        value: fmtInt(guestsCur),
        sub: `${fmtInt(guestsBase)} → ${fmtInt(guestsCur)}`,
        deltaLabel: `${arrow(dGuests)} ${sign(dGuests)}${dGuests.toFixed(1).replace(".", ",")}%`,
        deltaClass: cls(dGuests),
      },
      {
        label: "ADR (prom. anual)",
        value: fmtMoney2(adrCur),
        sub: `${fmtMoney2(adrBase)} → ${fmtMoney2(adrCur)}`,
        deltaLabel: `${arrow(dAdr)} ${sign(dAdr)}${dAdr.toFixed(1).replace(".", ",")}%`,
        deltaClass: cls(dAdr),
      },
    ];
  }, [jcrAggCur, jcrAggBase]);

  // KPI strings MAITEI
  const maiteiKpis = useMemo(() => {
    const roomsCur = maiteiAggCur.roomsOccupied;
    const roomsBase = maiteiAggBase.roomsOccupied;

    const revCur = maiteiAggCur.revenue;
    const revBase = maiteiAggBase.revenue;

    const guestsCur = maiteiAggCur.guests;
    const guestsBase = maiteiAggBase.guests;

    const adrCur = maiteiAggCur.adr;
    const adrBase = maiteiAggBase.adr;

    const dRooms = deltaPct(roomsCur, roomsBase);
    const dRev = deltaPct(revCur, revBase);
    const dGuests = deltaPct(guestsCur, guestsBase);
    const dAdr = deltaPct(adrCur, adrBase);

    const cls = (d: number) => (d >= 0 ? "up" : "down");

    return [
      {
        label: "Rooms occupied",
        value: fmtInt(roomsCur),
        sub: `${fmtInt(roomsBase)} → ${fmtInt(roomsCur)}`,
        deltaLabel: `${arrow(dRooms)} ${sign(dRooms)}${dRooms.toFixed(1).replace(".", ",")}%`,
        deltaClass: cls(dRooms),
      },
      {
        label: "Room Revenue",
        value: fmtMoney(revCur),
        sub: `${fmtMoney(revBase)} → ${fmtMoney(revCur)}`,
        deltaLabel: `${arrow(dRev)} ${sign(dRev)}${dRev.toFixed(1).replace(".", ",")}%`,
        deltaClass: cls(dRev),
      },
      {
        label: "Huéspedes",
        value: fmtInt(guestsCur),
        sub: `${fmtInt(guestsBase)} → ${fmtInt(guestsCur)}`,
        deltaLabel: `${arrow(dGuests)} ${sign(dGuests)}${dGuests.toFixed(1).replace(".", ",")}%`,
        deltaClass: cls(dGuests),
      },
      {
        label: "ADR (prom. anual)",
        value: fmtMoney2(adrCur),
        sub: `${fmtMoney2(adrBase)} → ${fmtMoney2(adrCur)}`,
        deltaLabel: `${arrow(dAdr)} ${sign(dAdr)}${dAdr.toFixed(1).replace(".", ",")}%`,
        deltaClass: cls(dAdr),
      },
    ];
  }, [maiteiAggCur, maiteiAggBase]);

  // comparativa rápida (JCR)
  const compareJcr = useMemo(() => {
    const occCur = jcrAggCur.occ01;
    const occBase = jcrAggBase.occ01;
    const dOcc = deltaPP(occCur, occBase);

    return {
      occCur,
      occBase,
      dOcc,
    };
  }, [jcrAggCur, jcrAggBase]);

  // membership tabs (JCR consolidado + por hotel)
  const [memTab, setMemTab] = useState<"JCR" | "MARRIOTT" | "SHERATON MDQ" | "SHERATON BCR">("JCR");

  const memAllowedHotels = useMemo(() => {
    if (memTab === "JCR") return JCR_HOTELS;
    return [memTab];
  }, [memTab]);

  return (
    <section className="section" id="comparador">
      {/* ====== Encabezado sección ====== */}
      <div className="sectionHeader">
        <div>
          <div className="sectionKicker">Informe dinámico</div>
          <h2 className="sectionTitle">Vista ejecutiva + exploradores</h2>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Grupo <strong>JCR</strong> por un lado (Marriott + Sheraton MDQ + Sheraton BCR) y <strong>GOTEL</strong> (Maitei) al final.
          </div>
        </div>
      </div>

      {/* ====== Selector de año global ====== */}
      <YearToggle years={yearsDetected} year={year} setYear={setYear} />

      {/* ====== Debug / error CSV ====== */}
      {hofError && (
        <div className="card" style={{ marginTop: "1rem", border: "1px solid rgba(255,0,0,.35)" }}>
          <div style={{ fontWeight: 800, marginBottom: ".25rem" }}>No pude leer el CSV de H&F</div>
          <div style={{ color: "var(--muted)" }}>{hofError}</div>
          <div style={{ color: "var(--muted)", marginTop: ".5rem" }}>
            Verificá que exista: <code>{HF_CSV_PATH}</code>
          </div>
        </div>
      )}

      {/* ====== 1) Carrouseles JCR ====== */}
      <div style={{ marginTop: "1rem" }}>
        <BigCarousel4
          title={`Grupo JCR — KPIs ${year} (vs ${baseYear})`}
          year={year}
          baseYear={baseYear}
          kpis={jcrKpis}
        />
      </div>

      {/* ====== 2) Comparativa rápida ====== */}
      <div style={{ marginTop: "1rem" }} className="cardRow">
        <div className="card">
          <div className="cardTop">
            <div className="cardTitle">Ocupación (JCR) — cálculo fijo por día</div>
          </div>
          <div className="cardValue">{fmtPct01(compareJcr.occCur)}</div>
          <div className={`delta ${compareJcr.dOcc >= 0 ? "up" : "down"}`}>
            {arrow(compareJcr.dOcc)} {sign(compareJcr.dOcc)}
            {compareJcr.dOcc.toFixed(1).replace(".", ",")} p.p. vs {baseYear} (
            {fmtPct01(compareJcr.occBase)})
          </div>
          <div className="cardNote">
            Disponibilidad fija: Marriott 300/día · Sheraton MDQ 194/día · Sheraton BCR 161/día.
          </div>
        </div>

        <div className="card">
          <div className="cardTop">
            <div className="cardTitle">Cobertura de datos (JCR)</div>
          </div>
          <div className="cardNote" style={{ marginTop: ".25rem" }}>
            {JCR_HOTELS.map((h) => (
              <div key={h} style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <span>{niceTitleCaseHotel(h)}</span>
                <span style={{ color: "var(--muted)" }}>{jcrAggCur.daysByHotel[h] ?? 0} días en {year}</span>
              </div>
            ))}
          </div>
          <div className="cardNote" style={{ marginTop: ".65rem" }}>
            Total disponibilidad (año): <strong>{fmtInt(jcrAggCur.availableRooms)}</strong>
          </div>
        </div>
      </div>

      {/* ====== 3) H&F — Explorador JCR ====== */}
      <h3 className="sectionTitle" style={{ marginTop: "2.25rem" }}>
        H&amp;F — Grupo JCR
      </h3>
      <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
        Filtros por hotel (JCR) + año/mes/trimestre. Incluye ranking por mes por hotel.
      </div>

      <div style={{ marginTop: "1rem" }}>
        <HofExplorer
          filePath={HF_CSV_PATH}
          allowedHotels={JCR_HOTELS}
          title="H&F — Explorador (JCR)"
          defaultYear={year}
        />
      </div>

      {/* ====== 4) Membership — con tabs y año global ====== */}
      <h3 className="sectionTitle" style={{ marginTop: "2.5rem" }}>
        Membership — Grupo JCR
      </h3>
      <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
        Consolidado (JCR) o por hotel. Usa el mismo año global ({year}) y compara contra {baseYear}.
      </div>

      <div
        style={{
          display: "flex",
          gap: ".5rem",
          flexWrap: "wrap",
          marginTop: "1rem",
        }}
      >
        {(["JCR", "MARRIOTT", "SHERATON MDQ", "SHERATON BCR"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`kpiBtn ${memTab === t ? "active" : ""}`}
            onClick={() => setMemTab(t)}
          >
            {t === "JCR" ? "JCR (Consolidado)" : niceTitleCaseHotel(t)}
          </button>
        ))}
      </div>

      <div style={{ marginTop: "1rem" }}>
        <MembershipSummary
          year={year}
          baseYear={baseYear}
          allowedHotels={memAllowedHotels}
          filePath={MEMBERSHIP_XLSX_PATH}
          title={
            memTab === "JCR"
              ? `Membership — JCR consolidado (${year} vs ${baseYear})`
              : `Membership — ${niceTitleCaseHotel(memTab)} (${year} vs ${baseYear})`
          }
        />
      </div>

      {/* ====== 5) Nacionalidades — Ranking + Mapa ====== */}
      <h3 className="sectionTitle" style={{ marginTop: "2.5rem" }}>
        Nacionalidades — Marriott Buenos Aires
      </h3>
      <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
        Ranking y distribución global por nacionalidad (Marriott). (El ranking de países debe verse más grande; continente queda más chico dentro de esos componentes).
      </div>

      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)",
          gap: "1.25rem",
          alignItems: "stretch",
        }}
      >
        <CountryRanking year={year} filePath={NACIONALIDADES_XLSX_PATH} />
        <WorldGuestsMap year={year} filePath={NACIONALIDADES_XLSX_PATH} />
      </div>

      {/* ====== 6) Carrouseles MAITEI (GOTEL) ====== */}
      <h3 className="sectionTitle" style={{ marginTop: "2.75rem" }}>
        GOTEL Management — Hotel Maitei
      </h3>
      <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
        KPIs del hotel Maitei (administración separada). Disponibilidad fija: <strong>98</strong> habitaciones/día.
      </div>

      <div style={{ marginTop: "1rem" }}>
        <BigCarousel4
          title={`Maitei — KPIs ${year} (vs ${baseYear})`}
          year={year}
          baseYear={baseYear}
          kpis={maiteiKpis}
        />
      </div>

      {/* ====== 7) H&F — Explorador MAITEI ====== */}
      <h3 className="sectionTitle" style={{ marginTop: "2.25rem" }}>
        H&amp;F — Hotel Maitei
      </h3>
      <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
        Filtros por fecha (año/mes/trimestre) y métricas calculadas desde el CSV diario.
      </div>

      <div style={{ marginTop: "1rem" }}>
        <HofExplorer
          filePath={HF_CSV_PATH}
          allowedHotels={GOTEL_HOTELS}
          title="H&F — Explorador (Maitei)"
          defaultYear={year}
        />
      </div>

      {/* spacer */}
      <div style={{ height: "1.25rem" }} />
    </section>
  );
}
