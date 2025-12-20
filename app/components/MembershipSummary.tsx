"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Props = {
  year: number;
  baseYear: number;
  filePath: string;            // "/data/jcr_membership.xlsx"
  hotelFilter: string;         // "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ"
};

type Mode = "YEAR" | "MONTH";

type Row = {
  date: Date | null;
  year: number | null;
  month: number | null;
  hotel: string;
  tier: string;
  qty: number;
};

const JCR_HOTELS = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];

const TIER_COLORS: Record<string, string> = {
  "MEMBER (MRD)": "linear-gradient(90deg, rgba(235,87,87,1), rgba(235,87,87,.65))",
  "GOLD ELITE (GLD)": "linear-gradient(90deg, rgba(243,156,18,1), rgba(243,156,18,.55))",
  "TITANIUM ELITE (TTM)": "linear-gradient(90deg, rgba(155,89,182,1), rgba(155,89,182,.55))",
  "PLATINUM ELITE (PLT)": "linear-gradient(90deg, rgba(120,136,160,1), rgba(120,136,160,.55))",
  "SILVER ELITE (SLR)": "linear-gradient(90deg, rgba(170,185,200,1), rgba(170,185,200,.55))",
  "AMBASSADOR ELITE (AMB)": "linear-gradient(90deg, rgba(46,204,255,1), rgba(46,204,255,.55))",
};

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function normKey(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function safeNum(v: any) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const normalized =
    s.indexOf(",") >= 0 && s.indexOf(".") >= 0
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function parseDateAny(v: any): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v ?? "").trim();
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

function stripWeirdSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function pickField(obj: any, candidates: string[]) {
  const keys = Object.keys(obj ?? {});
  const map: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) map[normKey(keys[i])] = keys[i];

  for (let i = 0; i < candidates.length; i++) {
    const c = normKey(candidates[i]);
    if (map[c]) return obj[map[c]];
  }
  return "";
}

async function readXlsx(path: string) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (status ${res.status})`);
  const buffer = await res.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetNames = wb.SheetNames || [];
  if (sheetNames.length === 0) return { rows: [] as any[] };

  // mejor hoja
  let bestRows: any[] = [];
  let bestScore = -1;

  for (let i = 0; i < sheetNames.length; i++) {
    const name = sheetNames[i];
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];

    const keys = Object.keys(rows[0] ?? {});
    const keySet = new Set(keys.map((k) => normKey(k)));
    let score = keys.length + Math.min(rows.length, 200) / 10;
    if (keySet.has("empresa") || keySet.has("hotel")) score += 40;
    if (keySet.has("bonboy") || keySet.has("membership")) score += 30;
    if (keySet.has("cantidad") || keySet.has("qty")) score += 20;
    if (keySet.has("fecha") || keySet.has("date")) score += 10;

    if (score > bestScore) {
      bestScore = score;
      bestRows = rows;
    }
  }

  return { rows: bestRows };
}

function fmtInt(n: number) {
  return (n || 0).toLocaleString("es-AR");
}

function fmtPct(n: number) {
  if (!Number.isFinite(n)) return "—";
  return (n * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%";
}

function tierLabel(raw: string) {
  const s = stripWeirdSpaces(raw || "").toUpperCase();
  if (!s) return "—";

  // normalizamos a labels consistentes
  if (s.includes("AMB")) return "Ambassador Elite (AMB)";
  if (s.includes("SILVER") || s.includes("SLR")) return "Silver Elite (SLR)";
  if (s.includes("PLATINUM") || s.includes("PLT")) return "Platinum Elite (PLT)";
  if (s.includes("TITANIUM") || s.includes("TTM")) return "Titanium Elite (TTM)";
  if (s.includes("GOLD") || s.includes("GLD")) return "Gold Elite (GLD)";
  if (s.includes("MEMBER") || s.includes("MRD")) return "Member (MRD)";
  return raw;
}

function tierKeyForColor(label: string) {
  // mapea “Member (MRD)” -> “MEMBER (MRD)”
  return stripWeirdSpaces(label).toUpperCase();
}

export default function MembershipSummary({ year, baseYear, filePath, hotelFilter }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("YEAR");
  const [month, setMonth] = useState<number>(1); // 1..12 cuando mode=MONTH

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);

    readXlsx(filePath)
      .then(({ rows: raw }) => {
        if (!alive) return;

        const parsed: Row[] = (raw || []).map((r: any) => {
          const dt = parseDateAny(pickField(r, ["Fecha", "date", "Día", "Dia"]));
          const yy = dt ? dt.getFullYear() : null;
          const mm = dt ? dt.getMonth() + 1 : null;

          const hotel = stripWeirdSpaces(
            String(pickField(r, ["Empresa", "Hotel", "empresa", "hotel"]) || "")
          ).toUpperCase();

          const tier = tierLabel(String(pickField(r, ["Bonboy", "Membership", "Tier", "bonboy"]) || ""));

          const qty = safeNum(pickField(r, ["Cantidad", "qty", "Qty", "Cantidad Total"]));

          return { date: dt, year: yy, month: mm, hotel, tier, qty };
        });

        setRows(parsed);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(String(e?.message || e));
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  // Filtrado por hotel
  const rowsHotel = useMemo(() => {
    const hf = (hotelFilter || "JCR").toUpperCase();

    let out = rows.filter((r) => r.qty > 0);

    if (hf === "JCR") {
      const allow = new Set(JCR_HOTELS);
      out = out.filter((r) => allow.has(r.hotel));
    } else {
      out = out.filter((r) => r.hotel === hf);
    }

    return out;
  }, [rows, hotelFilter]);

  // Años disponibles (para debug y para UI si querés)
  const availableYears = useMemo(() => {
    const s = new Set<number>();
    for (let i = 0; i < rowsHotel.length; i++) {
      const y = rowsHotel[i].year;
      if (typeof y === "number") s.add(y);
    }
    return Array.from(s).sort((a, b) => b - a);
  }, [rowsHotel]);

  // Suma por tier según año y modo
  const sumMap = (yy: number) => {
    const m = new Map<string, number>();

    for (let i = 0; i < rowsHotel.length; i++) {
      const r = rowsHotel[i];
      if (r.year !== yy) continue;

      if (mode === "MONTH") {
        if (r.month !== month) continue;
      }

      const k = r.tier || "—";
      m.set(k, (m.get(k) || 0) + r.qty);
    }
    return m;
  };

  const curMap = useMemo(() => sumMap(year), [year, mode, month, rowsHotel]);       // ok aunque sumMap no esté en deps: es función local pura
  const baseMap = useMemo(() => sumMap(baseYear), [baseYear, mode, month, rowsHotel]);

  // Keys unificados (sin spread de iterators)
  const tierKeys = useMemo(() => {
    const set = new Set<string>();
    Array.from(curMap.keys()).forEach((k) => set.add(k));
    Array.from(baseMap.keys()).forEach((k) => set.add(k));
    return Array.from(set);
  }, [curMap, baseMap]);

  // Lista final con porcentajes
  const list = useMemo(() => {
    const arr = tierKeys
      .map((k) => {
        const cur = curMap.get(k) || 0;
        const base = baseMap.get(k) || 0;
        return { k, cur, base };
      })
      .sort((a, b) => b.cur - a.cur);
    return arr;
  }, [tierKeys, curMap, baseMap]);

  const totalCur = useMemo(() => {
    const vals = Array.from(curMap.values());
    let t = 0;
    for (let i = 0; i < vals.length; i++) t += vals[i];
    return t;
  }, [curMap]);

  const totalBase = useMemo(() => {
    const vals = Array.from(baseMap.values());
    let t = 0;
    for (let i = 0; i < vals.length; i++) t += vals[i];
    return t;
  }, [baseMap]);

  const delta = useMemo(() => {
    if (totalBase <= 0) return null;
    return (totalCur - totalBase) / totalBase;
  }, [totalCur, totalBase]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        Cargando membership…
      </div>
    );
  }

  if (err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        <div style={{ fontWeight: 900 }}>Error cargando membership</div>
        <div style={{ opacity: 0.8, marginTop: 6 }}>{err}</div>
      </div>
    );
  }

  if (rowsHotel.length === 0) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
        <div style={{ fontWeight: 900 }}>Sin datos</div>
        <div style={{ opacity: 0.8, marginTop: 6 }}>
          No hay filas para el filtro actual. Hotel: {hotelFilter}. Años detectados:{" "}
          {availableYears.length ? availableYears.join(", ") : "—"}.
        </div>
      </div>
    );
  }

  // UI: tabs Año / meses
  const Tabs = () => {
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          className={mode === "YEAR" ? "btnPrimary" : "btnOutline"}
          type="button"
          onClick={() => setMode("YEAR")}
          style={{ borderRadius: 999, padding: ".5rem .85rem" }}
        >
          Año
        </button>

        {MONTHS.map((m, idx) => {
          const mm = idx + 1;
          const active = mode === "MONTH" && month === mm;
          return (
            <button
              key={m}
              className={active ? "btnPrimary" : "btnOutline"}
              type="button"
              onClick={() => {
                setMode("MONTH");
                setMonth(mm);
              }}
              style={{ borderRadius: 999, padding: ".5rem .75rem" }}
            >
              {m}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="card" style={{ padding: "1.1rem", borderRadius: 26 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: "1.2rem" }}>
            Membership ({hotelFilter || "JCR"})
          </div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>
            {mode === "YEAR" ? "Acumulado" : `Mes: ${MONTHS[month - 1]}`} {year} · vs {baseYear}
          </div>
        </div>

        <div style={{ maxWidth: "100%", overflowX: "auto" }}>
          <Tabs />
        </div>
      </div>

      {/* Body responsive */}
      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr)",
          gap: "1rem",
        }}
      >
        {/* Total card */}
        <div
          style={{
            background: "rgba(0,0,0,.03)",
            borderRadius: 22,
            padding: "1.2rem",
            border: "1px solid rgba(0,0,0,.06)",
          }}
        >
          <div style={{ opacity: 0.75, fontWeight: 800 }}>Total</div>
          <div style={{ fontSize: "3rem", fontWeight: 950, lineHeight: 1.05, marginTop: ".35rem" }}>
            {fmtInt(totalCur)}
          </div>
          <div style={{ marginTop: ".85rem" }}>
            {delta === null ? (
              <span style={{ opacity: 0.75 }}>Sin base {baseYear}</span>
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: ".5rem .8rem",
                  borderRadius: 999,
                  fontWeight: 900,
                  border: "1px solid rgba(0,0,0,.12)",
                  background: delta >= 0 ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.12)",
                }}
              >
                {delta >= 0 ? "+" : ""}
                {fmtPct(delta)} vs {baseYear}
              </span>
            )}
          </div>

          <div style={{ marginTop: ".9rem", opacity: 0.75 }}>Composición</div>
        </div>

        {/* Bars */}
        <div style={{ display: "grid", gap: ".9rem" }}>
          {list.map((it) => {
            const share = totalCur > 0 ? it.cur / totalCur : 0;
            const colorKey = tierKeyForColor(it.k);
            const bg = TIER_COLORS[colorKey] || "linear-gradient(90deg, rgba(0,0,0,.45), rgba(0,0,0,.15))";

            return (
              <div
                key={it.k}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) 90px",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {it.k}
                    </div>
                    <div style={{ opacity: 0.8, fontWeight: 800 }}>{fmtPct(share)}</div>
                  </div>

                  {/* Barra (más chica, como pediste) */}
                  <div style={{ height: 12, background: "rgba(0,0,0,.06)", borderRadius: 999, overflow: "hidden", marginTop: 8 }}>
                    <div style={{ width: `${Math.min(100, Math.max(2, share * 100))}%`, height: "100%", background: bg }} />
                  </div>
                </div>

                <div style={{ textAlign: "right", fontWeight: 950 }}>{fmtInt(it.cur)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
