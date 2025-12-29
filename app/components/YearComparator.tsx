"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CsvRow,
  readCsvFromPublic,
  safeDiv,
  toNumberSmart,
  toPercent01,
  formatMoneyUSD0,
  formatPct01,
} from "./csvClient";

type Props = {
  filePath: string;
  year: number;
  baseYear: number;
  /**
   * "" => todos
   * "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI"
   */
  hotelFilter: string;
};

type Keys = {
  kHotel: string; // Empresa
  kFecha: string; // Fecha (o Date)
  kHof: string; // HoF
  kOccPct: string; // Occ.%
  kTotal: string; // Total Occ. (o Total)
  kRoomRevenue: string; // Room Revenue
  kAdr: string; // Average Rate
  kAdl: string; // Adl. & Chl.
  kDep: string; // Dep. Rooms
};

function pickKey(headers: string[], candidates: string[]): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/\./g, "")
      .trim();

  const H = headers.map((h) => ({ raw: h, n: norm(h) }));

  for (const c of candidates) {
    const cn = norm(c);
    const hit = H.find((x) => x.n === cn);
    if (hit) return hit.raw;
  }

  // fallback contains
  for (const c of candidates) {
    const cn = norm(c);
    const hit = H.find((x) => x.n.includes(cn));
    if (hit) return hit.raw;
  }

  return "";
}

function parseDateAny(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;

  const s = String(v).trim();
  if (!s) return null;

  // Preferimos dd/mm/yyyy (tu columna "Fecha" suele venir así)
  // ejemplos: "1/6/2022"
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    const yy = Number(m1[3]);
    const d = new Date(yy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // "01-06-22 Wed" (columna Date)
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m2) {
    const dd = Number(m2[1]);
    const mm = Number(m2[2]);
    let yy = Number(m2[3]);
    if (yy < 100) yy = 2000 + yy;
    const d = new Date(yy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // fallback Date.parse
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);

  return null;
}

function qOfMonth(m: number): 1 | 2 | 3 | 4 {
  if (m <= 2) return 1;
  if (m <= 5) return 2;
  if (m <= 8) return 3;
  return 4;
}

function monthLabel(m: number) {
  const names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return names[m] ?? "";
}

export default function YearComparator({ filePath, year, baseYear, hotelFilter }: Props) {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readCsvFromPublic(filePath)
      .then((r) => {
        if (!alive) return;
        setRows(r.rows ?? []);
        setHeaders(r.headers ?? []);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message ?? "Error leyendo H&F");
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  const keys: Keys = useMemo(() => {
    const kHotel = pickKey(headers, ["Empresa", "Hotel"]);
    const kFecha = pickKey(headers, ["Fecha", "Date"]);
    const kHof = pickKey(headers, ["HoF", "Hof", "HOF"]);
    const kOccPct = pickKey(headers, ["Occ.%", "Occ %", "Occ"]);
    const kTotal = pickKey(headers, ["Total Occ.", "Total", "Total Rooms", "Total Rooms in Hotel"]);
    const kRoomRevenue = pickKey(headers, ["Room Revenue", "Room Reven", "Room Revenu", "Room Reven"]);
    const kAdr = pickKey(headers, ["Average Rate", "ADR"]);
    const kAdl = pickKey(headers, ["Adl. & Chl.", "Adl. &", "Adults", "Adl"]);
    const kDep = pickKey(headers, ["Dep. Rooms", "Dep.", "Departures", "Dep Rooms"]);

    return { kHotel, kFecha, kHof, kOccPct, kTotal, kRoomRevenue, kAdr, kAdl, kDep };
  }, [headers]);

  const filtered = useMemo(() => {
    if (!rows.length) return [];

    const kHotel = keys.kHotel;
    const kFecha = keys.kFecha;
    const kHof = keys.kHof;

    const out = rows
      .map((r) => {
        const d = parseDateAny(r[kFecha]);
        const yy = d ? d.getFullYear() : null;

        return {
          raw: r,
          date: d,
          year: yy,
          month: d ? d.getMonth() : null,
          q: d ? qOfMonth(d.getMonth()) : null,
          empresa: String(r[kHotel] ?? "").trim(),
          hof: String(r[kHof] ?? "").trim(),
        };
      })
      .filter((x) => x.date && x.year !== null);

    // hotelFilter: "" => todos, si viene MAITEI o MARRIOTT etc debe ser match EXACTO
    const hf = String(hotelFilter ?? "").trim();
    const hotelOk = (emp: string) => {
      if (!hf) return true;
      return emp === hf;
    };

    return out.filter((x) => hotelOk(x.empresa));
  }, [rows, keys, hotelFilter]);

  const byYear = useMemo(() => {
    const kOcc = keys.kOccPct;
    const kRev = keys.kRoomRevenue;
    const kAdr = keys.kAdr;
    const kTotal = keys.kTotal;

    const agg = (targetYear: number) => {
      const rowsY = filtered.filter((x) => x.year === targetYear);

      let sumRev = 0;
      let sumOccPct = 0;
      let cntOcc = 0;

      let sumAdr = 0;
      let cntAdr = 0;

      let sumTotal = 0;

      for (const x of rowsY) {
        const r = x.raw;
        const occ01 = toPercent01(toNumberSmart(r[kOcc]));
        if (occ01 > 0) {
          sumOccPct += occ01;
          cntOcc++;
        }

        const rev = toNumberSmart(r[kRev]);
        sumRev += rev;

        const adr = toNumberSmart(r[kAdr]);
        if (adr > 0) {
          sumAdr += adr;
          cntAdr++;
        }

        const tot = toNumberSmart(r[kTotal]);
        sumTotal += tot;
      }

      // Importante: ocupación promedio del período (promedio de días)
      const occAvg = cntOcc ? sumOccPct / cntOcc : 0;
      const adrAvg = cntAdr ? sumAdr / cntAdr : 0;

      return {
        n: rowsY.length,
        occAvg,
        roomRevenue: sumRev,
        adrAvg,
        totalOcc: sumTotal,
      };
    };

    return {
      current: agg(year),
      base: agg(baseYear),
    };
  }, [filtered, keys, year, baseYear]);

  const monthlySeries = useMemo(() => {
    const kOcc = keys.kOccPct;
    const kRev = keys.kRoomRevenue;
    const kAdr = keys.kAdr;

    type Point = {
      y: number;
      m: number;
      label: string;
      n: number;
      occAvg: number;
      rev: number;
      adrAvg: number;
    };

    const build = (targetYear: number): Point[] => {
      const map = new Map<number, { n: number; occSum: number; occCnt: number; rev: number; adrSum: number; adrCnt: number }>();

      for (const x of filtered) {
        if (x.year !== targetYear || x.month === null) continue;
        const m = x.month;
        const r = x.raw;

        const bucket =
          map.get(m) ?? { n: 0, occSum: 0, occCnt: 0, rev: 0, adrSum: 0, adrCnt: 0 };

        bucket.n += 1;

        const occ = toPercent01(toNumberSmart(r[kOcc]));
        if (occ > 0) {
          bucket.occSum += occ;
          bucket.occCnt += 1;
        }

        bucket.rev += toNumberSmart(r[kRev]);

        const adr = toNumberSmart(r[kAdr]);
        if (adr > 0) {
          bucket.adrSum += adr;
          bucket.adrCnt += 1;
        }

        map.set(m, bucket);
      }

      const pts: Point[] = [];
      for (let m = 0; m < 12; m++) {
        const b = map.get(m);
        if (!b) continue;
        pts.push({
          y: targetYear,
          m,
          label: `${monthLabel(m)} ${targetYear}`,
          n: b.n,
          occAvg: b.occCnt ? b.occSum / b.occCnt : 0,
          rev: b.rev,
          adrAvg: b.adrCnt ? b.adrSum / b.adrCnt : 0,
        });
      }

      // orden natural Ene..Dic (como querés)
      pts.sort((a, b) => a.m - b.m);
      return pts;
    };

    return {
      current: build(year),
      base: build(baseYear),
    };
  }, [filtered, keys, year, baseYear]);

  const title = useMemo(() => {
    const h = hotelFilter ? hotelFilter : "Todos (Grupo)";
    return `History & Forecast — ${h} · ${year} vs ${baseYear}`;
  }, [hotelFilter, year, baseYear]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Cargando H&F…
      </div>
    );
  }

  if (err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Error leyendo H&F: {err}
      </div>
    );
  }

  const c = byYear.current;
  const b = byYear.base;

  return (
    <section className="section" id="hf">
      <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
        {title}
      </div>

      <div className="sectionDesc" style={{ marginTop: ".35rem", opacity: 0.85 }}>
        Fuente: {filePath} · Usando columna <b>{keys.kFecha || "Fecha"}</b> y filtro exacto por <b>{keys.kHotel || "Empresa"}</b>.
      </div>

      {/* KPIs comparativos */}
      <div style={{ display: "grid", gap: ".75rem", marginTop: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: ".75rem" }}>
          <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
            <div style={{ opacity: 0.75, fontSize: ".9rem" }}>Ocupación promedio</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 950, marginTop: ".25rem" }}>
              {formatPct01(c.occAvg)}
            </div>
            <div style={{ opacity: 0.75, marginTop: ".25rem" }}>
              vs {baseYear}: <b>{formatPct01(b.occAvg)}</b>
            </div>
          </div>

          <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
            <div style={{ opacity: 0.75, fontSize: ".9rem" }}>Room Revenue (acum.)</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 950, marginTop: ".25rem" }}>
              {formatMoneyUSD0(c.roomRevenue)}
            </div>
            <div style={{ opacity: 0.75, marginTop: ".25rem" }}>
              vs {baseYear}: <b>{formatMoneyUSD0(b.roomRevenue)}</b>
            </div>
          </div>

          <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
            <div style={{ opacity: 0.75, fontSize: ".9rem" }}>ADR promedio</div>
            <div style={{ fontSize: "1.6rem", fontWeight: 950, marginTop: ".25rem" }}>
              {formatMoneyUSD0(c.adrAvg)}
            </div>
            <div style={{ opacity: 0.75, marginTop: ".25rem" }}>
              vs {baseYear}: <b>{formatMoneyUSD0(b.adrAvg)}</b>
            </div>
          </div>
        </div>

        {/* Tabla por mes (Ene..Dic) */}
        <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
          <div style={{ fontWeight: 950, marginBottom: ".5rem" }}>
            Detalle mensual (orden natural)
          </div>

          {monthlySeries.current.length === 0 ? (
            <div style={{ opacity: 0.75 }}>Sin datos para {year} con el filtro actual.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".95rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", opacity: 0.85 }}>
                    <th style={{ padding: ".5rem" }}>Mes</th>
                    <th style={{ padding: ".5rem" }}>Ocupación</th>
                    <th style={{ padding: ".5rem" }}>ADR</th>
                    <th style={{ padding: ".5rem" }}>Room Revenue</th>
                    <th style={{ padding: ".5rem" }}>Días</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySeries.current.map((p) => (
                    <tr key={`m-${p.m}`} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                      <td style={{ padding: ".5rem" }}>{monthLabel(p.m)}</td>
                      <td style={{ padding: ".5rem" }}>{formatPct01(p.occAvg)}</td>
                      <td style={{ padding: ".5rem" }}>{formatMoneyUSD0(p.adrAvg)}</td>
                      <td style={{ padding: ".5rem" }}>{formatMoneyUSD0(p.rev)}</td>
                      <td style={{ padding: ".5rem" }}>{p.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: ".75rem", opacity: 0.75, fontSize: ".9rem" }}>
            Nota: Ocupación = <b>promedio diario</b> (no suma), para evitar valores absurdos &gt; 100%.
          </div>
        </div>
      </div>
    </section>
  );
}
