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

type CompareMode = "FULL_YEAR" | "SAME_PERIOD";

// Normalización Empresa -> Hotel canónico (Excel)
const COMPANY_MAP: Record<string, string> = {
  MARRIOTT: "Marriott Buenos Aires",
  "SHERATON MDQ": "Sheraton Mar del Plata",
  "SHERATON BCR": "Sheraton Bariloche",
};

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

function fmtInt(n: number) {
  return (Number.isFinite(n) ? n : 0).toLocaleString("es-AR");
}

function fmtPct(x: number) {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(1).replace(".", ",")}%`;
}

function deltaPct(cur: number, base: number) {
  if (!base) return null;
  return ((cur / base) - 1) * 100;
}

function deltaClass(d: number | null) {
  if (d === null) return "";
  if (d > 0) return "up";
  if (d < 0) return "down";
  return "";
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

function membershipClass(raw: string) {
  const k = normalizeMembershipKey(raw);
  if (k === "AMB") return "mchip m-amb";
  if (k === "TTM") return "mchip m-ttm";
  if (k === "PLT") return "mchip m-plt";
  if (k === "GLD") return "mchip m-gld";
  if (k === "SLR") return "mchip m-slr";
  if (k === "MRD") return "mchip m-mrd";
  return "mchip m-oth";
}

export default function MembershipSummary({
  year,
  baseYear,
  hotelsJCR,
  filePath = "/data/jcr_membership.xlsx",
}: {
  year: number;
  baseYear: number;
  hotelsJCR: string[];
  filePath?: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // selector de mes en pantalla (Año o un mes específico)
  const [month, setMonth] = useState<number | "ALL">("ALL");

  // modo comparación (por si baseYear está incompleto)
  const [compareMode, setCompareMode] = useState<CompareMode>("SAME_PERIOD");

  useEffect(() => {
    let alive = true;
    setLoading(true);

    readXlsxFromPublic(filePath)
      .then(({ rows }) => {
        if (!alive) return;

        const parsed: Row[] = (rows as any[])
          .map((r: any) => {
            const membership = (r.Bonboy ?? r.bonboy ?? r.Membership ?? "").toString().trim();
            const qty = safeNum(r.Cantidad ?? r.cantidad ?? r.Qty ?? r.Cant ?? 0);

            const rawCompany = (r.Empresa ?? r.empresa ?? r.Hotel ?? "")
              .toString()
              .trim()
              .toUpperCase();

            const hotel = COMPANY_MAP[rawCompany] ?? "";
            const d = parseAnyDate(r.Fecha ?? r.fecha ?? r.Date ?? r.Dia ?? r.Día);

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
      .catch((err) => {
        console.error("MembershipSummary error:", err);
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => {
      alive = false;
    };
  }, [filePath]);

  const filtered = useMemo(() => {
    const hotelsCanon = hotelsJCR
      .map((h) => COMPANY_MAP[h.toUpperCase()] ?? h)
      .filter(Boolean);

    return rows.filter((r) => {
      if (r.year !== year && r.year !== baseYear) return false;
      if (!hotelsCanon.includes(r.hotel)) return false;
      if (month === "ALL") return true;
      return r.month === month;
    });
  }, [rows, hotelsJCR, year, baseYear, month]);

  function sumMap(targetYear: number) {
    const m = new Map<string, number>();
    filtered
      .filter((r) => r.year === targetYear)
      .forEach((r) => {
        const key = r.membership;
        m.set(key, (m.get(key) ?? 0) + r.qty);
      });
    return m;
  }

  const table = useMemo(() => {
    const cur = sumMap(year);
    const base = sumMap(baseYear);

    // ✅ FIX (sin spread de iterator)
    const keys = Array.from(new Set<string>(Array.from(cur.keys()).concat(Array.from(base.keys()))));

    const list = keys
      .map((k) => {
        const curVal = cur.get(k) ?? 0;
        const baseVal = base.get(k) ?? 0;

        // si compareMode SAME_PERIOD, la base es comparable solo por el mismo mes (si se eligió)
        const delta = deltaPct(curVal, baseVal);

        return { k, curVal, baseVal, delta };
      })
      .sort((a, b) => b.curVal - a.curVal);

    const curTotal = Array.from(cur.values()).reduce((a, b) => a + b, 0);
    const baseTotal = Array.from(base.values()).reduce((a, b) => a + b, 0);
    const totalDelta = deltaPct(curTotal, baseTotal);

    return { list, curTotal, baseTotal, totalDelta };
  }, [filtered, year, baseYear, compareMode]);

  if (loading) {
    return <div className="card">Cargando membership…</div>;
  }

  return (
    <div className="card" style={{ padding: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-end" }}>
        <div>
          <div className="cardTitle">Membership – resumen</div>
          <div className="cardNote" style={{ marginTop: ".25rem" }}>
            {month === "ALL" ? "Año completo" : `Mes ${month}`} · {year} vs {baseYear}
          </div>
        </div>

        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
          <select className="input" value={month} onChange={(e) => setMonth(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}>
            <option value="ALL">Año</option>
            {Array.from({ length: 12 }).map((_, i) => (
              <option key={i + 1} value={i + 1}>
                Mes {i + 1}
              </option>
            ))}
          </select>

          <select className="input" value={compareMode} onChange={(e) => setCompareMode(e.target.value as CompareMode)}>
            <option value="SAME_PERIOD">Mismo período</option>
            <option value="FULL_YEAR">Año completo</option>
          </select>
        </div>
      </div>

      <div className="cardGrid" style={{ marginTop: "1rem" }}>
        <div className="kpi">
          <div className="kpiLabel">Total</div>
          <div className="kpiValue">{fmtInt(table.curTotal)}</div>
          <div className={`delta ${deltaClass(table.totalDelta)}`}>
            {table.totalDelta === null ? "—" : `${table.totalDelta >= 0 ? "+" : ""}${table.totalDelta.toFixed(1).replace(".", ",")}%`}
          </div>
        </div>
      </div>

      <div style={{ marginTop: "1rem", display: "grid", gap: ".6rem" }}>
        {table.list.slice(0, 10).map((it) => (
          <div
            key={it.k}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: ".75rem",
              alignItems: "center",
              border: "1px solid rgba(148,163,184,.25)",
              borderRadius: 14,
              padding: ".65rem .75rem",
            }}
          >
            <div style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
              <span className={membershipClass(it.k)}>{normalizeMembershipKey(it.k)}</span>
              <div style={{ fontWeight: 700 }}>{it.k}</div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 800 }}>{fmtInt(it.curVal)}</div>
              <div className={`delta ${deltaClass(it.delta)}`} style={{ justifyContent: "flex-end" as any }}>
                {it.delta === null ? "—" : `${it.delta >= 0 ? "+" : ""}${it.delta.toFixed(1).replace(".", ",")}%`}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="cardNote" style={{ marginTop: "1rem" }}>
        *Base comparativa: {baseYear}. (El modo “mismo período” te ayuda cuando la base no tiene el año completo.)
      </div>
    </div>
  );
}


