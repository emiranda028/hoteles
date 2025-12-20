"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import HofExplorer from "./HofExplorer";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";
import WorldGuestsMap from "./WorldGuestsMap";

/**
 * YearComparator (FULL)
 * - Filtro global de AÑO (aplica a carrouseles, H&F, Membership, Nacionalidades)
 * - Filtro de AÑO BASE (para variaciones vs base)
 * - KPIs anuales calculados DESDE /public/data/hf_diario.csv (diario)
 * - JCR = Marriott + Sheraton MDQ + Sheraton BCR
 * - GOTEL = Maitei (sección separada al final)
 *
 * NOTAS IMPORTANTES (para Vercel / Next):
 * - El CSV debe estar en: public/data/hf_diario.csv  -> se accede como "/data/hf_diario.csv"
 * - Membership excel debe estar en: public/data/jcr_membership.xlsx -> "/data/jcr_membership.xlsx"
 * - Nacionalidades excel debe estar en: public/data/jcr_nacionalidades.xlsx -> "/data/jcr_nacionalidades.xlsx"
 *
 * - NO se pasa defaultHotel a HofExplorer (te rompía typings).
 * - NO se usan hooks dentro del JSX (evitamos errores de compilación).
 */

const DEFAULT_YEAR = 2025;
const DEFAULT_BASE_YEAR = 2024;

// Hoteles (normalizados)
const JCR_HOTELS = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
const GOTEL_HOTELS = ["MAITEI"];

// Disponibilidad fija por día (para ocupación)
const availPerDayByHotel: Record<string, number> = {
  MARRIOTT: 300,
  "SHERATON MDQ": 194,
  "SHERATON BCR": 161,
  MAITEI: 98,
};

// ---------- helpers formato ----------
const fmtInt = (n: number) => Math.round(n || 0).toLocaleString("es-AR");
const fmtMoney = (n: number) =>
  (n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct01 = (p01: number) => ((p01 || 0) * 100).toFixed(1).replace(".", ",") + "%";
const fmtPP = (pp: number) => (pp || 0).toFixed(1).replace(".", ",") + " p.p.";

function deltaClass(v: number): "up" | "down" | "flat" {
  if (v > 0.0001) return "up";
  if (v < -0.0001) return "down";
  return "flat";
}

function parseNumLoose(v: any): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;

  // soporta "22.441,71" (es-AR) y "22,441.71" y "22441.71"
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/\./g, "") // quita separador miles
    .replace(/,/g, ".") // coma decimal -> punto
    .replace(/[^\d.-]/g, "");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normHotel(raw: any) {
  const s = String(raw ?? "").trim().toUpperCase();

  if (!s) return "";

  // Marriott
  if (s.includes("MARRIOTT")) return "MARRIOTT";

  // Sheraton Bariloche
  if (s.includes("BARILOCHE") || s.includes("BCR")) return "SHERATON BCR";

  // Sheraton Mar del Plata
  if (s.includes("MAR DEL PLATA") || s.includes("MDQ")) return "SHERATON MDQ";

  // Maitei
  if (s.includes("MAITEI")) return "MAITEI";

  // fallback
  return s;
}

function parseDateLoose(v: any): Date | null {
  if (!v) return null;

  // Excel -> Date (a veces ya viene Date)
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  const s = String(v).trim();
  if (!s) return null;

  // ISO / parse directo
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;

  // dd/mm/yyyy o dd-mm-yyyy
  const m1 = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]) - 1;
    const yy = Number(m1[3].length === 2 ? "20" + m1[3] : m1[3]);
    const d = new Date(yy, mm, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // "01-06-22 Wed" -> tomamos "01-06-22"
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
  month: number; // 1-12
  roomsOcc: number; // Total Occ.
  guests: number; // Adl. & Chl.
  revenue: number; // Room Revenue
};

async function fetchText(path: string) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (status ${res.status})`);
  return await res.text();
}

// CSV con separador ; y headers con saltos de línea
function parseHfCsv(text: string): HfRow[] {
  if (!text?.trim()) return [];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  // Header
  const headerLine = lines[0];
  const headers = headerLine.split(";").map((h) => h.replace(/^"|"$/g, "").trim());

  const idx = (needle: string) =>
    headers.findIndex((h) => h.toLowerCase().includes(needle.toLowerCase()));

  // índices flexibles
  const iEmpresa = idx("Empresa");
  const iFecha = idx("Fecha"); // preferimos "Fecha"
  const iDate = idx("Date");
  const iOcc = idx("Total"); // "Total Occ."
  const iRevenue = idx("Room Revenue");
  const iGuests = idx("Adl.");

  const out: HfRow[] = [];

  for (let li = 1; li < lines.length; li++) {
    const cols = lines[li].split(";").map((c) => c.replace(/^"|"$/g, "").trim());

    const hotelRaw = iEmpresa >= 0 ? cols[iEmpresa] : "";
    const hotel = normHotel(hotelRaw);
    if (!hotel) continue;

    const dateRaw =
      iFecha >= 0 && cols[iFecha] ? cols[iFecha] : iDate >= 0 ? cols[iDate] : "";
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
  adr: number; // revenue / rooms
  occ01: number; // rooms / available
  availableRooms: number; // sum(availPerDay * days)
  daysCounted: number; // total días únicos por hotel sumados (debug)
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

    // días únicos por hotel
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
function useCountUp(target: number, durationMs = 950) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = value;
    const to = target;

    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setValue(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}

// ---------- UI: Carrousel Grande (4 KPIs) ----------
type CarouselKpi = {
  label: string;
  value: string;
  sub: string;
  delta?: string;
  deltaClass?: "up" | "down" | "flat";
};

function BigCarousel4(props: {
  title: string;
  subtitle: string;
  kpis: CarouselKpi[];
  autoRotate?: boolean;
  rotateMs?: number;
}) {
  const { autoRotate = true, rotateMs = 4200 } = props;

  const [slide, setSlide] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!autoRotate) return;
    if (timerRef.current) window.clearInterval(timerRef.current);

    timerRef.current = window.setInterval(() => {
      setSlide((s) => (s + 1) % 4);
    }, rotateMs);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [autoRotate, rotateMs]);

  const bgFor = (i: number) => {
    // suaves, sin “ensuciar”
    // (usa tus variables CSS si querés, acá queda elegante y neutro)
    const backgrounds = [
      "linear-gradient(135deg, rgba(0,0,0,.02), rgba(0,0,0,.00))",
      "linear-gradient(135deg, rgba(0,0,0,.01), rgba(0,0,0,.03))",
      "linear-gradient(135deg, rgba(0,0,0,.03), rgba(0,0,0,.00))",
      "linear-gradient(135deg, rgba(0,0,0,.02), rgba(0,0,0,.04))",
    ];
    return backgrounds[i % backgrounds.length];
  };

  const dots = (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: ".9rem" }}>
      {props.kpis.map((_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Slide ${i + 1}`}
          onClick={() => setSlide(i)}
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            background: i === slide ? "rgba(0,0,0,.55)" : "rgba(0,0,0,.18)",
          }}
        />
      ))}
    </div>
  );

  const card = (k: CarouselKpi, idx: number, isActive: boolean) => (
    <div
      key={k.label}
      style={{
        borderRadius: 22,
        border: "1px solid rgba(0,0,0,.07)",
        background: bgFor(idx),
        padding: "1.15rem",
        minHeight: 170,
        display: "grid",
        alignContent: "start",
        gap: ".35rem",
        boxShadow: isActive ? "0 12px 28px rgba(0,0,0,.08)" : "0 6px 16px rgba(0,0,0,.05)",
        transform: isActive ? "translateY(-2px)" : "translateY(0)",
        transition: "all .25s ease",
      }}
    >
      <div style={{ color: "var(--muted)", fontWeight: 800, letterSpacing: ".2px" }}>{k.label}</div>

      <div style={{ fontSize: "2.6rem", fontWeight: 950, lineHeight: 1.02 }}>
        {k.value}
      </div>

      {k.delta ? (
        <div className={`delta ${k.deltaClass ?? "flat"}`} style={{ width: "fit-content" }}>
          {k.delta}
        </div>
      ) : null}

      <div style={{ color: "var(--muted)", fontSize: ".98rem" }}>{k.sub}</div>
    </div>
  );

  return (
    <div className="card" style={{ padding: "1.25rem", overflow: "hidden" }}>
      <div style={{ display: "grid", gap: ".2rem" }}>
        <div className="cardTitle" style={{ fontSize: "1.25rem" }}>
          {props.title}
        </div>
        <div className="cardNote">{props.subtitle}</div>
      </div>

      {/* Desktop: grilla 4 */}
      <div
        className="hideOnMobile"
        style={{
          marginTop: "1.05rem",
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "1rem",
        }}
      >
        {props.kpis.map((k, idx) => card(k, idx, idx === slide))}
      </div>

      {/* Mobile: slide único */}
      <div className="showOnMobile" style={{ marginTop: "1.05rem" }}>
        {card(props.kpis[slide], slide, true)}
        {dots}
      </div>

      {/* Desktop dots sutiles también */}
      <div className="hideOnMobile">{dots}</div>
    </div>
  );
}

// ---------- UI: pills (si no existen en CSS, igual se ven con inline) ----------
function PillRow(props: {
  label: string;
  values: number[];
  active: number;
  onChange: (v: number) => void;
  rightAlign?: boolean;
}) {
  const { rightAlign = false } = props;
  return (
    <div style={{ display: "grid", gap: ".35rem", justifyItems: rightAlign ? "end" : "start" }}>
      <div style={{ color: "var(--muted)", fontSize: ".9rem", fontWeight: 800 }}>{props.label}</div>
      <div
        className="pillRow"
        style={{
          display: "flex",
          gap: ".45rem",
          flexWrap: "wrap",
          justifyContent: rightAlign ? "flex-end" : "flex-start",
        }}
      >
        {props.values.map((v) => (
          <button
            key={v}
            type="button"
            className={`pill ${v === props.active ? "active" : ""}`}
            onClick={() => props.onChange(v)}
            style={{
              padding: ".42rem .68rem",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,.10)",
              background: v === props.active ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.9)",
              cursor: "pointer",
              fontWeight: 800,
              fontSize: ".92rem",
            }}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- MAIN ----------
export default function YearComparator() {
  // Filtros globales
  const [year, setYear] = useState<number>(DEFAULT_YEAR);
  const [baseYear, setBaseYear] = useState<number>(DEFAULT_BASE_YEAR);

  // Cargamos hf_diario.csv (1 vez)
  const [hfRows, setHfRows] = useState<HfRow[]>([]);
  const [hfErr, setHfErr] = useState<string>("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setHfErr("");
        const text = await fetchText("/data/hf_diario.csv");
        if (!alive) return;
        setHfRows(parseHfCsv(text));
      } catch (e: any) {
        if (!alive) return;
        setHfRows([]);
        setHfErr(e?.message ?? "Error cargando hf_diario.csv");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Años disponibles reales según CSV
  const yearsAvailable = useMemo(() => {
    const s = new Set<number>();
    for (const r of hfRows) s.add(r.year);

    const arr = Array.from(s).sort((a, b) => b - a);

    // fallback si todavía no cargó
    return arr.length ? arr : [2026, 2025, 2024, 2023, 2022];
  }, [hfRows]);

  // Si el año elegido no existe (por ejemplo, CSV incompleto), lo corregimos
  useEffect(() => {
    if (!yearsAvailable.includes(year)) {
      setYear(yearsAvailable[0] ?? DEFAULT_YEAR);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearsAvailable.join("|")]);

  useEffect(() => {
    if (baseYear === year) {
      // set base a la próxima opción disponible
      const candidate = yearsAvailable.find((y) => y !== year);
      if (candidate) setBaseYear(candidate);
    } else if (!yearsAvailable.includes(baseYear)) {
      const candidate = yearsAvailable.find((y) => y !== year);
      if (candidate) setBaseYear(candidate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, yearsAvailable.join("|")]);

  // Agregados JCR / GOTEL
  const jcrCur = useMemo(() => calcAgg(hfRows, JCR_HOTELS, year), [hfRows, year]);
  const jcrBase = useMemo(() => calcAgg(hfRows, JCR_HOTELS, baseYear), [hfRows, baseYear]);

  const maiteiCur = useMemo(() => calcAgg(hfRows, GOTEL_HOTELS, year), [hfRows, year]);
  const maiteiBase = useMemo(() => calcAgg(hfRows, GOTEL_HOTELS, baseYear), [hfRows, baseYear]);

  // Deltas JCR
  const dRooms = jcrBase.rooms > 0 ? (jcrCur.rooms / jcrBase.rooms - 1) * 100 : 0;
  const dGuests = jcrBase.guests > 0 ? (jcrCur.guests / jcrBase.guests - 1) * 100 : 0;
  const dRev = jcrBase.revenue > 0 ? (jcrCur.revenue / jcrBase.revenue - 1) * 100 : 0;
  const dAdr = jcrBase.adr > 0 ? (jcrCur.adr / jcrBase.adr - 1) * 100 : 0;
  const dOccPP = (jcrCur.occ01 - jcrBase.occ01) * 100;

  // Deltas Maitei
  const dRoomsM = maiteiBase.rooms > 0 ? (maiteiCur.rooms / maiteiBase.rooms - 1) * 100 : 0;
  const dGuestsM = maiteiBase.guests > 0 ? (maiteiCur.guests / maiteiBase.guests - 1) * 100 : 0;
  const dRevM = maiteiBase.revenue > 0 ? (maiteiCur.revenue / maiteiBase.revenue - 1) * 100 : 0;
  const dAdrM = maiteiBase.adr > 0 ? (maiteiCur.adr / maiteiBase.adr - 1) * 100 : 0;
  const dOccPPM = (maiteiCur.occ01 - maiteiBase.occ01) * 100;

  // Animación de números (solo valores)
  const roomsAnim = useCountUp(jcrCur.rooms);
  const guestsAnim = useCountUp(jcrCur.guests);
  const revAnim = useCountUp(jcrCur.revenue);
  const adrAnim = useCountUp(jcrCur.adr);

  // Texto ocupación JCR
  const occLineJcr = useMemo(() => {
    return {
      cur: fmtPct01(jcrCur.occ01),
      base: fmtPct01(jcrBase.occ01),
      pp: `${dOccPP >= 0 ? "+" : ""}${fmtPP(dOccPP)}`,
    };
  }, [jcrCur.occ01, jcrBase.occ01, dOccPP]);

  // KPI Cards JCR (4)
  const jcrKpis: CarouselKpi[] = useMemo(() => {
    return [
      {
        label: "Rooms occupied",
        value: fmtInt(roomsAnim),
        delta: `${dRooms >= 0 ? "+" : ""}${dRooms.toFixed(1).replace(".", ",")}% vs ${baseYear}`,
        deltaClass: deltaClass(dRooms),
        sub: `${fmtInt(jcrBase.rooms)} → ${fmtInt(jcrCur.rooms)}`,
      },
      {
        label: "Room Revenue (USD)",
        value: fmtMoney(revAnim),
        delta: `${dRev >= 0 ? "+" : ""}${dRev.toFixed(1).replace(".", ",")}% vs ${baseYear}`,
        deltaClass: deltaClass(dRev),
        sub: `${fmtMoney(jcrBase.revenue)} → ${fmtMoney(jcrCur.revenue)}`,
      },
      {
        label: "Huéspedes",
        value: fmtInt(guestsAnim),
        delta: `${dGuests >= 0 ? "+" : ""}${dGuests.toFixed(1).replace(".", ",")}% vs ${baseYear}`,
        deltaClass: deltaClass(dGuests),
        sub: `${fmtInt(jcrBase.guests)} → ${fmtInt(jcrCur.guests)}`,
      },
      {
        label: "ADR (USD)",
        value: fmtMoney(adrAnim),
        delta: `${dAdr >= 0 ? "+" : ""}${dAdr.toFixed(1).replace(".", ",")}% vs ${baseYear}`,
        deltaClass: deltaClass(dAdr),
        sub: `${fmtMoney(jcrBase.adr)} → ${fmtMoney(jcrCur.adr)}`,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    roomsAnim,
    guestsAnim,
    revAnim,
    adrAnim,
    dRooms,
    dGuests,
    dRev,
    dAdr,
    baseYear,
    jcrBase.rooms,
    jcrCur.rooms,
    jcrBase.guests,
    jcrCur.guests,
    jcrBase.revenue,
    jcrCur.revenue,
    jcrBase.adr,
    jcrCur.adr,
  ]);

  // KPI Cards Maitei (4) — sin animación (podés agregar igual, pero no es necesario)
  const maiteiKpis: CarouselKpi[] = useMemo(() => {
    return [
      {
        label: "Rooms occupied",
        value: fmtInt(maiteiCur.rooms),
        delta: `${dRoomsM >= 0 ? "+" : ""}${dRoomsM.toFixed(1).replace(".", ",")}% vs ${baseYear}`,
        deltaClass: deltaClass(dRoomsM),
        sub: `${fmtInt(maiteiBase.rooms)} → ${fmtInt(maiteiCur.rooms)}`,
      },
      {
        label: "Room Revenue (USD)",
        value: fmtMoney(maiteiCur.revenue),
        delta: `${dRevM >= 0 ? "+" : ""}${dRevM.toFixed(1).replace(".", ",")}% vs ${baseYear}`,
        deltaClass: deltaClass(dRevM),
        sub: `${fmtMoney(maiteiBase.revenue)} → ${fmtMoney(maiteiCur.revenue)}`,
      },
      {
        label: "Huéspedes",
        value: fmtInt(maiteiCur.guests),
        delta: `${dGuestsM >= 0 ? "+" : ""}${dGuestsM.toFixed(1).replace(".", ",")}% vs ${baseYear}`,
        deltaClass: deltaClass(dGuestsM),
        sub: `${fmtInt(maiteiBase.guests)} → ${fmtInt(maiteiCur.guests)}`,
      },
      {
        label: "ADR (USD)",
        value: fmtMoney(maiteiCur.adr),
        delta: `${dAdrM >= 0 ? "+" : ""}${dAdrM.toFixed(1).replace(".", ",")}% vs ${baseYear}`,
        deltaClass: deltaClass(dAdrM),
        sub: `${fmtMoney(maiteiBase.adr)} → ${fmtMoney(maiteiCur.adr)}`,
      },
    ];
  }, [
    maiteiCur.rooms,
    maiteiCur.guests,
    maiteiCur.revenue,
    maiteiCur.adr,
    maiteiBase.rooms,
    maiteiBase.guests,
    maiteiBase.revenue,
    maiteiBase.adr,
    dRoomsM,
    dGuestsM,
    dRevM,
    dAdrM,
    baseYear,
  ]);

  const occLineMaitei = useMemo(() => {
    return {
      cur: fmtPct01(maiteiCur.occ01),
      base: fmtPct01(maiteiBase.occ01),
      pp: `${dOccPPM >= 0 ? "+" : ""}${fmtPP(dOccPPM)}`,
    };
  }, [maiteiCur.occ01, maiteiBase.occ01, dOccPPM]);

  // Render
  return (
    <section className="section" id="comparador">
      {/* ===== HEADER + FILTROS GLOBALES ===== */}
      <div className="sectionHeader" style={{ alignItems: "flex-end", gap: "1rem" }}>
        <div>
          <div className="sectionKicker">VISTA EJECUTIVA</div>
          <h2 className="sectionTitle">Informe dinámico</h2>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Filtros y cálculos automáticos: <strong>Grupo JCR</strong> por un lado y{" "}
            <strong>GOTEL / Maitei</strong> por separado.
          </div>
        </div>

        <div style={{ display: "grid", gap: ".75rem" }}>
          <PillRow
            label="Año (global)"
            values={yearsAvailable}
            active={year}
            onChange={setYear}
            rightAlign
          />

          <PillRow
            label="Año base (comparativo)"
            values={yearsAvailable.filter((y) => y !== year)}
            active={baseYear}
            onChange={setBaseYear}
            rightAlign
          />
        </div>
      </div>

      {/* ===== 1) CARROUSEL JCR (GRANDE) ===== */}
      <div style={{ display: "grid", gap: "1rem", marginTop: ".9rem" }}>
        <BigCarousel4
          title="Grupo JCR — KPIs anuales"
          subtitle={`Año ${year} vs ${baseYear} · Ocupación: ${occLineJcr.base} → ${occLineJcr.cur} (${occLineJcr.pp})`}
          kpis={jcrKpis}
          autoRotate
          rotateMs={4200}
        />

        {hfErr ? (
          <div className="card" style={{ padding: "1rem" }}>
            <div className="delta down">{hfErr}</div>
            <div className="cardNote" style={{ marginTop: ".35rem" }}>
              Revisá que exista <code>public/data/hf_diario.csv</code> (ruta pública <code>/data/hf_diario.csv</code>).
            </div>
          </div>
        ) : null}
      </div>

      {/* ===== 2) COMPARATIVA (TEXTO CORTO, SIN “ENSUCIAR”) ===== */}
      <div className="card" style={{ padding: "1.15rem", marginTop: "1rem" }}>
        <div className="cardTitle">Comparativa {year} vs {baseYear}</div>
        <div className="cardNote" style={{ marginTop: ".35rem" }}>
          Ocupación con disponibilidad fija: Marriott 300/día · Sheraton MDQ 194/día · Sheraton BCR 161/día · Maitei 98/día.
        </div>
      </div>

      {/* ===== 3) H&F — JCR ===== */}
      <div style={{ marginTop: "1rem" }}>
        <HofExplorer
          filePath="/data/hf_diario.csv"
          allowedHotels={JCR_HOTELS}
          title="H&F — Grupo JCR"
          defaultYear={year}
        />
      </div>

      {/* ===== 4) MEMBERSHIP — JCR (con filtro global de año) ===== */}
      <div style={{ marginTop: "1rem" }}>
        <MembershipSummary
          year={year}
          baseYear={baseYear}
          allowedHotels={JCR_HOTELS}
          filePath="/data/jcr_membership.xlsx"
          title="Membership (JCR)"
        />
      </div>

      {/* ===== 5) NACIONALIDADES (ranking país grande + continente chico + mapa) =====
          IMPORTANTE: acá asumimos que tus componentes aceptan (year, filePath).
          Si alguno no los acepta, ajustá su firma o dejalo sin props.
      */}
      <section className="section" style={{ marginTop: "1rem" }}>
        <div className="sectionHeader">
          <div>
            <div className="sectionKicker">Origen de huéspedes</div>
            <h3 className="sectionTitle">Huéspedes por país — Marriott Buenos Aires</h3>
            <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
              Ranking y distribución global por nacionalidad (fuente: Excel operativo).
            </div>
          </div>
        </div>

        {/* Layout: País grande / Continente + Mapa a la derecha (map más grande) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)",
            gap: "1.25rem",
            alignItems: "stretch",
          }}
        >
          {/* CountryRanking: hacelo “grande” desde adentro (cards) */}
          <CountryRanking year={year} filePath="/data/jcr_nacionalidades.xlsx" />

          {/* Mapa */}
          <WorldGuestsMap year={year} filePath="/data/jcr_nacionalidades.xlsx" />
        </div>

        {/* Si vos tenés una sección de continentes separada en otro componente,
            la idea es que vaya más chica. Si todavía no existe, la dejamos fuera. */}
      </section>

      {/* ===== 6) CARROUSEL MAITEI (GOTEL) — AL FINAL ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionHeader">
          <div>
            <div className="sectionKicker">GOTEL Management</div>
            <h3 className="sectionTitle">Hotel Maitei</h3>
            <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
              Bloque independiente del Grupo JCR.
            </div>
          </div>
        </div>

        <BigCarousel4
          title="Maitei — KPIs anuales"
          subtitle={`Año ${year} vs ${baseYear} · Ocupación: ${occLineMaitei.base} → ${occLineMaitei.cur} (${occLineMaitei.pp})`}
          kpis={maiteiKpis}
          autoRotate
          rotateMs={4400}
        />
      </div>

      {/* ===== 7) H&F — MAITEI ===== */}
      <div style={{ marginTop: "1rem" }}>
        <HofExplorer
          filePath="/data/hf_diario.csv"
          allowedHotels={GOTEL_HOTELS}
          title="H&F — Maitei"
          defaultYear={year}
        />
      </div>

      {/* Espaciado final */}
      <div style={{ marginTop: "1.25rem" }} />
    </section>
  );
}
