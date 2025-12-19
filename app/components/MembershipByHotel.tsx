"use client";

import { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic } from "./csvClient";

type Row = {
  bomboy: string;
  empresa: string;
  cantidad: number;
  year: number;
};

type Props = {
  filePath: string;
  year: number;
};

const norm = (v: any) =>
  String(v ?? "")
    .trim()
    .toUpperCase();

const toNumber = (v: any) =>
  Number(String(v ?? "0").replace(",", ".")) || 0;

export default function MembershipByHotel({ filePath, year }: Props) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    readCsvFromPublic(filePath).then((json: any) => {
      const raw = Array.isArray(json) ? json : json.rows ?? [];

      const parsed: Row[] = raw.map((r: any) => ({
        bomboy: norm(r.Bomboy ?? r.BOMBOY ?? r.Membership),
        empresa: norm(r.Empresa ?? r.EMPRESA ?? r.Hotel),
        cantidad: toNumber(r.Cantidad ?? r.CANTIDAD ?? r.Qty),
        year: Number(
          String(r.Fecha ?? r.YEAR ?? "")
            .slice(0, 4)
        ),
      }));

      setRows(parsed);
    });
  }, [filePath]);

  const sumFor = (y: number) => {
    const m = new Map<string, number>();
    rows
      .filter((r) => r.year === y)
      .forEach((r) => {
        m.set(r.empresa, (m.get(r.empresa) ?? 0) + r.cantidad);
      });
    return m;
  };

  const data = useMemo(() => {
    const cur = sumFor(year);
    const base = sumFor(year - 1);

    const hotels = Array.from(
      new Set([
        ...Array.from(cur.keys()),
        ...Array.from(base.keys()),
      ])
    );

    return hotels.map((h) => ({
      hotel: h,
      current: cur.get(h) ?? 0,
      previous: base.get(h) ?? 0,
      delta:
        base.get(h) && base.get(h)! > 0
          ? ((cur.get(h) ?? 0) / base.get(h)! - 1) * 100
          : 0,
    }));
  }, [rows, year]);

  return (
    <div className="card">
      <h4 className="cardTitle">Membership por hotel</h4>

      <table className="table">
        <thead>
          <tr>
            <th>Hotel</th>
            <th>{year}</th>
            <th>{year - 1}</th>
            <th>Δ %</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.hotel}>
              <td>{r.hotel}</td>
              <td>{r.current}</td>
              <td>{r.previous}</td>
              <td>{r.delta.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
