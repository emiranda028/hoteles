"use client";

import { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic } from "./csvClient";

type HofRow = {
  empresa: string;
  fecha: string;
  year: number;
  month: number; // 1-12
  occupied: number; // Total Occ.
  revenue: number;  // Room Revenue
  guests: number;   // Adl. & Chl.
};

const AVAIL_PER_DAY: Record<string, number> = {
  MARRIOTT: 300,
  "SHERATON MDQ": 194,
  "SHERATON BCR": 161,
};

const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function toNumberIntl(x: any) {
  // "22.441,71" -> 22441.71, "59,40%" -> 59.40
  if (x === null || x === undefined) return 0;
  const s = String(x).trim();
  if (!s) return 0;

  const noPct = s.replace("%", "").trim();
  const normalized = noPct.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function clampMonth(m: number) {
  if (!Number.isFinite(m)) return 0;
  if (m < 1 || m > 12) return 0;
  return m;
}

function parseYearMonthFromFecha(fecha: any) {
  // Soporta "1/6/2022" (dd/mm/yyyy) y "6/1/2022" (mm/dd/yyyy) y también con "-"
  const s = String(fecha ?? "").trim();
  if (!s) return { year: 0, month: 0 };

  const parts = s.split(/[\/\-]/).map((p) => p.trim());
  if (parts.length < 3) return { year: 0, month: 0 };

  const a = Number(parts[0]); // puede ser día o mes
  const b = Number(parts[1]); // puede ser mes o día
  const y = Number(parts[2]);

  const year = Number.isFinite(y) ? y : 0;

  // Heurística robusta:
  // - si a > 12 => a es día, b es mes
  // - si b > 12 => b es día, a es mes
  // - si ambos <= 12 (ambiguo), preferimos b como mes (formato típico AR: dd/mm/yyyy)
  let month = 0;
  if (a > 12 && b >= 1 && b <= 12) month = b;
  else if (b > 12 && a >= 1 && a <= 12) month = a;
  else month = b;

  return { year, month: clampMonth(month) };
}

function fmtMoney(n: number) {
  // “as-is” (no asumimos IVA ni conversión)
  return Math.round(n).toLocaleString("es-AR");
}
function fmtPct01(p01: number) {
  return (p01 * 100).toFixed(1).replace(".", ",") + "%";
}

export default function HofSummary({
  year,
  baseYear = 2024,
  filePath = "/data/hf_diario.csv",
  empresa = "MARRIOTT",
}: {
  year: number;
  baseYear?: number;
  filePath?: string;
  empresa?: "MARRIOTT" | "SHERATON MDQ" | "SHERATON BCR";
}) {
  const [rows, setRows] = useState<HofRow[]>([]);
  const [loading, setLoading] = useState(true);
  const avail = AVAIL_PER_DAY[empresa] ?? 0;

  useEffect(() => {
    let alive = true;
    setLoading(true);

    readCsvFromPublic(filePath)
      .then(({ rows }) => {
        if (!alive) return;

        const normalized: HofRow[] = rows
          .map((r: any) => {
            const emp = String(r["Empresa"] ?? r["empresa"] ?? "")
              .trim()
              .toUpperCase();

            const fecha = r["Fecha"] ?? r["fecha"];
            const { year: yy, month: mm } = parseYearMonthFromFecha(fecha);

            const occupied = toNumberIntl(
              r["Total Occ."] ??
              r["Total Occ"] ??
              r["Total\nOcc."] ??
              r["Total Occ "] ??
              r["Total Occ. "] ??
              r["Total Occ.\u00A0"]
            );

            const revenue = toNumberIntl(
              r["Room Revenue"] ??
              r["RoomRevenue"] ??
              r["Room Revenue "] ??
              r["Room Revenue\u00A0"]
            );

            const guests = toNumberIntl(
              r["Adl. & Chl."] ??
              r["Adl. & Chl"] ??
              r["Adl. &\nChl."] ??
              r["Adl. & Chl. "] ??
              r["Adl. & Chl.\u00A0"]
            );

            return {
              empresa: emp,
              fecha: String(fecha ?? "").trim(),
              year: yy,
              month: mm,
              occupied,
              revenue,
              guests,
            };
          })
          .filter((x) => x.empresa && x.year && x.month); // month ya viene 1..12

        setRows(normalized);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));

    return () => {
      alive = false;
    };
  }, [filePath]);

  const availableYears = useMemo(() => {
    return Array.from(new Set(rows.filter(r => r.empresa === empresa).map(r => r.year))).sort((a,b)=>a-b);
  }, [rows, empresa]);

  const rowsY = useMemo(() => rows.filter(r => r.empresa === empresa && r.year === year), [rows, empresa, year]);
  const rowsBase = useMemo(() => rows.filter(r => r.empresa === empresa && r.year === baseYear), [rows, empresa, baseYear]);

  const annual = useMemo(() => {
    const days = rowsY.length;
    const occRooms = rowsY.reduce((s, r) => s + r.occupied, 0);
    const rev = rowsY.reduce((s, r) => s + r.revenue, 0);
    const guests = rowsY.reduce((s, r) => s + r.guests, 0);

    const availRooms = avail > 0 ? days * avail : 0;
    const occ01 = availRooms > 0 ? occRooms / availRooms : 0;
    const adr = occRooms > 0 ? rev / occRooms : 0;

    return { days, occRooms, availRooms, occ01, rev, guests, adr };
  }, [rowsY, avail]);

  const annualBase = useMemo(() => {
    const days = rowsBase.length;
    const occRooms = rowsBase.reduce((s, r) => s + r.occupied, 0);
    const rev = rowsBase.reduce((s, r) => s + r.revenue, 0);
    const availRooms = avail > 0 ? days * avail : 0;
    const occ01 = availRooms > 0 ? occRooms / availRooms : 0;
    return { days, occRooms, availRooms, occ01, rev };
  }, [rowsBase, avail]);

  // ✅ 12 meses fijos (Ene–Dic)
  const monthly12 = useMemo(() => {
    const buckets = new Map<number, { days: number; occRooms: number; rev: number; guests: number }>();

    rowsY.forEach((r) => {
      const prev = buckets.get(r.month) ?? { days: 0, occRooms: 0, rev: 0, guests: 0 };
      prev.days += 1;
      prev.occRooms += r.occupied;
      prev.rev += r.revenue;
      prev.guests += r.guests;
      buckets.set(r.month, prev);
    });

    const out = [];
    for (let m = 1; m <= 12; m++) {
      const b = buckets.get(m) ?? { days: 0, occRooms: 0, rev: 0, guests: 0 };
      const availRooms = b.days * avail;
      const occ01 = availRooms > 0 ? b.occRooms / availRooms : 0;
      const adr = b.occRooms > 0 ? b.rev / b.occRooms : 0;

      out.push({
        month: m,
        monthName: MONTHS[m - 1],
        days: b.days,
        occRooms: b.occRooms,
        rev: b.rev,
        guests: b.guests,
        availRooms,
        occ01,
        adr,
      });
    }
    return out;
  }, [rowsY, avail]);

  const monthlyRanking = useMemo(() => {
    return [...monthly12].sort((a, b) => {
      if (b.occ01 !== a.occ01) return b.occ01 - a.occ01;
      return b.rev - a.rev;
    });
  }, [monthly12]);

  const occDeltaPP = (annual.occ01 - annualBase.occ01) * 100;
  const revDeltaPct = annualBase.rev > 0 ? ((annual.rev / annualBase.rev) - 1) * 100 : 0;

  if (loading) {
    return (
      <div className="card">
        <div className="cardTop">
          <div>
            <div className="cardTitle">H&F – {empresa}</div>
            <div className="cardNote">Cargando CSV…</div>
          </div>
        </div>
      </div>
    );
  }

  if (!rowsY.length) {
    return (
      <div className="card">
        <div className="cardTop">
          <div>
            <div className="cardTitle">H&F – {empresa}</div>
            <div className="cardNote">
              Sin datos para {year}. Años disponibles: {availableYears.length ? availableYears.join(", ") : "—"}
            </div>
          </div>
        </div>
        <div className="cardNote">
          Filas {year}: 0 · Filas {baseYear}: {rowsBase.length}
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ gridColumn: "span 1" }}>
      <div className="cardTop">
        <div>
          <div className="cardTitle">H&F – {empresa}</div>
          <div className="cardNote">
            Ocupación con disponibilidad fija: {avail}/día · Revenue “as-is” (puede incluir IVA)
          </div>
        </div>
      </div>

      <div className="kpiGrid" style={{ marginTop: ".6rem" }}>
        <div className="kpi">
          <div className="kpiLabel">Ocupación promedio {year}</div>
          <div className="kpiValue">{fmtPct01(annual.occ01)}</div>
          <div className={`delta ${occDeltaPP >= 0 ? "up" : "down"}`}>
            {occDeltaPP >= 0 ? "▲" : "▼"} {occDeltaPP >= 0 ? "+" : ""}
            {occDeltaPP.toFixed(1).replace(".", ",")} p.p. vs {baseYear}
          </div>
        </div>

        <div className="kpi">
          <div className="kpiLabel">Room Revenue {year}</div>
          <div className="kpiValue">{fmtMoney(annual.rev)}</div>
          <div className={`delta ${revDeltaPct >= 0 ? "up" : "down"}`}>
            {revDeltaPct >= 0 ? "▲" : "▼"} {revDeltaPct >= 0 ? "+" : ""}
            {revDeltaPct.toFixed(1).replace(".", ",")}% vs {baseYear}
          </div>
        </div>

        <div className="kpi">
          <div className="kpiLabel">Rooms ocupadas {year}</div>
          <div className="kpiValue">{annual.occRooms.toLocaleString("es-AR")}</div>
          <div className="kpiCap">{annual.days} días leídos (CSV)</div>
        </div>

        <div className="kpi">
          <div className="kpiLabel">ADR estimado {year}</div>
          <div className="kpiValue">{Math.round(annual.adr).toLocaleString("es-AR")}</div>
          <div className="kpiCap">Revenue / Rooms ocupadas</div>
        </div>
      </div>

      {/* ✅ Detalle mensual SOLO 12 meses + Ranking */}
      <div style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: ".9rem" }}>
        <div style={{ overflowX: "auto" }}>
          <div className="sectionHeader" style={{ marginTop: ".25rem" }}>
            <div>
              <div className="sectionKicker">Detalle</div>
              <div className="sectionTitle">Mensual (12 meses)</div>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                <th style={{ padding: ".5rem .25rem" }}>Mes</th>
                <th style={{ padding: ".5rem .25rem" }}>Ocupación</th>
                <th style={{ padding: ".5rem .25rem" }}>Rooms</th>
                <th style={{ padding: ".5rem .25rem" }}>Revenue</th>
                <th style={{ padding: ".5rem .25rem" }}>ADR</th>
              </tr>
            </thead>
            <tbody>
              {monthly12.map((m) => (
                <tr key={m.month} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: ".55rem .25rem", fontWeight: 700 }}>{m.monthName}</td>
                  <td style={{ padding: ".55rem .25rem" }}>{fmtPct01(m.occ01)}</td>
                  <td style={{ padding: ".55rem .25rem" }}>{m.occRooms.toLocaleString("es-AR")}</td>
                  <td style={{ padding: ".55rem .25rem" }}>{fmtMoney(m.rev)}</td>
                  <td style={{ padding: ".55rem .25rem" }}>{Math.round(m.adr).toLocaleString("es-AR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ overflowX: "auto" }}>
          <div className="sectionHeader" style={{ marginTop: ".25rem" }}>
            <div>
              <div className="sectionKicker">Ranking</div>
              <div className="sectionTitle">Mejor mes → peor mes</div>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                <th style={{ padding: ".5rem .25rem" }}>#</th>
                <th style={{ padding: ".5rem .25rem" }}>Mes</th>
                <th style={{ padding: ".5rem .25rem" }}>Ocupación</th>
                <th style={{ padding: ".5rem .25rem" }}>Rooms</th>
                <th style={{ padding: ".5rem .25rem" }}>Revenue</th>
                <th style={{ padding: ".5rem .25rem" }}>ADR</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRanking.map((m, i) => (
                <tr key={m.month} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: ".55rem .25rem", fontWeight: 800 }}>{i + 1}</td>
                  <td style={{ padding: ".55rem .25rem", fontWeight: 700 }}>{m.monthName}</td>
                  <td style={{ padding: ".55rem .25rem" }}>{fmtPct01(m.occ01)}</td>
                  <td style={{ padding: ".55rem .25rem" }}>{m.occRooms.toLocaleString("es-AR")}</td>
                  <td style={{ padding: ".55rem .25rem" }}>{fmtMoney(m.rev)}</td>
                  <td style={{ padding: ".55rem .25rem" }}>{Math.round(m.adr).toLocaleString("es-AR")}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="cardNote" style={{ marginTop: ".6rem" }}>
            Ocupación mensual = Rooms / (días del mes leídos * disponibilidad fija). ADR = Revenue / Rooms.
          </div>
        </div>
      </div>
    </div>
  );
}
