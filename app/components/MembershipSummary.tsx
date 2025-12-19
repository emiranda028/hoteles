"use client";

import { useMemo } from "react";

type Row = {
  year: number;
  hotel: string;
  membership: string;
  qty: number;
};

type Props = {
  rows: Row[];
  year: number;
  baseYear?: number;
  title?: string;
};

function sumMap(rows: Row[], year: number) {
  const map = new Map<string, number>();
  rows
    .filter((r) => r.year === year)
    .forEach((r) => {
      map.set(r.membership, (map.get(r.membership) ?? 0) + r.qty);
    });
  return map;
}

// ✅ FIX: sin for..of sobre Map.values()
function totalOf(map: Map<string, number>) {
  return Array.from(map.values()).reduce((a, b) => a + b, 0);
}

function deltaPct(cur: number, base: number) {
  if (!base) return 0;
  return ((cur - base) / base) * 100;
}

export default function MembershipSummary({
  rows,
  year,
  baseYear,
  title = "Membership",
}: Props) {
  const cur = useMemo(() => sumMap(rows, year), [rows, year]);
  const base = useMemo(
    () => (baseYear ? sumMap(rows, baseYear) : new Map()),
    [rows, baseYear]
  );

  const totalCur = totalOf(cur);
  const totalBase = baseYear ? totalOf(base) : 0;

  const list = useMemo(() => {
    const keys = Array.from(
      new Set([
        ...Array.from(cur.keys()),
        ...Array.from(base.keys()),
      ])
    );

    return keys
      .map((k) => {
        const curVal = cur.get(k) ?? 0;
        const baseVal = base.get(k) ?? 0;
        return {
          membership: k,
          cur: curVal,
          base: baseVal,
          delta: deltaPct(curVal, baseVal),
        };
      })
      .sort((a, b) => b.cur - a.cur);
  }, [cur, base]);

  return (
    <section className="section">
      <h3 className="sectionTitle">{title}</h3>

      <div className="kpiGrid" style={{ marginBottom: "1rem" }}>
        <div className="kpi">
          <div className="kpiLabel">Total membresías</div>
          <div className="kpiValue">{totalCur.toLocaleString()}</div>
          {baseYear && (
            <div className="kpiCap">
              {deltaPct(totalCur, totalBase).toFixed(1)}%
              vs {baseYear}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Membresía</th>
              <th>{year}</th>
              {baseYear && <th>{baseYear}</th>}
              {baseYear && <th>Variación</th>}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.membership}>
                <td>{r.membership}</td>
                <td>{r.cur.toLocaleString()}</td>
                {baseYear && <td>{r.base.toLocaleString()}</td>}
                {baseYear && (
                  <td
                    style={{
                      color:
                        r.delta > 0
                          ? "var(--success)"
                          : r.delta < 0
                          ? "var(--danger)"
                          : "inherit",
                    }}
                  >
                    {r.delta.toFixed(1)}%
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
