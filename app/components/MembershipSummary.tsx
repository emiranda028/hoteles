"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Row = {
  hotel: string;        // MARRIOTT | SHERATON MDQ | SHERATON BCR
  membership: string;   // texto original
  mkey: string;         // clave normalizada (AMB/TTM/PLT/GLD/SLR/MRD/OTH)
  qty: number;
  year: number;
  month: number;        // 1..12
};

type Props = {
  title: string;
  year: number;
  baseYear: number;
  allowedHotels: string[];   // JCR_HOTELS
  filePath?: string;         // default /data/jcr_membership.xlsx
};

const DEFAULT_FILE = "/data/jcr_membership.xlsx";

// Normalización Empresa -> Hotel canónico
function normalizeHotel(raw: any): string {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return "";

  if (s === "MARRIOTT" || s.includes("MARRIOTT")) return "MARRIOTT";
  if (s.includes("SHERATON") && (s.includes("MDQ") || s.includes("MAR DEL PLATA"))) return "SHERATON MDQ";
  if (s.includes("SHERATON") && (s.includes("BCR") || s.includes("BARILOCHE"))) return "SHERATON BCR";

  // si ya viene canónico
  if (s === "SHERATON MDQ" || s === "SHERATON BCR") return s;

  return s;
}

function safeNum(v: any) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const norm = s.replace(/\./g, "").replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

function parseAnyDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  // excel serial
  if (typeof v === "number" && v > 20000 && v < 60000) {
    // XLSX date serial: days since 1899-12-30
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return new Date(d.y, d.m - 1, d.d);
  }

  const s = String(v).trim();

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

function normalizeMembershipKey(raw: string) {
  const s = (raw ?? "").toString().toUpperCase();
  if (s.includes("(AMB)") || s.includes("AMBASSADOR")) return "AMB";
  if (s.includes("(TTM)") || s.includes("TITANIUM")) return "TTM";
  if (s.includes("(PLT)") || s.includes("PLATINUM")) return "PLT";
  if (s.includes("(GLD)") || s.includes("GOLD")) return "GLD";
  if (s.includes("(SLR)") || s.includes("SILVER")) return "SLR";
  if (s.includes("(MRD)") || s.includes("MEMBER")) return "MRD";
  return "OTH";
}

function labelMembershipKey(k: string) {
  if (k === "AMB") return "Ambassador";
  if (k === "TTM") return "Titanium";
  if (k === "PLT") return "Platinum";
  if (k === "GLD") return "Gold";
  if (k === "SLR") return "Silver";
  if (k === "MRD") return "Member";
  return "Otros";
}

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("es-AR");
}
function deltaPct(cur: number, base: number) {
  if (!base) return 0;
  return (cur / base - 1) * 100;
}
function deltaLabelPct(cur: number, base: number) {
  if (!base) return "—";
  const d = deltaPct(cur, base);
  return `${d >= 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")}%`;
}
function deltaClass(d: number): "up" | "down" | "flat" {
  if (d > 0.00001) return "up";
  if (d < -0.00001) return "down";
  return "flat";
}

// Colores por key (mantiene identidad visual)
const KEY_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  AMB: { bg: "rgba(245,158,11,0.16)", border: "rgba(245,158,11,0.35)", text: "rgba(245,158,11,0.95)" },
  TTM: { bg: "rgba(168,85,247,0.14)", border: "rgba(168,85,247,0.34)", text: "rgba(168,85,247,0.95)" },
  PLT: { bg: "rgba(59,130,246,0.14)", border: "rgba(59,130,246,0.34)", text: "rgba(59,130,246,0.95)" },
  GLD: { bg: "rgba(234,179,8,0.12)", border: "rgba(234,179,8,0.30)", text: "rgba(234,179,8,0.95)" },
  SLR: { bg: "rgba(148,163,184,0.14)", border: "rgba(148,163,184,0.30)", text: "rgba(226,232,240,0.90)" },
  MRD: { bg: "rgba(16,185,129,0.14)", border: "rgba(16,185,129,0.30)", text: "rgba(16,185,129,0.95)" },
  OTH: { bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.16)", text: "rgba(255,255,255,0.85)" },
};

// Elegir la mejor hoja (tu idea, bien)
type ReadResult = { rows: any[]; sheetName: string; sheetNames: string[] };

function scoreRows(rows: any[]) {
  if (!rows || rows.length === 0) return 0;

  const keys = Object.keys(rows[0] ?? {});
  const keySet = new Set(keys.map((k) => String(k).trim().toLowerCase()));

  const hasEmpresa = keySet.has("empresa");
  const hasBonboy = keySet.has("bonboy") || keySet.has("membership");
  const hasCantidad = keySet.has("cantidad") || keySet.has("qty") || keySet.has("cant");
  const hasFecha = keySet.has("fecha") || keySet.has("date") || keySet.has("día") || keySet.has("dia");

  let score = keys.length;
  if (hasEmpresa) score += 50;
  if (hasBonboy) score += 25;
  if (hasCantidad) score += 25;
  if (hasFecha) score += 15;

  score += Math.min(rows.length, 200) / 10;
  return score;
}

async function readXlsxFromPublic(path?: string): Promise<ReadResult> {
  if (!path) throw new Error("No se pudo cargar: filePath está vacío/undefined");

  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (status ${res.status})`);

  const buffer = await res.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  const sheetNames = wb.SheetNames ?? [];
  if (sheetNames.length === 0) return { rows: [], sheetName: "", sheetNames: [] };

  let bestSheet = sheetNames[0];
  let bestRows: any[] = [];
  let bestScore = -1;

  for (let i = 0; i < sheetNames.length; i++) {
    const name = sheetNames[i];
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

function monthName(m: number) {
  return ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][m - 1] ?? `Mes ${m}`;
}

export default function MembershipSummary({
  title,
  year,
  baseYear,
  allowedHotels,
  filePath = DEFAULT_FILE,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // filtro por hotel dentro de membership: JCR (suma) o individual
  const [hotelScope, setHotelScope] = useState<"JCR" | "MARRIOTT" | "SHERATON MDQ" | "SHERATON BCR">("JCR");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readXlsxFromPublic(filePath)
      .then(({ rows }) => {
        if (!alive) return;

        const parsed: Row[] = rows
          .map((r: any) => {
            const membershipRaw =
              (r.Bonboy ?? r.bonboy ?? r.Membership ?? r.membership ?? "").toString().trim();
            const qty = safeNum(r.Cantidad ?? r.cantidad ?? r.Qty ?? r.qty ?? r.Cant ?? r.cant ?? 0);

            const hotel = normalizeHotel(r.Empresa ?? r.empresa ?? r.Hotel ?? r.hotel ?? "");
            const d = parseAnyDate(r.Fecha ?? r.fecha ?? r.Date ?? r.date ?? r.Dia ?? r.Día ?? r.dia ?? r["Día"]);

            if (!membershipRaw || !hotel || !d) return null;

            const y = d.getFullYear();
            const m = d.getMonth() + 1;

            // solo JCR
            if (!allowedHotels.includes(hotel)) return null;

            return {
              hotel,
              membership: membershipRaw,
              mkey: normalizeMembershipKey(membershipRaw),
              qty,
              year: y,
              month: m,
            } as Row;
          })
          .filter(Boolean) as Row[];

        setRows(parsed);
      })
      .catch((e: any) => {
        console.error("MembershipSummary error:", e);
        setErr(e?.message ?? "Error leyendo membership");
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => {
      alive = false;
    };
  }, [filePath, allowedHotels]);

  const hotelsForFilter = useMemo(() => {
    return ["JCR", ...allowedHotels] as Array<"JCR" | "MARRIOTT" | "SHERATON MDQ" | "SHERATON BCR">;
  }, [allowedHotels]);

  const scopedRows = useMemo(() => {
    const base = rows.filter((r) => r.year === year || r.year === baseYear);

    if (hotelScope === "JCR") return base;
    return base.filter((r) => r.hotel === hotelScope);
  }, [rows, year, baseYear, hotelScope]);

  const yearRows = useMemo(() => scopedRows.filter((r) => r.year === year), [scopedRows, year]);
  const baseRows = useMemo(() => scopedRows.filter((r) => r.year === baseYear), [scopedRows, baseYear]);

  const yearsPresent = useMemo(() => {
    const s = new Set<number>();
    rows.forEach((r) => s.add(r.year));
    const arr = Array.from(s).sort((a, b) => b - a);
    return arr;
  }, [rows]);

  // Totales por membership key
  function sumByKey(list: Row[]) {
    const map = new Map<string, number>();
    for (let i = 0; i < list.length; i++) {
      const k = list[i].mkey;
      map.set(k, (map.get(k) ?? 0) + (list[i].qty ?? 0));
    }
    return map;
  }

  const curMap = useMemo(() => sumByKey(yearRows), [yearRows]);
  const baseMap = useMemo(() => sumByKey(baseRows), [baseRows]);

  // UNION keys sin iterables spread (evita error TS target)
  const keys = useMemo(() => {
    const arr: string[] = [];
    const a = Array.from(curMap.keys());
    const b = Array.from(baseMap.keys());
    for (let i = 0; i < a.length; i++) arr.push(a[i]);
    for (let i = 0; i < b.length; i++) arr.push(b[i]);
    const uniq = Array.from(new Set(arr));
    // orden “lógico”
    const order = ["AMB","TTM","PLT","GLD","SLR","MRD","OTH"];
    uniq.sort((x, y) => order.indexOf(x) - order.indexOf(y));
    return uniq;
  }, [curMap, baseMap]);

  const curTotal = useMemo(() => {
    let s = 0;
    keys.forEach((k) => (s += (curMap.get(k) ?? 0)));
    return s;
  }, [keys, curMap]);

  const baseTotal = useMemo(() => {
    let s = 0;
    keys.forEach((k) => (s += (baseMap.get(k) ?? 0)));
    return s;
  }, [keys, baseMap]);

  const dTotal = useMemo(() => deltaPct(curTotal, baseTotal), [curTotal, baseTotal]);

  // Serie mensual total (para mini gráfico)
  const monthSeries = useMemo(() => {
    const make = (list: Row[]) => {
      const m = new Array(12).fill(0);
      for (let i = 0; i < list.length; i++) {
        const idx = Math.max(0, Math.min(11, (list[i].month ?? 1) - 1));
        m[idx] += list[i].qty ?? 0;
      }
      return m;
    };
    return {
      cur: make(yearRows),
      base: make(baseRows),
    };
  }, [yearRows, baseRows]);

  const maxMonth = useMemo(() => Math.max(1, ...monthSeries.cur, ...monthSeries.base), [monthSeries]);

  // Data para gráfico principal: barras por membership (comparativa)
  const barData = useMemo(() => {
    return keys.map((k) => {
      const curVal = curMap.get(k) ?? 0;
      const baseVal = baseMap.get(k) ?? 0;
      const d = deltaPct(curVal, baseVal);
      return { k, curVal, baseVal, d };
    });
  }, [keys, curMap, baseMap]);

  if (loading) {
    return (
      <div>
        <div className="cardTitle">{title}</div>
        <div className="cardNote" style={{ marginTop: ".35rem" }}>Cargando membership…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div>
        <div className="cardTitle">{title}</div>
        <div className="delta down" style={{ width: "fit-content", marginTop: ".6rem" }}>
          {err}
        </div>
      </div>
    );
  }

  // Si no hay filas para esos años, lo explicitamos con diagnóstico útil
  const hasAny = scopedRows.length > 0;
  const hasCur = yearRows.length > 0;
  const hasBase = baseRows.length > 0;

  if (!hasAny || (!hasCur && !hasBase)) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div className="cardTitle">{title}</div>
            <div className="cardNote" style={{ marginTop: ".35rem" }}>
              Sin datos para {hotelScope === "JCR" ? "JCR" : hotelScope} en {year} / {baseYear}.
            </div>
          </div>

          <div className="pillRow">
            {hotelsForFilter.map((h) => (
              <button
                key={h}
                type="button"
                className={`pill ${h === hotelScope ? "active" : ""}`}
                onClick={() => setHotelScope(h)}
              >
                {h === "JCR" ? "JCR (suma)" : h}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: ".85rem", color: "var(--muted)", fontSize: ".95rem" }}>
          Años disponibles en el Excel: {yearsPresent.length ? yearsPresent.join(", ") : "—"}.
          <div style={{ marginTop: ".35rem" }}>
            Si el año existe pero igual dice “sin datos”, suele ser por:
            <ul style={{ marginTop: ".35rem" }}>
              <li>La columna <strong>Fecha</strong> viene vacía o no es fecha real.</li>
              <li>La columna <strong>Empresa</strong> no matchea (ej: “Marriott Buenos Aires” vs “MARRIOTT”).</li>
              <li>El archivo no está en <code>public/data/jcr_membership.xlsx</code>.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header + filtro hotel */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <div className="cardTitle">{title}</div>
          <div className="cardNote" style={{ marginTop: ".35rem" }}>
            {hotelScope === "JCR" ? "JCR (suma de 3 hoteles)" : `Hotel: ${hotelScope}`} — Acumulado {year} · vs {baseYear}
          </div>
        </div>

        <div className="pillRow" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          {hotelsForFilter.map((h) => (
            <button
              key={h}
              type="button"
              className={`pill ${h === hotelScope ? "active" : ""}`}
              onClick={() => setHotelScope(h)}
            >
              {h === "JCR" ? "JCR (suma)" : h}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs principales */}
      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "1rem",
        }}
      >
        <div className="kpiCard">
          <div className="kpiLabel">Total membresías</div>
          <div className="kpiValue">{fmtInt(curTotal)}</div>
          <div className={`delta ${deltaClass(dTotal)}`} style={{ width: "fit-content" }}>
            {deltaLabelPct(curTotal, baseTotal)} vs {baseYear}
          </div>
        </div>

        <div className="kpiCard">
          <div className="kpiLabel">Total {baseYear}</div>
          <div className="kpiValue">{fmtInt(baseTotal)}</div>
          <div className="kpiHint">Base comparativa</div>
        </div>

        <div className="kpiCard">
          <div className="kpiLabel">Estado datos</div>
          <div className="kpiValue" style={{ fontSize: "1.35rem" }}>
            {hasCur ? "OK" : "Falta"} / {hasBase ? "OK" : "Falta"}
          </div>
          <div className="kpiHint">
            Filas {year}: {fmtInt(yearRows.length)} · Filas {baseYear}: {fmtInt(baseRows.length)}
          </div>
        </div>
      </div>

      {/* Chips por membership */}
      <div style={{ marginTop: "1rem", display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
        {keys.map((k) => {
          const st = KEY_STYLE[k] ?? KEY_STYLE.OTH;
          const curVal = curMap.get(k) ?? 0;
          return (
            <div
              key={k}
              style={{
                borderRadius: 999,
                padding: "0.4rem 0.65rem",
                border: `1px solid ${st.border}`,
                background: st.bg,
                color: st.text,
                fontWeight: 900,
                fontSize: ".92rem",
              }}
              title={labelMembershipKey(k)}
            >
              {labelMembershipKey(k)} · {fmtInt(curVal)}
            </div>
          );
        })}
      </div>

      {/* Gráfico comparativo por membership (barras horizontales) */}
      <div style={{ marginTop: "1rem" }}>
        <div style={{ fontWeight: 950, marginBottom: ".5rem" }}>Distribución por membresía</div>

        <div style={{ display: "grid", gap: ".55rem" }}>
          {barData.map(({ k, curVal, baseVal, d }) => {
            const st = KEY_STYLE[k] ?? KEY_STYLE.OTH;
            const max = Math.max(1, ...barData.map((x) => Math.max(x.curVal, x.baseVal)));
            const wCur = Math.round((curVal / max) * 100);
            const wBase = Math.round((baseVal / max) * 100);

            return (
              <div key={k} style={{ display: "grid", gap: ".25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                  <div style={{ fontWeight: 900 }}>
                    {labelMembershipKey(k)}
                  </div>
                  <div className={`delta ${deltaClass(d)}`} style={{ width: "fit-content" }}>
                    {deltaLabelPct(curVal, baseVal)} vs {baseYear}
                  </div>
                </div>

                <div style={{ display: "grid", gap: ".25rem" }}>
                  {/* base */}
                  <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                    <div style={{ width: 58, color: "var(--muted)", fontWeight: 800, fontSize: ".9rem" }}>
                      {baseYear}
                    </div>
                    <div style={{ flex: 1, height: 10, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                      <div style={{ width: `${wBase}%`, height: "100%", background: "rgba(255,255,255,0.30)" }} />
                    </div>
                    <div style={{ width: 90, textAlign: "right", color: "rgba(255,255,255,0.85)", fontWeight: 900 }}>
                      {fmtInt(baseVal)}
                    </div>
                  </div>

                  {/* current */}
                  <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                    <div style={{ width: 58, color: "var(--muted)", fontWeight: 800, fontSize: ".9rem" }}>
                      {year}
                    </div>
                    <div style={{ flex: 1, height: 10, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                      <div style={{ width: `${wCur}%`, height: "100%", background: st.text }} />
                    </div>
                    <div style={{ width: 90, textAlign: "right", color: "rgba(255,255,255,0.95)", fontWeight: 950 }}>
                      {fmtInt(curVal)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mini gráfico mensual (cur vs base) */}
      <div style={{ marginTop: "1.25rem" }}>
        <div style={{ fontWeight: 950, marginBottom: ".5rem" }}>Evolución mensual (total)</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
            gap: ".5rem",
            alignItems: "end",
          }}
        >
          {new Array(12).fill(0).map((_, i) => {
            const curV = monthSeries.cur[i] ?? 0;
            const baseV = monthSeries.base[i] ?? 0;

            const hCur = Math.max(6, Math.round((curV / maxMonth) * 72));
            const hBase = Math.max(6, Math.round((baseV / maxMonth) * 72));

            return (
              <div key={i} style={{ display: "grid", gap: ".25rem", justifyItems: "center" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "end", height: 76 }}>
                  <div
                    title={`${baseYear} · ${monthName(i + 1)}: ${fmtInt(baseV)}`}
                    style={{
                      width: 10,
                      height: hBase,
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.25)",
                    }}
                  />
                  <div
                    title={`${year} · ${monthName(i + 1)}: ${fmtInt(curV)}`}
                    style={{
                      width: 10,
                      height: hCur,
                      borderRadius: 6,
                      background: "rgba(59,130,246,0.85)",
                    }}
                  />
                </div>
                <div style={{ fontSize: ".72rem", color: "var(--muted)", fontWeight: 800 }}>
                  {i + 1}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: ".6rem", color: "var(--muted)", fontSize: ".9rem" }}>
          Base = barra gris · Año seleccionado = barra azul. (Si querés, después lo dejamos con colores por hotel.)
        </div>
      </div>

      <style jsx>{`
        .pillRow {
          display: flex;
          gap: 0.5rem;
        }
        .pill {
          border-radius: 999px;
          padding: 0.45rem 0.7rem;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          color: rgba(255, 255, 255, 0.9);
          font-weight: 850;
          cursor: pointer;
        }
        .pill.active {
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(255, 255, 255, 0.22);
        }
        .delta {
          border-radius: 999px;
          padding: 0.35rem 0.65rem;
          font-weight: 900;
          font-size: 0.9rem;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
        }
        .delta.up {
          color: rgba(34, 197, 94, 0.95);
        }
        .delta.down {
          color: rgba(248, 113, 113, 0.95);
        }
        .delta.flat {
          color: rgba(255, 255, 255, 0.85);
        }
        .kpiCard {
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.05);
          padding: 1rem;
          display: grid;
          gap: 0.35rem;
        }
        .kpiLabel {
          color: var(--muted);
          font-weight: 900;
        }
        .kpiValue {
          font-size: 2rem;
          font-weight: 950;
          line-height: 1.05;
        }
        .kpiHint {
          color: var(--muted);
          font-size: 0.92rem;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
