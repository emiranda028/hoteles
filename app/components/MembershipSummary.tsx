"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  filePath: string;
  allowedHotels: string[];
  title: string;
  year: number;
  baseYear: number;
};

type Row = {
  Empresa?: string;
  Bonboy?: string;
  Cantidad?: number | string;
  Fecha?: string | Date;
};

function toYear(v: any): number | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d.getFullYear();
}

function num(v: any): number {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return isNaN(n) ? 0 : n;
}

export default function MembershipSummary({
  filePath,
  allowedHotels,
  title,
  year,
  baseYear,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    readXlsxFromPublic(filePath)
      .then((res) => setRows(res.rows as Row[]))
      .catch((e) => setError(e.message));
  }, [filePath]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const hotel = String(r.Empresa ?? "").toUpperCase().trim();
      const y = toYear(r.Fecha);
      return (
        allowedHotels.includes(hotel) &&
        y !== null &&
        (y === year || y === baseYear)
      );
    });
  }, [rows, allowedHotels, year, baseYear]);

  const sumByYear = (y: number) => {
    const map = new Map<string, number>();
    filtered.forEach((r) => {
      if (toYear(r.Fecha) !== y) return;
      const key = String(r.Bonboy ?? "OTROS").trim();
      map.set(key, (map.get(key) ?? 0) + num(r.Cantidad));
    });
    return map;
  };

  const cur = useMemo(() => sumByYear(year), [filtered, year]);
  const base = useMemo(() => sumByYear(baseYear), [filtered, baseYear]);

  const memberships = useMemo(() => {
    const keys = Array.from(
      new Set([...Array.from(cur.keys()), ...Array.from(base.keys())])
    );

    return keys.map((k) => {
      const curVal = cur.get(k) ?? 0;
      const baseVal = base.get(k) ?? 0;
      const diff = curVal - baseVal;
      const pct = baseVal > 0 ? (diff / baseVal) * 100 : null;

      return {
        name: k,
        cur: curVal,
        base: baseVal,
        diff,
        pct,
      };
    });
  }, [cur, base]);

  if (error) {
    return <div className="card">Error cargando Membership: {error}</div>;
  }

  if (memberships.length === 0) {
    return (
      <div className="card">
        <h3>{title}</h3>
        <p>Sin datos para los filtros seleccionados.</p>
      </div>
    );
  }

  return (
    <section className="section">
      <h2 className="sectionTitle">{title}</h2>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Membresía</th>
              <th>{baseYear}</th>
              <th>{year}</th>
              <th>Δ</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            {memberships.map((m) => (
              <tr key={m.name}>
                <td>{m.name}</td>
                <td>{m.base.toLocaleString()}</td>
                <td>{m.cur.toLocaleString()}</td>
                <td
                  style={{
                    color: m.diff >= 0 ? "var(--green)" : "var(--red)",
                    fontWeight: 600,
                  }}
                >
                  {m.diff >= 0 ? "+" : ""}
                  {m.diff.toLocaleString()}
                </td>
                <td>
                  {m.pct === null
                    ? "—"
                    : `${m.pct > 0 ? "+" : ""}${m.pct.toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
