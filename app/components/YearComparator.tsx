"use client";

import { useEffect, useMemo, useState } from "react";

// Secciones existentes (no las rompo)
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";
import WorldGuestsMap from "./WorldGuestsMap";
import HofExplorer from "./HofExplorer";

// =====================
// Tipos y helpers
// =====================
type Metrics = {
  rooms: number;     // Rooms occupied
  guests: number;    // Huéspedes
  revenue: number;   // Room Revenue (USD, número completo)
  occ: number;       // Ocupación 0-1
  adr: number;       // ADR (USD, anual promedio)
};

type HotelsMap = Record<string, Metrics>;

type DataYear = {
  jcr: { hotels: HotelsMap };
  gotel: { hotels: HotelsMap };
};

// ✅ IMPORTANTE
// Este bloque es el que alimenta el carrusel degradé + comparativas.
// Si tus números reales ya vienen desde H&F, podés actualizar acá con los anuales reales.
// Mientras tanto, esto “SIEMPRE” va a mostrar KPIs (y no se rompe por CSV).
const DATA: Record<number, DataYear> = {
  2024: {
    jcr: {
      hotels: {
        "Marriott Buenos Aires": { rooms: 108592, guests: 175830, revenue: 18100000, occ: 0.488, adr: 157 },
        "Sheraton Mar del Plata": { rooms: 0, guests: 0, revenue: 0, occ: 0, adr: 0 },
        "Sheraton Bariloche": { rooms: 0, guests: 0, revenue: 0, occ: 0, adr: 0 },
      },
    },
    gotel: {
      hotels: {
        "Hotel Maitei": { rooms: 0, guests: 0, revenue: 0, occ: 0, adr: 0 },
      },
    },
  },
  2025: {
    jcr: {
      hotels: {
        "Marriott Buenos Aires": { rooms: 126786, guests: 199320, revenue: 20400000, occ: 0.456, adr: 170 },
        "Sheraton Mar del Plata": { rooms: 0, guests: 0, revenue: 0, occ: 0, adr: 0 },
        "Sheraton Bariloche": { rooms: 0, guests: 0, revenue: 0, occ: 0, adr: 0 },
      },
    },
    gotel: {
      hotels: {
        "Hotel Maitei": { rooms: 0, guests: 0, revenue: 0, occ: 0, adr: 0 },
      },
    },
  },
};

// Logos (ajustá si tus paths difieren)
const HOTEL_LOGOS: Record<string, string> = {
  "Marriott Buenos Aires": "/logos/marriott.png",
  "Sheraton Mar del Plata": "/logos/sheraton-mdq-2025.jpg",
  "Sheraton Bariloche": "/logos/sheraton-bcr.png",
  "Hotel Maitei": "/logos/maitei.png",
};

const JCR_HOTELS_CANON = ["Marriott Buenos Aires", "Sheraton Mar del Plata", "Sheraton Bariloche"];
const GOTEL_HOTELS_CANON = ["Hotel Maitei"];

// En H&F tu CSV usa “MARRIOTT”, “SHERATON MDQ”, “SHERATON BCR”, “MAITEI”
const HOF_JCR_ALLOWED = ["MARRIOTT", "SHERATON MDQ", "SHERATON BCR"];
const HOF_GOTEL_ALLOWED = ["MAITEI"];

// Formateadores
const fmtInt = (n: number) => Math.round(n || 0).toLocaleString("es-AR");
const fmtUsd = (n: number) =>
  (n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd0 = (n: number) => Math.round(n || 0).toLocaleString("es-AR");
const fmtPct01 = (p: number) => ((p || 0) * 100).toFixed(1).replace(".", ",") + "%";

function deltaPct(cur: number, base: number) {
  if (!base) return 0;
  return ((cur / base) - 1) * 100;
}
function deltaPP(curOcc01: number, baseOcc01: number) {
  return ((curOcc01 || 0) - (baseOcc01 || 0)) * 100;
}
const deltaClass = (d: number) => (d >= 0 ? "up" : "down");

// Animación numérica suave
function animate(from: number, to: number, ms: number, setter: (v: number) => void) {
  const start = performance.now();
  function step(now: number) {
    const t = Math.min((now - start) / ms, 1);
    setter(from + (to - from) * t);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/**
 * Consolida un grupo desde hoteles.
 * Ocupación ponderada usando available inferido: available = occupied / occ
 */
function computeGroupFromHotels(hotels: HotelsMap): Metrics {
  let roomsOccupiedSum = 0;
  let guestsSum = 0;
  let revenueSum = 0;
  let roomsAvailableSum = 0;
  let adrWeightedSum = 0;
  let adrWeight = 0;

  Object.values(hotels).forEach((h) => {
    roomsOccupiedSum += h.rooms || 0;
    guestsSum += h.guests || 0;
    revenueSum += h.revenue || 0;

    const occ = Math.max(h.occ || 0, 0.0001);
    roomsAvailableSum += (h.rooms || 0) / occ;

    // ADR ponderado por rooms occupied
    if ((h.adr || 0) > 0 && (h.rooms || 0) > 0) {
      adrWeightedSum += (h.adr || 0) * (h.rooms || 0);
      adrWeight += (h.rooms || 0);
    }
  });

  const occWeighted = roomsAvailableSum > 0 ? roomsOccupiedSum / roomsAvailableSum : 0;
  const adrWeighted = adrWeight > 0 ? adrWeightedSum / adrWeight : 0;

  return {
    rooms: roomsOccupiedSum,
    guests: guestsSum,
    revenue: revenueSum,
    occ: occWeighted,
    adr: adrWeighted,
  };
}

// =====================
// UI: Big Carousel (4 cards)
// =====================
function BigCarousel4(props: {
  title: string;
  subtitle?: string;
  year: number;
  baseYear: number;
  cur: Metrics;
  base: Metrics;
}) {
  const { title, subtitle, year, baseYear, cur, base } = props;

  const roomsDelta = deltaPct(cur.rooms, base.rooms);
  const guestsDelta = deltaPct(cur.guests, base.guests);
  const revenueDelta = deltaPct(cur.revenue, base.revenue);
  const adrDelta = deltaPct(cur.adr, base.adr);

  // Animated states
  const [rooms, setRooms] = useState<number>(cur.rooms);
  const [guests, setGuests] = useState<number>(cur.guests);
  const [revenue, setRevenue] = useState<number>(cur.revenue);
  const [adr, setAdr] = useState<number>(cur.adr);

  useEffect(() => {
    animate(rooms, cur.rooms, 650, setRooms);
    animate(guests, cur.guests, 650, setGuests);
    animate(revenue, cur.revenue, 650, setRevenue);
    animate(adr, cur.adr, 650, setAdr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur.rooms, cur.guests, cur.revenue, cur.adr, year]);

  const Card = (p: {
    kicker: string;
    value: string;
    delta: number;
    fromTo: string;
    gradientClass: string;
  }) => (
    <div className={`bigKpiCard ${p.gradientClass}`}>
      <div className="bigKpiKicker">{p.kicker}</div>
      <div className="bigKpiValue">{p.value}</div>
      <div className={`bigKpiDelta ${deltaClass(p.delta)}`}>
        {p.delta >= 0 ? "▲" : "▼"} {p.delta >= 0 ? "+" : ""}
        {p.delta.toFixed(1).replace(".", ",")}% vs {baseYear}
      </div>
      <div className="bigKpiFromTo">{p.fromTo}</div>
    </div>
  );

  return (
    <section className="section" style={{ paddingTop: "1rem" }}>
      <div className="sectionHeader">
        <div>
          <div className="sectionKicker">Vista ejecutiva</div>
          <h2 className="sectionTitle">{title}</h2>
          {subtitle && <div className="sectionDesc" style={{ marginTop: ".35rem" }}>{subtitle}</div>}
        </div>
      </div>

      <div className="bigKpiGrid">
        <Card
          kicker="Rooms occupied"
          value={fmtInt(rooms)}
          delta={roomsDelta}
          fromTo={`${fmtInt(base.rooms)} → ${fmtInt(cur.rooms)}`}
          gradientClass="g1"
        />
        <Card
          kicker="Room Revenue (USD)"
          value={fmtUsd0(revenue)}
          delta={revenueDelta}
          fromTo={`${fmtUsd0(base.revenue)} → ${fmtUsd0(cur.revenue)}`}
          gradientClass="g2"
        />
        <Card
          kicker="Huéspedes"
          value={fmtInt(guests)}
          delta={guestsDelta}
          fromTo={`${fmtInt(base.guests)} → ${fmtInt(cur.guests)}`}
          gradientClass="g3"
        />
        <Card
          kicker="ADR anual (USD)"
          value={fmtUsd(adr)}
          delta={adrDelta}
          fromTo={`${fmtUsd(base.adr)} → ${fmtUsd(cur.adr)}`}
          gradientClass="g4"
        />
      </div>
    </section>
  );
}

// =====================
// Component principal
// =====================
export default function YearComparator() {
  // ✅ default 2025
  const DEFAULT_YEAR = 2025;
  const baseYear = 2024;

  const years = useMemo(() => Object.keys(DATA).map(Number).sort(), []);
  const [year, setYear] = useState<number>(DEFAULT_YEAR);

  // Para evitar “sin datos” si alguien elige un año no cargado
  useEffect(() => {
    if (!DATA[year]) setYear(DEFAULT_YEAR);
  }, [year]);

  // Grupo JCR consolidado (desde DATA)
  const baseJCR = useMemo(() => computeGroupFromHotels(DATA[baseYear].jcr.hotels), []);
  const curJCR = useMemo(() => computeGroupFromHotels(DATA[year].jcr.hotels), [year]);

  // Grupo GOTEL (Maitei) consolidado (desde DATA)
  const baseGotel = useMemo(() => computeGroupFromHotels(DATA[baseYear].gotel.hotels), []);
  const curGotel = useMemo(() => computeGroupFromHotels(DATA[year].gotel.hotels), [year]);

  return (
    <section className="section" id="comparador">
      {/* ========= 1) Carrousel grande JCR (SIEMPRE con datos) ========= */}
      <BigCarousel4
        title={`Grupo JCR — KPIs ${year} (vs ${baseYear})`}
        subtitle="Marriott BA · Sheraton MDQ · Sheraton Bariloche"
        year={year}
        baseYear={baseYear}
        cur={curJCR}
        base={baseJCR}
      />

      {/* ========= 2) Selector de año (solo para comparativas/lectura) ========= */}
      <div className="stickyControls" style={{ marginTop: "1.25rem" }}>
        <div>
          <div className="stickyTitle">Comparativa</div>
          <div className="stickyHint">
            Seleccioná el año para ver comparativas y secciones con filtro. Base fija: <strong>{baseYear}</strong>.
          </div>
        </div>

        <div className="toggle">
          {years.map((y) => (
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

      {/* ========= 3) H&F — Explorador (JCR) ========= */}
      <section className="section" style={{ marginTop: "2rem" }}>
        <div className="sectionHeader">
          <div>
            <div className="sectionKicker">H&F</div>
            <h3 className="sectionTitle">H&F — Explorador (Grupo JCR)</h3>
            <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
              Filtros por hotel JCR + año/mes/trimestre. Incluye ranking por mes por hotel.
            </div>
          </div>
        </div>

        <HofExplorer
          title="Grupo JCR"
          allowedHotels={HOF_JCR_ALLOWED}
          filePath="/data/hf_diario.csv"
          defaultYear={DEFAULT_YEAR}
        />
      </section>

      {/* ========= 4) Membership (JCR) ========= */}
      <section className="section" style={{ marginTop: "2.2rem" }}>
        <div className="sectionHeader">
          <div>
            <div className="sectionKicker">Membership</div>
            <h3 className="sectionTitle">Membership — Grupo JCR</h3>
            <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
              Acumulado del año seleccionado y variación vs {baseYear}. (Datos desde Excel)
            </div>
          </div>
        </div>

        {/* OJO: no le paso `year=` porque tu build anterior falló por Props.
            MembershipSummary ya maneja su year/baseYear internamente (o recibe defaultYear). */}
        <MembershipSummary
          filePath="/data/jcr_membership.xlsx"
          allowedHotels={["MARRIOTT", "SHERATON MDQ", "SHERATON BCR", "JCR"]}
          title="Grupo JCR"
          defaultYear={DEFAULT_YEAR}
        />
      </section>

      {/* ========= 5) Nacionalidades ========= */}
      <section className="section" style={{ marginTop: "2.2rem" }}>
        <div className="sectionHeader">
          <div>
            <div className="sectionKicker">Origen de huéspedes</div>
            <h3 className="sectionTitle">Nacionalidades — Marriott Buenos Aires</h3>
            <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
              Ranking por país y mapa global. (Filtro por año)
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, .85fr)",
            gap: "1.25rem",
            alignItems: "stretch",
          }}
        >
          {/* País: más grande */}
          <CountryRanking year={year} filePath="/data/jcr_nacionalidades.xlsx" />
          {/* Mapa: más chico */}
          <WorldGuestsMap year={year} filePath="/data/jcr_nacionalidades.xlsx" />
        </div>
      </section>

      {/* ========= 6) Carrousel GOTEL (Maitei) ========= */}
      <BigCarousel4
        title={`GOTEL Management — Hotel Maitei · KPIs ${year} (vs ${baseYear})`}
        subtitle="Se reporta aparte (no se suma a JCR)."
        year={year}
        baseYear={baseYear}
        cur={curGotel}
        base={baseGotel}
      />

      {/* ========= 7) H&F — Explorador (Maitei) ========= */}
      <section className="section" style={{ marginTop: "2rem" }}>
        <div className="sectionHeader">
          <div>
            <div className="sectionKicker">H&F</div>
            <h3 className="sectionTitle">H&F — Explorador (Hotel Maitei)</h3>
            <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
              Filtros por año/mes/trimestre + ranking mensual.
            </div>
          </div>
        </div>

        <HofExplorer
          title="Hotel Maitei (GOTEL)"
          allowedHotels={HOF_GOTEL_ALLOWED}
          filePath="/data/hf_diario.csv"
          defaultYear={DEFAULT_YEAR}
        />
      </section>
    </section>
  );
}
