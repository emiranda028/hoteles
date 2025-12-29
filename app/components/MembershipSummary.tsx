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
  hotelFilter?: string; // "" = todos
  allowedHotels?: string[];
  compactCharts?: boolean;
};

function pickKey(keys: string[], candidates: string[]): string {
  const norm = (s: string) => s.trim().toLowerCase();
  const map = new Map(keys.map((k) => [norm(k), k]));
  for (const c of candidates) {
    const hit = map.get(norm(c));
    if (hit) return hit;
  }
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

  if (s.includes("MARRIOTT")) return "MARRIOTT";
  if (s.includes("MAITEI")) return "MAITEI";

  // Sheraton separados
  if (s.includes("SHERATON") && (s.includes("MDQ") || s.includes("MAR DEL PLATA"))) return "SHERATON MDQ";
  if (s.includes("SHERATON") && (s.includes("BCR") || s.includes("BARILOCHE"))) return "SHERATON BCR";

  return s;
}

function normMember(v: any): string {
  const s = String(v ?? "").trim();
  if (!s) return "Sin dato";
  const up = s.toUpperCase();

  if (up.includes("AMBASSADOR")) return "Ambassador";
  if (up.includes("TITANIUM")) return "Titanium";
  if (up.includes("PLATINUM")) return "Platinum";
  if (up.includes("GOLD")) return "Gold";
  if (up.includes("SILVER")) return "Silver";
  if (up.includes("MEMBER")) return "Member";
  if (up.includes("NON") || up.includes("NO ") || up.includes("SIN")) return "Non Member";

  return s;
}

function memberColor(member: string): string {
  const m = member.toUpperCase();

  // pedidos tuyos
  if (m.includes("GOLD")) return "#d4af37"; // oro
  if (m.includes("PLATINUM")) return "#c0c0c0"; // plata
  if (m.includes("AMBASSADOR")) return "#2bb3ff"; // celeste

  // extras razonables
  if (m.includes("TITANIUM")) return "#6f7a86"; // gris azulado
  if (m.includes("SILVER")) return "#a7a7a7";
  if (m.includes("MEMBER")) return "#2563eb"; // azul
  if (m.includes("NON")) return "#6b7280"; // gris

  return "#9ca3af";
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
    const { hotel: kHotel, member: kMem, qty: kQty, date: kDate } = sheetInfo.detected;
    const okColumns = Boolean(kHotel && kMem && kQty && kDate);

    const allowedSet = new Set((allowedHotels ?? []).map(normHotel).filter(Boolean));
    const hasAllowed = allowedSet.size > 0;
    const filterHotel = normHotel(hotelFilter);

    const totalsY = new Map<string, number>();
    const totalsB = new Map<string, number>();

    let totalYear = 0;
    let totalBase = 0;

    if (!okColumns) {
      return { okColumns, totalYear, totalBase, totalsY, totalsB };
    }

    for (const r of rows) {
      const hotel = normHotel(r[kHotel]);
      if (!hotel) continue;

      if (hasAllowed && !allowedSet.has(hotel)) continue;
      if (filterHotel && hotel !== filterHotel) continue;

      const d = parseDateAny(r[kDate]);
      if (!d) continue;

      const y = d.getFullYear();
      const mem = normMember(r[kMem]);
      const qty = Math.max(0, toNumberSmart(r[kQty]));

      if (y === year) {
        totalYear += qty;
        totalsY.set(mem, (totalsY.get(mem) ?? 0) + qty);
      } else if (y === baseYear) {
        totalBase += qty;
        totalsB.set(mem, (totalsB.get(mem) ?? 0) + qty);
      }
    }

    return { okColumns, totalYear, totalBase, totalsY, totalsB };
  }, [rows, sheetInfo.detected, allowedHotels, hotelFilter, year, baseYear]);

  const table = useMemo(() => {
    const members = new Set<string>();
    for (const k of analysis.totalsY.keys()) members.add(k);
    for (const k of analysis.totalsB.keys()) members.add(k);

    const totalY = analysis.totalYear || 0;
    const totalB = analysis.totalBase || 0;

    const arr = Array.from(members).map((m) => {
      const y = analysis.totalsY.get(m) ?? 0;
      const b = analysis.totalsB.get(m) ?? 0;
      return {
        member: m,
        y,
        b,
        pY: totalY ? y / totalY : 0,
        pB: totalB ? b / totalB : 0,
        delta: y - b,
      };
    });

    arr.sort((a, b) => b.y - a.y);
    return arr.slice(0, 12);
  }, [analysis]);

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
  const hasData = analysis.totalYear > 0 || analysis.totalBase > 0;

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
          <div style={{ fontSize: compactCharts ? "1.6rem" : "2.0rem", fontWeight: 950 }}>
            {formatInt(analysis.totalYear)}
          </div>
          <div style={{ opacity: 0.8, marginTop: ".15rem" }}>
            Total {year} · vs {baseYear}: <b>{formatInt(analysis.totalBase)}</b>
          </div>
        </div>
      </div>

      {!analysis.okColumns && (
        <div className="card" style={{ marginTop: ".85rem", padding: ".85rem", borderRadius: 14 }}>
          No pude detectar columnas clave. Asegurate que el XLSX tenga: <b>Empresa</b>, <b>Bonboy/Bonvoy</b>, <b>Cantidad</b> y <b>Fecha</b>.
        </div>
      )}

      <div style={{ marginTop: "1rem" }}>
        <div style={{ fontWeight: 950, marginBottom: ".5rem" }}>Top categorías</div>

        <div style={{ display: "grid", gap: ".45rem" }}>
          {table.map((r) => {
            const bar = Math.min(1, Math.max(0, r.pY));
            const c = memberColor(r.member);

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

                  <div style={{ height: 9, borderRadius: 999, background: "rgba(0,0,0,.08)", marginTop: ".35rem" }}>
                    <div style={{ height: 9, width: `${bar * 100}%`, borderRadius: 999, background: c }} />
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
