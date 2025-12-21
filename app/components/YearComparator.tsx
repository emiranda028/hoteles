"use client";

import { useEffect, useMemo, useState } from "react";

import HighlightsCarousel from "./HighlightsCarousel";
import MembershipSummary from "./MembershipSummary";
import CountryRanking from "./CountryRanking";
import { readCsvFromPublic } from "./csvClient";

type GlobalHotel = "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

const HF_PATH = "/data/hf_diario.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

const JCR_HOTELS: GlobalHotel[] = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];

type HfRow = {
  Empresa?: string;
  HoF?: string;
  Fecha?: string;
  Date?: string;

  ["Occ.%"]?: any;
  ["Average Rate"]?: any;
  ["Room Revenue"]?: any;
  ["Adl. & Chl."]?: any;
};

function normalizeText(s: any) {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(x: any) {
  if (x === null || x === undefined) return 0;
  const s = String(x).trim();
  if (!s) return 0;

  // 59,40% => 59.40
  const pct = s.includes("%");
  const cleaned = s
    .replace(/\./g, "")
    .replace(",", ".")
    .replace("%", "")
    .replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return pct ? n : n;
}

function parseDateAny(v: any): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;

  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]) - 1;
    const yy = Number(m[3]);
    const d = new Date(yy, mm, dd);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  // yyyy-mm-dd
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m2) {
    const yy = Number(m2[1]);
    const mm = Number(m2[2]) - 1;
    const dd = Number(m2[3]);
    const d = new Date(yy, mm, dd);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  const d3 = new Date(s);
  return Number.isFinite(d3.getTime()) ? d3 : null;
}

function getYear(r: HfRow): number | null {
  const d = parseDateAny(r.Fecha || r.Date);
  return d ? d.getFullYear() : null;
}

function isHistoryOrForecast(v: any) {
  const s = String(v ?? "").toLowerCase();
  return s.includes("history") || s.includes("forecast");
}

function formatMoneyARS(n: number) {
  try {
    return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  } catch {
    return String(Math.round(n));
  }
}

function hotelLabel(h: GlobalHotel) {
  if (h === "JCR") return "JCR (MARRIOTT + SHERATON BCR + SHERATON MDQ)";
  return h;
}

export default function YearComparator() {
  // filtros globales
  const [year, setYear] = useState<number>(2025);
  const [baseYear, setBaseYear] = useState<number>(2024);
  const [globalHotel, setGlobalHotel] = useState<GlobalHotel>("JCR");

  // H&F rows
  const [hfRows, setHfRows] = useState<HfRow[]>([]);
  const [hfLoading, setHfLoading] = useState(true);
  const [hfErr, setHfErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setHfLoading(true);
    setHfErr(null);

    readCsvFromPublic(HF_PATH)
      .then((res) => {
        if (!alive) return;
        setHfRows((res.rows ?? []) as HfRow[]);
      })
      .catch((e: any) => {
        if (!alive) return;
        setHfErr(e?.message ?? "Error leyendo H&F");
      })
      .finally(() => {
        if (!alive) return;
        setHfLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const availableYears = useMemo(() => {
    const ys = new Set<number>();
    for (const r of hfRows) {
      const y = getYear(r);
      if (y) ys.add(y);
    }
    const out = Array.from(ys.values()).sort((a, b) => b - a);
    return out.length ? out : [2025, 2024, 2023];
  }, [hfRows]);

  // si year/baseYear no existen en data, los ajustamos suavemente
  useEffect(() => {
    if (!availableYears.length) return;
    if (!availableYears.includes(year)) setYear(availableYears[0]);
    if (!availableYears.includes(baseYear)) {
      const candidate = availableYears.find((y) => y !== year) ?? availableYears[0];
      setBaseYear(candidate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableYears]);

  const allowedHotels = useMemo(() => {
    if (globalHotel === "JCR") return ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
    return [globalHotel];
  }, [globalHotel]);

  const hfYearRows = useMemo(() => {
    return (hfRows ?? [])
      .filter((r) => allowedHotels.includes(normalizeText(r.Empresa)))
      .filter((r) => isHistoryOrForecast(r.HoF))
      .filter((r) => getYear(r) === year);
  }, [hfRows, allowedHotels, year]);

  const hfBaseRows = useMemo(() => {
    return (hfRows ?? [])
      .filter((r) => allowedHotels.includes(normalizeText(r.Empresa)))
      .filter((r) => isHistoryOrForecast(r.HoF))
      .filter((r) => getYear(r) === baseYear);
  }, [hfRows, allowedHotels, baseYear]);

  const hfKpis = useMemo(() => {
    const calc = (rows: HfRow[]) => {
      let occSum = 0,
        occCount = 0;
      let adrSum = 0,
        adrCount = 0;
      let roomRevenue = 0;
      let pax = 0;

      for (const r of rows) {
        const occ = toNumber((r as any)["Occ.%"]);
        if (occ > 0) {
          occSum += occ;
          occCount += 1;
        }

        const adr = toNumber((r as any)["Average Rate"]);
        if (adr > 0) {
          adrSum += adr;
          adrCount += 1;
        }

        roomRevenue += toNumber((r as any)["Room Revenue"]);
        pax += toNumber((r as any)["Adl. & Chl."]);
      }

      return {
        rows: rows.length,
        occAvg: occCount ? occSum / occCount : 0,
        adrAvg: adrCount ? adrSum / adrCount : 0,
        roomRevenue,
        pax,
      };
    };

    return {
      cur: calc(hfYearRows),
      base: calc(hfBaseRows),
    };
  }, [hfYearRows, hfBaseRows]);

  const delta = useMemo(() => {
    const cur = hfKpis.cur;
    const base = hfKpis.base;

    const pct = (a: number, b: number) => {
      if (!b) return null;
      return ((a - b) / b) * 100;
    };

    return {
      occ: pct(cur.occAvg, base.occAvg),
      adr: pct(cur.adrAvg, base.adrAvg),
      rev: pct(cur.roomRevenue, base.roomRevenue),
      pax: pct(cur.pax, base.pax),
    };
  }, [hfKpis]);

  const membershipHotelFilter = useMemo(() => {
    // Membership: filtro global año + hotel (JCR/MARRIOTT/SHERATONS). MAITEI NO aplica (no está en ese XLSX).
    if (globalHotel === "MAITEI") return "JCR";
    return globalHotel;
  }, [globalHotel]);

  return (
    <section className="section" id="comparador">
      {/* ===== Encabezado + filtros globales ===== */}
      <div style={{ display: "grid", gap: ".85rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.35rem", fontWeight: 950 }}>
          Comparador anual · H&amp;F + Membership + Nacionalidades
        </div>

        <div
          className="card"
          style={{
            padding: "1rem",
            borderRadius: 22,
            display: "grid",
            gap: ".75rem",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: ".75rem",
              alignItems: "end",
            }}
          >
            <div>
              <div style={{ fontSize: ".82rem", opacity: 0.8 }}>Año</div>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                style={{ width: "100%", padding: ".55rem", borderRadius: 12 }}
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: ".82rem", opacity: 0.8 }}>Comparar contra</div>
              <select
                value={baseYear}
                onChange={(e) => setBaseYear(Number(e.target.value))}
                style={{ width: "100%", padding: ".55rem", borderRadius: 12 }}
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: ".82rem", opacity: 0.8 }}>Hotel</div>
              <select
                value={globalHotel}
                onChange={(e) => setGlobalHotel(e.target.value as GlobalHotel)}
                style={{ width: "100%", padding: ".55rem", borderRadius: 12 }}
              >
                <option value="JCR">JCR</option>
                <option value="MARRIOTT">MARRIOTT</option>
                <option value="SHERATON BCR">SHERATON BCR</option>
                <option value="SHERATON MDQ">SHERATON MDQ</option>
                <option value="MAITEI">MAITEI</option>
              </select>
            </div>
          </div>

          <div style={{ fontSize: ".85rem", opacity: 0.8 }}>
            Filtro actual: <b>{hotelLabel(globalHotel)}</b> · <b>{year}</b> vs <b>{baseYear}</b>
          </div>
        </div>
      </div>

      {/* ===== 1) Highlights / Carrouseles H&F ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Highlights (H&amp;F)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          KPIs rápidos desde el CSV H&amp;F. Respetan filtros globales.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <HighlightsCarousel year={year} hotelFilter={globalHotel} filePath={HF_PATH} />
        </div>
      </div>

      {/* ===== 2) KPIs principales (cards) ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          KPIs principales · {year} vs {baseYear}
        </div>

        <div
          style={{
            marginTop: ".85rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: ".75rem",
          }}
        >
          <KpiCard
            title="Ocupación promedio"
            a={`${hfKpis.cur.occAvg.toFixed(1)}%`}
            b={`${hfKpis.base.occAvg.toFixed(1)}%`}
            delta={delta.occ}
          />
          <KpiCard
            title="ADR promedio"
            a={formatMoneyARS(hfKpis.cur.adrAvg)}
            b={formatMoneyARS(hfKpis.base.adrAvg)}
            delta={delta.adr}
          />
          <KpiCard
            title="Room Revenue"
            a={formatMoneyARS(hfKpis.cur.roomRevenue)}
            b={formatMoneyARS(hfKpis.base.roomRevenue)}
            delta={delta.rev}
          />
          <KpiCard
            title="Pax (Adl+Chl)"
            a={formatMoneyARS(hfKpis.cur.pax)}
            b={formatMoneyARS(hfKpis.base.pax)}
            delta={delta.pax}
          />
        </div>

        <div style={{ marginTop: ".75rem", fontSize: ".85rem", opacity: 0.8 }}>
          H&amp;F filas: {hfKpis.cur.rows.toLocaleString("es-AR")} ({year}) ·{" "}
          {hfKpis.base.rows.toLocaleString("es-AR")} ({baseYear})
        </div>

        {hfLoading && (
          <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 18 }}>
            Cargando H&amp;F…
          </div>
        )}
        {hfErr && (
          <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 18 }}>
            Error H&amp;F: {hfErr}
          </div>
        )}
        {!hfLoading && !hfErr && hfKpis.cur.rows === 0 && (
          <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 18 }}>
            Sin filas H&amp;F para el filtro actual.
            <div style={{ marginTop: ".4rem", opacity: 0.85 }}>
              Chequeá que en el CSV existan: Empresa ∈ {allowedHotels.join(", ")} y Fecha dentro del año {year}.
            </div>
          </div>
        )}
      </div>

      {/* ===== 3) Comparativa (resumen) ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Comparativa (resumen)
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Resumen compacto para presentación. Respeta filtro global.
        </div>

        <div className="card" style={{ marginTop: ".85rem", padding: "1rem", borderRadius: 22 }}>
          <div style={{ display: "grid", gap: ".55rem" }}>
            <CompareLine label="Ocupación" a={hfKpis.cur.occAvg} b={hfKpis.base.occAvg} suffix="%" />
            <CompareLine label="ADR" a={hfKpis.cur.adrAvg} b={hfKpis.base.adrAvg} money />
            <CompareLine label="Room Revenue" a={hfKpis.cur.roomRevenue} b={hfKpis.base.roomRevenue} money />
            <CompareLine label="Pax" a={hfKpis.cur.pax} b={hfKpis.base.pax} />
          </div>
        </div>
      </div>

      {/* ===== 4) Membership ===== */}
      <div style={{ marginTop: "1.25rem" }}>
        <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
          Membership (JCR) · cantidades + gráficos
        </div>
        <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
          Usa filtro global de año + hotel (JCR/MARRIOTT/SHERATONS). Si elegís MAITEI, muestra JCR.
        </div>

        <div style={{ marginTop: ".85rem" }}>
          <MembershipSummary
            year={year}
            baseYear={baseYear}
            filePath={MEMBERSHIP_PATH}
            title={`Membership (${membershipHotelFilter}) — Acumulado ${year} · vs ${baseYear}`}
            allowedHotels={[...JCR_HOTELS]}
            hotelFilter={membershipHotelFilter as any}
            compactCharts={true}
          />
        </div>
      </div>

      {/* ===== 5) Nacionalidades ===== */}
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

      {/* ===== 6) MAITEI separado (solo si corresponde) ===== */}
      {globalHotel === "MAITEI" && (
        <div style={{ marginTop: "1.25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
            MAITEI (separado)
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Vista dedicada para MAITEI (H&amp;F). Membership no aplica.
          </div>

          <div style={{ marginTop: ".85rem" }}>
            <HighlightsCarousel year={year} hotelFilter="MAITEI" filePath={HF_PATH} />
          </div>
        </div>
      )}
    </section>
  );
}

/* =========================
   UI helpers
========================= */

function KpiCard({
  title,
  a,
  b,
  delta,
}: {
  title: string;
  a: string;
  b: string;
  delta: number | null;
}) {
  const d =
    delta === null
      ? "—"
      : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;

  return (
    <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
      <div style={{ fontSize: ".85rem", opacity: 0.8 }}>{title}</div>

      <div style={{ marginTop: ".35rem", display: "grid", gap: ".25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ opacity: 0.8 }}>{a}</span>
          <span style={{ fontWeight: 950 }}>{d}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", opacity: 0.8 }}>
          <span>{b}</span>
          <span style={{ fontSize: ".82rem" }}>base</span>
        </div>
      </div>
    </div>
  );
}

function CompareLine({
  label,
  a,
  b,
  suffix,
  money,
}: {
  label: string;
  a: number;
  b: number;
  suffix?: string;
  money?: boolean;
}) {
  const fmt = (x: number) => (money ? formatMoneyARS(x) : x.toLocaleString("es-AR"));
  const valA = suffix ? `${a.toFixed(1)}${suffix}` : fmt(a);
  const valB = suffix ? `${b.toFixed(1)}${suffix}` : fmt(b);
  const d = b ? ((a - b) / b) * 100 : null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        gap: ".75rem",
        alignItems: "center",
      }}
    >
      <div style={{ fontWeight: 850 }}>{label}</div>
      <div style={{ opacity: 0.9 }}>{valA}</div>
      <div style={{ fontWeight: 950, opacity: 0.95 }}>
        {d === null ? "—" : `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`}
      </div>

      <div style={{ gridColumn: "1 / -1", height: 1, background: "rgba(255,255,255,.08)" }} />
      <div style={{ gridColumn: "1 / -1", opacity: 0.75, marginTop: "-.35rem" }}>
        Base: {valB}
      </div>
    </div>
  );
}
