"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Row = {
  hotel: string;
  membership: string;
  qty: number;
  year: number;
  month: number;
};

type Detect = {
  colHotel?: string;
  colMembership?: string;
  colQty?: string;
  colDate?: string;
  sampleKeys: string[];
};

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"] as const;
const monthLabel = (m: number) => MONTHS[m - 1] ?? `Mes ${m}`;

const COLOR: Record<string, string> = {
  MRD: "rgba(239,68,68,.75)",
  GLD: "rgba(245,158,11,.80)",
  TTM: "rgba(168,85,247,.75)",
  PLT: "rgba(148,163,184,.80)",
  SLR: "rgba(203,213,225,.75)",
  AMB: "rgba(56,189,248,.75)",
  OTH: "rgba(100,116,139,.60)",
};

function norm(s: any) {
  return String(s ?? "").trim();
}

function safeNum(v: any) {
  // acepta "1.234,56" / "1234.56" / "1234"
  const s = String(v ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseAnyDate(v: any): Date | null {
  if (!v && v !== 0) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  // Excel serial
  if (typeof v === "number" && Number.isFinite(v)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + v * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(v ?? "").trim();
  if (!s) return null;

  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    const d2 = new Date(yy, mm - 1, dd);
    return isNaN(d2.getTime()) ? null : d2;
  }

  // dd-mm-yy (a veces viene así)
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m2) {
    const dd = Number(m2[1]);
    const mm = Number(m2[2]);
    let yy = Number(m2[3]);
    if (yy < 100) yy += 2000;
    const d2 = new Date(yy, mm - 1, dd);
    return isNaN(d2.getTime()) ? null : d2;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeTierKey(raw: string) {
  const s = (raw ?? "").toString().toUpperCase();

  // contemplá "(MRD)" y variantes
  if (s.includes("(MRD)") || s.includes("MEMBER")) return "MRD";
  if (s.includes("(GLD)") || s.includes("GOLD")) return "GLD";
  if (s.includes("(TTM)") || s.includes("TITANIUM")) return "TTM";
  if (s.includes("(PLT)") || s.includes("PLATINUM")) return "PLT";
  if (s.includes("(SLR)") || s.includes("SILVER")) return "SLR";
  if (s.includes("(AMB)") || s.includes("AMBASSADOR")) return "AMB";
  return "OTH";
}

function pctDelta(cur: number, base: number) {
  if (!base) return null;
  return ((cur / base) - 1) * 100;
}

// --- Heurística de columnas ---
// Busca columnas por nombre aproximado, sin depender de un header exacto
function detectColumns(sampleRow: any): Detect {
  const keys = Object.keys(sampleRow ?? {});
  const upper = keys.map((k) => ({ k, u: k.toUpperCase() }));

  const pick = (preds: ((u: string) => boolean)[]) => {
    const hit = upper.find(({ u }) => preds.some((p) => p(u)));
    return hit?.k;
  };

  const colHotel = pick([
    (u) => u.includes("EMPRESA"),
    (u) => u.includes("HOTEL"),
    (u) => u.includes("PROPERTY"),
    (u) => u.includes("HOTELES"),
  ]);

  const colMembership = pick([
    (u) => u.includes("BONVOY"),
    (u) => u.includes("BONBOY"),
    (u) => u.includes("MEMBERSHIP"),
    (u) => u.includes("TIER"),
    (u) => u.includes("NIVEL"),
    (u) => u.includes("CATEG"),
  ]);

  const colQty = pick([
    (u) => u === "QTY",
    (u) => u.includes("CANTIDAD"),
    (u) => u.includes("CANT."),
    (u) => u.includes("COUNT"),
    (u) => u.includes("TOTAL"),
    (u) => u.includes("MIEMBROS"),
  ]);

  const colDate = pick([
    (u) => u === "FECHA",
    (u) => u.includes("DATE"),
    (u) => u.includes("DIA"),
  ]);

  return { colHotel, colMembership, colQty, colDate, sampleKeys: keys };
}

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("es-AR");
}

export default function MembershipSummary({
  year,
  baseYear,
  filePath,
  hotelsJCR,
}: {
  year: number;
  baseYear: number;
  filePath: string;
  hotelsJCR?: string[];
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [month, setMonth] = useState<number | "ALL">("ALL");
  const [hotelFilter, setHotelFilter] = useState<string>("ALL");

  const [detect, setDetect] = useState<Detect | null>(null);
  const [rawCount, setRawCount] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    readXlsxFromPublic(filePath)
      .then(({ rows }) => {
        if (!alive) return;

        const raw = rows ?? [];
        setRawCount(raw.length);

        const d = detectColumns(raw[0] ?? {});
        setDetect(d);

        const parsed: Row[] = raw
          .map((r: any) => {
            const hotel = norm(r[d.colHotel ?? "Empresa"] ?? r.Empresa ?? r.empresa ?? r.Hotel ?? r.hotel);
            const membership = norm(r[d.colMembership ?? "Bonvoy"] ?? r.Bonvoy ?? r.Bonboy ?? r.Membership ?? r.membership);
            const qty = safeNum(r[d.colQty ?? "Cantidad"] ?? r.Cantidad ?? r.cantidad ?? r.Qty ?? r.qty ?? r.Total ?? r.total);
            const dt = parseAnyDate(r[d.colDate ?? "Fecha"] ?? r.Fecha ?? r.fecha ?? r.Date ?? r.date);

            if (!hotel || !membership || !dt) return null;

            return {
              hotel,
              membership,
              qty,
              year: dt.getFullYear(),
              month: dt.getMonth() + 1,
            } as Row;
          })
          .filter(Boolean) as Row[];

        setRows(parsed);
      })
      .catch((e) => {
        console.error("MembershipSummary read error:", e);
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => {
      alive = false;
    };
  }, [filePath]);

  // restringir a hoteles JCR si lo pasan desde YearComparator
  const hotelAllow = useMemo(() => {
    if (!hotelsJCR || hotelsJCR.length === 0) return null;
    const s = new Set(hotelsJCR);
    return (h: string) => s.has(h);
  }, [hotelsJCR]);

  const hotelsInData = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      if (hotelAllow && !hotelAllow(r.hotel)) return;
      s.add(r.hotel);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [rows, hotelAllow]);

  const yearsInData = useMemo(() => {
    const s = new Set<number>();
    rows.forEach((r) => {
      if (hotelAllow && !hotelAllow(r.hotel)) return;
      s.add(r.year);
    });
    return Array.from(s).sort((a, b) => a - b);
  }, [rows, hotelAllow]);

  // meses del año seleccionado para botones
  const monthsCur = useMemo(() => {
    const s = new Set<number>();
    rows
      .filter((r) => r.year === year)
      .filter((r) => (hotelAllow ? hotelAllow(r.hotel) : true))
      .filter((r) => (hotelFilter === "ALL" ? true : r.hotel === hotelFilter))
      .forEach((r) => s.add(r.month));
    return Array.from(s).sort((a, b) => a - b);
  }, [rows, year, hotelAllow, hotelFilter]);

  const agg = useMemo(() => {
    const pick = (yy: number) =>
      rows
        .filter((r) => r.year === yy)
        .filter((r) => (hotelAllow ? hotelAllow(r.hotel) : true))
        .filter((r) => (hotelFilter === "ALL" ? true : r.hotel === hotelFilter))
        .filter((r) => (month === "ALL" ? true : r.month === month));

    const sumMap = (yy: number) => {
      const map = new Map<string, number>();
      pick(yy).forEach((r) => map.set(r.membership, (map.get(r.membership) ?? 0) + r.qty));
      return map;
    };

    const cur = sumMap(year);
    const base = sumMap(baseYear);

    // ✅ Vercel/TS safe
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
        return {
          membership: k,
          key: normalizeTierKey(k),
          cur: curVal,
          base: baseVal,
          deltaPct: pctDelta(curVal, baseVal),
        };
      })
      .sort((a, b) => b.cur - a.cur);

    const totalCur = list.reduce((s, x) => s + x.cur, 0);
    const totalBase = list.reduce((s, x) => s + x.base, 0);
    const totalDelta = pctDelta(totalCur, totalBase);

    const maxCur = Math.max(1, ...list.map((x) => x.cur));

    return { list, totalCur, totalDelta, maxCur };
  }, [rows, year, baseYear, hotelAllow, hotelFilter, month]);

  if (loading) {
    return (
      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="cardTitle">Membership</div>
        <div className="cardNote">Cargando…</div>
      </div>
    );
  }

  // si no hay datos, devolvemos diagnóstico visible (clave para Vercel)
  const empty = agg.list.length === 0;

  return (
    <div className="card" style={{ gridColumn: "1 / -1", padding: "1.1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <div className="cardTitle">Membership (JCR)</div>
          <div className="cardNote">
            {hotelFilter === "ALL" ? "Consolidado" : hotelFilter} ·{" "}
            {month === "ALL" ? `Acumulado ${year}` : `${monthLabel(month)} ${year}`} · vs {baseYear}
          </div>
        </div>

        {/* Filtro Hotel */}
        <div className="toggle" style={{ flexWrap: "wrap", gap: ".4rem" }}>
          <button
            type="button"
            className={`toggleBtn ${hotelFilter === "ALL" ? "active" : ""}`}
            onClick={() => setHotelFilter("ALL")}
          >
            Todos
          </button>
          {hotelsInData.map((h) => (
            <button
              key={h}
              type="button"
              className={`toggleBtn ${hotelFilter === h ? "active" : ""}`}
              onClick={() => setHotelFilter(h)}
            >
              {h}
            </button>
          ))}
        </div>
      </div>

      {/* Selector Mes/Año */}
      <div className="toggle" style={{ marginTop: ".75rem", flexWrap: "wrap" }}>
        <button type="button" className={`toggleBtn ${month === "ALL" ? "active" : ""}`} onClick={() => setMonth("ALL")}>
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

      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns: "minmax(0, 280px) minmax(0, 1fr)",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        {/* Total */}
        <div
          style={{
            border: "1px solid rgba(148,163,184,.25)",
            borderRadius: 18,
            padding: "1rem",
            background: "rgba(15,23,42,.06)",
          }}
        >
          <div style={{ fontSize: ".85rem", color: "var(--muted)" }}>Total</div>
          <div style={{ fontSize: "2rem", fontWeight: 800, marginTop: ".2rem" }}>
            {fmtInt(agg.totalCur)}
          </div>
          <div className="delta" style={{ marginTop: ".4rem" }}>
            {agg.totalDelta == null
              ? "—"
              : `${agg.totalDelta >= 0 ? "+" : ""}${agg.totalDelta.toFixed(1).replace(".", ",")}%`}{" "}
            vs {baseYear}
          </div>

          {/* Diagnóstico corto */}
          <div className="cardNote" style={{ marginTop: ".55rem" }}>
            Filas leídas: <strong>{rawCount}</strong> · Filas válidas:{" "}
            <strong>{rows.length}</strong>
            <br />
            Años: <strong>{yearsInData.length ? yearsInData.join(", ") : "—"}</strong>
            <br />
            Hoteles: <strong>{hotelsInData.length ? hotelsInData.join(" · ") : "—"}</strong>
          </div>
        </div>

        {/* Barras */}
        <div style={{ display: "grid", gap: ".55rem" }}>
          {empty ? (
            <div className="cardNote" style={{ padding: ".5rem 0" }}>
              <strong>Sin datos.</strong> Esto suele ser porque el Excel no está en la ruta correcta o los headers cambiaron.
              <div style={{ marginTop: ".4rem" }}>
                Detectado: hotel=<code>{detect?.colHotel ?? "—"}</code> · membership=<code>{detect?.colMembership ?? "—"}</code> · qty=<code>{detect?.colQty ?? "—"}</code> · fecha=<code>{detect?.colDate ?? "—"}</code>
              </div>
              <div style={{ marginTop: ".35rem" }}>
                Keys ejemplo: <code>{(detect?.sampleKeys ?? []).slice(0, 10).join(", ") || "—"}</code>
              </div>
            </div>
          ) : (
            agg.list.map((x) => {
              const w = Math.max(2, (x.cur / agg.maxCur) * 100);
              const col = COLOR[x.key] ?? COLOR.OTH;

              return (
                <div key={x.membership} style={{ display: "grid", gap: ".25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem" }}>
                    <div style={{ fontWeight: 700 }}>
                      {x.membership}
                      <span style={{ marginLeft: ".5rem", fontWeight: 600, color: "var(--muted)" }}>
                        · {fmtInt(x.cur)}
                      </span>
                    </div>
                    <div className={`delta ${x.deltaPct != null && x.deltaPct < 0 ? "down" : "up"}`} style={{ margin: 0 }}>
                      {x.deltaPct == null ? "—" : `${x.deltaPct >= 0 ? "+" : ""}${x.deltaPct.toFixed(1).replace(".", ",")}%`}
                    </div>
                  </div>

                  <div style={{ height: 10, borderRadius: 999, background: "rgba(148,163,184,.18)", overflow: "hidden" }}>
                    <div style={{ width: `${w}%`, height: "100%", background: col }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
