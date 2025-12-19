"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type MembershipRow = {
  type: string;
  qty: number;
  year: number;
  month: number;
  hotel: string;
};

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseAnyDate(v: any): Date | null {
  if (!v && v !== 0) return null;

  if (v instanceof Date && !isNaN(v.getTime())) return v;

  // Excel serial
  if (typeof v === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + v * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof v === "string") {
    const s = v.trim();

    // ISO
    const iso = new Date(s);
    if (!isNaN(iso.getTime())) return iso;

    // dd/mm/yyyy
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

function normalizeMembershipType(v: any): string {
  const s = (v ?? "").toString().trim();
  if (!s) return "Otros";
  return s;
}

/** Colores por tipo (simple y consistente) */
function typeColor(t: string) {
  const k = t.toUpperCase();
  if (k.includes("GOLD") || k.includes("GLD")) return "#D4AF37";
  if (k.includes("PLAT") || k.includes("PLT")) return "#9AA0A6";
  if (k.includes("SILV") || k.includes("SLR")) return "#C0C0C0";
  if (k.includes("TITAN") || k.includes("TTM")) return "#5F6B7A";
  if (k.includes("AMBASS") || k.includes("AMB")) return "#4DA3FF";
  if (k.includes("MEMBER") || k.includes("MRD")) return "#E53935";
  return "#7C4DFF";
}

export default function MembershipSummary({
  year,
  baseYear,
  hotelsJCR,
  filePath = "/data/jcr_membership.xlsx",
}: {
  year: number;
  baseYear: number;
  hotelsJCR: string[];
  filePath?: string;
}) {
  const [rows, setRows] = useState<MembershipRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    readXlsxFromPublic(filePath)
      .then(({ rows }) => {
        if (!alive) return;

        const parsed: MembershipRow[] = (rows as any[])
          .map((r: any) => {
            const type = normalizeMembershipType(r.Bomboy ?? r.bomboy);
            const qty = safeNum(r.Cantidad ?? r.cantidad ?? 0);
            const hotel = (r.Empresa ?? r.empresa ?? "").toString().trim();

            const d = parseAnyDate(r.Fecha ?? r.fecha);
            if (!d) return null;

            return {
              type,
              qty,
              year: d.getFullYear(),
              month: d.getMonth() + 1,
              hotel,
            };
          })
          .filter(Boolean) as MembershipRow[];

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

  // Filtrar solo hoteles JCR que pasan desde YearComparator
  const rowsJCR = useMemo(() => {
    const set = new Set(hotelsJCR);
    return rows.filter((r) => set.has(r.hotel));
  }, [rows, hotelsJCR]);

  // Meses disponibles en baseYear
  const monthsBase = useMemo(() => {
    const set = new Set<number>();
    rowsJCR
      .filter((r) => r.year === baseYear)
      .forEach((r) => set.add(r.month));
    return Array.from(set).sort((a, b) => a - b);
  }, [rowsJCR, baseYear]);

  // Meses comunes para comparar
  const compareMonths = useMemo(() => {
    const baseSet = new Set(monthsBase);
    const curSet = new Set<number>();

    rowsJCR
      .filter((r) => r.year === year)
      .forEach((r) => curSet.add(r.month));

    const inter = Array.from(curSet)
      .filter((m) => baseSet.has(m))
      .sort((a, b) => a - b);

    return inter.length ? inter : null;
  }, [rowsJCR, year, monthsBase]);

  const summary = useMemo(() => {
    const sumMap = (yy: number) => {
      const map = new Map<string, number>();
      rowsJCR
        .filter((r) => r.year === yy)
        .filter((r) => (compareMonths ? compareMonths.includes(r.month) : true))
        .forEach((r) => {
          map.set(r.type, (map.get(r.type) ?? 0) + r.qty);
        });
      return map;
    };

    const cur = sumMap(year);
    const base = sumMap(baseYear);

    // ✅ FIX VERCEL: no spread de iteradores
    const keys = Array.from(
      new Set<string>([
        ...Array.from(cur.keys()),
        ...Array.from(base.keys()),
      ])
    );

    const list = keys
      .map((k) => {
        const curVal = cur.get(k) ?? 0;
        const baseVal = base.get(k) ?? 0;
        const hasBase = baseVal > 0;
        const deltaPct = hasBase ? ((curVal / baseVal) - 1) * 100 : NaN;
        return { type: k, cur: curVal, base: baseVal, hasBase, deltaPct };
      })
      .sort((a, b) => b.cur - a.cur);

    const totalCur = list.reduce((acc, x) => acc + x.cur, 0);
    const max = Math.max(1, ...list.map((x) => x.cur));

    return { list, totalCur, max, hasComparable: !!compareMonths };
  }, [rowsJCR, year, baseYear, compareMonths]);

  if (loading) {
    return (
      <div className="card">
        <div className="cardTitle">Membership (JCR)</div>
        <div className="cardNote">Cargando datos…</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <div className="cardTop">
        <div>
          <div className="cardTitle">Membership (JCR) – distribución</div>
          <div className="cardNote">
            {summary.hasComparable
              ? `Comparación mismo período vs ${baseYear}`
              : `Comparación vs ${baseYear} (base incompleta)`}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div className="cardNote">Total {year}</div>
          <div className="cardValue">{summary.totalCur.toLocaleString("es-AR")}</div>
        </div>
      </div>

      <div className="rankList" style={{ marginTop: ".9rem" }}>
        {summary.list.map((x, i) => (
          <div key={x.type} className="rankRow">
            <div className="rankLeft">
              <div className="rankPos">{i + 1}</div>

              <div style={{ display: "flex", alignItems: "center", gap: ".55rem" }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: typeColor(x.type),
                    display: "inline-block",
                  }}
                />
                <div className="rankCountry">{x.type}</div>
              </div>
            </div>

            <div className="rankRight" style={{ display: "flex", gap: ".8rem", alignItems: "center" }}>
              <div className="rankBarWrap" style={{ width: 240 }}>
                <div
                  className="rankBar"
                  style={{
                    width: `${(x.cur / summary.max) * 100}%`,
                    background: typeColor(x.type),
                  }}
                />
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

