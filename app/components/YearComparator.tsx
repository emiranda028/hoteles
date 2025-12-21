"use client";

import React, { useEffect, useMemo, useState } from "react";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";
import HofExplorer from "./HofExplorer";

// ============ Constantes (paths) ============
const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

// ============ Hoteles ============
const JCR_HOTELS = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
const ALL_HOTELS = ["JCR", ...JCR_HOTELS, "MAITEI"];

// ============ Helpers ============
function safeNum(v: any) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const normalized =
    s.indexOf(",") >= 0 && s.indexOf(".") >= 0
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(n: number) {
  return (n || 0).toLocaleString("es-AR");
}
function fmtMoneyUSD(n: number) {
  // número completo (sin “M”)
  return (n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(x: number) {
  if (!Number.isFinite(x)) return "—";
  return (x * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%";
}

function parseDateAny(v: any): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v ?? "").trim();
  if (!s) return null;

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

function normKey(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// CSV robusto (detecta delimitador , o ;)
function parseCsvSmart(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [] as string[], rows: [] as Record<string, string>[] };

  const first = lines[0];
  const comma = (first.match(/,/g) || []).length;
  const semi = (first.match(/;/g) || []).length;
  const delim = semi > comma ? ";" : ",";

  const headers = first.split(delim).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(delim);
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = (parts[j] ?? "").trim();
    }
    rows.push(obj);
  }

  return { headers, rows };
}

function pick(obj: any, candidates: string[]) {
  const keys = Object.keys(obj ?? {});
  const map: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) map[normKey(keys[i])] = keys[i];

  for (let i = 0; i < candidates.length; i++) {
    const c = normKey(candidates[i]);
    if (map[c]) return obj[map[c]];
  }
  return "";
}

type HfRow = {
  date: Date | null;
  year: number | null;
  hotel: string;
  roomsOcc: number;
  revenue: number;
  guests: number;
  adr: number;
};

// ======= KPI Card (grande, degradé, responsive) =======
function KpiCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div
      className="card"
      style={{
        padding: "1.15rem",
        borderRadius: 26,
        background: "linear-gradient(135deg, rgba(161,0,28,0.12), rgba(255,87,87,0.10))",
        border: "1px solid rgba(161,0,28,.18)",
      }}
    >
      <div style={{ opacity: 0.8, fontWeight: 850 }}>{title}</div>
      <div style={{ fontSize: "2.3rem", fontWeight: 950, marginTop: ".35rem", lineHeight: 1.05 }}>{value}</div>
      <div style={{ opacity: 0.8, marginTop: ".55rem" }}>{subtitle}</div>
    </div>
  );
}

// ============ Component ============
export default function YearComparator() {
  const DEFAULT_YEAR = 2025;
  const DEFAULT_BASE = 2024;

  // filtros globales
  const [year, setYear] = useState<number>(DEFAULT_YEAR);
  const [baseYear, setBaseYear] = useState<number>(DEFAULT_BASE);
  const [globalHotel, setGlobalHotel] = useState<string>("JCR");

  // data H&F
  const [hfRows, setHfRows] = useState<HfRow[]>([]);
  const [hfLoading, setHfLoading] = useState(true);
  const [hfErr, setHfErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setHfLoading(true);
    setHfErr(null);

    fetch(HF_PATH)
      .then(async (r) => {
        if (!r.ok) throw new Error(`No se pudo cargar ${HF_PATH} (status ${r.status})`);
        const txt = await r.text();
        const { rows } = parseCsvSmart(txt);

        const parsed: HfRow[] = rows.map((raw) => {
          const dt = parseDateAny(pick(raw, ["Fecha", "date", "Día", "Dia"]));
          const yy = dt ? dt.getFullYear() : null;

          const hotel = String(pick(raw, ["Hotel", "Empresa", "empresa"]) || "").trim().toUpperCase();

          const roomsOcc = safeNum(pick(raw, ["Rooms Occupied minus House Use", "Rooms Occupied", "Rooms", "RoomsOcc"]));
          const revenue = safeNum(pick(raw, ["Room Revenue", "Revenue", "RoomRevenue"]));
          const guests = safeNum(pick(raw, ["Total In-House Persons", "Guests", "Huéspedes", "Huespedes"]));
          const adr = safeNum(pick(raw, ["ADR", "Tarifa", "Average Daily Rate"]));

          return { date: dt, year: yy, hotel, roomsOcc, revenue, guests, adr };
        });

        if (!alive) return;
        setHfRows(parsed);
        setHfLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setHfErr(String(e?.message || e));
        setHfLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  // años disponibles en hf
  const hfYears = useMemo(() => {
    const s = new Set<number>();
    for (let i = 0; i < hfRows.length; i++) {
      const y = hfRows[i].year;
      if (typeof y === "number") s.add(y);
    }
    return Array.from(s).sort((a, b) => b - a);
  }, [hfRows]);

  // filtro hotel JCR -> suma de 3 hoteles
  const hfFiltered = useMemo(() => {
    const y = year;
    const hf = (globalHotel || "JCR").toUpperCase();

    let out = hfRows.filter((r) => r.year === y);

    if (hf === "JCR") {
      const allow = new Set(JCR_HOTELS);
      out = out.filter((r) => allow.has(r.hotel));
    } else if (hf === "MAITEI") {
      out = out.filter((r) => r.hotel === "MAITEI");
    } else {
      out = out.filter((r) => r.hotel === hf);
    }

    return out;
  }, [hfRows, year, globalHotel]);

  const agg = useMemo(() => {
    let rooms = 0;
    let rev = 0;
    let guests = 0;

    // ADR anual promedio ponderado por rooms
    let adrWeighted = 0;
    let adrRooms = 0;

    for (let i = 0; i < hfFiltered.length; i++) {
      const r = hfFiltered[i];
      rooms += r.roomsOcc;
      rev += r.revenue;
      guests += r.guests;

      if (r.adr > 0 && r.roomsOcc > 0) {
        adrWeighted += r.adr * r.roomsOcc;
        adrRooms += r.roomsOcc;
      }
    }

    const adr = adrRooms > 0 ? adrWeighted / adrRooms : 0;
    return { rooms, rev, guests, adr };
  }, [hfFiltered]);

  // Comparativa year vs baseYear para JCR (para el bloque “Comparativa”)
  const comp = useMemo(() => {
    // siempre comparativa del grupo JCR (como pediste)
    const allow = new Set(JCR_HOTELS);

    const cur = hfRows.filter((r) => r.year === year && allow.has(r.hotel));
    const base = hfRows.filter((r) => r.year === baseYear && allow.has(r.hotel));

    const sum = (arr: HfRow[]) => {
      let rooms = 0, rev = 0, guests = 0;
      let adrWeighted = 0, adrRooms = 0;
      for (let i = 0; i < arr.length; i++) {
        const r = arr[i];
        rooms += r.roomsOcc;
        rev += r.revenue;
        guests += r.guests;
        if (r.adr > 0 && r.roomsOcc > 0) {
          adrWeighted += r.adr * r.roomsOcc;
          adrRooms += r.roomsOcc;
        }
      }
      const adr = adrRooms > 0 ? adrWeighted / adrRooms : 0;
      return { rooms, rev, guests, adr };
    };

    const A = sum(cur);
    const B = sum(base);

    const pct = (a: number, b: number) => (b > 0 ? (a - b) / b : null);

    return {
      A,
      B,
      roomsPct: pct(A.rooms, B.rooms),
      revPct: pct(A.rev, B.rev),
      guestsPct: pct(A.guests, B.guests),
      adrPct: pct(A.adr, B.adr),
    };
  }, [hfRows, year, baseYear]);

  // ===== UI pieces =====
  const YearButtons = () => {
    const years = hfYears.length ? hfYears : [2025, 2024, 2023];
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {years.map((y) => (
          <button
            key={y}
            type="button"
            className={y === year ? "btnPrimary" : "btnOutline"}
            onClick={() => setYear(y)}
            style={{ borderRadius: 999, padding: ".55rem .9rem" }}
          >
            {y}
          </button>
        ))}
      </div>
    );
  };

  const HotelButtons = () => {
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ALL_HOTELS.map((h) => (
          <button
            key={h}
            type="button"
            className={h === globalHotel ? "btnPrimary" : "btnOutline"}
            onClick={() => setGlobalHotel(h)}
            style={{ borderRadius: 999, padding: ".55rem .9rem" }}
          >
            {h}
          </button>
        ))}
      </div>
    );
  };

  if (hfLoading) {
    return (
      <section className="section" id="comparador">
        <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
          Cargando H&F…
        </div>
      </section>
    );
  }

  if (hfErr) {
    return (
      <section className="section" id="comparador">
        <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
          <div style={{ fontWeight: 900 }}>Error cargando H&F</div>
          <div style={{ opacity: 0.8, marginTop: 6 }}>{hfErr}</div>
          <div style={{ opacity: 0.7, marginTop: 10 }}>
            Revisá que exista: <b>public/data/hf_diario.csv</b> (ruta: {HF_PATH})
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section" id="comparador">
      {/* ====== Filtros globales (Año + Hotel) ====== */}
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        <div style={{ fontWeight: 950, fontSize: "1.1rem" }}>Filtros globales</div>
        <div style={{ opacity: 0.75, marginTop: 6 }}>
          Año y hotel impactan: KPIs, H&F Explorador, Membership y (opcional) Nacionalidades.
        </div>

        <div style={{ marginTop: ".9rem", display: "grid", gap: ".85rem" }}>
          <div>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Año</div>
            <YearButtons />
          </div>

          <div>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Hotel</div>
            <HotelButtons />
          </div>
        </div>
      </div>

      {/* ====== 1) Carrouseles / KPIs (JCR) ====== */}
      <div style={{ marginTop: "1.1rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Grupo JCR — KPIs {year}
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Habitaciones ocupadas · Recaudación · Huéspedes · ADR (promedio ponderado). (Filtro hotel: {globalHotel})
        </div>

        <div
          style={{
            marginTop: ".9rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: "1rem",
          }}
        >
          <KpiCard title="Rooms occupied" value={fmtInt(agg.rooms)} subtitle={`Año ${year}`} />
          <KpiCard title="Room Revenue (USD)" value={fmtMoneyUSD(agg.rev)} subtitle={`Año ${year}`} />
          <KpiCard title="Huéspedes" value={fmtInt(agg.guests)} subtitle={`Año ${year}`} />
          <KpiCard title="ADR (USD)" value={fmtMoneyUSD(agg.adr)} subtitle={`Año ${year}`} />
        </div>
      </div>

      {/* ====== 2) Comparativa 2025 vs 2024 (o year vs baseYear) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Comparativa {year} vs {baseYear} (JCR)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Comparación consolidada de Marriott + Sheraton BCR + Sheraton MDQ.
        </div>

        <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 22 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontWeight: 900 }}>Base:</div>
            {[2024, 2023, 2022].map((y) => (
              <button
                key={y}
                type="button"
                className={y === baseYear ? "btnPrimary" : "btnOutline"}
                onClick={() => setBaseYear(y)}
                style={{ borderRadius: 999, padding: ".55rem .9rem" }}
              >
                {y}
              </button>
            ))}
          </div>

          <div
            style={{
              marginTop: "1rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "1rem",
            }}
          >
            <KpiCard
              title="Rooms occupied"
              value={comp.roomsPct === null ? "—" : `${comp.roomsPct >= 0 ? "+" : ""}${fmtPct(comp.roomsPct)}`}
              subtitle={`${fmtInt(comp.B.rooms)} → ${fmtInt(comp.A.rooms)}`}
            />
            <KpiCard
              title="Room Revenue (USD)"
              value={comp.revPct === null ? "—" : `${comp.revPct >= 0 ? "+" : ""}${fmtPct(comp.revPct)}`}
              subtitle={`${fmtMoneyUSD(comp.B.rev)} → ${fmtMoneyUSD(comp.A.rev)}`}
            />
            <KpiCard
              title="Huéspedes"
              value={comp.guestsPct === null ? "—" : `${comp.guestsPct >= 0 ? "+" : ""}${fmtPct(comp.guestsPct)}`}
              subtitle={`${fmtInt(comp.B.guests)} → ${fmtInt(comp.A.guests)}`}
            />
            <KpiCard
              title="ADR (USD)"
              value={comp.adrPct === null ? "—" : `${comp.adrPct >= 0 ? "+" : ""}${fmtPct(comp.adrPct)}`}
              subtitle={`${fmtMoneyUSD(comp.B.adr)} → ${fmtMoneyUSD(comp.A.adr)}`}
            />
          </div>
        </div>
      </div>

      {/* ====== 3) H&F – Explorador (JCR) ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          H&amp;F – Explorador (Grupo JCR)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Filtros por hotel JCR + año/mes/trimestre. Incluye ranking por mes por hotel.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <HofExplorer
            filePath={HF_PATH}
            allowedHotels={JCR_HOTELS}
            title="H&F – Explorador (JCR)"
            defaultYear={year}
          />
        </div>
      </div>

      {/* ====== 4) Membership ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Membership (JCR)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Cantidades + gráficos. Filtro global de año + hotel (JCR/MARRIOTT/SHERATONS).
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <MembershipSummary
            year={year}
            baseYear={baseYear}
            filePath={MEMBERSHIP_PATH}
            hotelFilter={globalHotel === "MAITEI" ? "JCR" : globalHotel}  // membership es JCR
          />
        </div>
      </div>

      {/* ====== 5) Nacionalidades ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Nacionalidades
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Ranking por país + distribución por continente. (Archivo Marriott). Usa filtro global de año.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <CountryRanking year={year} filePath={NACIONALIDADES_PATH} hotelFilter={""} />
        </div>
      </div>

      {/* ====== 6) Carrouseles Maitei – Gotel ====== */}
      <div style={{ marginTop: "1.35rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Hotel Maitei — Gotel Management
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          KPIs y explorador separados del Grupo JCR.
        </div>

        <div style={{ marginTop: ".9rem" }}>
          <HofExplorer
            filePath={HF_PATH}
            allowedHotels={["MAITEI"]}
            title="H&F – Explorador (Maitei)"
            defaultYear={year}
          />
        </div>
      </div>
    </section>
  );
}
