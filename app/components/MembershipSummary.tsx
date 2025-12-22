"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  baseYear: number;
  allowedHotels: string[];      // ["MARRIOTT","SHERATON BCR","SHERATON MDQ"]
  filePath: string;            // "/data/jcr_membership.xlsx"
  title?: string;
};

type RowAny = Record<string, any>;

type DetectInfo = {
  hotelKey?: string;
  membershipKey?: string;
  qtyKey?: string;
  dateKey?: string;
  keys: string[];
};

type TierAgg = {
  tier: string;
  code: string;
  qty: number;
  share: number; // 0-1
};

const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR");
const fmtPct = (p01: number) => (p01 * 100).toFixed(1).replace(".", ",") + "%";
const fmtPP = (pp: number) => pp.toFixed(1).replace(".", ",") + " p.p.";

function normKey(s: any) {
  return String(s ?? "").trim().toLowerCase();
}

function normHotel(raw: any) {
  const s = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (s.includes("MARRIOTT")) return "MARRIOTT";
  if (s.includes("BARILOCHE") || s.includes("BCR")) return "SHERATON BCR";
  if (s.includes("MAR DEL PLATA") || s.includes("MDQ")) return "SHERATON MDQ";
  return s;
}

function normTier(raw: any) {
  return String(raw ?? "").trim().replace(/\s+/g, " ");
}

function tierCode(tier: string) {
  const m = tier.match(/\(([^)]+)\)/);
  return (m?.[1] ?? "").trim().toUpperCase();
}

function parseNumber(v: any): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
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

  const s = String(v).trim();
  if (!s) return null;

  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function detectColumns(rows: RowAny[]): DetectInfo {
  const keys = Object.keys(rows?.[0] ?? {});
  const pick = (cands: string[]) => {
    for (const c of cands) {
      const real = keys.find((k) => normKey(k) === c.toLowerCase());
      if (real) return real;
    }
    return undefined;
  };

  const hotelKey = pick(["empresa", "hotel", "property", "propiedad"]);
  const membershipKey = pick(["bonboy", "membership", "tier", "membresia", "membresía"]);
  const qtyKey = pick(["cantidad", "qty", "quantity", "count", "total"]);
  const dateKey = pick(["fecha", "date", "day"]);

  return { hotelKey, membershipKey, qtyKey, dateKey, keys };
}

function monthLabelEs(m: number) {
  const names = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return names[m - 1] ?? String(m);
}

type Scope = "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ";

export default function MembershipSummary({
  year,
  baseYear,
  allowedHotels,
  filePath,
  title = "Membership (JCR)",
}: Props) {
  const [raw, setRaw] = useState<RowAny[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [scope, setScope] = useState<Scope>("JCR");
  const [mode, setMode] = useState<"YEAR" | "MONTH">("YEAR");
  const [month, setMonth] = useState<number>(1);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError("");

        const r = await readXlsxFromPublic(filePath);
        // r.sheetName existe (lo garantiza xlsxClient)
        const rows = (r.rows ?? []) as RowAny[];

        if (!alive) return;
        setRaw(rows);
      } catch (e: any) {
        console.error(e);
        if (!alive) return;
        setRaw([]);
        setError(e?.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [filePath]);

  const det = useMemo(() => detectColumns(raw), [raw]);

  const filtered = useMemo(() => {
    if (!raw.length) return [];

    const { hotelKey, membershipKey, qtyKey, dateKey } = det;
    if (!hotelKey || !membershipKey || !qtyKey || !dateKey) return [];

    const scopeHotel = scope === "JCR" ? null : scope;

    return raw
      .map((r) => {
        const h = normHotel(r[hotelKey]);
        const tier = normTier(r[membershipKey]);
        const qty = parseNumber(r[qtyKey]);
        const d = parseAnyDate(r[dateKey]);
        if (!h || !tier || !d) return null;

        const yy = d.getFullYear();
        const mm = d.getMonth() + 1;

        return { hotel: h, tier, qty, year: yy, month: mm };
      })
      .filter(Boolean)
      .filter((x: any) => allowedHotels.includes(x.hotel))
      .filter((x: any) => (scopeHotel ? x.hotel === scopeHotel : true))
      .filter((x: any) => x.year === year || x.year === baseYear) // necesitamos ambos para comparar
      .filter((x: any) => (mode === "MONTH" ? x.month === month : true)) as any[];
  }, [raw, det, allowedHotels, scope, year, baseYear, mode, month]);

  const tiersAgg = useMemo(() => {
    const mapCur = new Map<string, number>();
    const mapBase = new Map<string, number>();

    for (const r of filtered as any[]) {
      const key = r.tier;
      if (r.year === year) mapCur.set(key, (mapCur.get(key) ?? 0) + r.qty);
      if (r.year === baseYear) mapBase.set(key, (mapBase.get(key) ?? 0) + r.qty);
    }

    const totalCur = Array.from(mapCur.values()).reduce((a, b) => a + b, 0);
    const totalBase = Array.from(mapBase.values()).reduce((a, b) => a + b, 0);

    const tiers = Array.from(new Set([...mapCur.keys(), ...mapBase.keys()])).sort();

    const cur: TierAgg[] = tiers.map((t) => ({
      tier: t,
      code: tierCode(t),
      qty: mapCur.get(t) ?? 0,
      share: totalCur ? (mapCur.get(t) ?? 0) / totalCur : 0,
    }));

    const base: TierAgg[] = tiers.map((t) => ({
      tier: t,
      code: tierCode(t),
      qty: mapBase.get(t) ?? 0,
      share: totalBase ? (mapBase.get(t) ?? 0) / totalBase : 0,
    }));

    return { cur, base, totalCur, totalBase };
  }, [filtered, year, baseYear]);

  const monthsAvailable = useMemo(() => {
    const set = new Set<number>();
    for (const r of filtered as any[]) {
      if (r.year === year) set.add(r.month);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [filtered, year]);

  return (
    <section className="section" style={{ marginTop: "1rem" }}>
      <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 900 }}>{title}</div>

      <div className="card" style={{ padding: "1rem", borderRadius: 18, marginTop: ".75rem" }}>
        <div style={{ display: "grid", gap: ".75rem", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
          <div>
            <div style={{ fontSize: ".85rem", opacity: 0.75 }}>Scope</div>
            <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} style={{ width: "100%", padding: ".55rem", borderRadius: 12 }}>
              <option value="JCR">JCR (Consolidado)</option>
              <option value="MARRIOTT">MARRIOTT</option>
              <option value="SHERATON BCR">SHERATON BCR</option>
              <option value="SHERATON MDQ">SHERATON MDQ</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: ".85rem", opacity: 0.75 }}>Modo</div>
            <select value={mode} onChange={(e) => setMode(e.target.value as any)} style={{ width: "100%", padding: ".55rem", borderRadius: 12 }}>
              <option value="YEAR">Año</option>
              <option value="MONTH">Mes</option>
            </select>
          </div>

          {mode === "MONTH" && (
            <div>
              <div style={{ fontSize: ".85rem", opacity: 0.75 }}>Mes</div>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ width: "100%", padding: ".55rem", borderRadius: 12 }}>
                {(monthsAvailable.length ? monthsAvailable : [1,2,3,4,5,6,7,8,9,10,11,12]).map((m) => (
                  <option key={m} value={m}>{monthLabelEs(m)}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {loading && <div style={{ marginTop: ".9rem", opacity: 0.8 }}>Cargando membership…</div>}
        {!loading && error && <div style={{ marginTop: ".9rem", color: "#b91c1c" }}>{error}</div>}

        {!loading && !error && !(tiersAgg.cur.length || tiersAgg.base.length) && (
          <div style={{ marginTop: ".9rem", opacity: 0.8 }}>
            Sin datos para el filtro actual. Keys detectadas: {det.keys.join(", ")}
          </div>
        )}

        {!loading && !error && (tiersAgg.cur.length || tiersAgg.base.length) && (
          <>
            <div style={{ display: "grid", gap: ".75rem", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginTop: "1rem" }}>
              <div className="kpi">
                <div className="kpiLabel">Total {year}</div>
                <div className="kpiValue">{fmtInt(tiersAgg.totalCur)}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">Total {baseYear}</div>
                <div className="kpiValue">{fmtInt(tiersAgg.totalBase)}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">Dif.</div>
                <div className="kpiValue">{fmtInt(tiersAgg.totalCur - tiersAgg.totalBase)}</div>
              </div>
              <div className="kpi">
                <div className="kpiLabel">Δ share top tier</div>
                <div className="kpiValue">
                  {(() => {
                    const top = tiersAgg.cur.slice().sort((a, b) => b.share - a.share)[0];
                    if (!top) return "—";
                    const base = tiersAgg.base.find((x) => x.tier === top.tier);
                    const pp = ((top.share ?? 0) - (base?.share ?? 0)) * 100;
                    return fmtPP(pp);
                  })()}
                </div>
              </div>
            </div>

            <div style={{ marginTop: "1rem" }}>
              <div style={{ fontWeight: 900, marginBottom: ".5rem" }}>Mix por tier</div>

              <div style={{ display: "grid", gap: ".5rem" }}>
                {tiersAgg.cur
                  .slice()
                  .sort((a, b) => b.qty - a.qty)
                  .map((t) => {
                    const b = tiersAgg.base.find((x) => x.tier === t.tier);
                    const pp = ((t.share ?? 0) - (b?.share ?? 0)) * 100;

                    return (
                      <div key={t.tier} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: ".5rem", alignItems: "center", padding: ".55rem .65rem", borderRadius: 14, background: "rgba(0,0,0,.03)" }}>
                        <div style={{ fontWeight: 800 }}>{t.tier}</div>
                        <div style={{ opacity: 0.85 }}>{fmtInt(t.qty)}</div>
                        <div style={{ opacity: 0.85 }}>{fmtPct(t.share)}</div>
                        <div style={{ fontWeight: 900, color: pp >= 0 ? "#15803d" : "#b91c1c" }}>
                          {pp >= 0 ? "+" : ""}{fmtPP(pp)}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
