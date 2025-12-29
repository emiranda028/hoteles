"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";
import { parseDateAny, toNumberSmart, formatInt, formatPct01 } from "./useCsvClient";

type XlsxRow = Record<string, any>;

export type Props = {
  title?: string;
  year: number;
  baseYear: number;
  filePath: string;

  /** "" = todos, sino match contra Empresa */
  hotelFilter?: string;

  /** si se pasa, limita a ese set de hoteles */
  allowedHotels?: string[];

  /** si true, reduce padding/altura (opcional) */
  compactCharts?: boolean;
};

type SeriesPoint = { x: number; y: number };

function pickKey(keys: string[], candidates: string[]): string {
  const norm = (s: string) => s.trim().toLowerCase();
  const map = new Map(keys.map((k) => [norm(k), k]));
  for (const c of candidates) {
    const hit = map.get(norm(c));
    if (hit) return hit;
  }
  // fallback fuzzy: contiene
  for (const c of candidates) {
    const nc = norm(c);
    const k = keys.find((kk) => norm(kk).includes(nc));
    if (k) return k;
  }
  return "";
}

function normHotel(v: any): string {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s) return "";
  // normalizaciones típicas
  if (s.includes("MARRIOTT")) return "MARRIOTT";
  if (s.includes("MAITEI")) return "MAITEI";

  // Sheraton: mantenemos separados BCR / MDQ
  if (s.includes("SHERATON") && (s.includes("MDQ") || s.includes("MAR DEL PLATA"))) return "SHERATON MDQ";
  if (s.includes("SHERATON") && (s.includes("BCR") || s.includes("BARILOCHE"))) return "SHERATON BCR";

  return s;
}

function normMember(v: any): string {
  const s = String(v ?? "").trim();
  if (!s) return "Sin dato";
  // arregla acentos/variantes frecuentes
  const up = s.toUpperCase();
  if (up.includes("PLATINUM")) return "Platinum";
  if (up.includes("GOLD")) return "Gold";
  if (up.includes("SILVER")) return "Silver";
  if (up.includes("TITANIUM")) return "Titanium";
  if (up.includes("AMBASSADOR")) return "Ambassador";
  if (up.includes("MEMBER")) return "Member";
  if (up.includes("NON") || up.includes("NO ") || up.includes("SIN")) return "Non Member";
  return s;
}

function groupColor(hotelFilter?: string, allowedHotels?: string[]): string {
  const hf = normHotel(hotelFilter);
  const allowed = (allowedHotels ?? []).map(normHotel);
  const isMaitei = hf === "MAITEI" || (allowed.length > 0 && allowed.every((h) => h === "MAITEI"));
  return isMaitei ? "#2bb3ff" : "#d10f1b"; // celeste / rojo
}

function buildLineSeries(monthTotals: number[]): SeriesPoint[] {
  // 12 meses, x 0..11
  return monthTotals.map((y, i) => ({ x: i, y: y ?? 0 }));
}

function svgPath(points: SeriesPoint[], w: number, h: number, pad = 8): string {
  if (!points.length) return "";
  const ys = points.map((p) => p.y);
  const yMax = Math.max(1, ...ys);
  const yMin = Math.min(0, ...ys);

  const xScale = (x: number) => pad + (x / 11) * (w - pad * 2);
  const yScale = (y: number) => {
    const t = (y - yMin) / (yMax - yMin || 1);
    return h - pad - t * (h - pad * 2);
  };

  let d = `M ${xScale(points[0].x)} ${yScale(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${xScale(points[i].x)} ${yScale(points[i].y)}`;
  }
  return d;
}

export default function MembershipSummary(props: Props) {
  const {
    year,
    baseYear,
    filePath,
    title = `Membership — Acumulado ${year} · vs ${baseYear}`,
    hotelFilter = "",
    allowedHotels = [],
    compactCharts = false,
  } = props;

  const [rows, setRows] = useState<XlsxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [sheetInfo, setSheetInfo] = useState<{
    sheet?: string;
    keys: string[];
    detected: { hotel: string; member: string; qty: string; date: string };
  }>({ keys: [], detected: { hotel: "", member: "", qty: "", date: "" } });

  const color = useMemo(() => groupColor(hotelFilter, allowedHotels), [hotelFilter, allowedHotels]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    (async () => {
      try {
        const r = await readXlsxFromPublic(filePath);
        if (!alive) return;

        const rr = (r as any)?.rows ?? [];
        const keys = rr?.[0] ? Object.keys(rr[0]) : [];

        const kHotel = pickKey(keys, ["Empresa", "Hotel"]);
        const kMem = pickKey(keys, ["Bonboy", "Bonvoy", "Membership", "Membresia", "Membresía"]);
        const kQty = pickKey(keys, ["Cantidad", "Qty", "Count", "Rooms", "Room Nights"]);
        const kDate = pickKey(keys, ["Fecha", "Date", "Día", "Dia", "Day"]);

        setSheetInfo({
          sheet: (r as any)?.sheet,
          keys,
          detected: { hotel: kHotel, member: kMem, qty: kQty, date: kDate },
        });

        setRows(rr as XlsxRow[]);
        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "Error leyendo XLSX");
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [filePath]);

  const analysis = useMemo(() => {
    const keys = sheetInfo.detected;
    const kHotel = keys.hotel;
    const kMem = keys.member;
    const kQty = keys.qty;
    const kDate = keys.date;

    const allowedSet = new Set((allowedHotels ?? []).map(normHotel).filter(Boolean));
    const hasAllowed = allowedSet.size > 0;

    const filterHotel = normHotel(hotelFilter);

    const totalsByYear = new Map<string, number>();
    const totalsByBase = new Map<string, number>();

    const monthTotalsYear = Array.from({ length: 12 }, () => 0);
    const monthTotalsBase = Array.from({ length: 12 }, () => 0);

    const okColumns = Boolean(kHotel && kMem && kQty && kDate);

    let totalY = 0;
    let totalB = 0;

    if (!okColumns) {
      return {
        okColumns,
        totalY,
        totalB,
        totalsByYear,
        totalsByBase,
        monthTotalsYear,
        monthTotalsBase,
      };
    }

    for (const r of rows) {
      const hotel = normHotel(r[kHotel]);
      if (!hotel) continue;

      // allowedHotels (por grupo)
      if (hasAllowed && !allowedSet.has(hotel)) continue;

      // hotelFilter (exacto por Empresa)
      if (filterHotel && hotel !== filterHotel) continue;

      const d = parseDateAny(r[kDate]);
      if (!d) continue;

      const y = d.getFullYear();
      const m = d.getMonth(); // 0-11

      const mem = normMember(r[kMem]);
      const qty = Math.max(0, toNumberSmart(r[kQty]));

      if (y === year) {
        totalY += qty;
        totalsByYear.set(mem, (totalsByYear.get(mem) ?? 0) + qty);
        if (m >= 0 && m < 12) monthTotalsYear[m] += qty;
      } else if (y === baseYear) {
        totalB += qty;
        totalsByBase.set(mem, (totalsByBase.get(mem) ?? 0) + qty);
        if (m >= 0 && m < 12) monthTotalsBase[m] += qty;
      }
    }

    return {
      okColumns,
      totalY,
      totalB,
      totalsByYear,
      totalsByBase,
      monthTotalsYear,
      monthTotalsBase,
    };
  }, [rows, sheetInfo.detected, allowedHotels, hotelFilter, year, baseYear]);

  const table = useMemo(() => {
    const arr: Array<{
      member: string;
      y: number;
      b: number;
      pY: number; // share
      pB: number;
      delta: number;
    }> = [];

    const members = new Set<string>();
    for (const k of analysis.totalsByYear.keys()) members.add(k);
    for (const k of analysis.totalsByBase.keys()) members.add(k);

    const totalY = analysis.totalY || 0;
    const totalB = analysis.totalB || 0;

    for (const m of members) {
      const y = analysis.totalsByYear.get(m) ?? 0;
      const b = analysis.totalsByBase.get(m) ?? 0;
      arr.push({
        member: m,
        y,
        b,
        pY: totalY ? y / totalY : 0,
        pB: totalB ? b / totalB : 0,
        delta: y - b,
      });
    }

    // ordenar por year desc
    arr.sort((a, b) => b.y - a.y);

    return arr.slice(0, 12);
  }, [analysis]);

  const chart = useMemo(() => {
    const w = 520;
    const h = compactCharts ? 110 : 140;

    const sY = buildLineSeries(analysis.monthTotalsYear);
    const sB = buildLineSeries(analysis.monthTotalsBase);

    const dY = svgPath(sY, w, h, 10);
    const dB = svgPath(sB, w, h, 10);

    return { w, h, dY, dB };
  }, [analysis.monthTotalsYear, analysis.monthTotalsBase, compactCharts]);

  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  if (loading) {
    return (
      <div className="card" style={{ padding: compactCharts ? ".85rem" : "1rem", borderRadius: 18 }}>
        Cargando membership…
      </div>
    );
  }

  if (err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Error: {err}
      </div>
    );
  }

  const detected = sheetInfo.detected;
  const hasData = analysis.totalY > 0 || analysis.totalB > 0;

  return (
    <div className="card" style={{ padding: compactCharts ? ".9rem" : "1.1rem", borderRadius: 18 }}>
      <div style={{ display: "flex", gap: ".75rem", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "1.15rem", fontWeight: 950 }}>{title}</div>
          <div style={{ marginTop: ".25rem", opacity: 0.85, fontSize: ".95rem" }}>
            {hasData ? (
              <>
                Filtro hotel: <b>{hotelFilter ? normHotel(hotelFilter) : "Todos"}</b> · Sheet: <b>{sheetInfo.sheet ?? "—"}</b>
              </>
            ) : (
              <>
                <b>Sin datos</b> para {year}. (Revisá fecha/empresa en el XLSX)
              </>
            )}
          </div>
          <div style={{ marginTop: ".35rem", opacity: 0.75, fontSize: ".85rem" }}>
            Detectado: hotel=<b>{detected.hotel || "—"}</b> · membership=<b>{detected.member || "—"}</b> · qty=<b>{detected.qty || "—"}</b> · fecha=<b>{detected.date || "—"}</b>
          </div>
        </div>

        <div style={{ minWidth: 220, textAlign: "right" }}>
          <div style={{ fontSize: compactCharts ? "1.4rem" : "1.7rem", fontWeight: 950, color }}>
            {formatInt(analysis.totalY)}
          </div>
          <div style={{ opacity: 0.8, marginTop: ".15rem" }}>
            Total {year} · vs {baseYear}: <b>{formatInt(analysis.totalB)}</b>
          </div>
        </div>
      </div>

      {!analysis.okColumns && (
        <div className="card" style={{ marginTop: ".85rem", padding: ".85rem", borderRadius: 14 }}>
          No pude detectar columnas clave. Asegurate que el XLSX tenga: <b>Empresa</b>, <b>Bonboy/Bonvoy</b>, <b>Cantidad</b> y <b>Fecha</b>.
        </div>
      )}

      {/* ===== Line chart ===== */}
      <div style={{ marginTop: ".85rem", overflowX: "auto" }}>
        <svg width={chart.w} height={chart.h} style={{ display: "block" }}>
          {/* baseYear */}
          <path d={chart.dB} fill="none" stroke="#999" strokeWidth="2" opacity="0.7" />
          {/* year */}
          <path d={chart.dY} fill="none" stroke={color} strokeWidth="3" />

          {/* labels simples */}
          <text x="10" y="14" fontSize="12" fill="#666">
            {baseYear}
          </text>
          <text x="60" y="14" fontSize="12" fill={color}>
            {year}
          </text>
        </svg>

        <div style={{ display: "flex", gap: ".35rem", flexWrap: "wrap", marginTop: ".35rem", opacity: 0.85, fontSize: ".85rem" }}>
          {months.map((m) => (
            <span key={m} className="pill" style={{ padding: ".15rem .45rem", borderRadius: 999 }}>
              {m}
            </span>
          ))}
        </div>
      </div>

      {/* ===== Tabla top memberships ===== */}
      <div style={{ marginTop: "1rem" }}>
        <div style={{ fontWeight: 950, marginBottom: ".5rem" }}>Top categorías</div>

        <div style={{ display: "grid", gap: ".45rem" }}>
          {table.map((r) => {
            const bar = Math.min(1, Math.max(0, r.pY));
            return (
              <div
                key={r.member}
                className="card"
                style={{
                  padding: ".55rem .75rem",
                  borderRadius: 14,
                  display: "grid",
                  gridTemplateColumns: "1.2fr .6fr .6fr .6fr",
                  gap: ".5rem",
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 850, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.member}
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: "rgba(0,0,0,.08)", marginTop: ".3rem" }}>
                    <div style={{ height: 8, width: `${bar * 100}%`, borderRadius: 999, background: color }} />
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 900 }}>{formatInt(r.y)}</div>
                  <div style={{ opacity: 0.75 }}>{formatPct01(r.pY)}</div>
                </div>

                <div style={{ textAlign: "right", opacity: 0.9 }}>
                  <div style={{ fontWeight: 800 }}>{formatInt(r.b)}</div>
                  <div style={{ opacity: 0.75 }}>{formatPct01(r.pB)}</div>
                </div>

                <div style={{ textAlign: "right", opacity: 0.9 }}>
                  <div style={{ fontWeight: 900, color: r.delta >= 0 ? "#1a7f37" : "#b42318" }}>
                    {r.delta >= 0 ? "+" : ""}
                    {formatInt(r.delta)}
                  </div>
                  <div style={{ opacity: 0.7, fontSize: ".85rem" }}>Δ</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
