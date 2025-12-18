"use client";

import { useEffect, useMemo, useState } from "react";
import HofExplorer from "./HofExplorer";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";
import WorldGuestsMap from "./WorldGuestsMap";
import ContinentBreakdown from "./ContinentBreakdown";
import { readCsvFromPublic } from "./csvClient";

type HofRow = {
  empresa: string;         // MARRIOTT / SHERATON MDQ / SHERATON BCR / MAITEI
  fecha: Date | null;      // parsed
  year: number;
  month: number;           // 1..12
  roomsOcc: number;        // Total Occ.
  revenue: number;         // Room Revenue
  guests: number;          // Adl. & Chl.
};

const DEFAULT_YEAR = 2025;
const BASE_YEAR = 2024;

// Disponibilidad fija por día
const AVAIL_PER_DAY: Record<string, number> = {
  MARRIOTT: 300,
  "SHERATON MDQ": 194,
  "SHERATON BCR": 161,
  MAITEI: 98,
};

const JCR_HOTELS = ["MARRIOTT", "SHERATON MDQ", "SHERATON BCR"];
const GOTEL_HOTELS = ["MAITEI"];

const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR");
const fmtMoney0 = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
const fmtPct01 = (p01: number) => (p01 * 100).toFixed(1).replace(".", ",") + "%";

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

  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

function deltaPct(cur: number, base: number) {
  if (!base) return null;
  return ((cur / base) - 1) * 100;
}

function deltaLabelPct(cur: number, base: number) {
  const d = deltaPct(cur, base);
  if (d === null) return "—";
  return `${d >= 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")}%`;
}

function deltaLabelPP(cur01: number, base01: number) {
  const dpp = (cur01 - base01) * 100;
  return `${dpp >= 0 ? "+" : ""}${dpp.toFixed(1).replace(".", ",")} p.p.`;
}

function monthName(m: number) {
  return ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][m - 1] ?? `Mes ${m}`;
}

/** ===== Carrousel grande (4 slides) ===== */
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
        bg: "linear-gradient(135deg, rgba(59,130,246,.28), rgba(15,23,42,.10))",
      },
      {
        label: "Recaudación total (Room Revenue, USD)",
        big: fmtMoney0(cur.revenue),
        delta: `${deltaLabelPct(cur.revenue, base.revenue)} vs ${baseYear}`,
        cap: `${fmtMoney0(base.revenue)} → ${fmtMoney0(cur.revenue)}`,
        bg: "linear-gradient(135deg, rgba(245,158,11,.24), rgba(15,23,42,.10))",
      },
      {
        label: "Huéspedes (Adl. & Chl.)",
        big: fmtInt(cur.guests),
        delta: `${deltaLabelPct(cur.guests, base.guests)} vs ${baseYear}`,
        cap: `${fmtInt(base.guests)} → ${fmtInt(cur.guests)}`,
        bg: "linear-gradient(135deg, rgba(16,185,129,.24), rgba(15,23,42,.10))",
      },
      {
        label: "Tarifa promedio anual (ADR)",
        big: fmtMoney0(cur.adr),
        delta: `${deltaLabelPct(cur.adr, base.adr)} vs ${baseYear}`,
        cap: `${fmtMoney0(base.adr)} → ${fmtMoney0(cur.adr)}`,
        bg: "linear-gradient(135deg, rgba(168,85,247,.20), rgba(15,23,42,.10))",
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
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <div className="sectionKicker">{subtitle}</div>
          <div className="sectionTitle" style={{ marginTop: ".15rem" }}>{title}</div>
          <div className="sectionDesc" style={{ marginTop: ".25rem" }}>
            Año seleccionado: <strong>{year}</strong> · Base: <strong>{baseYear}</strong>
          </div>
        </div>

        <div className="toggle" aria-label="Carousel controls">
          {slides.map((_, i) => (
            <button
              key={i}
              className={`toggleBtn ${idx === i ? "active" : ""}`}
              type="button"
              onClick={() => setIdx(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          marginTop: "1rem",
          padding: "1.35rem",
          borderRadius: 18,
          background: s.bg,
          minHeight: 160,
          display: "grid",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: ".95rem", color: "var(--muted)", letterSpacing: ".02em" }}>{s.label}</div>
        <div style={{ fontSize: "3.0rem", fontWeight: 900, lineHeight: 1.0, marginTop: ".15rem" }}>
          {s.big}
        </div>
        <div className="delta up" style={{ marginTop: ".35rem", fontSize: "1.0rem" }}>
          {s.delta}
        </div>
        <div className="cardNote" style={{ marginTop: ".25rem" }}>{s.cap}</div>
      </div>
    </div>
  );
}

/** Lee CSV una sola vez y deja datos listos */
function useHofRows(filePath: string) {
  const [rows, setRows] = useState<HofRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    readCsvFromPublic(filePath)
      .then(({ rows }) => {
        if (!alive) return;

        const parsed: HofRow[] = rows
          .map((r: any) => {
            const empresa = String(r.Empresa ?? r.empresa ?? "").trim().toUpperCase();
            const d = parseDateAny(r.Fecha ?? r.fecha ?? r.Date ?? r.DATE ?? "");
            const year = d ? d.getFullYear() : 0;
            const month = d ? d.getMonth() + 1 : 0;

            const roomsOcc = safeNum(r['Total\nOcc.'] ?? r["Total Occ."] ?? r.TotalOcc ?? r["Total Occ"] ?? r["Total"] ?? r["TotalOcc."]);
            const revenue = safeNum(r["Room Revenue"] ?? r.RoomRevenue ?? r.Revenue);
            const guests = safeNum(r["Adl. &\nChl."] ?? r["Adl. & Chl."] ?? r["Adl. & Chl"] ?? r.Guests ?? r["Adl.&Chl."]);

            if (!empresa || !d || !year || !month) return null;

            return { empresa, fecha: d, year, month, roomsOcc, revenue, guests } as HofRow;
          })
          .filter(Boolean) as HofRow[];

        setRows(parsed);
      })
      .catch((e) => {
        console.error(e);
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => { alive = false; };
  }, [filePath]);

  return { rows, loading };
}

/** Totales anuales por grupo (para carrousel) */
function annualTotals(rows: HofRow[], year: number, hotels: string[]) {
  const subset = rows.filter((r) => r.year === year && hotels.includes(r.empresa));

  const rooms = subset.reduce((s, r) => s + r.roomsOcc, 0);
  const revenue = subset.reduce((s, r) => s + r.revenue, 0);
  const guests = subset.reduce((s, r) => s + r.guests, 0);
  const adr = rooms > 0 ? revenue / rooms : 0;

  // ocupación ponderada: usamos disponibilidad fija por hotel * días del año presentes
  // (si faltan días, esto queda “ocupación sobre días reportados”, que es lo más honesto con el CSV)
  const daysByHotel = new Map<string, number>();
  subset.forEach((r) => {
    const key = `${r.empresa}-${r.year}-${r.month}-${r.fecha?.getDate()}`;
    // dedupe simple por día
    // (si tu csv trae 1 fila por día, con esto alcanza)
    daysByHotel.set(key, 1);
  });

  // contamos días por hotel
  const hotelDaysCount = new Map<string, number>();
  subset.forEach((r) => {
    const k = `${r.empresa}-${r.year}-${r.month}-${r.fecha?.getDate()}`;
    if (daysByHotel.get(k) !== 1) return;
    hotelDaysCount.set(r.empresa, (hotelDaysCount.get(r.empresa) ?? 0) + 1);
  });

  let available = 0;
  hotels.forEach((h) => {
    const d = hotelDaysCount.get(h) ?? 0;
    const availPerDay = AVAIL_PER_DAY[h] ?? 0;
    available += d * availPerDay;
  });

  const occ01 = available > 0 ? rooms / available : 0;

  return { rooms, revenue, guests, adr, occ01, subsetCount: subset.length };
}

export default function YearComparator() {
  const [year, setYear] = useState<number>(DEFAULT_YEAR);

  const filePath = "/data/hf_diario.csv";
  const { rows: hofRows, loading: hofLoading } = useHofRows(filePath);

  const jcrCur = useMemo(() => annualTotals(hofRows, year, JCR_HOTELS), [hofRows, year]);
  const jcrBase = useMemo(() => annualTotals(hofRows, BASE_YEAR, JCR_HOTELS), [hofRows]);

  const gotelCur = useMemo(() => annualTotals(hofRows, year, GOTEL_HOTELS), [hofRows, year]);
  const gotelBase = useMemo(() => annualTotals(hofRows, BASE_YEAR, GOTEL_HOTELS), [hofRows]);

  const yearsAvailable = useMemo(() => {
    const s = new Set<number>();
    hofRows.forEach((r) => s.add(r.year));
    return Array.from(s).sort((a, b) => a - b);
  }, [hofRows]);

  return (
    <section className="section" id="comparador">
      {/* 1) Carrouseles JCR */}
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

      {/* Filtro de años global (para TODO lo demás) */}
      <div className="stickyControls" style={{ marginTop: "1.25rem" }}>
        <div>
          <div className="stickyTitle">Filtro global</div>
          <div className="stickyHint">
            Este filtro impacta H&F, Membership y Nacionalidades.
          </div>
        </div>

        <div className="toggle">
          {(yearsAvailable.length ? yearsAvailable : [BASE_YEAR, DEFAULT_YEAR]).map((y) => (
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

      {/* 2) Comparativa 2025 vs 2024 (bloque corto) */}
      <h3 className="sectionTitle" style={{ marginTop: "2rem" }}>
        Comparativa 2025 vs 2024 (JCR)
      </h3>
      <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
        Resumen interanual del grupo (tomado del CSV H&F).
      </div>

      <div className="cardRow" style={{ marginTop: "1rem" }}>
        <div className="card">
          <div className="cardTitle">Ocupación (promedio sobre días reportados)</div>
          <div className="cardValue">{fmtPct01(jcrCur.occ01)}</div>
          <div className="delta up">
            {deltaLabelPP(jcrCur.occ01, jcrBase.occ01)} vs {BASE_YEAR}
          </div>
        </div>

        <div className="card">
          <div className="cardTitle">ADR anual</div>
          <div className="cardValue">{fmtMoney0(jcrCur.adr)}</div>
          <div className="delta up">
            {deltaLabelPct(jcrCur.adr, jcrBase.adr)} vs {BASE_YEAR}
          </div>
        </div>
      </div>

      {/* 3) H&F JCR (explorador + ranking por mes lo maneja HofExplorer) */}
      <h3 className="sectionTitle" style={{ marginTop: "2rem" }}>
        H&F – Grupo JCR
      </h3>
      <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
        Filtros por hotel JCR + año/mes/trimestre. Incluye ranking por mes por hotel.
      </div>

      <div className="cardRow" style={{ marginTop: "1rem" }}>
        <HofExplorer
          filePath="/data/hf_diario.csv"
          allowedHotels={JCR_HOTELS}
          defaultHotel="MARRIOTT"
          defaultYear={DEFAULT_YEAR}
        />
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
        {/* tarjeta grande */}
        <CountryRanking year={year} filePath="/data/jcr_nacionalidades.xlsx" variant="big" />

        <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: "1.25rem" }}>
          {/* tarjeta chica continente */}
          <ContinentBreakdown year={year} filePath="/data/jcr_nacionalidades.xlsx" />
          {/* mapa */}
          <WorldGuestsMap year={year} filePath="/data/jcr_nacionalidades.xlsx" />
        </div>
      </div>

      {/* 6) Carrouseles Maitei */}
      <div style={{ marginTop: "2.2rem" }}>
        <BigCarousel4
          title="VISTA EJECUTIVA – Maitei (GOTEL Management)"
          subtitle="Carrousel ejecutivo (4 KPIs)"
          year={year}
          baseYear={BASE_YEAR}
          cur={gotelCur}
          base={gotelBase}
        />
      </div>

      {/* 7) H&F Maitei */}
      <h3 className="sectionTitle" style={{ marginTop: "2rem" }}>
        H&F – Maitei (GOTEL)
      </h3>
      <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
        Explorador con filtros propios (no se mezcla con JCR).
      </div>

      <div className="cardRow" style={{ marginTop: "1rem" }}>
        <HofExplorer
          filePath="/data/hf_diario.csv"
          allowedHotels={GOTEL_HOTELS}
          defaultHotel="MAITEI"
          defaultYear={DEFAULT_YEAR}
        />
      </div>

      {hofLoading && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <div className="cardTitle">Cargando H&F…</div>
          <div className="cardNote">Leyendo hf_diario.csv</div>
        </div>
      )}
    </section>
  );
}

