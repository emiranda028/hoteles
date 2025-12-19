"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Row = {
  hotel: string;
  year: number;
  month: number;
  membership: string;
  qty: number;
};

const monthLabel = (m: number) =>
  ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][m - 1] ?? `Mes ${m}`;

function safeNum(v: any) {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function parseAnyDate(v: any): Date | null {
  if (!v && v !== 0) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  if (typeof v === "number" && Number.isFinite(v)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + v * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(v ?? "").trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    const d2 = new Date(yy, mm - 1, dd);
    return isNaN(d2.getTime()) ? null : d2;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeKey(raw: string) {
  const s = (raw ?? "").toString().toUpperCase();
  if (s.includes("(AMB)") || s.includes("AMBASSADOR")) return "AMB";
  if (s.includes("(TTM)") || s.includes("TITANIUM")) return "TTM";
  if (s.includes("(PLT)") || s.includes("PLATINUM")) return "PLT";
  if (s.includes("(GLD)") || s.includes("GOLD")) return "GLD";
  if (s.includes("(SLR)") || s.includes("SILVER")) return "SLR";
  if (s.includes("(MRD)") || s.includes("MEMBER")) return "MRD";
  return "OTH";
}

const COLOR: Record<string, string> = {
  GLD: "rgba(245,158,11,.80)",
  PLT: "rgba(148,163,184,.80)",
  SLR: "rgba(203,213,225,.75)",
  MRD: "rgba(239,68,68,.75)",
  AMB: "rgba(56,189,248,.75)",
  TTM: "rgba(168,85,247,.75)",
  OTH: "rgba(100,116,139,.60)",
};

function pctDelta(cur: number, base: number) {
  if (!base) return null;
  return ((cur / base) - 1) * 100;
}

export default function MembershipSummary({
  year,
  baseYear,
  hotelsJCR,
  filePath,
}: {
  year: number;
  baseYear: number;
  hotelsJCR: string[];
  filePath: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState<number | "ALL">("ALL");

  useEffect(() => {
    let alive = true;
    setLoading(true);

    readXlsxFromPublic(filePath)
      .then(({ rows }) => {
        if (!alive) return;

        const parsed: Row[] = rows
          .map((r: any) => {
            const membership = (r.Bonboy ?? r.bonboy ?? r.Membership ?? "").toString().trim();
            const qty = safeNum(r.Cantidad ?? r.cantidad ?? r.Qty ?? 0);
            const hotel = (r.Empresa ?? r.empresa ?? r.Hotel ?? "").toString().trim();
            const d = parseAnyDate(r.Fecha ?? r.fecha ?? r.Date ?? "");

            if (!membership || !hotel || !d) return null;

            return {
              hotel,
              membership,
              qty,
              year: d.getFullYear(),
              month: d.getMonth() + 1,
            } as Row;
          })
          .filter(Boolean) as Row[];

        setRows(parsed);
      })
      .catch((e) => {
        console.error(e);
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => {
      alive = false;
    };
  }, [filePath]);

  const monthsCur = useMemo(() => {
    const s = new Set<number>();
    rows
      .filter((r) => r.year === year)
      .filter((r) => hotelsJCR.includes(r.hotel))
      .forEach((r) => s.add(r.month));
    return Array.from(s).sort((a, b) => a - b);
  }, [rows, year, hotelsJCR]);

  const agg = useMemo(() => {
    const pick = (yy: number) =>
      rows
        .filter((r) => r.year === yy)
        .filter((r) => hotelsJCR.includes(r.hotel))
        .filter((r) => (month === "ALL" ? true : r.month === month));

    const sumMap = (yy: number) => {
      const map = new Map<string, number>();
      pick(yy).forEach((r) => map.set(r.membership, (map.get(r.membership) ?? 0) + r.qty));
      return map;
    };

    const cur = sumMap(year);
    const base = sumMap(baseYear);

    // ✅ FIX VERCEL/TS TARGET: no usar spread sobre Map.keys()
    const keys = Array.from(
      new Set([
        ...Array.from(cur.keys()),
        ...Array.from(base.keys()),
      ])
    );

    const list = keys
      .map((k) => {
        const curVal = cur.get(k) ?? 0;
        const baseVal = base.get(k) ?? 0;
        const d = pctDelta(curVal, baseVal);
        return { membership: k, key: normalizeKey(k), cur: curVal, base: baseVal, deltaPct: d };
      })
      .sort((a, b) => b.cur - a.cur);

    const totalCur = list.reduce((s, x) => s + x.cur, 0);
    const totalBase = list.reduce((s, x) => s + x.base, 0);
    const totalDelta = pctDelta(totalCur, totalBase);

    const maxCur = Math.max(1, ...list.map((x) => x.cur));

    return { list, totalCur, totalDelta, maxCur };
  }, [rows, year, baseYear, hotelsJCR, month]);

  if (loading) {
    return (
      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="cardTitle">Membership (JCR)</div>
        <div className="cardNote">Cargando…</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ gridColumn: "1 / -1", padding: "1.1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <div className="cardTitle">Membership (JCR)</div>
          <div className="cardNote">
            {month === "ALL" ? `Acumulado ${year}` : `${monthLabel(month)} ${year}`} · vs {baseYear}
          </div>
        </div>

        <div className="toggle" style={{ flexWrap: "wrap" }}>
          <button
            type="button"
            className={`toggleBtn ${month === "ALL" ? "active" : ""}`}
            onClick={() => setMonth("ALL")}
          >
            Año
          </button>

          {monthsCur.map((m) => (
            <button
              key={m}
              type="button"
              className={`toggleBtn ${month === m ? "active" : ""}`}
              onClick={() => setMonth(m)}
            >
              {monthLabel(m)}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns: "minmax(0, 280px) minmax(0, 1fr)",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        <div
          style={{
            border: "1px solid rgba(148,163,184,.25)",
            borderRadius: 18,
            padding: "1rem",
            background: "rgba(15,23,42,.06)",
          }}
        >
          <div style={{ fontSize: ".9rem", color: "var(--muted)" }}>Total</div>
          <div style={{ fontSize: "2.2rem", fontWeight: 900, marginTop: ".15rem" }}>
            {agg.totalCur.toLocaleString("es-AR")}
          </div>

          {agg.totalDelta === null ? (
            <div className="delta" style={{ marginTop: ".35rem" }}>Base sin datos</div>
          ) : (
            <div className={`delta ${agg.totalDelta >= 0 ? "up" : "down"}`} style={{ marginTop: ".35rem" }}>
              {agg.totalDelta >= 0 ? "+" : ""}
              {agg.totalDelta.toFixed(1).replace(".", ",")}% vs {baseYear}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: ".7rem" }}>
          {agg.list.slice(0, 10).map((x) => {
            const w = Math.max(0, Math.min(100, (x.cur / agg.maxCur) * 100));
            return (
              <div
                key={x.membership}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(160px, 1fr) minmax(0, 2fr) minmax(80px, 110px)",
                  gap: ".75rem",
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 800, fontSize: ".95rem" }}>{x.membership}</div>

                <div style={{ height: 10, background: "rgba(148,163,184,.22)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${w}%`, height: "100%", background: COLOR[x.key] ?? COLOR.OTH }} />
                </div>

                <div style={{ textAlign: "right", fontWeight: 900 }}>
                  {x.cur.toLocaleString("es-AR")}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
