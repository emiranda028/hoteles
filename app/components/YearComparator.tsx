"use client";

import { useEffect, useMemo, useState } from "react";

import HofExplorer from "./HofExplorer";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";
import ContinentBreakdown from "./ContinentBreakdown";
import WorldGuestsMap from "./WorldGuestsMap";

/**
 * YearComparator
 * - Carrusel grande JCR (4 KPIs) + filtro global de año
 * - Comparativa 2025 vs 2024 (JCR)
 * - H&F Explorador (JCR)
 * - Membership (JCR)
 * - Nacionalidades (Marriott) + Continente + Mapa
 * - Carrusel Maitei (Gotel)
 * - H&F Explorador (Maitei)
 */

/** ===== Config ===== */
const DEFAULT_YEAR = 2025;
const BASE_YEAR = 2024;

const JCR_HOTELS = ["MARRIOTT", "SHERATON MDQ", "SHERATON BCR"];
const GOTEL_HOTELS = ["MAITEI"];

const AVAIL_PER_DAY: Record<string, number> = {
  MARRIOTT: 300,
  "SHERATON MDQ": 194,
  "SHERATON BCR": 161,
  MAITEI: 98,
};

/** ===== Utils ===== */
function safeNum(v: any) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  // soporta "22.441,71" y "22441.71"
  const norm = s.replace(/\./g, "").replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

function parseDateAny(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  const s = String(v).trim();

  // "1/6/2022"
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // "01-06-22 Wed" o "01-06-2022"
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
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

function fmtInt(n: number) {
  return (Number.isFinite(n) ? n : 0).toLocaleString("es-AR");
}

// dinero SIN “M” (como querías)
function fmtMoney0(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct01(x01: number) {
  const v = Number.isFinite(x01) ? x01 : 0;
  return (v * 100).toFixed(1).replace(".", ",") + "%";
}

function deltaPct(cur: number, base: number) {
  if (!base) return null;
  return ((cur / base) - 1) * 100;
}

function deltaPP(cur01: number, base01: number) {
  return (cur01 - base01) * 100;
}

function deltaClass(d: number | null) {
  if (d === null) return "";
  if (d > 0) return "up";
  if (d < 0) return "down";
  return "";
}

function deltaLabelPct(cur: number, base: number) {
  const d = deltaPct(cur, base);
  if (d === null) return "—";
  return `${d >= 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")}%`;
}

function deltaLabelPP(cur01: number, base01: number) {
  const dpp = deltaPP(cur01, base01);
  return `${dpp >= 0 ? "+" : ""}${dpp.toFixed(1).replace(".", ",")} p.p.`;
}

/** ===== CSV hook ===== */
type HofRow = {
  empresa: string;
  fecha: Date;
  year: number;
  month: number;
  roomsOcc: number;
  revenue: number;
  guests: number;
};

function useHofRows(filePath: string) {
  const [rows, setRows] = useState<HofRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    fetch(filePath)
      .then((r) => r.text())
      .then((text) => {
        if (!alive) return;

        // CSV puede venir con ; y saltos en headers
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);

        if (!lines.length) {
          setRows([]);
          return;
        }

        // parse simple: detect ; o ,
        const sep = lines[0].includes(";") ? ";" : ",";

        const headers = lines[0]
          .split(sep)
          .map((h) => h.replace(/^"|"$/g, "").trim());

        const idx = (nameCandidates: string[]) => {
          const u = headers.map((h) => h.toUpperCase());
          for (const cand of nameCandidates) {
            const p = u.indexOf(cand.toUpperCase());
            if (p >= 0) return p;
          }
          return -1;
        };

        const iDate = idx(["DATE", "FECHA", "Fecha"]);
        const iEmpresa = idx(["EMPRESA", "Empresa"]);
        const iRooms = idx(['"TOTAL\nOCC."', "TOTAL OCC.", "TOTAL OCC", "TOTALOCC", "ROOMS OCC", "ROOMSOCC"]);
        const iRevenue = idx(["ROOM REVENUE", "REVENUE"]);
        const iGuests = idx(['"ADL. &\nCHL."', "ADL. & CHL.", "ADL. & CHL", "GUESTS", "ADL.&CHL."]);

        const parsed: HofRow[] = [];

        for (let k = 1; k < lines.length; k++) {
          const cols = lines[k].split(sep).map((c) => c.replace(/^"|"$/g, "").trim());

          const empresa = (cols[iEmpresa] ?? "").toString().trim().toUpperCase();
          const d = parseDateAny(cols[iDate]);
          const roomsOcc = safeNum(cols[iRooms]);
          const revenue = safeNum(cols[iRevenue]);
          const guests = safeNum(cols[iGuests]);

          if (!empresa || !d) continue;

          parsed.push({
            empresa,
            fecha: d,
            year: d.getFullYear(),
            month: d.getMonth() + 1,
            roomsOcc,
            revenue,
            guests,
          });
        }

        setRows(parsed);
      })
      .catch((e) => {
        console.error("CSV error:", e);
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => {
      alive = false;
    };
  }, [filePath]);

  return { rows, loading };
}

/** ===== Totales anuales por grupo (para carruseles) ===== */
function annualTotals(rows: HofRow[], year: number, hotels: string[]) {
  const subset = rows.filter((r) => r.year === year && hotels.includes(r.empresa));

  const rooms = subset.reduce((s, r) => s + r.roomsOcc, 0);
  const revenue = subset.reduce((s, r) => s + r.revenue, 0);
  const guests = subset.reduce((s, r) => s + r.guests, 0);
  const adr = rooms > 0 ? revenue / rooms : 0;

  // días reportados (dedupe por hotel+fecha)
  const dayKey = new Set<string>();
  const hotelDays = new Map<string, number>();
  subset.forEach((r) => {
    const k = `${r.empresa}-${r.fecha.toDateString()}`;
    if (dayKey.has(k)) return;
    dayKey.add(k);
    hotelDays.set(r.empresa, (hotelDays.get(r.empresa) ?? 0) + 1);
  });

  let available = 0;
  hotels.forEach((h) => {
    const d = hotelDays.get(h) ?? 0;
    available += d * (AVAIL_PER_DAY[h] ?? 0);
  });

  const occ01 = available > 0 ? rooms / available : 0;

  return { rooms, revenue, guests, adr, occ01 };
}

/** ===== Carrusel grande (4 slides) ===== */
function BigCarousel4({
  title,
  subtitle,
  year,
  baseYear,
  cur,
  base,
}: {
  title: string;
  subtitle: string;
  year: number;
  baseYear: number;
  cur: { rooms: number; revenue: number; guests: number; adr: number; occ01: number };
  base: { rooms: number; revenue: number; guests: number; adr: number; occ01: number };
}) {
  const slides = useMemo(() => {
    return [
      {
        label: "Habitaciones ocupadas",
        big: fmtInt(cur.rooms),
        delta: `${deltaLabelPct(cur.rooms, base.rooms)} vs ${baseYear}`,
        cap: `${fmtInt(base.rooms)} → ${fmtInt(cur.rooms)}`,
      },
      {
        label: "Recaudación total (Room Revenue, USD)",
        big: fmtMoney0(cur.revenue),
        delta: `${deltaLabelPct(cur.revenue, base.revenue)} vs ${baseYear}`,
        cap: `${fmtMoney0(base.revenue)} → ${fmtMoney0(cur.revenue)}`,
      },
      {
        label: "Huéspedes (Adl. & Chl.)",
        big: fmtInt(cur.guests),
        delta: `${deltaLabelPct(cur.guests, base.guests)} vs ${baseYear}`,
        cap: `${fmtInt(base.guests)} → ${fmtInt(cur.guests)}`,
      },
      {
        label: "Tarifa promedio anual (ADR)",
        big: fmtMoney0(cur.adr),
        delta: `${deltaLabelPct(cur.adr, base.adr)} vs ${baseYear}`,
        cap: `${fmtMoney0(base.adr)} → ${fmtMoney0(cur.adr)}`,
      },
    ];
  }, [cur, base, baseYear]);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((x) => (x + 1) % slides.length), 3200);
    return () => clearInterval(t);
  }, [slides.length]);

  const s = slides[idx];

  return (
    <div className="card" style={{ padding: "1.25rem", borderRadius: 22, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }}>
        <div>
          <div className="cardTitle" style={{ fontSize: ".95rem" }}>
            {title}
          </div>
          <div className="cardNote" style={{ marginTop: ".15rem" }}>
            {subtitle} · Año {year}
          </div>
        </div>

        <div className="toggle" aria-label="slides">
          {slides.map((_, i) => (
            <button
              key={i}
              className={`toggleBtn ${idx === i ? "active" : ""}`}
              onClick={() => setIdx(i)}
              type="button"
              title={`Slide ${i + 1}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: "1.1rem" }}>
        <div style={{ fontSize: "clamp(2.2rem, 3.2vw, 3.1rem)", fontWeight: 900, letterSpacing: "-.02em" }}>
          {s.big}
        </div>

        <div className={`delta ${deltaClass(idx === 0 ? deltaPct(cur.rooms, base.rooms) : idx === 1 ? deltaPct(cur.revenue, base.revenue) : idx === 2 ? deltaPct(cur.guests, base.guests) : deltaPct(cur.adr, base.adr))}`} style={{ display: "inline-flex", marginTop: ".75rem" }}>
          {s.delta}
        </div>

        <div className="cardNote" style={{ marginTop: ".85rem" }}>
          {s.label} · {s.cap}
        </div>
      </div>
    </div>
  );
}

export default function YearComparator() {
  const filePath = "/data/hf_diario.csv";
  const { rows: hofRows, loading: hofLoading } = useHofRows(filePath);

  const yearsAvailable = useMemo(() => {
    const s = new Set<number>();
    hofRows.forEach((r) => s.add(r.year));
    const arr = Array.from(s).sort((a, b) => a - b);
    return arr.length ? arr : [BASE_YEAR, DEFAULT_YEAR];
  }, [hofRows]);

  const [year, setYear] = useState<number>(DEFAULT_YEAR);

  // si el año no existe aún, cae al último disponible (o 2025 si está)
  useEffect(() => {
    if (!yearsAvailable.length) return;
    if (!yearsAvailable.includes(year)) {
      const prefer = yearsAvailable.includes(DEFAULT_YEAR) ? DEFAULT_YEAR : yearsAvailable[yearsAvailable.length - 1];
      setYear(prefer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearsAvailable.join("|")]);

  const jcrCur = useMemo(() => annualTotals(hofRows, year, JCR_HOTELS), [hofRows, year]);
  const jcrBase = useMemo(() => annualTotals(hofRows, BASE_YEAR, JCR_HOTELS), [hofRows]);

  const gotelCur = useMemo(() => annualTotals(hofRows, year, GOTEL_HOTELS), [hofRows, year]);
  const gotelBase = useMemo(() => annualTotals(hofRows, BASE_YEAR, GOTEL_HOTELS), [hofRows]);

  // timestamp solo cliente (evita hidratación)
  const [lastUpdated, setLastUpdated] = useState<string>("—");
  useEffect(() => {
    setLastUpdated(new Date().toLocaleString("es-AR"));
  }, []);

  return (
    <section className="section" id="comparador">
      {/* 1) Carrusel grande JCR */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: "1rem" }}>
        <BigCarousel4
          title="VISTA EJECUTIVA – Grupo JCR"
          subtitle="Carrousel ejecutivo (4 KPIs)"
          year={year}
          baseYear={BASE_YEAR}
          cur={jcrCur}
          base={jcrBase}
        />
      </div>

      {/* Filtro global (sticky) */}
      <div className="stickyControls" style={{ marginTop: "1.25rem" }}>
        <div>
          <div className="stickyTitle">Filtro global</div>
          <div className="stickyHint">
            Impacta H&amp;F, Membership y Nacionalidades · Última actualización: <strong>{lastUpdated}</strong>
          </div>
        </div>

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

      {/* 2) Comparativa 2025 vs 2024 (JCR) */}
      <h3 className="sectionTitle" style={{ marginTop: "2rem" }}>
        Comparativa 2025 vs 2024 (JCR)
      </h3>
      <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
        Resumen interanual del grupo (calculado desde H&amp;F CSV). {hofLoading ? "Cargando…" : ""}
      </div>

      <div className="cardGrid" style={{ marginTop: "1rem" }}>
        <div className="card">
          <div className="cardTitle">Rooms occupied</div>
          <div className="cardValue">{fmtInt(jcrCur.rooms)}</div>
          <div className={`delta ${deltaClass(deltaPct(jcrCur.rooms, jcrBase.rooms))}`}>
            {deltaLabelPct(jcrCur.rooms, jcrBase.rooms)} vs {BASE_YEAR}
          </div>
        </div>

        <div className="card">
          <div className="cardTitle">Room Revenue (USD)</div>
          <div className="cardValue">{fmtMoney0(jcrCur.revenue)}</div>
          <div className={`delta ${deltaClass(deltaPct(jcrCur.revenue, jcrBase.revenue))}`}>
            {deltaLabelPct(jcrCur.revenue, jcrBase.revenue)} vs {BASE_YEAR}
          </div>
        </div>

        <div className="card">
          <div className="cardTitle">Huéspedes</div>
          <div className="cardValue">{fmtInt(jcrCur.guests)}</div>
          <div className={`delta ${deltaClass(deltaPct(jcrCur.guests, jcrBase.guests))}`}>
            {deltaLabelPct(jcrCur.guests, jcrBase.guests)} vs {BASE_YEAR}
          </div>
        </div>

        <div className="card">
          <div className="cardTitle">Ocupación</div>
          <div className="cardValue">{fmtPct01(jcrCur.occ01)}</div>
          <div className={`delta ${deltaClass(deltaPP(jcrCur.occ01, jcrBase.occ01))}`}>
            {deltaLabelPP(jcrCur.occ01, jcrBase.occ01)} vs {BASE_YEAR}
          </div>
        </div>

        <div className="card">
          <div className="cardTitle">ADR anual</div>
          <div className="cardValue">{fmtMoney0(jcrCur.adr)}</div>
          <div className={`delta ${deltaClass(deltaPct(jcrCur.adr, jcrBase.adr))}`}>
            {deltaLabelPct(jcrCur.adr, jcrBase.adr)} vs {BASE_YEAR}
          </div>
        </div>
      </div>

      {/* 3) H&F Explorador JCR */}
      <h3 className="sectionTitle" style={{ marginTop: "2rem" }}>
        H&amp;F – Grupo JCR
      </h3>
      <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
        Filtros por hotel JCR + año/mes/trimestre. Incluye ranking por mes por hotel.
      </div>
      <div className="cardRow" style={{ marginTop: "1rem" }}>
        <HofExplorer filePath={filePath} allowedHotels={JCR_HOTELS} title="H&F – Grupo JCR" defaultYear={year} />
      </div>

      {/* 4) Membership */}
      <h3 className="sectionTitle" style={{ marginTop: "2rem" }}>
        Membership (JCR)
      </h3>
      <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
        Cantidades + gráficos (desde Excel). Usa el filtro global de año.
      </div>
      <div className="cardRow" style={{ marginTop: "1rem" }}>
        <MembershipSummary
          year={year}
          baseYear={BASE_YEAR}
          hotelsJCR={["MARRIOTT", "SHERATON MDQ", "SHERATON BCR"]}
          filePath="/data/jcr_membership.xlsx"
        />
      </div>

      {/* 5) Nacionalidades */}
      <h3 className="sectionTitle" style={{ marginTop: "2rem" }}>
        Nacionalidades – Marriott
      </h3>
      <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
        Ranking con mapa. Tarjeta grande por país + tarjeta chica por continente.
      </div>

      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, .85fr)",
          gap: "1.25rem",
          alignItems: "stretch",
        }}
      >
        <CountryRanking year={year} filePath="/data/jcr_nacionalidades.xlsx" variant="big" />

        <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: "1.25rem" }}>
          <ContinentBreakdown year={year} filePath="/data/jcr_nacionalidades.xlsx" />
          <WorldGuestsMap year={year} filePath="/data/jcr_nacionalidades.xlsx" />
        </div>
      </div>

      {/* 6) Carrusel Maitei / GOTEL */}
      <div style={{ marginTop: "2.5rem", display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: "1rem" }}>
        <BigCarousel4
          title="VISTA EJECUTIVA – Maitei (GOTEL)"
          subtitle="Carrousel ejecutivo (4 KPIs)"
          year={year}
          baseYear={BASE_YEAR}
          cur={gotelCur}
          base={gotelBase}
        />
      </div>

      {/* 7) H&F Explorador Maitei */}
      <h3 className="sectionTitle" style={{ marginTop: "2rem" }}>
        H&amp;F – Maitei (GOTEL)
      </h3>
      <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
        Filtros por hotel + año/mes/trimestre. Ocupación calculada con disponibilidad fija (Maitei: 98 hab/día).
      </div>
      <div className="cardRow" style={{ marginTop: "1rem" }}>
        <HofExplorer filePath={filePath} allowedHotels={["MAITEI"]} title="H&F – Maitei (GOTEL)" defaultYear={year} />
      </div>
    </section>
  );
}


