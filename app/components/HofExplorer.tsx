"use client";

import { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic } from "./csvClient";

/* ===============================
   CONFIGURACIÓN FIJA
================================ */

const AVAIL_PER_DAY_BY_HOTEL: Record<string, number> = {
  MARRIOTT: 300,
  "SHERATON MDQ": 194,
  "SHERATON BCR": 161,
  MAITEI: 98,
};

const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function normHotel(x: string) {
  return String(x ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/** Intenta parsear números con formato ES/AR (1.234.567,89) y también variantes */
function parseMoneyES(value: any) {
  if (value == null) return 0;
  const s = String(value).trim();
  if (!s) return 0;

  // Caso típico ES: 22.441,71  => 22441.71
  // Si viene US: 22441.71 lo deja como está
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (hasComma && !hasDot) {
    return Number(s.replace(",", ".")) || 0;
  }
  // solo puntos: puede ser miles o decimal; lo intentamos directo
  return Number(s) || 0;
}

const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR");
const fmtMoney0 = (n: number) =>
  Math.round(n).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const fmtMoney2 = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct1 = (p01: number) => (p01 * 100).toFixed(1).replace(".", ",") + "%";

/* ===============================
   TIPOS
================================ */

type HofRow = {
  date: Date;
  year: number;
  month: number; // 1-12
  quarter: number; // 1-4
  rooms: number;
  revenue: number;
  guests: number;
  hotel: string; // normalizado
};

type Agg = {
  rooms: number;
  revenue: number;
  guests: number;
  days: number;
  availableRooms: number;
  occ01: number;
  adr: number; // revenue / rooms
};

/* ===============================
   COMPONENTE
================================ */

export default function HofExplorer({
  filePath = "/data/hf_diario.csv",
  allowedHotels,
  title,
  defaultYear = 2025,
}: {
  filePath?: string;
  allowedHotels: string[];
  title: string;
  defaultYear?: number;
}) {
  /* ---------- STATE ---------- */

  const [rows, setRows] = useState<HofRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [hotel, setHotel] = useState<string>(allowedHotels?.[0] ?? "MARRIOTT");
  const [year, setYear] = useState<number>(defaultYear);
  const [mode, setMode] = useState<"year" | "quarter" | "month">("year");
  const [quarter, setQuarter] = useState<number>(1);
  const [month, setMonth] = useState<number>(1);

  /* ---------- LOAD CSV ---------- */

  useEffect(() => {
    let alive = true;
    setLoading(true);

    readCsvFromPublic(filePath)
      .then(({ rows }) => {
        if (!alive) return;

        const parsed: HofRow[] = rows
          .map((r: any) => {
            const d = new Date(r.Fecha || r.Date);
            if (Number.isNaN(d.getTime())) return null;

            const rooms = Number(r["Total Occ."] ?? r["Total\nOcc."] ?? r["Total Occ"] ?? r.Rooms ?? 0) || 0;

            return {
              date: d,
              year: d.getFullYear(),
              month: d.getMonth() + 1,
              quarter: Math.floor(d.getMonth() / 3) + 1,
              rooms,
              revenue: parseMoneyES(r["Room Revenue"] ?? r["Room\nRevenue"] ?? r.Revenue ?? 0),
              guests: Number(r["Adl. & Chl."] ?? r["Adl. &\nChl."] ?? r.Guests ?? 0) || 0,
              hotel: normHotel(r.Empresa ?? r.Hotel ?? ""),
            } as HofRow;
          })
          .filter(Boolean) as HofRow[];

        setRows(parsed);
      })
      .finally(() => setLoading(false));

    return () => {
      alive = false;
    };
  }, [filePath]);

  /* ---------- FILTRADO BASE ---------- */

  const rowsHotel = useMemo(() => {
    const target = normHotel(hotel);
    return rows.filter((r) => r.hotel === target);
  }, [rows, hotel]);

  const yearsAvailable = useMemo(() => {
    const ys = Array.from(new Set(rowsHotel.map((r) => r.year))).sort((a, b) => a - b);
    return ys;
  }, [rowsHotel]);

  // Ajuste automático si el año actual no existe para ese hotel
  useEffect(() => {
    if (!yearsAvailable.length) return;
    if (!yearsAvailable.includes(year)) {
      // preferimos 2025 si existe, si no el último
      const prefer = yearsAvailable.includes(2025) ? 2025 : yearsAvailable[yearsAvailable.length - 1];
      setYear(prefer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearsAvailable.join("|")]);

  // Ajuste quarter/month por si cambian de año
  useEffect(() => {
    setQuarter(1);
    setMonth(1);
  }, [year]);

  /* ---------- AGREGADOR ---------- */

  function aggregate(list: HofRow[], hotelKey: string): Agg | null {
    if (!list.length) return null;

    const availPerDay = AVAIL_PER_DAY_BY_HOTEL[normHotel(hotelKey)] ?? 0;
    const days = new Set(list.map((r) => r.date.toDateString())).size;

    const rooms = list.reduce((a, b) => a + (Number.isFinite(b.rooms) ? b.rooms : 0), 0);
    const revenue = list.reduce((a, b) => a + (Number.isFinite(b.revenue) ? b.revenue : 0), 0);
    const guests = list.reduce((a, b) => a + (Number.isFinite(b.guests) ? b.guests : 0), 0);

    const availableRooms = days * availPerDay;
    const occ01 = availableRooms > 0 ? rooms / availableRooms : 0;
    const adr = rooms > 0 ? revenue / rooms : 0;

    return { rooms, revenue, guests, days, availableRooms, occ01, adr };
  }

  /* ---------- AGREGADO PRINCIPAL SEGÚN MODO ---------- */

  const aggMain = useMemo(() => {
    const base = rowsHotel.filter((r) => r.year === year);

    if (mode === "year") return aggregate(base, hotel);
    if (mode === "quarter") return aggregate(base.filter((r) => r.quarter === quarter), hotel);
    return aggregate(base.filter((r) => r.month === month), hotel);
  }, [rowsHotel, year, mode, quarter, month, hotel]);

  /* ---------- DETALLE MENSUAL (12 MESES) + RANKING ---------- */

  const monthly = useMemo(() => {
    const out: Array<
      Agg & { month: number; name: string }
    > = [];

    for (let m = 1; m <= 12; m++) {
      const list = rowsHotel.filter((r) => r.year === year && r.month === m);
      const agg = aggregate(list, hotel);
      if (agg) {
        out.push({
          ...agg,
          month: m,
          name: MONTHS_ES[m - 1],
        });
      } else {
        // Si querés siempre 12 filas aunque falten meses, descomentá esto:
        // out.push({ rooms:0,revenue:0,guests:0,days:0,availableRooms:0,occ01:0,adr:0,month:m,name:MONTHS_ES[m-1] })
      }
    }

    return out;
  }, [rowsHotel, year, hotel]);

  const ranking = useMemo(() => {
    const sorted = [...monthly].sort((a, b) => b.occ01 - a.occ01);
    return sorted;
  }, [monthly]);

  const maxOcc = useMemo(() => {
    const v = ranking.length ? ranking[0].occ01 : 0;
    return v > 0 ? v : 0;
  }, [ranking]);

  /* ===============================
     UI helpers
================================ */

  const Chip = ({
    active,
    children,
    onClick,
    title,
  }: {
    active?: boolean;
    children: React.ReactNode;
    onClick?: () => void;
    title?: string;
  }) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        border: "1px solid var(--border)",
        background: active ? "rgba(0,0,0,.06)" : "transparent",
        color: "var(--text)",
        padding: ".5rem .75rem",
        borderRadius: "999px",
        fontWeight: 700,
        fontSize: ".85rem",
        cursor: "pointer",
        transition: "transform .06s ease, background .15s ease",
      }}
    >
      {children}
    </button>
  );

  const SegBtn = ({
    active,
    children,
    onClick,
  }: {
    active?: boolean;
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "1px solid var(--border)",
        background: active ? "var(--primary)" : "transparent",
        color: active ? "#fff" : "var(--text)",
        padding: ".55rem .9rem",
        borderRadius: "12px",
        fontWeight: 800,
        fontSize: ".8rem",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );

  const Medal = (i: number) => {
    if (i === 0) return "🥇";
    if (i === 1) return "🥈";
    if (i === 2) return "🥉";
    return "•";
  };

  /* ===============================
     RENDER
================================ */

  return (
    <section className="section">
      <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: "1rem" }}>
        <div>
          <div className="sectionKicker">H&F – Explorador</div>
          <h3 className="sectionTitle">{title}</h3>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Filtros por hotel + año/mes/trimestre. Incluye ranking por mes por hotel.
          </div>
        </div>
      </div>

      {/* ===== FILTROS (BONITOS) ===== */}
      <div
        className="card"
        style={{
          marginTop: "1rem",
          padding: "1rem",
          display: "grid",
          gap: "1rem",
        }}
      >
        {/* fila 1: Hotel + Año */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".6rem", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: ".85rem", color: "var(--muted)" }}>Hotel</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem" }}>
            {allowedHotels.map((h) => (
              <Chip
                key={h}
                active={normHotel(hotel) === normHotel(h)}
                onClick={() => setHotel(h)}
              >
                {h}
              </Chip>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ fontWeight: 800, fontSize: ".85rem", color: "var(--muted)" }}>Año</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem" }}>
            {yearsAvailable.map((y) => (
              <Chip key={y} active={year === y} onClick={() => setYear(y)}>
                {y}
              </Chip>
            ))}
          </div>
        </div>

        {/* fila 2: modo + selector quarter/month */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".6rem", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: ".85rem", color: "var(--muted)" }}>Vista</div>
          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            <SegBtn active={mode === "year"} onClick={() => setMode("year")}>
              YEAR
            </SegBtn>
            <SegBtn active={mode === "quarter"} onClick={() => setMode("quarter")}>
              QUARTER
            </SegBtn>
            <SegBtn active={mode === "month"} onClick={() => setMode("month")}>
              MONTH
            </SegBtn>
          </div>

          {mode === "quarter" && (
            <>
              <div style={{ marginLeft: ".75rem", fontWeight: 800, fontSize: ".85rem", color: "var(--muted)" }}>
                Trimestre
              </div>
              <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                {[1, 2, 3, 4].map((q) => (
                  <Chip key={q} active={quarter === q} onClick={() => setQuarter(q)}>
                    Q{q}
                  </Chip>
                ))}
              </div>
            </>
          )}

          {mode === "month" && (
            <>
              <div style={{ marginLeft: ".75rem", fontWeight: 800, fontSize: ".85rem", color: "var(--muted)" }}>
                Mes
              </div>
              <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                {MONTHS_ES.map((name, idx) => {
                  const m = idx + 1;
                  return (
                    <Chip key={name} active={month === m} onClick={() => setMonth(m)} title={name}>
                      {name.slice(0, 3).toUpperCase()}
                    </Chip>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== KPI ===== */}
      <div className="cardRow" style={{ marginTop: "1rem" }}>
        <div className="card">
          <div className="cardTitle">Ocupación promedio</div>
          <div className="cardValue">
            {loading ? "…" : aggMain ? fmtPct1(aggMain.occ01) : "—"}
          </div>
          <div className="cardNote">
            Disponibilidad: {AVAIL_PER_DAY_BY_HOTEL[normHotel(hotel)] ?? 0}/día · Días:{" "}
            {aggMain ? fmtInt(aggMain.days) : "0"}
          </div>
        </div>

        <div className="card">
          <div className="cardTitle">Rooms occupied</div>
          <div className="cardValue">{loading ? "…" : aggMain ? fmtInt(aggMain.rooms) : "—"}</div>
          <div className="cardNote">
            Total disp.: {aggMain ? fmtInt(aggMain.availableRooms) : "0"}
          </div>
        </div>

        <div className="card">
          <div className="cardTitle">Room Revenue</div>
          <div className="cardValue">{loading ? "…" : aggMain ? fmtMoney2(aggMain.revenue) : "—"}</div>
          <div className="cardNote">Moneda “as-is” desde el CSV.</div>
        </div>

        <div className="card">
          <div className="cardTitle">ADR</div>
          <div className="cardValue">{loading ? "…" : aggMain ? fmtMoney0(aggMain.adr) : "—"}</div>
          <div className="cardNote">Revenue / Rooms</div>
        </div>
      </div>

      {/* ===== DETALLE + RANKING ===== */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, .8fr)",
          gap: "1.25rem",
          marginTop: "1.25rem",
          alignItems: "stretch",
        }}
      >
        {/* DETALLE */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="cardTitle">Detalle mensual</div>
          <div className="cardNote" style={{ marginTop: ".25rem" }}>
            Enero–Diciembre (12 meses) · Año {year}
          </div>

          <div style={{ marginTop: ".8rem", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                  <th style={{ padding: ".6rem .5rem", borderBottom: "1px solid var(--border)" }}>Mes</th>
                  <th style={{ padding: ".6rem .5rem", borderBottom: "1px solid var(--border)" }}>Ocupación</th>
                  <th style={{ padding: ".6rem .5rem", borderBottom: "1px solid var(--border)" }}>Rooms</th>
                  <th style={{ padding: ".6rem .5rem", borderBottom: "1px solid var(--border)" }}>Revenue</th>
                  <th style={{ padding: ".6rem .5rem", borderBottom: "1px solid var(--border)" }}>ADR</th>
                </tr>
              </thead>
              <tbody>
                {monthly.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: ".85rem .5rem", color: "var(--muted)" }}>
                      Sin datos para {year}.
                    </td>
                  </tr>
                ) : (
                  monthly.map((m) => (
                    <tr key={m.month}>
                      <td style={{ padding: ".55rem .5rem", borderBottom: "1px solid rgba(0,0,0,.06)", fontWeight: 700 }}>
                        {m.name}
                      </td>
                      <td style={{ padding: ".55rem .5rem", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
                        {fmtPct1(m.occ01)}
                      </td>
                      <td style={{ padding: ".55rem .5rem", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
                        {fmtInt(m.rooms)}
                      </td>
                      <td style={{ padding: ".55rem .5rem", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
                        {fmtMoney2(m.revenue)}
                      </td>
                      <td style={{ padding: ".55rem .5rem", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
                        {fmtMoney0(m.adr)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RANKING */}
        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="cardTitle">Ranking de meses</div>
          <div className="cardNote" style={{ marginTop: ".25rem" }}>
            Mejor → peor (por ocupación)
          </div>

          <div style={{ marginTop: ".9rem", display: "grid", gap: ".55rem" }}>
            {ranking.length === 0 ? (
              <div style={{ color: "var(--muted)" }}>Sin datos.</div>
            ) : (
              ranking.map((m, i) => {
                const w = maxOcc > 0 ? Math.max(0.06, m.occ01 / maxOcc) : 0;
                return (
                  <div
                    key={m.month}
                    style={{
                      border: "1px solid rgba(0,0,0,.08)",
                      borderRadius: "14px",
                      padding: ".65rem .7rem",
                      background: "rgba(0,0,0,.02)",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                        <div style={{ width: 24, textAlign: "center" }}>{Medal(i)}</div>
                        <div style={{ fontWeight: 900 }}>{i + 1}. {m.name}</div>
                      </div>
                      <div style={{ fontWeight: 900 }}>{fmtPct1(m.occ01)}</div>
                    </div>

                    <div style={{ marginTop: ".45rem", display: "flex", gap: ".5rem", alignItems: "center" }}>
                      <div
                        aria-hidden="true"
                        style={{
                          height: 8,
                          flex: 1,
                          background: "rgba(0,0,0,.08)",
                          borderRadius: 999,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.round(w * 100)}%`,
                            background: "var(--primary)",
                            borderRadius: 999,
                          }}
                        />
                      </div>
                      <div style={{ fontSize: ".8rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                        ADR {fmtMoney0(m.adr)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ marginTop: "auto" }} />
        </div>
      </div>
    </section>
  );
}
