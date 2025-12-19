"use client";

import { useEffect, useMemo, useState } from "react";

import CountryRanking from "./CountryRanking";
import WorldGuestsMap from "./WorldGuestsMap";
import MembershipSummary from "./MembershipSummary";
import HofExplorer from "./HofExplorer";

// =====================
// Types
// =====================
type Metrics = {
  rooms: number; // Rooms occupied
  guests: number; // Guests
  revenue: number; // Room Revenue (USD)
  adr: number; // ADR (USD)
  occ: number; // 0-1
};

type HotelsMap = Record<string, Metrics>;
type DataYear = {
  jcr: { hotels: HotelsMap };
  gotel: { hotels: HotelsMap };
};

// =====================
// Static data (resumen ejecutivo)
// (H&F viene del CSV por separado, HofExplorer)
// =====================
const DATA: Record<number, DataYear> = {
  2024: {
    jcr: {
      hotels: {
        "Marriott Buenos Aires": { rooms: 46210, guests: 74200, revenue: 12140334, adr: 157, occ: 0.52 },
        "Sheraton Mar del Plata": { rooms: 28740, guests: 45800, revenue: 5019409, adr: 131, occ: 0.47 },
        "Sheraton Bariloche": { rooms: 22110, guests: 35100, revenue: 2979870, adr: 140, occ: 0.44 },
      },
    },
    gotel: {
      hotels: {
        Maitei: { rooms: 11532, guests: 20730, revenue: 447167, adr: 74, occ: 0.41 }, // occ real se calcula en H&F con 98/día
      },
    },
  },
  2025: {
    jcr: {
      hotels: {
        "Marriott Buenos Aires": { rooms: 51890, guests: 80120, revenue: 13140230, adr: 171, occ: 0.54 },
        "Sheraton Mar del Plata": { rooms: 33140, guests: 50980, revenue: 10656002, adr: 151, occ: 0.49 },
        "Sheraton Bariloche": { rooms: 26210, guests: 40120, revenue: 338274, adr: 136, occ: 0.46 },
      },
    },
    gotel: {
      hotels: {
        Maitei: { rooms: 15546, guests: 28080, revenue: 752851, adr: 78, occ: 0.43 },
      },
    },
  },
};

// Logos
const HOTEL_LOGOS: Record<string, string> = {
  "Marriott Buenos Aires": "/logos/marriott.png",
  "Sheraton Mar del Plata": "/logos/sheraton-mdq-2025.jpg",
  "Sheraton Bariloche": "/logos/sheraton-bcr.png",
  Maitei: "/logos/maitei.png",
};

// =====================
// Helpers
// =====================
const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR");
const fmtUsd = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtUsd2 = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct01 = (p: number) => (p * 100).toFixed(1).replace(".", ",") + "%";

function deltaPct(cur: number, base: number) {
  if (!base) return 0;
  return (cur / base - 1) * 100;
}
function deltaPP(curOcc01: number, baseOcc01: number) {
  return (curOcc01 - baseOcc01) * 100;
}
const deltaClass = (d: number) => (d >= 0 ? "up" : "down");

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
 * Consolidado desde hoteles:
 * - Occ ponderada: available = occupied/occ => occ_total = sum(occupied)/sum(available)
 * - ADR ponderada por rooms
 */
function computeGroupFromHotels(hotels: HotelsMap): Metrics {
  let roomsOccupiedSum = 0;
  let guestsSum = 0;
  let revenueSum = 0;

  let roomsAvailableSum = 0;
  let adrWeightedNumer = 0;

  Object.values(hotels).forEach((h) => {
    roomsOccupiedSum += h.rooms;
    guestsSum += h.guests;
    revenueSum += h.revenue;

    const occ = Math.max(h.occ, 0.0001);
    roomsAvailableSum += h.rooms / occ;

    adrWeightedNumer += h.adr * h.rooms;
  });

  const occWeighted = roomsAvailableSum > 0 ? roomsOccupiedSum / roomsAvailableSum : 0;
  const adrWeighted = roomsOccupiedSum > 0 ? adrWeightedNumer / roomsOccupiedSum : 0;

  return {
    rooms: roomsOccupiedSum,
    guests: guestsSum,
    revenue: revenueSum,
    adr: adrWeighted,
    occ: occWeighted,
  };
}

// =====================
// UI: Big carousel (4 slides)
// =====================
type Slide = {
  title: string;
  big: string;
  sub: string;
  trendLabel: string;
  trendClass: string;
  bgClass: string;
};

function Arrow({ up }: { up: boolean }) {
  return <span aria-hidden="true">{up ? "▲" : "▼"}</span>;
}

function BigCarousel4({
  slides,
  autoMs = 4500,
}: {
  slides: Slide[];
  autoMs?: number;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((p) => (p + 1) % slides.length), autoMs);
    return () => clearInterval(t);
  }, [autoMs, slides.length]);

  return (
    <div className="bigCarousel">
      <div className={`bigSlide ${slides[idx]?.bgClass ?? ""}`}>
        <div className="bigSlideTop">
          <div className="bigSlideTitle">{slides[idx]?.title}</div>
          <div className={`bigSlideTrend ${slides[idx]?.trendClass ?? ""}`}>
            {slides[idx]?.trendClass === "up" ? <Arrow up /> : <Arrow up={false} />}
            <span>{slides[idx]?.trendLabel}</span>
          </div>
        </div>

        <div className="bigSlideValue">{slides[idx]?.big}</div>
        <div className="bigSlideSub">{slides[idx]?.sub}</div>

        <div className="dots">
          {slides.map((_, i) => (
            <button
              key={i}
              className={`dot ${i === idx ? "active" : ""}`}
              onClick={() => setIdx(i)}
              type="button"
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      </div>

      <style jsx>{`
        .bigCarousel {
          width: 100%;
        }
        .bigSlide {
          border-radius: 18px;
          padding: 18px 18px 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 14px 50px rgba(0, 0, 0, 0.22);
          overflow: hidden;
        }
        .bg1 {
          background: radial-gradient(1200px 500px at 20% 10%, rgba(96, 165, 250, 0.28), transparent 60%),
            linear-gradient(180deg, rgba(16, 18, 26, 0.95), rgba(12, 14, 20, 0.95));
        }
        .bg2 {
          background: radial-gradient(1200px 500px at 20% 10%, rgba(34, 197, 94, 0.22), transparent 60%),
            linear-gradient(180deg, rgba(16, 18, 26, 0.95), rgba(12, 14, 20, 0.95));
        }
        .bg3 {
          background: radial-gradient(1200px 500px at 20% 10%, rgba(168, 85, 247, 0.22), transparent 60%),
            linear-gradient(180deg, rgba(16, 18, 26, 0.95), rgba(12, 14, 20, 0.95));
        }
        .bg4 {
          background: radial-gradient(1200px 500px at 20% 10%, rgba(245, 158, 11, 0.22), transparent 60%),
            linear-gradient(180deg, rgba(16, 18, 26, 0.95), rgba(12, 14, 20, 0.95));
        }
        .bigSlideTop {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .bigSlideTitle {
          font-weight: 700;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.86);
          letter-spacing: 0.2px;
        }
        .bigSlideTrend {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-weight: 800;
          font-size: 13px;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          white-space: nowrap;
        }
        .bigSlideTrend.up {
          color: rgba(34, 197, 94, 0.95);
        }
        .bigSlideTrend.down {
          color: rgba(248, 113, 113, 0.95);
        }
        .bigSlideValue {
          margin-top: 10px;
          font-size: 44px;
          line-height: 1.03;
          font-weight: 900;
          letter-spacing: -1px;
          color: rgba(255, 255, 255, 0.97);
        }
        .bigSlideSub {
          margin-top: 6px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.7);
        }
        .dots {
          margin-top: 14px;
          display: flex;
          gap: 8px;
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.08);
          cursor: pointer;
        }
        .dot.active {
          background: rgba(255, 255, 255, 0.85);
          border-color: rgba(255, 255, 255, 0.65);
        }
      `}</style>
    </div>
  );
}

// =====================
// Main component
// =====================
export default function YearComparator() {
  const BASE_YEAR = 2024;
  const DEFAULT_YEAR = 2025;

  const years = useMemo(() => Object.keys(DATA).map(Number).sort(), []);
  const [year, setYear] = useState<number>(DEFAULT_YEAR);

  // timestamp solo en cliente (evita hydration mismatch)
  const [lastUpdated, setLastUpdated] = useState<string>("—");
  useEffect(() => {
    setLastUpdated(new Date().toLocaleString("es-AR"));
  }, []);

  // Consolidados
  const baseJCR = useMemo(() => computeGroupFromHotels(DATA[BASE_YEAR].jcr.hotels), []);
  const curJCR = useMemo(() => computeGroupFromHotels(DATA[year].jcr.hotels), [year]);

  const baseMaitei = useMemo(() => computeGroupFromHotels(DATA[BASE_YEAR].gotel.hotels), []);
  const curMaitei = useMemo(() => computeGroupFromHotels(DATA[year].gotel.hotels), [year]);

  // Animación valores (carrousel / tarjetas)
  const [rooms, setRooms] = useState(curJCR.rooms);
  const [guests, setGuests] = useState(curJCR.guests);
  const [revenue, setRevenue] = useState(curJCR.revenue);
  const [adr, setAdr] = useState(curJCR.adr);
  const [occ, setOcc] = useState(curJCR.occ);

  useEffect(() => {
    animate(rooms, curJCR.rooms, 520, setRooms);
    animate(guests, curJCR.guests, 520, setGuests);
    animate(revenue, curJCR.revenue, 520, setRevenue);
    animate(adr, curJCR.adr, 520, setAdr);
    animate(occ, curJCR.occ, 520, setOcc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  // Deltas JCR
  const roomsDelta = deltaPct(curJCR.rooms, baseJCR.rooms);
  const guestsDelta = deltaPct(curJCR.guests, baseJCR.guests);
  const revenueDelta = deltaPct(curJCR.revenue, baseJCR.revenue);
  const adrDelta = deltaPct(curJCR.adr, baseJCR.adr);
  const occDelta = deltaPP(curJCR.occ, baseJCR.occ);

  // Slides JCR (usa el año seleccionado; default 2025)
  const slidesJCR: Slide[] = useMemo(() => {
    const upDown = (d: number) => (d >= 0 ? "up" : "down");
    const sign = (d: number) => (d >= 0 ? "+" : "");

    return [
      {
        title: "Rooms occupied · Grupo JCR",
        big: fmtInt(rooms),
        sub: `${BASE_YEAR}: ${fmtInt(baseJCR.rooms)} → ${year}: ${fmtInt(curJCR.rooms)}`,
        trendLabel: `${sign(roomsDelta)}${roomsDelta.toFixed(1).replace(".", ",")}%`,
        trendClass: upDown(roomsDelta),
        bgClass: "bg1",
      },
      {
        title: "Room Revenue (USD) · Grupo JCR",
        big: fmtUsd(revenue),
        sub: `${BASE_YEAR}: ${fmtUsd(baseJCR.revenue)} → ${year}: ${fmtUsd(curJCR.revenue)}`,
        trendLabel: `${sign(revenueDelta)}${revenueDelta.toFixed(1).replace(".", ",")}%`,
        trendClass: upDown(revenueDelta),
        bgClass: "bg2",
      },
      {
        title: "Huéspedes · Grupo JCR",
        big: fmtInt(guests),
        sub: `${BASE_YEAR}: ${fmtInt(baseJCR.guests)} → ${year}: ${fmtInt(curJCR.guests)}`,
        trendLabel: `${sign(guestsDelta)}${guestsDelta.toFixed(1).replace(".", ",")}%`,
        trendClass: upDown(guestsDelta),
        bgClass: "bg3",
      },
      {
        title: "ADR (USD) + Ocupación · Grupo JCR",
        big: `${fmtUsd2(adr)} · ${fmtPct01(occ)}`,
        sub: `ADR ${BASE_YEAR}: ${fmtUsd2(baseJCR.adr)} → ${year}: ${fmtUsd2(curJCR.adr)} · Occ ${BASE_YEAR}: ${fmtPct01(baseJCR.occ)} → ${year}: ${fmtPct01(curJCR.occ)}`,
        trendLabel: `ADR ${adrDelta >= 0 ? "+" : ""}${adrDelta.toFixed(1).replace(".", ",")}% · Occ ${occDelta >= 0 ? "+" : ""}${occDelta.toFixed(1).replace(".", ",")} p.p.`,
        trendClass: upDown(adrDelta + occDelta),
        bgClass: "bg4",
      },
    ];
  }, [
    rooms,
    guests,
    revenue,
    adr,
    occ,
    year,
    BASE_YEAR,
    baseJCR.rooms,
    baseJCR.guests,
    baseJCR.revenue,
    baseJCR.adr,
    baseJCR.occ,
    curJCR.rooms,
    curJCR.guests,
    curJCR.revenue,
    curJCR.adr,
    curJCR.occ,
    roomsDelta,
    guestsDelta,
    revenueDelta,
    adrDelta,
    occDelta,
  ]);

  // Slides Maitei (GOTEL) – abajo del todo
  const maiteiSlides: Slide[] = useMemo(() => {
    const roomsD = deltaPct(curMaitei.rooms, baseMaitei.rooms);
    const guestsD = deltaPct(curMaitei.guests, baseMaitei.guests);
    const revenueD = deltaPct(curMaitei.revenue, baseMaitei.revenue);
    const adrD = deltaPct(curMaitei.adr, baseMaitei.adr);

    const upDown = (d: number) => (d >= 0 ? "up" : "down");
    const sign = (d: number) => (d >= 0 ? "+" : "");

    return [
      {
        title: "Rooms occupied · Maitei (GOTEL)",
        big: fmtInt(curMaitei.rooms),
        sub: `${BASE_YEAR}: ${fmtInt(baseMaitei.rooms)} → ${year}: ${fmtInt(curMaitei.rooms)}`,
        trendLabel: `${sign(roomsD)}${roomsD.toFixed(1).replace(".", ",")}%`,
        trendClass: upDown(roomsD),
        bgClass: "bg1",
      },
      {
        title: "Room Revenue (USD) · Maitei (GOTEL)",
        big: fmtUsd(curMaitei.revenue),
        sub: `${BASE_YEAR}: ${fmtUsd(baseMaitei.revenue)} → ${year}: ${fmtUsd(curMaitei.revenue)}`,
        trendLabel: `${sign(revenueD)}${revenueD.toFixed(1).replace(".", ",")}%`,
        trendClass: upDown(revenueD),
        bgClass: "bg2",
      },
      {
        title: "Huéspedes · Maitei (GOTEL)",
        big: fmtInt(curMaitei.guests),
        sub: `${BASE_YEAR}: ${fmtInt(baseMaitei.guests)} → ${year}: ${fmtInt(curMaitei.guests)}`,
        trendLabel: `${sign(guestsD)}${guestsD.toFixed(1).replace(".", ",")}%`,
        trendClass: upDown(guestsD),
        bgClass: "bg3",
      },
      {
        title: "ADR (USD) · Maitei (GOTEL)",
        big: fmtUsd2(curMaitei.adr),
        sub: `${BASE_YEAR}: ${fmtUsd2(baseMaitei.adr)} → ${year}: ${fmtUsd2(curMaitei.adr)}`,
        trendLabel: `${sign(adrD)}${adrD.toFixed(1).replace(".", ",")}%`,
        trendClass: upDown(adrD),
        bgClass: "bg4",
      },
    ];
  }, [BASE_YEAR, baseMaitei, curMaitei, year]);

  const isBase = year === BASE_YEAR;

  const JCR_HOTELS = useMemo(
    () => ["MARRIOTT", "SHERATON MDQ", "SHERATON BCR"],
    []
  );
  const GOTEL_HOTELS = useMemo(() => ["MAITEI"], []);

  return (
    <section className="section" id="comparador">
      {/* =========================
          1) CARROUSEL JCR (arriba)
         ========================= */}
      <div className="sectionHeader">
        <div>
          <div className="sectionKicker">Vista ejecutiva</div>
          <h2 className="sectionTitle">Grupo JCR · Indicadores clave (multi-año)</h2>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Seleccioná el año (por defecto {DEFAULT_YEAR}). Los carrouseles y comparativas se recalculan automáticamente.
          </div>
        </div>

        <div className="toggle" style={{ alignSelf: "flex-end" }}>
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

      <BigCarousel4 slides={slidesJCR} />

      {/* =========================
          2) COMPARATIVA 2025 vs 2024 (mantener simple)
         ========================= */}
      <div style={{ marginTop: "1.25rem" }}>
        <h3 className="sectionTitle">Comparativa {year} vs {BASE_YEAR} · Grupo JCR</h3>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Deltas consolidados (interanual) calculados desde los hoteles JCR.
        </div>

        <div className="cardRow" style={{ marginTop: "1rem" }}>
          <div className="card">
            <div className="cardTop">
              <div className="cardTitle">Rooms occupied</div>
            </div>
            <div className="cardValue">{fmtInt(curJCR.rooms)}</div>
            <div className={`delta ${deltaClass(roomsDelta)}`}>
              {roomsDelta >= 0 ? "▲" : "▼"} {roomsDelta >= 0 ? "+" : ""}
              {roomsDelta.toFixed(1).replace(".", ",")}% vs {BASE_YEAR}
            </div>
          </div>

          <div className="card">
            <div className="cardTop">
              <div className="cardTitle">Room Revenue (USD)</div>
            </div>
            <div className="cardValue">{fmtUsd(curJCR.revenue)}</div>
            <div className={`delta ${deltaClass(revenueDelta)}`}>
              {revenueDelta >= 0 ? "▲" : "▼"} {revenueDelta >= 0 ? "+" : ""}
              {revenueDelta.toFixed(1).replace(".", ",")}% vs {BASE_YEAR}
            </div>
          </div>

          <div className="card">
            <div className="cardTop">
              <div className="cardTitle">Huéspedes</div>
            </div>
            <div className="cardValue">{fmtInt(curJCR.guests)}</div>
            <div className={`delta ${deltaClass(guestsDelta)}`}>
              {guestsDelta >= 0 ? "▲" : "▼"} {guestsDelta >= 0 ? "+" : ""}
              {guestsDelta.toFixed(1).replace(".", ",")}% vs {BASE_YEAR}
            </div>
          </div>

          <div className="card">
            <div className="cardTop">
              <div className="cardTitle">Ocupación (p.p.)</div>
            </div>
            <div className="cardValue">{fmtPct01(curJCR.occ)}</div>
            <div className={`delta ${deltaClass(occDelta)}`}>
              {occDelta >= 0 ? "▲" : "▼"} {occDelta >= 0 ? "+" : ""}
              {occDelta.toFixed(1).replace(".", ",")} p.p. vs {BASE_YEAR}
            </div>
          </div>
        </div>
      </div>

      {/* =========================
          3) H&F Explorer – JCR
         ========================= */}
      <div style={{ marginTop: "2.25rem" }}>
        <h3 className="sectionTitle">H&F – Grupo JCR</h3>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Filtros por hotel JCR + año/mes/trimestre. Incluye ranking por mes por hotel.
        </div>

        <div className="cardRow" style={{ marginTop: "1rem" }}>
          <div className="card" style={{ width: "100%" }}>
            <HofExplorer
              title="H&F – Explorador (JCR)"
              filePath="/data/hf_diario.csv"
              allowedHotels={JCR_HOTELS}
              defaultYear={DEFAULT_YEAR}
            />
          </div>
        </div>
      </div>

      {/* =========================
          4) Membership – JCR
         ========================= */}
      <div style={{ marginTop: "2.25rem" }}>
        <h3 className="sectionTitle">Membership (JCR)</h3>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Distribución y variación interanual (desde Excel).
        </div>

        <div className="cardRow" style={{ marginTop: "1rem" }}>
         <MembershipSummary
  year={year}
  baseYear={baseYear}
  hotelsJCR={["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"]}
  filePath="/data/jcr_membership.xlsx"
/>
          />
        </div>
      </div>

      {/* =========================
          5) Nacionalidades – Marriott
         ========================= */}
      <div style={{ marginTop: "2.25rem" }}>
        <div className="sectionHeader">
          <div>
            <div className="sectionKicker">Origen de huéspedes</div>
            <h3 className="sectionTitle">Nacionalidades – Marriott Buenos Aires</h3>
            <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
              Ranking por país + distribución global (mapa). Filtro por año.
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)",
            gap: "1.25rem",
            alignItems: "stretch",
            marginTop: "1rem",
          }}
        >
          <CountryRanking year={year} filePath="/data/jcr_nacionalidades.xlsx" />
          <WorldGuestsMap year={year} filePath="/data/jcr_nacionalidades.xlsx" />
        </div>
      </div>

      {/* =========================
          6) Carrouseles Maitei – GOTEL (abajo)
         ========================= */}
      <div style={{ marginTop: "2.75rem" }}>
        <div className="sectionHeader">
          <div>
            <div className="sectionKicker">GOTEL Management</div>
            <h2 className="sectionTitle">Hotel Maitei · Indicadores clave</h2>
            <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
              Bloque independiente del Grupo JCR (administración distinta).
            </div>
          </div>

          <div className="miniChip" style={{ alignSelf: "flex-end", display: "flex", gap: 10, alignItems: "center" }}>
            <img src={HOTEL_LOGOS["Maitei"]} alt="Maitei" style={{ width: 28, height: 28, borderRadius: 8 }} />
            <span style={{ fontWeight: 800 }}>Maitei</span>
          </div>
        </div>

        <BigCarousel4 slides={maiteiSlides} />
      </div>

      {/* =========================
          7) H&F Explorer – Maitei
         ========================= */}
      <div style={{ marginTop: "2.25rem" }}>
        <h3 className="sectionTitle">H&F – Maitei (GOTEL)</h3>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Filtros por año/mes/trimestre para Maitei. Ocupación calculada por disponibilidad fija (Maitei: 98/día) en tu HofExplorer.
        </div>

        <div className="cardRow" style={{ marginTop: "1rem" }}>
          <div className="card" style={{ width: "100%" }}>
            <HofExplorer
              title="H&F – Explorador (Maitei)"
              filePath="/data/hf_diario.csv"
              allowedHotels={GOTEL_HOTELS}
              defaultYear={DEFAULT_YEAR}
            />
          </div>
        </div>
      </div>

      <div style={{ marginTop: ".9rem", fontSize: ".8rem", color: "var(--muted)" }}>
        Última actualización (simulada): {lastUpdated}
      </div>
    </section>
  );
}



