"use client";

import { useEffect, useMemo, useState } from "react";
import HofExplorer from "./HofExplorer";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

/**
 * YearComparator
 * - Filtro global de AÑO (reutilizable por H&F / Membership / Nacionalidades)
 * - Carrouseles JCR grandes (Rooms, Revenue, Huéspedes, ADR) con animación
 * - Comparativa año vs año base (por defecto 2025 vs 2024)
 * - Secciones: H&F JCR, Membership, Nacionalidades, y bloques GOTEL/MAITEI si los tenés
 *
 * Importante:
 * - NO pasamos `defaultHotel` a HofExplorer (eso te rompía el build por typings).
 * - El cálculo de JCR se hace desde /data/hf_diario.csv (diario) usando disponibilidad fija.
 */

const DEFAULT_YEAR = 2025;
const DEFAULT_BASE_YEAR = 2024;

const JCR_HOTELS = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
const GOTEL_HOTELS = ["MAITEI"];

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
  // soporta "22.441,71" y "22,441.71" y "22441.71"
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

  // Intento ISO
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

  // Formato del CSV: "01-06-22 Wed" (tomamos la parte "01-06-22")
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

  const idx = (name: string) =>
    headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));

  // indices flexibles
  const iEmpresa = idx("Empresa");
  const iFecha = idx("Fecha"); // hay "Fecha" y "Date"; preferimos "Fecha"
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

    const dateRaw =
      (iFecha >= 0 && cols[iFecha]) ? cols[iFecha] : (iDate >= 0 ? cols[iDate] : "");
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

// ---------- agregaciones JCR ----------
type Agg = {
  rooms: number;
  guests: number;
  revenue: number;
  adr: number; // revenue / rooms
  occ01: number; // rooms / available
  availableRooms: number; // sum(availPerDay * days)
  daysCounted: number; // total de días-hotel contados (para debug)
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

    // días únicos por hotel (por si viene duplicado)
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

// ---------- UI: Cards grandes ----------
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
        <div className="cardTitle" style={{ fontSize: "1.2rem" }}>
          {props.title}
        </div>
        <div className="cardNote">{props.subtitle}</div>
      </div>

      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "1rem",
        }}
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
            <div style={{ fontSize: "2.2rem", fontWeight: 900, lineHeight: 1.05 }}>
              {k.value}
            </div>

            {k.delta ? (
              <div className={`delta ${k.deltaClass ?? "flat"}`} style={{ width: "fit-content" }}>
                {k.delta}
              </div>
            ) : null}

            <div style={{ color: "var(--muted)", fontSize: ".95rem" }}>{k.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function YearComparator() {
  // Filtro global de año (se usa en H&F / Membership / Nacionalidades)
  const [year, setYear] = useState<number>(DEFAULT_YEAR);
  const [baseYear, setBaseYear] = useState<number>(DEFAULT_BASE_YEAR);

  // Cargamos hf_diario.csv 1 sola vez
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

  const yearsAvailable = useMemo(() => {
    const s = new Set<number>();
    for (const r of hfRows) s.add(r.year);
    const arr = Array.from(s).sort((a, b) => b - a);
    // fallback razonable
    return arr.length ? arr : [2026, 2025, 2024, 2023, 2022];
  }, [hfRows]);

  // --- Agregados JCR ---
  const jcrCur = useMemo(() => calcAgg(hfRows, JCR_HOTELS, year), [hfRows, year]);
  const jcrBase = useMemo(() => calcAgg(hfRows, JCR_HOTELS, baseYear), [hfRows, baseYear]);

  const dRooms = jcrBase.rooms > 0 ? (jcrCur.rooms / jcrBase.rooms - 1) * 100 : 0;
  const dGuests = jcrBase.guests > 0 ? (jcrCur.guests / jcrBase.guests - 1) * 100 : 0;
  const dRev = jcrBase.revenue > 0 ? (jcrCur.revenue / jcrBase.revenue - 1) * 100 : 0;
  const dAdr = jcrBase.adr > 0 ? (jcrCur.adr / jcrBase.adr - 1) * 100 : 0;
  const dOccPP = (jcrCur.occ01 - jcrBase.occ01) * 100;

  // animaciones (solo para valores)
  const roomsAnim = useCountUp(jcrCur.rooms);
  const guestsAnim = useCountUp(jcrCur.guests);
  const revAnim = useCountUp(jcrCur.revenue);
  const adrAnim = useCountUp(jcrCur.adr);

  const jcrKpis = useMemo(() => {
    const deltaClass = (v: number): "up" | "down" | "flat" => (v > 0.0001 ? "up" : v < -0.0001 ? "down" : "flat");
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
  }, [roomsAnim, guestsAnim, revAnim, adrAnim, dRooms, dRev, dGuests, dAdr, baseYear, jcrBase, jcrCur]);

  const occLine = useMemo(() => {
    return {
      cur: fmtPct01(jcrCur.occ01),
      base: fmtPct01(jcrBase.occ01),
      pp: `${dOccPP >= 0 ? "+" : ""}${fmtPP(dOccPP)}`,
    };
  }, [jcrCur.occ01, jcrBase.occ01, dOccPP]);

  return (
    <section className="section" id="comparador">
      {/* ====== CONTROLES GLOBALES (AÑO) ====== */}
      <div className="sectionHeader" style={{ alignItems: "flex-end" }}>
        <div>
          <div className="sectionKicker">Vista ejecutiva</div>
          <h2 className="sectionTitle">Informe dinámico</h2>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Filtros y cálculos automáticos. JCR por un lado y GOTEL / Maitei por separado.
          </div>
        </div>

        <div style={{ display: "grid", gap: ".35rem", justifyItems: "end" }}>
          <div style={{ color: "var(--muted)", fontSize: ".9rem", fontWeight: 700 }}>
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

      {/* ====== 1) CARROUSELES JCR (grandes, al inicio) ====== */}
      <div style={{ display: "grid", gap: "1rem" }}>
        <BigCarousel4
          title="Grupo JCR — KPIs anuales"
          subtitle={`Año ${year} vs ${baseYear} · Ocupación: ${occLine.base} → ${occLine.cur} (${occLine.pp})`}
          kpis={jcrKpis}
        />

        {hfErr ? (
          <div className="card" style={{ padding: "1rem" }}>
            <div className="delta down">{hfErr}</div>
            <div className="cardNote" style={{ marginTop: ".35rem" }}>
              Revisá que exista <code>public/data/hf_diario.csv</code> en GitHub/Vercel.
            </div>
          </div>
        ) : null}
      </div>

      {/* ====== 2) COMPARATIVA (título general) ====== */}
      <div className="card" style={{ padding: "1.15rem", marginTop: "1rem" }}>
        <div className="cardTitle">Comparativa {year} vs {baseYear}</div>
        <div className="cardNote" style={{ marginTop: ".35rem" }}>
          La ocupación se calcula con disponibilidad fija:
          {" "}
          Marriott 300/día · Sheraton MDQ 194/día · Sheraton BCR 161/día · Maitei 98/día.
        </div>
      </div>

      {/* ====== 3) H&F — Explorador JCR ====== */}
      <div style={{ marginTop: "1rem" }}>
        <HofExplorer
          filePath="/data/hf_diario.csv"
          allowedHotels={JCR_HOTELS}
          title="H&F — Grupo JCR"
          defaultYear={year}
        />
      </div>

      {/* ====== 4) MEMBERSHIP (JCR) ====== */}
      <div style={{ marginTop: "1rem" }}>
        <MembershipSummary
          year={year}
          baseYear={baseYear}
          allowedHotels={JCR_HOTELS}
          filePath="/data/jcr_membership.xlsx"
          title="Membership (JCR)"
        />
      </div>

      {/* ====== 5) NACIONALIDADES ======
          Nota: CountryRanking es TU componente.
          Lo dejamos usando el filtro global de año si el componente ya lo soporta.
          Si tu CountryRanking no recibe props, dejalo así.
      */}
      <div style={{ marginTop: "1rem" }}>
        {/* Si tu CountryRanking acepta props year/baseYear, descomentá y ajustá la firma en CountryRanking.tsx */}
        {/* <CountryRanking year={year} baseYear={baseYear} /> */}
        <CountryRanking />
      </div>

      {/* ====== 6) CARROUSELES GOTEL/MAITEI (si querés mostrar) ====== */}
      <div style={{ marginTop: "1rem" }}>
        <div className="sectionHeader">
          <div>
            <div className="sectionKicker">Gotel Management</div>
            <h3 className="sectionTitle">Hotel Maitei</h3>
            <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
              Bloque independiente del Grupo JCR.
            </div>
          </div>
        </div>

        {/* Mini resumen Maitei desde el mismo hf_diario */}
        {useMemo(() => {
          const cur = calcAgg(hfRows, GOTEL_HOTELS, year);
          const base = calcAgg(hfRows, GOTEL_HOTELS, baseYear);
          const dR = base.rooms > 0 ? (cur.rooms / base.rooms - 1) * 100 : 0;
          const dG = base.guests > 0 ? (cur.guests / base.guests - 1) * 100 : 0;
          const dV = base.revenue > 0 ? (cur.revenue / base.revenue - 1) * 100 : 0;
          const dA = base.adr > 0 ? (cur.adr / base.adr - 1) * 100 : 0;

          return (
            <BigCarousel4
              title="Maitei — KPIs anuales"
              subtitle={`Año ${year} vs ${baseYear} · Ocupación: ${fmtPct01(base.occ01)} → ${fmtPct01(cur.occ01)} (${fmtPP((cur.occ01 - base.occ01) * 100)})`}
              kpis={[
                {
                  label: "Rooms occupied",
                  value: fmtInt(cur.rooms),
                  delta: `${dR >= 0 ? "+" : ""}${dR.toFixed(1).replace(".", ",")}% vs ${baseYear}`,
                  deltaClass: dR >= 0 ? "up" : "down",
                  sub: `${fmtInt(base.rooms)} → ${fmtInt(cur.rooms)}`,
                },
                {
                  label: "Room Revenue (USD)",
                  value: fmtMoney(cur.revenue),
                  delta: `${dV >= 0 ? "+" : ""}${dV.toFixed(1).replace(".", ",")}% vs ${baseYear}`,
                  deltaClass: dV >= 0 ? "up" : "down",
                  sub: `${fmtMoney(base.revenue)} → ${fmtMoney(cur.revenue)}`,
                },
                {
                  label: "Huéspedes",
                  value: fmtInt(cur.guests),
                  delta: `${dG >= 0 ? "+" : ""}${dG.toFixed(1).replace(".", ",")}% vs ${baseYear}`,
                  deltaClass: dG >= 0 ? "up" : "down",
                  sub: `${fmtInt(base.guests)} → ${fmtInt(cur.guests)}`,
                },
                {
                  label: "ADR (USD)",
                  value: fmtMoney(cur.adr),
                  delta: `${dA >= 0 ? "+" : ""}${dA.toFixed(1).replace(".", ",")}% vs ${baseYear}`,
                  deltaClass: dA >= 0 ? "up" : "down",
                  sub: `${fmtMoney(base.adr)} → ${fmtMoney(cur.adr)}`,
                },
              ]}
            />
          );
        }, [hfRows, year, baseYear])}
      </div>

      {/* ====== 7) H&F — Explorador Maitei ====== */}
      <div style={{ marginTop: "1rem" }}>
        <HofExplorer
          filePath="/data/hf_diario.csv"
          allowedHotels={GOTEL_HOTELS}
          title="H&F — Maitei"
          defaultYear={year}
        />
      </div>
    </section>
  );
}
