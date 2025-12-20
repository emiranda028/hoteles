"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Props = {
  year: number;
  baseYear: number;
  allowedHotels: string[];
  filePath: string;
  hotelFilter?: string; // "JCR" | hotel
};

type Row = {
  hotel: string;
  membership: string;
  qty: number;
  date: Date | null;
  year: number | null;
};

type ReadResult = {
  rows: any[];
  sheetName: string;
  sheetNames: string[];
};

function normStr(s: any) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function safeNum(v: any): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const out = s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(out);
  return Number.isFinite(n) ? n : 0;
}

function parseDateLoose(v: any): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;

  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    const yyyy = Number(m1[3]);
    const d = new Date(yyyy, mm - 1, dd);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  const t = Date.parse(s);
  if (Number.isFinite(t)) return new Date(t);
  return null;
}

function pick(obj: Record<string, any>, candidates: string[]) {
  const keys = Object.keys(obj);
  const lower = new Map(keys.map((k) => [k.toLowerCase(), k]));
  for (const cand of candidates) {
    const k = lower.get(cand.toLowerCase());
    if (k != null) return obj[k];
  }
  return "";
}

function scoreRows(rows: any[]) {
  if (!rows || rows.length === 0) return 0;
  const keys = Object.keys(rows[0] ?? {});
  const set = new Set(keys.map((k) => String(k).trim().toLowerCase()));
  let score = keys.length;

  if (set.has("empresa")) score += 50;
  if (set.has("bonboy")) score += 25;
  if (set.has("cantidad")) score += 25;
  if (set.has("fecha") || set.has("date")) score += 15;

  score += Math.min(rows.length, 300) / 10;
  return score;
}

async function readXlsxFromPublic(path: string): Promise<ReadResult> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (status ${res.status})`);
  const buffer = await res.arrayBuffer();

  const wb = XLSX.read(buffer, { type: "array" });
  const sheetNames = wb.SheetNames ?? [];
  if (sheetNames.length === 0) return { rows: [], sheetName: "", sheetNames: [] };

  let bestSheet = sheetNames[0];
  let bestRows: any[] = [];
  let bestScore = -1;

  for (const name of sheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];
    const s = scoreRows(rows);
    if (s > bestScore) {
      bestScore = s;
      bestSheet = name;
      bestRows = rows;
    }
  }

  return { rows: bestRows, sheetName: bestSheet, sheetNames };
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);
}

function pctDelta(cur: number, base: number) {
  if (!base) return 0;
  return (cur - base) / base;
}

function colorForMembership(name: string) {
  const n = normStr(name);
  // podés ajustar estos “keywords”
  if (n.includes("PLAT")) return { bg: "rgba(59,130,246,.14)", border: "rgba(59,130,246,.35)" };
  if (n.includes("GOLD")) return { bg: "rgba(245,158,11,.16)", border: "rgba(245,158,11,.35)" };
  if (n.includes("SILV")) return { bg: "rgba(148,163,184,.20)", border: "rgba(148,163,184,.40)" };
  if (n.includes("MEMB")) return { bg: "rgba(34,197,94,.14)", border: "rgba(34,197,94,.35)" };
  return { bg: "rgba(147,51,234,.12)", border: "rgba(147,51,234,.30)" };
}

export default function MembershipSummary({
  year,
  baseYear,
  allowedHotels,
  filePath,
  hotelFilter = "JCR",
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  // filtro interno (por si querés cambiar dentro del bloque)
  const [hotelLocal, setHotelLocal] = useState<string>(hotelFilter);

  useEffect(() => setHotelLocal(hotelFilter), [hotelFilter]);

  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        setLoading(true);
        setErr("");
        const rr = await readXlsxFromPublic(filePath);
        const mapped = rr.rows.map((r: any) => {
          const hotel = normStr(pick(r, ["Empresa", "empresa", "Hotel", "hotel", "Property"]));
          const membership = String(pick(r, ["Bonboy", "bonboy", "Membership", "membership", "Programa"])).trim();
          const qty = safeNum(pick(r, ["Cantidad", "cantidad", "Qty", "qty", "Count", "count"]));
          const dtRaw = pick(r, ["Fecha", "fecha", "Date", "date"]);
          const dt = parseDateLoose(dtRaw);

          return {
            hotel,
            membership,
            qty,
            date: dt,
            year: dt ? dt.getFullYear() : null,
          } as Row;
        });

        const clean = mapped.filter((r) => r.hotel && r.membership && r.qty && r.year);
        if (alive) setRows(clean);
      } catch (e: any) {
        console.error(e);
        if (alive) {
          setRows([]);
          setErr(String(e?.message ?? e));
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [filePath]);

  const allowedSet = useMemo(() => new Set(allowedHotels.map(normStr)), [allowedHotels]);

  const filtered = useMemo(() => {
    const hotelF = normStr(hotelLocal);
    return rows.filter((r) => {
      if (!allowedSet.has(normStr(r.hotel))) return false;
      if (hotelF !== "JCR" && hotelF !== normStr(r.hotel)) return false;
      return true;
    });
  }, [rows, allowedSet, hotelLocal]);

  const yearsAvail = useMemo(() => {
    const ys = new Set<number>();
    for (const r of filtered) if (r.year) ys.add(r.year);
    return Array.from(ys).sort((a, b) => b - a);
  }, [filtered]);

  function sumFor(y: number) {
    return filtered
      .filter((r) => r.year === y)
      .reduce((a, r) => a + (r.qty || 0), 0);
  }

  function sumMap(y: number) {
    const m = new Map<string, number>();
    for (const r of filtered) {
      if (r.year !== y) continue;
      const key = String(r.membership ?? "").trim();
      const prev = m.get(key) ?? 0;
      m.set(key, prev + (r.qty || 0));
    }
    return m;
  }

  const totalCur = useMemo(() => sumFor(year), [filtered, year]); // eslint-disable-line
  const totalBase = useMemo(() => sumFor(baseYear), [filtered, baseYear]); // eslint-disable-line

  const list = useMemo(() => {
    const cur = sumMap(year);
    const base = sumMap(baseYear);

    const keys = Array.from(
      new Set<string>([
        ...Array.from(cur.keys()),
        ...Array.from(base.keys()),
      ])
    );

    return keys
      .map((k) => {
        const curVal = cur.get(k) ?? 0;
        const baseVal = base.get(k) ?? 0;
        return {
          membership: k,
          cur: curVal,
          base: baseVal,
          delta: pctDelta(curVal, baseVal),
        };
      })
      .sort((a, b) => b.cur - a.cur);
  }, [filtered, year, baseYear]);

  const maxCur = useMemo(() => {
    const m = Math.max(1, ...list.map((x) => x.cur));
    return m;
  }, [list]);

  return (
    <div>
      {/* filtros */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: ".6rem", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>
          Membership ({hotelLocal === "JCR" ? "JCR total" : hotelLocal}) — {year} (vs {baseYear})
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem", alignItems: "center" }}>
          <select
            value={hotelLocal}
            onChange={(e) => setHotelLocal(e.target.value)}
            style={{
              padding: ".55rem .7rem",
              borderRadius: 999,
              border: "1px solid rgba(2,6,23,.16)",
              background: "rgba(255,255,255,.85)",
              fontWeight: 850,
            }}
          >
            <option value="JCR">JCR (Total)</option>
            {allowedHotels.map((h) => (
              <option key={h} value={normStr(h)}>
                {h}
              </option>
            ))}
          </select>

          <select
            value={year}
            onChange={() => {}}
            disabled
            style={{
              padding: ".55rem .7rem",
              borderRadius: 999,
              border: "1px solid rgba(2,6,23,.10)",
              background: "rgba(255,255,255,.65)",
              fontWeight: 850,
              opacity: 0.9,
            }}
            title="Este año se controla desde el filtro global de arriba"
          >
            <option value={year}>{year}</option>
          </select>

          <select
            value={baseYear}
            onChange={() => {}}
            disabled
            style={{
              padding: ".55rem .7rem",
              borderRadius: 999,
              border: "1px solid rgba(2,6,23,.10)",
              background: "rgba(255,255,255,.65)",
              fontWeight: 850,
              opacity: 0.9,
            }}
            title="Año base se controla desde el filtro global de arriba"
          >
            <option value={baseYear}>{baseYear}</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: ".55rem", opacity: 0.85, fontWeight: 750 }}>
        {loading ? "Cargando..." : err ? `Error: ${err}` : yearsAvail.length ? `Años disponibles: ${yearsAvail.join(", ")}` : "Sin datos"}
      </div>

      {/* Totales */}
      <div
        style={{
          marginTop: ".8rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        <div
          style={{
            borderRadius: 20,
            padding: "1rem",
            background: "linear-gradient(135deg, rgba(59,130,246,.18), rgba(34,197,94,.14))",
            border: "1px solid rgba(2,6,23,.08)",
          }}
        >
          <div style={{ fontWeight: 950, opacity: 0.9 }}>Total {year}</div>
          <div style={{ fontSize: "2rem", fontWeight: 950, letterSpacing: "-.02em" }}>{fmtInt(totalCur)}</div>
          <div style={{ fontWeight: 850, opacity: 0.85 }}>
            vs {baseYear}: {fmtInt(totalBase)} ·{" "}
            <span style={{ fontWeight: 950 }}>
              {totalBase ? `${(pctDelta(totalCur, totalBase) * 100).toFixed(1)}%` : "—"}
            </span>
          </div>
        </div>

        <div
          style={{
            borderRadius: 20,
            padding: "1rem",
            background: "rgba(255,255,255,.75)",
            border: "1px solid rgba(2,6,23,.10)",
          }}
        >
          <div style={{ fontWeight: 950, opacity: 0.9 }}>Top memberships ({year})</div>
          <div style={{ marginTop: ".55rem", display: "flex", flexWrap: "wrap", gap: ".45rem" }}>
            {list.slice(0, 6).map((x) => {
              const c = colorForMembership(x.membership);
              return (
                <span
                  key={x.membership}
                  style={{
                    padding: ".35rem .6rem",
                    borderRadius: 999,
                    background: c.bg,
                    border: `1px solid ${c.border}`,
                    fontWeight: 950,
                    fontSize: ".9rem",
                    whiteSpace: "nowrap",
                  }}
                >
                  {x.membership || "—"} · {fmtInt(x.cur)}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Gráfico compacto */}
      <div style={{ marginTop: "1rem" }}>
        <div style={{ fontWeight: 950, marginBottom: ".45rem" }}>Distribución por membresía ({year})</div>

        <div style={{ display: "grid", gap: 8 }}>
          {list.slice(0, 10).map((x) => {
            const c = colorForMembership(x.membership);
            const w = Math.round((x.cur / maxCur) * 100);
            const pos = x.delta >= 0;
            const sign = pos ? "+" : "";
            return (
              <div
                key={x.membership}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 10,
                  alignItems: "center",
                  padding: ".55rem .65rem",
                  borderRadius: 16,
                  background: "rgba(255,255,255,.75)",
                  border: "1px solid rgba(2,6,23,.10)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {x.membership || "—"}
                    </div>
                    <div style={{ fontWeight: 950 }}>{fmtInt(x.cur)}</div>
                  </div>

                  <div style={{ height: 8, borderRadius: 999, background: "rgba(2,6,23,.10)", overflow: "hidden", marginTop: 6 }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${w}%`,
                        background: c.border,
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    padding: ".25rem .55rem",
                    borderRadius: 999,
                    fontWeight: 950,
                    fontSize: ".82rem",
                    color: pos ? "rgb(21,128,61)" : "rgb(185,28,28)",
                    background: pos ? "rgba(34,197,94,.16)" : "rgba(239,68,68,.16)",
                    border: pos ? "1px solid rgba(34,197,94,.25)" : "1px solid rgba(239,68,68,.25)",
                    whiteSpace: "nowrap",
                  }}
                  title={`Variación vs ${baseYear}`}
                >
                  {sign}
                  {totalBase ? (x.delta * 100).toFixed(1) : "0.0"}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
