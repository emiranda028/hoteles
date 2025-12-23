"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic, XlsxRow } from "./xlsxClient";

type GlobalHotel = "MARRIOTT" | "SHERATON MDQ" | "SHERATON BCR" | "MAITEI";

type Props = {
  year: number;
  baseYear: number;
  filePath: string;
  globalHotel: GlobalHotel;
  compactCharts?: boolean;
};

function norm(s: any) {
  return String(s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function pickKey(keys: string[], candidates: string[]): string | null {
  const lower = new Map(keys.map((k) => [k.toLowerCase(), k]));
  for (const c of candidates) {
    const hit = lower.get(c.toLowerCase());
    if (hit) return hit;
  }
  for (const c of candidates) {
    const cLow = c.toLowerCase();
    const found = keys.find((k) => k.toLowerCase().includes(cLow));
    if (found) return found;
  }
  return null;
}

function parseAnyDate(v: any): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  if (typeof v === "number" && Number.isFinite(v)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + v * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(v).trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

function toNum(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (!s) return 0;
  const cleaned = s.replace(/\./g, "").replace(",", ".").replace("%", "");
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

export default function MembershipSummary({ year, baseYear, filePath, globalHotel, compactCharts = false }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [meta, setMeta] = useState<{ sheet: string; keys: string[] } | null>(null);
  const [detected, setDetected] = useState<{ kHotel: string | null; kMem: string | null; kQty: string | null; kDate: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readXlsxFromPublic(filePath)
      .then((r) => {
        if (!alive) return;

        const keys = r.rows?.[0] ? Object.keys(r.rows[0]) : [];
        setMeta({ sheet: r.sheet, keys });

        const kHotel = pickKey(keys, ["Empresa", "Hotel"]);
        const kMem = pickKey(keys, ["Bonboy", "Membership", "Membresia", "Membresía"]);
        const kQty = pickKey(keys, ["Cantidad", "Qty", "QTY", "Cant"]);
        const kDate = pickKey(keys, ["Fecha", "Date"]);

        setDetected({ kHotel, kMem, kQty, kDate });

        setRows(r.rows ?? []);
      })
      .catch((e) => {
        console.error(e);
        setErr(String(e?.message ?? e));
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => {
      alive = false;
    };
  }, [filePath]);

  // mapeo por si el XLSX trae nombres distintos a tu filtro
  const hotelsToUse = useMemo(() => {
    const h = norm(globalHotel);
    // si tu XLSX usa otras etiquetas, agregalas acá
    // ej: "SHERATON BARILOCHE" etc.
    return [h];
  }, [globalHotel]);

  const normalized = useMemo(() => {
    if (!rows.length || !detected) return [];
    const { kHotel, kMem, kQty, kDate } = detected;

    return rows
      .map((r: XlsxRow) => {
        const hotel = norm(kHotel ? r[kHotel] : r["Empresa"] ?? r["Hotel"]);
        const mem = String(kMem ? r[kMem] : r["Bonboy"] ?? r["Membership"] ?? "").trim();
        const qty = toNum(kQty ? r[kQty] : r["Cantidad"] ?? r["Qty"]);
        const d = parseAnyDate(kDate ? r[kDate] : r["Fecha"] ?? r["Date"]);
        if (!d) return null;

        return {
          hotel,
          mem,
          qty,
          year: d.getFullYear(),
          month: d.getMonth() + 1,
        };
      })
      .filter(Boolean) as { hotel: string; mem: string; qty: number; year: number; month: number }[];
  }, [rows, detected]);

  const yearRows = useMemo(() => {
    return normalized.filter((r) => r.year === year && hotelsToUse.includes(r.hotel));
  }, [normalized, year, hotelsToUse]);

  const baseRows = useMemo(() => {
    return normalized.filter((r) => r.year === baseYear && hotelsToUse.includes(r.hotel));
  }, [normalized, baseYear, hotelsToUse]);

  const sumYear = useMemo(() => yearRows.reduce((a, r) => a + r.qty, 0), [yearRows]);
  const sumBase = useMemo(() => baseRows.reduce((a, r) => a + r.qty, 0), [baseRows]);

  const byMonth = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of yearRows) m.set(r.month, (m.get(r.month) ?? 0) + r.qty);
    return Array.from({ length: 12 }).map((_, i) => m.get(i + 1) ?? 0);
  }, [yearRows]);

  const composition = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of yearRows) m.set(r.mem || "Sin definir", (m.get(r.mem || "Sin definir") ?? 0) + r.qty);

    return Array.from(m.entries())
      .map(([k, v]) => ({ k, v }))
      .sort((a, b) => b.v - a.v);
  }, [yearRows]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Cargando membership…
      </div>
    );
  }

  if (err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ color: "crimson" }}>Error: {err}</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>
          Membership (JCR) — Acumulado {year} · vs {baseYear}
        </div>

        <div style={{ marginTop: ".5rem", opacity: 0.85 }}>
          {sumYear ? (
            <>
              <b>{sumYear.toLocaleString("es-AR")}</b> (Δ vs {baseYear}:{" "}
              <b>{(sumYear - sumBase).toLocaleString("es-AR")}</b>)
            </>
          ) : (
            <>Sin datos para {globalHotel} en {year}.</>
          )}
        </div>

        {meta && detected ? (
          <div style={{ marginTop: ".6rem", fontSize: ".9rem", opacity: 0.75 }}>
            Sheet: {meta.sheet} · Detectado: hotel={detected.kHotel ?? "?"} · membership={detected.kMem ?? "?"} · qty={detected.kQty ?? "?"} · fecha={detected.kDate ?? "?"}
          </div>
        ) : null}
      </div>

      <div
        className="card"
        style={{
          padding: "1rem",
          borderRadius: 18,
          overflowX: "auto",
        }}
      >
        <div style={{ fontWeight: 900 }}>Ranking por mes</div>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520, marginTop: ".5rem" }}>
          <thead>
            <tr style={{ textAlign: "left", opacity: 0.85 }}>
              {MONTHS.map((m) => (
                <th key={m} style={{ padding: ".4rem .35rem" }}>
                  {m}
                </th>
              ))}
              <th style={{ padding: ".4rem .35rem" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
              {byMonth.map((v, i) => (
                <td key={i} style={{ padding: ".5rem .35rem" }}>
                  {v.toLocaleString("es-AR")}
                </td>
              ))}
              <td style={{ padding: ".5rem .35rem", fontWeight: 900 }}>{sumYear.toLocaleString("es-AR")}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 900 }}>Composición</div>
        <div style={{ marginTop: ".6rem", display: "grid", gap: ".35rem" }}>
          {composition.slice(0, compactCharts ? 8 : 14).map((x) => (
            <div key={x.k} style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.k}</div>
              <div style={{ fontWeight: 900 }}>{x.v.toLocaleString("es-AR")}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
