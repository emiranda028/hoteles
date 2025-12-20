"use client";

import { useMemo, useState } from "react";

import HofExplorer from "./HofExplorer";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";

/**
 * Ajustá estos paths si tus archivos están con otro nombre.
 * Deben existir en: public/data/...
 */
const HF_FILE = "/data/hf_diario.csv";
const MEMBERSHIP_FILE = "/data/jcr_membership.xlsx";
const NACIONALIDADES_FILE = "/data/nacionalidades.xlsx"; // <- si tu archivo se llama distinto, cambiá esto

const DEFAULT_YEAR = 2025;
const DEFAULT_BASE_YEAR = 2024;

// Hoteles del grupo JCR (importante: deben matchear exactamente "Empresa" en el CSV)
const JCR_HOTELS = ["MARRIOTT", "SHERATON MDQ", "SHERATON BCR"];
const GOTEL_HOTELS = ["MAITEI"];

// Disponibilidad fija por día
const AVAIL_PER_DAY: Record<string, number> = {
  MARRIOTT: 300,
  "SHERATON MDQ": 194,
  "SHERATON BCR": 161,
  MAITEI: 98,
};

type GroupKey = "JCR" | "GOTEL";

function fmtInt(n: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n || 0);
}
function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(n || 0);
}
function fmtPct01(x: number) {
  return new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 }).format(x || 0);
}
function safeHotelName(x: any) {
  const s = String(x ?? "").trim();
  return s.toUpperCase();
}

type HfRow = {
  Empresa: string;
  Fecha: string;
  "Total Occ.": number | string;
  "Room Revenue": number | string;
  "Average Rate": number | string;
  "Adl. & Chl.": number | string;
};

function parseEsNumber(v: any): number {
  // soporta "22.441,71" y "22441.71" y números
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;

  // Si tiene coma como decimal estilo ES: 22.441,71
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // miles con dot y decimales con coma
    const normalized = s.replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  // Si sólo coma: "123,45"
  if (hasComma && !hasDot) {
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  // default
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseYearFromFecha(fecha: any): number | null {
  // soporta "1/6/2022", "01-06-22 Wed", etc.
  const s = String(fecha ?? "").trim();
  if (!s) return null;

  // Caso dd/mm/yyyy
  const m1 = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m1) {
    let y = Number(m1[3]);
    if (y < 100) y += 2000;
    return Number.isFinite(y) ? y : null;
  }

  // Caso dd-mm-yy...
  const m2 = s.match(/(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m2) {
    let y = Number(m2[3]);
    if (y < 100) y += 2000;
    return Number.isFinite(y) ? y : null;
  }

  // Caso ISO yyyy-mm-dd
  const m3 = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m3) return Number(m3[1]);

  return null;
}

async function readCsv(path: string): Promise<HfRow[]> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar CSV: ${path}`);
  const text = await res.text();

  // Detect delimiter ; o ,
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const delim = firstLine.includes(";") ? ";" : ",";

  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(delim).map((h) => h.replace(/^"|"$/g, "").trim());

  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(delim).map((p) => p.replace(/^"|"$/g, "").trim());
    if (parts.length < 3) continue;
    const obj: any = {};
    headers.forEach((h, idx) => (obj[h] = parts[idx] ?? ""));
    rows.push(obj);
  }
  return rows as HfRow[];
}

type Agg = {
  rooms: number;
  guests: number;
  revenue: number;
  adr: number;
  occ01: number;
};

function aggregateGroup(rows: HfRow[], allowedHotels: string[], year: number): Agg {
  const allowed = new Set(allowedHotels.map((h) => h.toUpperCase()));
  const filtered = rows.filter((r) => {
    const hotel = safeHotelName((r as any).Empresa);
    if (!allowed.has(hotel)) return false;
    const y = parseYearFromFecha((r as any).Fecha ?? (r as any).Date);
    return y === year;
  });

  let rooms = 0;
  let guests = 0;
  let revenue = 0;

  // Para ocupación: total disponibles = sum(availPerDay(hotel) * días_en_registros)
  // (si el CSV trae una fila por día por hotel, esto funciona perfecto)
  let availableRooms = 0;

  for (const r of filtered) {
    const hotel = safeHotelName((r as any).Empresa);
    const occRooms = parseEsNumber((r as any)["Total Occ."] ?? (r as any)["Total Occ"] ?? (r as any)["Total\nOcc."]);
    const rev = parseEsNumber((r as any)["Room Revenue"]);
    const adl = parseEsNumber((r as any)["Adl. & Chl."] ?? (r as any)["Adl. & Chl. "]);

    rooms += occRooms;
    guests += adl;
    revenue += rev;

    const avail = AVAIL_PER_DAY[hotel] ?? 0;
    availableRooms += avail;
  }

  const occ01 = availableRooms > 0 ? rooms / availableRooms : 0;
  const adr = rooms > 0 ? revenue / rooms : 0;

  return { rooms, guests, revenue, adr, occ01 };
}

function deltaPct(cur: number, base: number): number {
  if (!base) return 0;
  return ((cur - base) / base) * 100;
}

function deltaPp(cur01: number, base01: number): number {
  return (cur01 - base01) * 100;
}

/** Carrousel simple (por si tu versión actual no tiene BigCarousel4). */
function BigKpiStrip(props: {
  title: string;
  items: { label: string; value: string; sub?: string }[];
}) {
  return (
    <div className="card" style={{ padding: "1.15rem", borderRadius: 26 }}>
      <div style={{ fontWeight: 950, fontSize: "1.1rem" }}>{props.title}</div>

      <div
        style={{
          marginTop: "0.85rem",
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "0.75rem",
        }}
      >
        {props.items.map((it) => (
          <div
            key={it.label}
            style={{
              borderRadius: 22,
              padding: "1rem",
              background:
                "linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))",
              border: "1px solid rgba(255,255,255,.10)",
              minHeight: 120,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div style={{ opacity: 0.8, fontWeight: 700 }}>{it.label}</div>
            <div style={{ fontWeight: 950, fontSize: "1.9rem", lineHeight: 1.05 }}>
              {it.value}
            </div>
            {it.sub ? <div style={{ opacity: 0.75, fontSize: ".92rem" }}>{it.sub}</div> : <div />}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function YearComparator() {
  const [group, setGroup] = useState<GroupKey>("JCR");
  const [year, setYear] = useState<number>(DEFAULT_YEAR);
  const [baseYear, setBaseYear] = useState<number>(DEFAULT_BASE_YEAR);

  const allowedHotels = useMemo(() => (group === "JCR" ? JCR_HOTELS : GOTEL_HOTELS), [group]);

  const [hfRows, setHfRows] = useState<HfRow[] | null>(null);
  const [hfErr, setHfErr] = useState<string>("");

  // cargar CSV una sola vez
  useMemo(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await readCsv(HF_FILE);
        if (cancelled) return;
        setHfRows(rows);
        setHfErr("");
      } catch (e: any) {
        if (cancelled) return;
        setHfRows([]);
        setHfErr(e?.message ?? "Error cargando CSV");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const aggCur = useMemo(() => {
    if (!hfRows) return null;
    return aggregateGroup(hfRows, allowedHotels, year);
  }, [hfRows, allowedHotels, year]);

  const aggBase = useMemo(() => {
    if (!hfRows) return null;
    return aggregateGroup(hfRows, allowedHotels, baseYear);
  }, [hfRows, allowedHotels, baseYear]);

  const headerTitle = group === "JCR" ? "Grupo JCR" : "Gotel Management · Maitei";

  const kpiItems = useMemo(() => {
    const cur = aggCur ?? { rooms: 0, revenue: 0, guests: 0, adr: 0, occ01: 0 };
    const base = aggBase ?? { rooms: 0, revenue: 0, guests: 0, adr: 0, occ01: 0 };

    return [
      {
        label: "Rooms occupied",
        value: fmtInt(cur.rooms),
        sub: `vs ${baseYear}: ${deltaPct(cur.rooms, base.rooms).toFixed(1)}%`,
      },
      {
        label: "Room Revenue (USD)",
        value: fmtMoney(cur.revenue),
        sub: `vs ${baseYear}: ${deltaPct(cur.revenue, base.revenue).toFixed(1)}%`,
      },
      {
        label: "Huéspedes",
        value: fmtInt(cur.guests),
        sub: `vs ${baseYear}: ${deltaPct(cur.guests, base.guests).toFixed(1)}%`,
      },
      {
        label: "Ocupación",
        value: fmtPct01(cur.occ01),
        sub: `vs ${baseYear}: ${deltaPp(cur.occ01, base.occ01).toFixed(1)} p.p.`,
      },
    ];
  }, [aggCur, aggBase, baseYear]);

  return (
    <section className="section" id="comparador">
      {/* ====== Filtros globales ====== */}
      <div className="card" style={{ padding: "1rem", borderRadius: 24 }}>
        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 950, fontSize: "1.1rem" }}>{headerTitle}</div>

          <div style={{ marginLeft: "auto", display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            <button
              className={group === "JCR" ? "btnPrimary" : "btnOutline"}
              type="button"
              onClick={() => setGroup("JCR")}
            >
              JCR
            </button>
            <button
              className={group === "GOTEL" ? "btnPrimary" : "btnOutline"}
              type="button"
              onClick={() => setGroup("GOTEL")}
            >
              GOTEL
            </button>

            <div style={{ width: 14 }} />

            {/* Año global */}
            <select
              className="select"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ padding: ".55rem .7rem", borderRadius: 14 }}
            >
              {[2022, 2023, 2024, 2025, 2026].map((y) => (
                <option value={y} key={y}>
                  Año {y}
                </option>
              ))}
            </select>

            <select
              className="select"
              value={baseYear}
              onChange={(e) => setBaseYear(Number(e.target.value))}
              style={{ padding: ".55rem .7rem", borderRadius: 14 }}
            >
              {[2022, 2023, 2024, 2025, 2026].map((y) => (
                <option value={y} key={y}>
                  Base {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hfErr ? (
          <div style={{ marginTop: ".75rem", color: "#ffb4b4", fontWeight: 700 }}>
            {hfErr}
          </div>
        ) : null}
      </div>

      {/* ====== 1) CARROUSELES / KPIs ====== */}
      <div style={{ marginTop: "1rem" }}>
        <BigKpiStrip title={`${headerTitle} — KPIs ${year} (vs ${baseYear})`} items={kpiItems} />
      </div>

      {/* ====== 2) COMPARATIVA 2025 vs 2024 (solo texto por ahora) ====== */}
      <div style={{ marginTop: "1rem" }} className="card">
        <div style={{ padding: "1rem", borderRadius: 24 }}>
          <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
            Comparativa {year} vs {baseYear}
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Resumen ejecutivo automático según el grupo seleccionado.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: ".65rem", marginTop: ".85rem" }}>
            {kpiItems.map((k) => (
              <div
                key={k.label}
                style={{
                  padding: ".85rem",
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,.10)",
                  background: "rgba(255,255,255,.03)",
                }}
              >
                <div style={{ opacity: 0.85, fontWeight: 800 }}>{k.label}</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 950, marginTop: ".25rem" }}>{k.value}</div>
                <div style={{ opacity: 0.8, marginTop: ".2rem" }}>{k.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ====== 3) H&F ====== */}
      <div style={{ marginTop: "1rem" }}>
        <HofExplorer
          title={`H&F – Explorador (${headerTitle})`}
          filePath={HF_FILE}
          allowedHotels={allowedHotels}
          defaultYear={year}
          defaultHotel={allowedHotels[0] ?? "MARRIOTT"}
          availPerDayByHotel={AVAIL_PER_DAY}
        />
      </div>

      {/* ====== 4) MEMBERSHIP ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <MembershipSummary
          year={year}
          baseYear={baseYear}
          allowedHotels={group === "JCR" ? JCR_HOTELS : GOTEL_HOTELS}
          filePath={MEMBERSHIP_FILE}
          groupLabel={headerTitle}
          enableHotelFilter={group === "JCR"} // JCR: deja filtrar Marriott/MDQ/BCR/JCR
        />
      </div>

      {/* ====== 5) NACIONALIDADES ====== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
          Nacionalidades
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Ranking por país + distribución global (mapa). Usa filtro global de año.
        </div>

        <div className="card" style={{ marginTop: "1rem", padding: "1rem", borderRadius: 22 }}>
          <CountryRanking
            year={year}
            filePath={NACIONALIDADES_FILE}
            baseYear={baseYear}
            limit={18}
          />
        </div>
      </div>
    </section>
  );
}
