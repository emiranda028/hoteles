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
  segment: string; // membership tier
  count: number;
};

const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR");

function norm(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function pickHeaderIndex(headers: string[], candidates: string[]) {
  // exact or contains
  for (const c of candidates) {
    const i = headers.findIndex((h) => h === c);
    if (i >= 0) return i;
  }
  for (const c of candidates) {
    const i = headers.findIndex((h) => h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

async function readXlsxFromPublic(filePath: string): Promise<Row[]> {
  // Lazy import so build stays lighter
  const XLSX = await import("xlsx");

  const res = await fetch(filePath, { cache: "no-store" });
  if (!res.ok) throw new Error(`No pude leer ${filePath} (HTTP ${res.status})`);

  const ab = await res.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array" });

  const out: Row[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    // Array of arrays
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][];
    if (!aoa || aoa.length < 2) continue;

    // find header row: first row with at least 3 non-empty cells
    let headerRowIdx = 0;
    for (let r = 0; r < Math.min(10, aoa.length); r++) {
      const filled = (aoa[r] || []).filter((x) => String(x ?? "").trim() !== "").length;
      if (filled >= 3) {
        headerRowIdx = r;
        break;
      }
    }

    const headersRaw = aoa[headerRowIdx] || [];
    const headers = headersRaw.map((h) => norm(h));

    const idxYear =
      pickHeaderIndex(headers, ["ano", "anio", "year", "fecha", "periodo"]) ??
      -1;
    const idxHotel =
      pickHeaderIndex(headers, ["hotel", "property", "empresa", "unidad", "establecimiento"]) ??
      -1;
    const idxSeg =
      pickHeaderIndex(headers, ["membership", "membresia", "membresia/tier", "tier", "level", "categoria", "segmento"]) ??
      -1;
    const idxCount =
      pickHeaderIndex(headers, ["count", "cantidad", "members", "miembros", "socios", "qty", "total"]) ??
      -1;

    // If not enough, skip sheet (but we try best effort)
    if (idxHotel < 0 || idxSeg < 0 || idxCount < 0) continue;

    for (let r = headerRowIdx + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const hotel = String(row[idxHotel] ?? "").trim();
      const segment = String(row[idxSeg] ?? "").trim();
      const rawCount = row[idxCount];

      if (!hotel || !segment) continue;

      const count =
        typeof rawCount === "number"
          ? rawCount
          : Number(String(rawCount ?? "").replace(/\./g, "").replace(",", "."));

      if (!Number.isFinite(count)) continue;

      // year parse: if missing, try infer from sheet name or ignore
      let y = 0;
      if (idxYear >= 0) {
        const rawYear = row[idxYear];
        const s = String(rawYear ?? "").trim();
        // If date-like "1/6/2024", try last 4 digits
        const m = s.match(/(20\d{2})/);
        y = m ? Number(m[1]) : Number(s);
      }
      if (!y || !Number.isFinite(y)) {
        const m2 = sheetName.match(/(20\d{2})/);
        y = m2 ? Number(m2[1]) : 0;
      }
      if (!y) continue;

      out.push({
        year: y,
        hotel,
        segment,
        count,
      });
    }
  }

  return out;
}

function groupSum(rows: Row[]) {
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.segment, (m.get(r.segment) ?? 0) + r.count);
  }
  return m;
}

function totalOf(map: Map<string, number>) {
  let t = 0;
  for (const v of map.values()) t += v;
  return t;
}

function topN(map: Map<string, number>, n = 8) {
  const list = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  return list.slice(0, n);
}

function Donut({
  data,
  title,
}: {
  data: { name: string; value: number }[];
  title: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  // Build conic-gradient stops (no hard-coded colors; uses CSS variables palette-like)
  // We cycle through a small set of CSS color vars already in your theme (fallback to rgba)
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
    const color = palette[i % palette.length];
    stops.push(`${color} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`);
  });

  const bg = `conic-gradient(${stops.join(",")})`;

  return (
    <div className="memCard">
      <div className="memCardHead">
        <div className="memCardTitle">{title}</div>
      </div>

      <div className="donutWrap">
        <div className="donut" style={{ background: bg }} />
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
        .donutWrap {
          position: relative;
          width: 100%;
          display: flex;
          justify-content: center;
          margin-top: 10px;
          margin-bottom: 10px;
        }
        .donut {
          width: 170px;
          height: 170px;
          border-radius: 999px;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08), 0 14px 30px rgba(0, 0, 0, 0.18);
          position: relative;
        }
        .donut::after {
          content: "";
          position: absolute;
          inset: 22px;
          background: rgba(12, 14, 20, 0.9);
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .donutCenter {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          pointer-events: none;
        }
        .donutBig {
          font-weight: 900;
          font-size: 26px;
          color: rgba(255, 255, 255, 0.95);
          letter-spacing: -0.5px;
          margin-top: -6px;
        }
        .donutCap {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.65);
          margin-top: -10px;
        }
        .legend {
          margin-top: 8px;
          display: grid;
          gap: 8px;
        }
        .legRow {
          display: grid;
          grid-template-columns: 14px 1fr auto;
          gap: 10px;
          align-items: center;
          padding: 8px 10px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .swatch {
          width: 10px;
          height: 10px;
          border-radius: 3px;
        }
        .legName {
          font-weight: 700;
          color: rgba(255, 255, 255, 0.82);
          font-size: 13px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .legVal {
          font-weight: 900;
          color: rgba(255, 255, 255, 0.92);
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}

function Bars({
  data,
  title,
}: {
  data: { name: string; value: number }[];
  title: string;
}) {
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
              <div
                className="barFill"
                style={{ width: `${(d.value / max) * 100}%` }}
                aria-label={`${d.name}: ${d.value}`}
              />
            </div>
            <div className="barVal">{fmtInt(d.value)}</div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .bars {
          margin-top: 10px;
          display: grid;
          gap: 10px;
        }
        .barRow {
          display: grid;
          grid-template-columns: 1fr 1.4fr auto;
          gap: 12px;
          align-items: center;
          padding: 10px 12px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        .barName {
          font-weight: 800;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.85);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .barTrack {
          height: 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.08);
          overflow: hidden;
        }
        .barFill {
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(
            90deg,
            rgba(96, 165, 250, 0.9),
            rgba(168, 85, 247, 0.85)
          );
        }
        .barVal {
          font-weight: 900;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.92);
        }
      `}</style>
    </div>
  );
}

export default function MembershipSummary({ year, baseYear, hotelsJCR, filePath }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    let alive = true;
    setErr("");
    readXlsxFromPublic(filePath)
      .then((r) => {
        if (!alive) return;
        setRows(r);
      })
      .catch((e: any) => {
        if (!alive) return;
        setErr(e?.message ?? "Error leyendo Excel");
        setRows([]);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  const normHotels = useMemo(() => hotelsJCR.map((h) => norm(h)), [hotelsJCR]);

  // Filter only JCR hotels (match by normalization and partial contains)
  const rowsJCR = useMemo(() => {
    return rows.filter((r) => {
      const h = norm(r.hotel);
      return normHotels.some((t) => h === t || h.includes(t) || t.includes(h));
    });
  }, [rows, normHotels]);

  const rowsCur = useMemo(() => rowsJCR.filter((r) => r.year === year), [rowsJCR, year]);
  const rowsBase = useMemo(() => rowsJCR.filter((r) => r.year === baseYear), [rowsJCR, baseYear]);

  const curMap = useMemo(() => groupSum(rowsCur), [rowsCur]);
  const baseMap = useMemo(() => groupSum(rowsBase), [rowsBase]);

  const curTotal = useMemo(() => totalOf(curMap), [curMap]);
  const baseTotal = useMemo(() => totalOf(baseMap), [baseMap]);

  const delta = useMemo(() => deltaPct(curTotal, baseTotal), [curTotal, baseTotal]);

  const topCur = useMemo(() => topN(curMap, 8).map(([name, value]) => ({ name, value })), [curMap]);
  const topDonut = useMemo(() => topN(curMap, 6).map(([name, value]) => ({ name, value })), [curMap]);

  const table = useMemo(() => {
    const keys = Array.from(new Set([...Array.from(curMap.keys()), ...Array.from(baseMap.keys())]));
    const list = keys
      .map((k) => {
        const c = curMap.get(k) ?? 0;
        const b = baseMap.get(k) ?? 0;
        const d = deltaPct(c, b);
        return { k, c, b, d };
      })
      .sort((a, b) => b.c - a.c);
    return list;
  }, [curMap, baseMap]);

  if (err) {
    return (
      <div className="card" style={{ width: "100%" }}>
        <div className="cardTitle">Membership (JCR)</div>
        <div className="delta down" style={{ marginTop: 8 }}>
          Error: {err}
        </div>
        <div className="cardNote" style={{ marginTop: 8 }}>
          Revisá que el archivo exista en <strong>public{filePath}</strong>.
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
          <h3 className="sectionTitle" style={{ margin: 0 }}>
            Grupo JCR · Membership {year}
          </h3>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Total y distribución por categoría (desde Excel).
          </div>
        </div>

        <div className="memTotals">
          <div className="memTotalCard">
            <div className="memTotalLabel">Total members</div>
            <div className="memTotalValue">{hasData ? fmtInt(curTotal) : "—"}</div>
            <div className={`memTotalDelta ${delta >= 0 ? "up" : "down"}`}>
              {delta >= 0 ? "▲" : "▼"} {delta >= 0 ? "+" : ""}
              {delta.toFixed(1).replace(".", ",")}% vs {baseYear}
            </div>
          </div>

          <div className="memTotalCard">
            <div className="memTotalLabel">Años disponibles</div>
            <div className="memTotalValue" style={{ fontSize: 18 }}>
              {Array.from(new Set(rowsJCR.map((r) => r.year))).sort().join(" · ") || "—"}
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
            El Excel se leyó, pero no encontré filas para ese año / hoteles JCR. Probá con otro año.
          </div>
        </div>
      ) : (
        <>
          <div className="memGrid">
            <Bars data={topCur} title="Top categorías (barras)" />
            <Donut data={topDonut} title="Distribución (donut)" />
          </div>

          <div className="memCard" style={{ marginTop: "1rem" }}>
            <div className="memCardHead">
              <div className="memCardTitle">Detalle por categoría (tabla)</div>
            </div>

            <div className="memTableWrap">
              <table className="memTable">
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th style={{ textAlign: "right" }}>{year}</th>
                    <th style={{ textAlign: "right" }}>{baseYear}</th>
                    <th style={{ textAlign: "right" }}>Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((r) => (
                    <tr key={r.k}>
                      <td>{r.k}</td>
                      <td style={{ textAlign: "right", fontWeight: 800 }}>{fmtInt(r.c)}</td>
                      <td style={{ textAlign: "right", color: "rgba(255,255,255,.75)" }}>{fmtInt(r.b)}</td>
                      <td style={{ textAlign: "right" }} className={r.d >= 0 ? "up" : "down"}>
                        {r.b === 0 ? "—" : `${r.d >= 0 ? "+" : ""}${r.d.toFixed(1).replace(".", ",")}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <style jsx>{`
              .memTableWrap {
                overflow: auto;
                margin-top: 10px;
              }
              .memTable {
                width: 100%;
                border-collapse: collapse;
                font-size: 13px;
              }
              .memTable th {
                text-align: left;
                color: rgba(255, 255, 255, 0.7);
                font-weight: 800;
                padding: 10px 8px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
              }
              .memTable td {
                padding: 10px 8px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                color: rgba(255, 255, 255, 0.88);
              }
              .up {
                color: rgba(34, 197, 94, 0.95);
                font-weight: 900;
              }
              .down {
                color: rgba(248, 113, 113, 0.95);
                font-weight: 900;
              }
            `}</style>
          </div>
        </>
      )}

      <style jsx>{`
        .memHead {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        @media (min-width: 980px) {
          .memHead {
            grid-template-columns: 1fr 1fr;
            align-items: end;
          }
        }
        .memTotals {
          display: grid;
          gap: 10px;
        }
        @media (min-width: 980px) {
          .memTotals {
            grid-template-columns: 1fr 1fr;
          }
        }
        .memTotalCard {
          border-radius: 16px;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .memTotalLabel {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.65);
          font-weight: 800;
        }
        .memTotalValue {
          margin-top: 6px;
          font-size: 28px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.95);
          letter-spacing: -0.6px;
        }
        .memTotalDelta {
          margin-top: 6px;
          font-size: 12px;
          font-weight: 900;
        }
        .memTotalDelta.up {
          color: rgba(34, 197, 94, 0.95);
        }
        .memTotalDelta.down {
          color: rgba(248, 113, 113, 0.95);
        }

        .memGrid {
          margin-top: 1rem;
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }
        @media (min-width: 980px) {
          .memGrid {
            grid-template-columns: 1.2fr 0.8fr;
          }
        }

        .memCard {
          border-radius: 18px;
          padding: 14px 14px 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: linear-gradient(180deg, rgba(16, 18, 26, 0.95), rgba(12, 14, 20, 0.95));
          box-shadow: 0 14px 40px rgba(0, 0, 0, 0.22);
        }
        .memCardHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .memCardTitle {
          font-size: 14px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.9);
        }
      `}</style>
    </div>
  );
}



