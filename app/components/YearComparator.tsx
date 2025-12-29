"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic, toNumberSmart, toPercent01, safeDiv, formatMoney, formatPct01 } from "./useCsvClient";

type Props = {
  filePath: string;
  year: number;
  baseYear: number;
  hotelFilter: string; // "" => todos
  quarter: number; // 0=todos
  month: number; // 0=todos
  accent: "jcr" | "maitei";
};

type HfRow = Record<string, any>;

function getKey(keys: string[], wanted: string[]) {
  const low = keys.map((k) => k.toLowerCase());
  for (const w of wanted) {
    const idx = low.indexOf(w.toLowerCase());
    if (idx >= 0) return keys[idx];
  }
  for (const w of wanted) {
    const idx = low.findIndex((k) => k.includes(w.toLowerCase()));
    if (idx >= 0) return keys[idx];
  }
  return "";
}

function parseDateAny(v: any): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]) - 1;
    const yy = Number(m1[3]);
    return new Date(yy, mm, dd);
  }
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m2) {
    const dd = Number(m2[1]);
    const mm = Number(m2[2]) - 1;
    let yy = Number(m2[3]);
    if (yy < 100) yy += 2000;
    return new Date(yy, mm, dd);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function quarterOfMonth(m: number) {
  if (m <= 3) return 1;
  if (m <= 6) return 2;
  if (m <= 9) return 3;
  return 4;
}

const ACC = {
  jcr: { border: "rgba(165,0,0,0.22)", pill: "rgba(165,0,0,0.08)" },
  maitei: { border: "rgba(0,140,255,0.22)", pill: "rgba(0,140,255,0.08)" },
};

export default function YearComparator(props: Props) {
  const [rows, setRows] = useState<HfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readCsvFromPublic(props.filePath)
      .then((r) => {
        if (!alive) return;
        setRows(r.rows as any[]);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message ?? "Error leyendo CSV");
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [props.filePath]);

  const computed = useMemo(() => {
    if (!rows.length) return null;

    const keys = Object.keys(rows[0] ?? {});
    const kHotel = getKey(keys, ["Empresa", "Hotel"]);
    const kFecha = getKey(keys, ["Fecha", "Date"]);
    const kOccPct = getKey(keys, ["Occ.%", "Occ%", "OCC%"]);
    const kRoomRev = getKey(keys, ["Room Revenue", "RoomRevenue", "Room_Revenue"]);
    const kAdr = getKey(keys, ["Average Rate", "ADR", "AverageRate"]);
    const kRoomsOcc = getKey(keys, ["Total Occ.", "Total Occ", "Rooms Occupied", "Occ Rooms"]);
    const kAdlChl = getKey(keys, ["Adl. & Chl.", "Adl&Chl", "Adults", "Pax"]);

    const pick = (y: number) => {
      const out: { r: HfRow; d: Date }[] = [];
      for (const r of rows) {
        const d = parseDateAny(r[kFecha]);
        if (!d) continue;
        if (d.getFullYear() !== y) continue;
        if (props.quarter !== 0 && quarterOfMonth(d.getMonth() + 1) !== props.quarter) continue;
        if (props.month !== 0 && d.getMonth() + 1 !== props.month) continue;
        const emp = String(r[kHotel] ?? "").trim();
        if (props.hotelFilter && emp !== props.hotelFilter) continue;
        out.push({ r, d });
      }
      return out;
    };

    const agg = (items: { r: HfRow; d: Date }[]) => {
      const n = items.length;

      const occAvg01 =
        n === 0 ? 0 : items.reduce((acc, it) => acc + toPercent01(toNumberSmart(it.r[kOccPct])), 0) / n;

      const roomRev = items.reduce((acc, it) => acc + toNumberSmart(it.r[kRoomRev]), 0);

      const adrAvg = n === 0 ? 0 : items.reduce((acc, it) => acc + toNumberSmart(it.r[kAdr]), 0) / n;

      const roomsOcc = items.reduce((acc, it) => acc + toNumberSmart(it.r[kRoomsOcc]), 0);

      const pax = items.reduce((acc, it) => acc + toNumberSmart(it.r[kAdlChl]), 0);
      const dobleOcc = safeDiv(pax, roomsOcc);

      const revpar = adrAvg * occAvg01;

      return { occAvg01, roomRev, adrAvg, revpar, dobleOcc };
    };

    const curItems = pick(props.year);
    const baseItems = pick(props.baseYear);

    const cur = agg(curItems);
    const base = agg(baseItems);

    const delta = (a: number, b: number) => (b === 0 ? 0 : (a - b) / b);

    // Ranking Mes por OCUPACION (promedio)
    const monthMap = new Map<number, { m: number; occSum: number; cnt: number }>();
    for (const it of curItems) {
      const m = it.d.getMonth() + 1;
      const v = toPercent01(toNumberSmart(it.r[kOccPct]));
      const prev = monthMap.get(m) ?? { m, occSum: 0, cnt: 0 };
      prev.occSum += v;
      prev.cnt += 1;
      monthMap.set(m, prev);
    }
    const rankingMes = [...monthMap.values()]
      .map((x) => ({ month: x.m, occ01: x.cnt ? x.occSum / x.cnt : 0 }))
      .sort((a, b) => b.occ01 - a.occ01);

    // Ranking Dia semana por OCUPACION (promedio)
    const dowNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const dowMap = new Map<number, { dow: number; occSum: number; cnt: number }>();
    for (const it of curItems) {
      const dow = it.d.getDay();
      const v = toPercent01(toNumberSmart(it.r[kOccPct]));
      const prev = dowMap.get(dow) ?? { dow, occSum: 0, cnt: 0 };
      prev.occSum += v;
      prev.cnt += 1;
      dowMap.set(dow, prev);
    }
    const rankingDow = [...dowMap.values()]
      .map((x) => ({ dow: x.dow, label: dowNames[x.dow], occ01: x.cnt ? x.occSum / x.cnt : 0 }))
      .sort((a, b) => b.occ01 - a.occ01);

    return {
      cur,
      base,
      delta,
      rankingMes,
      rankingDow,
    };
  }, [rows, props.year, props.baseYear, props.hotelFilter, props.quarter, props.month]);

  const a = ACC[props.accent];

  if (loading) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Cargando…</div>;
  if (err) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Error: {err}</div>;
  if (!computed) return <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Sin datos.</div>;

  const { cur, base, delta, rankingMes, rankingDow } = computed;

  const Card = ({ title, big, sub }: { title: string; big: string; sub: string }) => (
    <div className="card" style={{ padding: "1rem", borderRadius: 18, border: `1px solid ${a.border}` }}>
      <div style={{ fontWeight: 900, opacity: 0.9 }}>{title}</div>
      <div style={{ fontSize: "1.85rem", fontWeight: 1000, marginTop: ".25rem" }}>{big}</div>
      <div style={{ marginTop: ".15rem", opacity: 0.9, fontWeight: 850 }}>{sub}</div>
    </div>
  );

  const pctDelta = (d: number) => ((d || 0) * 100).toFixed(1) + "%";

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
        Comparativa principales indicadores
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: ".85rem" }}>
        <Card
          title="Ocupación promedio"
          big={formatPct01(cur.occAvg01)}
          sub={`${pctDelta(delta(cur.occAvg01, base.occAvg01))} vs ${props.baseYear}`}
        />
        <Card
          title="ADR promedio"
          big={formatMoney(cur.adrAvg)}
          sub={`${pctDelta(delta(cur.adrAvg, base.adrAvg))} vs ${props.baseYear}`}
        />
        <Card
          title="RevPAR (ADR×Occ)"
          big={formatMoney(cur.revpar)}
          sub={`${pctDelta(delta(cur.revpar, base.revpar))} vs ${props.baseYear}`}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: ".85rem" }}>
        <Card
          title="Doble ocupación (Pax/RoomOcc)"
          big={cur.dobleOcc.toFixed(2)}
          sub={`${pctDelta(delta(cur.dobleOcc, base.dobleOcc))} vs ${props.baseYear}`}
        />
        <Card
          title="Room Revenue (acumulado)"
          big={formatMoney(cur.roomRev)}
          sub={`${pctDelta(delta(cur.roomRev, base.roomRev))} vs ${props.baseYear}`}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
        <div className="card" style={{ padding: "1rem", borderRadius: 18, border: `1px solid ${a.border}` }}>
          <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Ranking de meses (por ocupación)</div>
          <div style={{ opacity: 0.85, marginTop: ".25rem" }}>
            Ordenado por ocupación promedio del año filtrado.
          </div>

          <div style={{ marginTop: ".75rem", display: "grid", gap: ".45rem" }}>
            {rankingMes.length === 0 ? (
              <div style={{ opacity: 0.8 }}>Sin datos.</div>
            ) : (
              rankingMes.map((r, i) => (
                <div
                  key={r.month}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: ".55rem .65rem",
                    borderRadius: 12,
                    background: a.pill,
                    border: `1px solid ${a.border}`,
                  }}
                >
                  <div style={{ fontWeight: 900 }}>
                    #{i + 1} · Mes {r.month}
                  </div>
                  <div style={{ fontWeight: 1000 }}>{formatPct01(r.occ01)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card" style={{ padding: "1rem", borderRadius: 18, border: `1px solid ${a.border}` }}>
          <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Ranking por día de la semana (ocupación)</div>
          <div style={{ opacity: 0.85, marginTop: ".25rem" }}>
            Para detectar el día donde hay que mejorar.
          </div>

          <div style={{ marginTop: ".75rem", display: "grid", gap: ".45rem" }}>
            {rankingDow.length === 0 ? (
              <div style={{ opacity: 0.8 }}>Sin datos.</div>
            ) : (
              rankingDow.map((r, i) => (
                <div
                  key={r.dow}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: ".55rem .65rem",
                    borderRadius: 12,
                    background: a.pill,
                    border: `1px solid ${a.border}`,
                  }}
                >
                  <div style={{ fontWeight: 900 }}>
                    #{i + 1} · {r.label}
                  </div>
                  <div style={{ fontWeight: 1000 }}>{formatPct01(r.occ01)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
