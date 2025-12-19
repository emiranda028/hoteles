"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  baseYear: number;
  hotelsJCR: string[];
  filePath: string;
};

type Row = {
  bomboy: string;
  cantidad: number;
  empresa: string;
  year: number;
};

function norm(s: any) {
  return String(s ?? "").trim();
}
function toNumber(v: any) {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function yearFromDateAny(v: any): number {
  if (!v) return 0;
  if (v instanceof Date && !isNaN(v.getTime())) return v.getFullYear();
  const s = String(v).trim();
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return Number(m1[3]);
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m2) return Number(m2[1]);
  const m3 = s.match(/(\d{4})/);
  return m3 ? Number(m3[1]) : 0;
}

function membershipColor(name: string) {
  const n = name.toUpperCase();
  if (n.includes("AMB")) return "#6EC1FF";
  if (n.includes("TTM") || n.includes("TIT")) return "#4D4D4D";
  if (n.includes("PLT") || n.includes("PLAT")) return "#BFC5CC";
  if (n.includes("GLD") || n.includes("GOLD")) return "#D6B44C";
  if (n.includes("SLR") || n.includes("SILV")) return "#A8AEB6";
  if (n.includes("MRD") || n.includes("MEMBER")) return "#E53935";
  return "#7C8AA0";
}

/** ✅ union keys SIN spread de iteradores */
function unionKeysFromMaps(cur: Map<string, number>, base: Map<string, number>) {
  const set = new Set<string>();
  cur.forEach((_v, k) => set.add(k));
  base.forEach((_v, k) => set.add(k));
  return Array.from(set);
}

export default function MembershipSummary({ year, baseYear, hotelsJCR, filePath }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setError(null);
        const json = await readXlsxFromPublic(filePath);

        const parsed: Row[] = (json as any[]).map((r) => {
          const bomboy = norm(r.Bomboy ?? r.BOMBOY);
          const empresa = norm(r.Empresa ?? r.EMPRESA);
          const cantidad = toNumber(r.Cantidad ?? r.CANTIDAD);
          const fecha = norm(r.Fecha ?? r.FECHA);

          return { bomboy, empresa, cantidad, year: yearFromDateAny(fecha) };
        });

        const filtered = parsed.filter(
          (r) => r.bomboy && r.empresa && hotelsJCR.includes(r.empresa) && Number.isFinite(r.cantidad)
        );

        if (mounted) setRows(filtered);
      } catch (e: any) {
        if (mounted) setError(e?.message ?? "Error leyendo Excel");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [filePath, hotelsJCR]);

  const summary = useMemo(() => {
    function sumMap(y: number) {
      const map = new Map<string, number>();
      rows.forEach((r) => {
        if (r.year !== y) return;
        map.set(r.bomboy, (map.get(r.bomboy) ?? 0) + r.cantidad);
      });
      return map;
    }

    const cur = sumMap(year);
    const base = sumMap(baseYear);

    const keys = unionKeysFromMaps(cur, base);

    const list = keys
      .map((k) => {
        const curVal = cur.get(k) ?? 0;
        const baseVal = base.get(k) ?? 0;
        const diff = curVal - baseVal;
        const pct = baseVal > 0 ? (diff / baseVal) * 100 : null;
        return { k, curVal, baseVal, diff, pct };
      })
      .sort((a, b) => b.curVal - a.curVal);

    const totalCur = list.reduce((a, x) => a + x.curVal, 0);
    const totalBase = list.reduce((a, x) => a + x.baseVal, 0);

    return { list, totalCur, totalBase };
  }, [rows, year, baseYear]);

  return (
    <div className="card" style={{ width: "100%" }}>
      <div className="cardTop">
        <div className="cardTitle">Membership (JCR) – distribución y variación</div>
        <div className="cardNote">
          Consolidado {year} vs {baseYear} (Excel)
        </div>
      </div>

      {error && (
        <div className="delta down" style={{ marginTop: ".75rem" }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: "1.25rem", marginTop: "1rem" }}>
        {/* Lista + barras */}
        <div className="card" style={{ margin: 0 }}>
          <div className="cardTop">
            <div className="cardTitle">Mix por membresía</div>
            <div className="cardNote">
              Total {year}: <strong>{summary.totalCur.toLocaleString("es-AR")}</strong>
              {" · "}
              {baseYear}: <strong>{summary.totalBase.toLocaleString("es-AR")}</strong>
            </div>
          </div>

          <div style={{ display: "grid", gap: ".65rem", marginTop: ".9rem" }}>
            {summary.list.map((x) => {
              const color = membershipColor(x.k);
              const share = summary.totalCur > 0 ? x.curVal / summary.totalCur : 0;

              return (
                <div key={x.k} style={{ display: "grid", gap: ".35rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", alignItems: "baseline" }}>
                    <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: color, display: "inline-block" }} />
                      <div style={{ fontWeight: 800 }}>{x.k}</div>
                      <div style={{ color: "var(--muted)", fontSize: ".85rem" }}>
                        {x.curVal.toLocaleString("es-AR")}
                        {x.baseVal > 0 ? (
                          <>
                            {" "}
                            · Δ {x.diff >= 0 ? "+" : ""}
                            {x.diff.toLocaleString("es-AR")}
                            {x.pct != null ? ` (${x.pct >= 0 ? "+" : ""}${x.pct.toFixed(1).replace(".", ",")}%)` : ""}
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div style={{ fontWeight: 800 }}>{Math.round(share * 100)}%</div>
                  </div>

                  <div style={{ height: 10, background: "rgba(255,255,255,.06)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, height: "100%", background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tarjeta de variación */}
        <div className="card" style={{ margin: 0 }}>
          <div className="cardTop">
            <div className="cardTitle">Resumen interanual</div>
            <div className="cardNote">Lectura rápida</div>
          </div>

          <div style={{ display: "grid", gap: ".75rem", marginTop: "1rem" }}>
            <div className="kpi">
              <div className="kpiLabel">Total membresías</div>
              <div className="kpiValue">{summary.totalCur.toLocaleString("es-AR")}</div>
              <div className="kpiCap">
                vs {baseYear}: {summary.totalBase.toLocaleString("es-AR")}
              </div>
            </div>

            <div className="kpi">
              <div className="kpiLabel">Variación absoluta</div>
              <div className="kpiValue">
                {(summary.totalCur - summary.totalBase >= 0 ? "+" : "")}
                {(summary.totalCur - summary.totalBase).toLocaleString("es-AR")}
              </div>
              <div className="kpiCap">
                {summary.totalBase > 0
                  ? `${(((summary.totalCur - summary.totalBase) / summary.totalBase) * 100).toFixed(1).replace(".", ",")}%`
                  : "—"}
              </div>
            </div>

            <div className="cardNote" style={{ marginTop: ".5rem" }}>
              Tip: si querés, después le metemos una torta interactiva (Recharts) con el mismo color mapping.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
