"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  year: number;
  baseYear: number;
  hotelsJCR: string[];
  filePath: string; // "/data/jcr_membership.xlsx"
};

type Row = {
  year: number;
  hotel: string;
  segment: string;
  count: number;
};

const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR");

function groupSum(rows: Row[]) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.segment, (m.get(r.segment) ?? 0) + r.count);
  return m;
}
function totalOf(map: Map<string, number>) {
  let t = 0;
  for (const v of map.values()) t += v;
  return t;
}
function deltaPct(cur: number, base: number) {
  if (!base) return 0;
  return ((cur / base) - 1) * 100;
}
function topN(map: Map<string, number>, n = 8) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, value]) => ({ name, value }));
}

function Donut({ data, title }: { data: { name: string; value: number }[]; title: string }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const palette = [
    "rgba(96,165,250,.9)",
    "rgba(34,197,94,.9)",
    "rgba(168,85,247,.9)",
    "rgba(245,158,11,.9)",
    "rgba(248,113,113,.9)",
    "rgba(20,184,166,.9)",
    "rgba(236,72,153,.9)",
    "rgba(148,163,184,.9)",
  ];

  let acc = 0;
  const stops: string[] = [];
  data.forEach((d, i) => {
    const start = (acc / total) * 360;
    acc += d.value;
    const end = (acc / total) * 360;
    stops.push(`${palette[i % palette.length]} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`);
  });

  return (
    <div className="memCard">
      <div className="memCardHead">
        <div className="memCardTitle">{title}</div>
      </div>

      <div className="donutWrap">
        <div className="donut" style={{ background: `conic-gradient(${stops.join(",")})` }} />
        <div className="donutCenter">
          <div className="donutBig">{fmtInt(total)}</div>
          <div className="donutCap">Total</div>
        </div>
      </div>

      <div className="legend">
        {data.map((d, i) => (
          <div className="legRow" key={d.name}>
            <span className="swatch" style={{ background: palette[i % palette.length] }} />
            <span className="legName">{d.name}</span>
            <span className="legVal">{fmtInt(d.value)}</span>
          </div>
        ))}
      </div>

      <style jsx>{`
        .donutWrap { position: relative; display: flex; justify-content: center; margin: 10px 0; }
        .donut { width: 170px; height: 170px; border-radius: 999px; position: relative;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,.08), 0 14px 30px rgba(0,0,0,.18);
        }
        .donut::after { content:""; position:absolute; inset:22px; border-radius:999px;
          background: rgba(12,14,20,.9); border: 1px solid rgba(255,255,255,.08);
        }
        .donutCenter { position:absolute; inset:0; display:grid; place-items:center; pointer-events:none; }
        .donutBig { font-weight: 900; font-size: 26px; color: rgba(255,255,255,.95); margin-top:-6px; }
        .donutCap { font-size: 12px; color: rgba(255,255,255,.65); margin-top:-10px; }
        .legend { display:grid; gap:8px; margin-top:8px; }
        .legRow { display:grid; grid-template-columns:14px 1fr auto; gap:10px; align-items:center;
          padding: 8px 10px; border-radius: 12px;
          background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06);
        }
        .swatch { width:10px; height:10px; border-radius:3px; }
        .legName { font-weight: 800; font-size: 13px; color: rgba(255,255,255,.82); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .legVal { font-weight: 900; font-size: 13px; color: rgba(255,255,255,.92); }
      `}</style>
    </div>
  );
}

function Bars({ data, title }: { data: { name: string; value: number }[]; title: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="memCard">
      <div className="memCardHead">
        <div className="memCardTitle">{title}</div>
      </div>

      <div className="bars">
        {data.map((d) => (
          <div className="barRow" key={d.name}>
            <div className="barName">{d.name}</div>
            <div className="barTrack">
              <div className="barFill" style={{ width: `${(d.value / max) * 100}%` }} />
            </div>
            <div className="barVal">{fmtInt(d.value)}</div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .bars { display:grid; gap:10px; margin-top:10px; }
        .barRow { display:grid; grid-template-columns: 1fr 1.4fr auto; gap:12px; align-items:center;
          padding: 10px 12px; border-radius: 14px;
          background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06);
        }
        .barName { font-weight: 800; font-size: 13px; color: rgba(255,255,255,.85); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .barTrack { height: 10px; border-radius: 999px; background: rgba(255,255,255,.08);
          border: 1px solid rgba(255,255,255,.08); overflow:hidden;
        }
        .barFill { height:100%; border-radius:999px;
          background: linear-gradient(90deg, rgba(96,165,250,.9), rgba(168,85,247,.85));
        }
        .barVal { font-weight: 900; font-size: 13px; color: rgba(255,255,255,.92); }
      `}</style>
    </div>
  );
}

export default function MembershipSummary({ year, baseYear, hotelsJCR, filePath }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setErr("");

    const file = (filePath || "/data/jcr_membership.xlsx").replace(/^\//, ""); // "data/..."
    const allowed = encodeURIComponent(hotelsJCR.join(","));

    fetch(`/api/membership?file=${encodeURIComponent(file)}&allowedHotels=${allowed}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        if (json?.error) {
          setErr(String(json.error));
          setRows([]);
          return;
        }
        setRows(Array.isArray(json?.rows) ? json.rows : []);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message ?? "Error");
        setRows([]);
      });

    return () => {
      alive = false;
    };
  }, [filePath, hotelsJCR]);

  const rowsCur = useMemo(() => rows.filter((r) => r.year === year), [rows, year]);
  const rowsBase = useMemo(() => rows.filter((r) => r.year === baseYear), [rows, baseYear]);

  const curMap = useMemo(() => groupSum(rowsCur), [rowsCur]);
  const baseMap = useMemo(() => groupSum(rowsBase), [rowsBase]);

  const curTotal = useMemo(() => totalOf(curMap), [curMap]);
  const baseTotal = useMemo(() => totalOf(baseMap), [baseMap]);
  const d = useMemo(() => deltaPct(curTotal, baseTotal), [curTotal, baseTotal]);

  const donut = useMemo(() => topN(curMap, 6), [curMap]);
  const bars = useMemo(() => topN(curMap, 8), [curMap]);

  const yearsAvail = useMemo(
    () => Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => a - b),
    [rows]
  );

  if (err) {
    return (
      <div className="card" style={{ width: "100%" }}>
        <div className="cardTitle">Membership (JCR)</div>
        <div className="delta down" style={{ marginTop: 8 }}>Error: {err}</div>
        <div className="cardNote" style={{ marginTop: 8 }}>
          Confirmá que existe <strong>public{filePath}</strong>
        </div>
      </div>
    );
  }

  const hasData = rowsCur.length > 0;

  return (
    <div style={{ width: "100%" }}>
      <div className="memHead">
        <div>
          <div className="sectionKicker">Membership</div>
          <h3 className="sectionTitle" style={{ margin: 0 }}>Grupo JCR · Membership {year}</h3>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Total y distribución por categoría (desde Excel).
          </div>
        </div>

        <div className="memTotals">
          <div className="memTotalCard">
            <div className="memTotalLabel">Total members</div>
            <div className="memTotalValue">{hasData ? fmtInt(curTotal) : "—"}</div>
            <div className={`memTotalDelta ${d >= 0 ? "up" : "down"}`}>
              {d >= 0 ? "▲" : "▼"} {d >= 0 ? "+" : ""}{d.toFixed(1).replace(".", ",")}% vs {baseYear}
            </div>
          </div>

          <div className="memTotalCard">
            <div className="memTotalLabel">Años disponibles</div>
            <div className="memTotalValue" style={{ fontSize: 18 }}>
              {yearsAvail.length ? yearsAvail.join(" · ") : "—"}
            </div>
            <div className="memTotalDelta" style={{ color: "rgba(255,255,255,.65)" }}>
              Filas {year}: {rowsCur.length} · Filas {baseYear}: {rowsBase.length}
            </div>
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="card" style={{ width: "100%", marginTop: "1rem" }}>
          <div className="cardTitle">Sin datos para {year}</div>
          <div className="cardNote" style={{ marginTop: 8 }}>
            El Excel se leyó, pero no hay filas para ese año.
          </div>
        </div>
      ) : (
        <div className="memGrid">
          <Bars data={bars} title="Top categorías (barras)" />
          <Donut data={donut} title="Distribución (donut)" />
        </div>
      )}

      <style jsx>{`
        .memHead { display:grid; grid-template-columns:1fr; gap:12px; }
        @media (min-width:980px){ .memHead{ grid-template-columns:1fr 1fr; align-items:end; } }
        .memTotals { display:grid; gap:10px; }
        @media (min-width:980px){ .memTotals{ grid-template-columns:1fr 1fr; } }
        .memTotalCard { border-radius:16px; padding:12px 14px; background: rgba(255,255,255,.04);
          border: 1px solid rgba(255,255,255,.08);
        }
        .memTotalLabel { font-size:12px; color: rgba(255,255,255,.65); font-weight:800; }
        .memTotalValue { margin-top:6px; font-size:28px; font-weight:900; color: rgba(255,255,255,.95); letter-spacing:-.6px; }
        .memTotalDelta { margin-top:6px; font-size:12px; font-weight:900; }
        .memTotalDelta.up { color: rgba(34,197,94,.95); }
        .memTotalDelta.down { color: rgba(248,113,113,.95); }

        .memGrid { margin-top: 1rem; display:grid; grid-template-columns:1fr; gap: 1rem; }
        @media (min-width:980px){ .memGrid{ grid-template-columns:1.2fr .8fr; } }

        .memCard { border-radius:18px; padding:14px 14px 16px;
          border: 1px solid rgba(255,255,255,.08);
          background: linear-gradient(180deg, rgba(16,18,26,.95), rgba(12,14,20,.95));
          box-shadow: 0 14px 40px rgba(0,0,0,.22);
        }
        .memCardHead { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .memCardTitle { font-size:14px; font-weight:900; color: rgba(255,255,255,.9); }
      `}</style>
    </div>
  );
}
