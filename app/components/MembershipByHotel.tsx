"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Row = {
  bomboy: string;     // tipo de membresía
  cantidad: number;   // cantidad
  fecha?: string;
  empresa: string;    // hotel
  year: number;
};

type Props = {
  year: number;
  baseYear: number;
  hotelsJCR: string[];
  filePath: string;
  title?: string;
};

function norm(s: any) {
  return String(s ?? "").trim();
}

function toNumber(v: any) {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function yearFromDateAny(v: any): number {
  // soporta "13/12/2025", "2025-12-13", Date, etc.
  if (!v) return 0;
  if (v instanceof Date && !isNaN(v.getTime())) return v.getFullYear();

  const s = String(v).trim();

  // dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) return Number(m1[3]);

  // yyyy-mm-dd
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m2) return Number(m2[1]);

  // fallback: último bloque de 4 dígitos
  const m3 = s.match(/(\d{4})/);
  return m3 ? Number(m3[1]) : 0;
}

function membershipColor(name: string) {
  const n = name.toUpperCase();

  if (n.includes("AMB")) return "#6EC1FF";          // Ambassador celeste
  if (n.includes("TTM") || n.includes("TIT")) return "#4D4D4D"; // Titanium
  if (n.includes("PLT") || n.includes("PLAT")) return "#BFC5CC"; // Platinum gris
  if (n.includes("GLD") || n.includes("GOLD")) return "#D6B44C"; // Gold dorado
  if (n.includes("SLR") || n.includes("SILV")) return "#A8AEB6"; // Silver gris
  if (n.includes("MRD") || n.includes("MEMBER")) return "#E53935"; // Member rojo

  return "#7C8AA0";
}

/** ✅ union keys SIN spread de iteradores */
function unionKeysFromMaps(cur: Map<string, number>, base: Map<string, number>) {
  const set = new Set<string>();
  cur.forEach((_v, k) => set.add(k));
  base.forEach((_v, k) => set.add(k));
  return Array.from(set);
}

export default function MembershipByHotel({
  year,
  baseYear,
  hotelsJCR,
  filePath,
  title = "Membership por hotel",
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setError(null);
        const json = await readXlsxFromPublic(filePath);

        // json = array de filas (objetos con keys según encabezados)
        const parsed: Row[] = (json as any[]).map((r) => {
          const bomboy = norm(r.Bomboy ?? r.BOMBOY ?? r.Membership ?? r.MEMBERSHIP);
          const empresa = norm(r.Empresa ?? r.EMPRESA ?? r.Hotel ?? r.HOTEL);
          const cantidad = toNumber(r.Cantidad ?? r.CANTIDAD ?? r.Qty ?? r.QTY);
          const fecha = norm(r.Fecha ?? r.FECHA ?? r.Date ?? r.DATE);

          return {
            bomboy,
            empresa,
            cantidad,
            fecha,
            year: yearFromDateAny(fecha),
          };
        });

        // filtro hoteles grupo
        const filtered = parsed.filter(
          (r) =>
            r.bomboy &&
            r.empresa &&
            hotelsJCR.includes(r.empresa) &&
            Number.isFinite(r.cantidad)
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

  const perHotel = useMemo(() => {
    // hotel -> (membership -> qty)
    const cur = new Map<string, Map<string, number>>();
    const base = new Map<string, Map<string, number>>();

    function add(map: Map<string, Map<string, number>>, hotel: string, key: string, qty: number) {
      if (!map.has(hotel)) map.set(hotel, new Map());
      const m = map.get(hotel)!;
      m.set(key, (m.get(key) ?? 0) + qty);
    }

    rows.forEach((r) => {
      if (r.year === year) add(cur, r.empresa, r.bomboy, r.cantidad);
      if (r.year === baseYear) add(base, r.empresa, r.bomboy, r.cantidad);
    });

    const hotels = Array.from(new Set<string>(hotelsJCR));

    return hotels.map((hotel) => {
      const curM = cur.get(hotel) ?? new Map<string, number>();
      const baseM = base.get(hotel) ?? new Map<string, number>();

      const keys = unionKeysFromMaps(curM, baseM);

      const list = keys
        .map((k) => {
          const curVal = curM.get(k) ?? 0;
          const baseVal = baseM.get(k) ?? 0;
          const diff = curVal - baseVal;
          const pct = baseVal > 0 ? (diff / baseVal) * 100 : null;
          return { k, curVal, baseVal, diff, pct };
        })
        .sort((a, b) => b.curVal - a.curVal);

      const totalCur = list.reduce((acc, x) => acc + x.curVal, 0);
      const totalBase = list.reduce((acc, x) => acc + x.baseVal, 0);

      return { hotel, list, totalCur, totalBase };
    });
  }, [rows, year, baseYear, hotelsJCR]);

  return (
    <div className="card" style={{ width: "100%" }}>
      <div className="cardTop">
        <div className="cardTitle">{title}</div>
        <div className="cardNote">Comparación {year} vs {baseYear}</div>
      </div>

      {error && (
        <div className="delta down" style={{ marginTop: ".75rem" }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem", marginTop: "1rem" }}>
        {perHotel.map((h) => (
          <div key={h.hotel} className="card" style={{ margin: 0 }}>
            <div className="cardTop">
              <div className="cardTitle">{h.hotel}</div>
              <div className="cardNote">
                Total {year}: <strong>{h.totalCur.toLocaleString("es-AR")}</strong>{" "}
                · {baseYear}: <strong>{h.totalBase.toLocaleString("es-AR")}</strong>
              </div>
            </div>

            <div style={{ display: "grid", gap: ".5rem", marginTop: ".75rem" }}>
              {h.list.slice(0, 8).map((x) => {
                const color = membershipColor(x.k);
                const share = h.totalCur > 0 ? x.curVal / h.totalCur : 0;

                return (
                  <div key={x.k} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: ".6rem", alignItems: "center" }}>
                    <div style={{ display: "grid", gap: ".35rem" }}>
                      <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                        <span style={{ width: 10, height: 10, borderRadius: 999, background: color, display: "inline-block" }} />
                        <div style={{ fontWeight: 700 }}>{x.k}</div>
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

                      <div style={{ height: 10, background: "rgba(255,255,255,.06)", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, height: "100%", background: color }} />
                      </div>
                    </div>

                    <div style={{ fontWeight: 800 }}>{Math.round(share * 100)}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
