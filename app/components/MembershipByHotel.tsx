"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Row = { hotel: string; year: number; month: number; qty: number };

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseAnyDate(v: any): Date | null {
  if (!v && v !== 0) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + v * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "string") {
    const s = v.trim();
    const iso = new Date(s);
    if (!isNaN(iso.getTime())) return iso;
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      const dd = Number(m[1]);
      const mm = Number(m[2]);
      let yy = Number(m[3]);
      if (yy < 100) yy += 2000;
      const d = new Date(yy, mm - 1, dd);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

const COMPANY_MAP: Record<string, string> = {
  "MARRIOTT": "Marriott Buenos Aires",
  "SHERATON MDQ": "Sheraton Mar del Plata",
  "SHERATON BCR": "Sheraton Bariloche",
};

export default function MembershipByHotel({
  year,
  baseYear,
  filePath = "/data/jcr_membership.xlsx",
}: {
  year: number;
  baseYear: number;
  filePath?: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    readXlsxFromPublic(filePath)
      .then(({ rows }) => {
        if (!alive) return;

        const parsed: Row[] = rows
          .map((r: any) => {
            const qty = safeNum(r.Cantidad ?? r.cantidad ?? 0);
            const rawCompany = (r.Empresa ?? r.empresa ?? "").toString().trim().toUpperCase();
            const hotel = COMPANY_MAP[rawCompany] ?? "";
            const d = parseAnyDate(r.Fecha ?? r.fecha);
            if (!hotel || !d) return null;
            return { hotel, year: d.getFullYear(), month: d.getMonth() + 1, qty };
          })
          .filter(Boolean) as Row[];

        setRows(parsed);
      })
      .catch((err) => {
        console.error(err);
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => {
      alive = false;
    };
  }, [filePath]);

  const monthsBase = useMemo(() => {
    const set = new Set<number>();
    rows.filter((r) => r.year === baseYear).forEach((r) => set.add(r.month));
    return Array.from(set).sort((a, b) => a - b);
  }, [rows, baseYear]);

  // Same-period: solo meses que existen en baseYear (si baseYear está incompleto)
  const compareMonths = useMemo(() => {
    const baseSet = new Set(monthsBase);
    const curMonths = new Set<number>();
    rows.filter((r) => r.year === year).forEach((r) => curMonths.add(r.month));
    const inter = Array.from(curMonths).filter((m) => baseSet.has(m)).sort((a, b) => a - b);
    return inter.length ? inter : null; // null -> no hay comparables
  }, [rows, year, monthsBase]);

  const ranking = useMemo(() => {
    const sumFor = (yy: number) => {
      const map = new Map<string, number>();
      rows
        .filter((r) => r.year === yy)
        .filter((r) => (compareMonths ? compareMonths.includes(r.month) : true))
        .forEach((r) => map.set(r.hotel, (map.get(r.hotel) ?? 0) + r.qty));
      return map;
    };

    const cur = sumFor(year);
    const base = sumFor(baseYear);

    const hotels = Array.from(new Set([...cur.keys(), ...base.keys()]));

    const list = hotels
      .map((h) => {
        const c = cur.get(h) ?? 0;
        const b = base.get(h) ?? 0;
        const hasBase = b > 0;
        const deltaPct = hasBase ? ((c / b) - 1) * 100 : NaN;
        return { hotel: h, cur: c, base: b, hasBase, deltaPct };
      })
      .sort((a, b) => b.cur - a.cur);

    const max = Math.max(1, ...list.map((x) => x.cur));
    return { list, max, hasComparable: !!compareMonths };
  }, [rows, year, baseYear, compareMonths]);

  if (loading) {
    return (
      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="cardTitle">Contribución por hotel</div>
        <div className="cardNote">Cargando…</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <div className="cardTop">
        <div>
          <div className="cardTitle">Contribución de Membership por hotel (JCR)</div>
          <div className="cardNote">
            {ranking.hasComparable ? `Comparación mismo período vs ${baseYear}` : `Comparación vs ${baseYear} (base incompleta)`}
          </div>
        </div>
      </div>

      <div className="rankList" style={{ marginTop: ".9rem" }}>
        {ranking.list.map((x, i) => (
          <div key={i} className="rankRow">
            <div className="rankLeft">
              <div className="rankPos">{i + 1}</div>
              <div className="rankCountry">{x.hotel}</div>
            </div>

            <div className="rankRight" style={{ display: "flex", gap: ".8rem", alignItems: "center" }}>
              <div className="rankBarWrap" style={{ width: 220 }}>
                <div className="rankBar" style={{ width: `${(x.cur / ranking.max) * 100}%` }} />
              </div>

              <div className="rankGuests" style={{ minWidth: 90 }}>
                {x.cur.toLocaleString("es-AR")}
              </div>

              {x.hasBase ? (
                <div className={`delta ${x.deltaPct >= 0 ? "up" : "down"}`}>
                  {x.deltaPct >= 0 ? "+" : ""}
                  {x.deltaPct.toFixed(1).replace(".", ",")}%
                </div>
              ) : (
                <div className="delta">—</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
