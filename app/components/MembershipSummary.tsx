"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

/**
 * MembershipSummary
 * - Lee /public/data/jcr_membership.xlsx
 * - Detecta columnas (Empresa / Bonboy / Cantidad / Fecha)
 * - Permite filtrar por Hotel + Año
 * - Opción JCR = suma Marriott + Sheraton MDQ + Sheraton BCR
 * - Gráficos: donut (share) + barras horizontales + cards
 *
 * Nota Vercel/TS:
 * - NO usamos map.keys()/values() en loops directos (rompe target ES5).
 */

type Props = {
  filePath: string; // "/data/jcr_membership.xlsx"
  allowedHotels: string[]; // ej: ["JCR","MARRIOTT","SHERATON MDQ","SHERATON BCR"]
  defaultYear?: number; // ej: 2025
  title?: string;
};

type RawRow = Record<string, any>;

type ParsedRow = {
  hotel: string;
  membership: string;
  qty: number;
  year: number;
};

const JCR_SET = new Set(["MARRIOTT", "SHERATON MDQ", "SHERATON BCR"]);

function normStr(v: any) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function upper(v: any) {
  return normStr(v).toUpperCase();
}

function parseNumberSmart(v: any) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const s = normStr(v);
  if (!s) return 0;
  // soporta "1.234" "1,234" "1.234,56"
  const cleaned = s
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

function parseDateYear(v: any) {
  // XLSX puede traer Date real, number (serial), o string
  if (!v) return NaN;

  if (v instanceof Date) return v.getFullYear();

  if (typeof v === "number") {
    // Si Excel serial: a veces viene como 45200 etc.
    // Tomamos heurística simple: si es muy grande, interpretamos como días desde 1899-12-30
    if (v > 2000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(excelEpoch.getTime() + v * 86400000);
      return d.getUTCFullYear();
    }
    return NaN;
  }

  const s = normStr(v);
  // formatos frecuentes: "1/6/2022" o "01-06-22"
  // intentamos Date.parse
  const d1 = new Date(s);
  if (!isNaN(d1.getTime())) return d1.getFullYear();

  // dd/mm/yyyy manual
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let yy = Number(m[3]);
    if (yy < 100) yy = 2000 + yy;
    return yy;
  }

  return NaN;
}

function pickColumn(keys: string[], candidates: string[]) {
  const lowerKeys = keys.map((k) => k.toLowerCase());
  for (const c of candidates) {
    const idx = lowerKeys.indexOf(c.toLowerCase());
    if (idx >= 0) return keys[idx];
  }
  return "";
}

function stablePalette(name: string) {
  // colores consistentes por membresía (sin libs)
  const key = upper(name);

  // Si vos tenés nombres exactos, agregalos acá
  const hard: Record<string, string> = {
    "BONBOY": "#7C3AED",
    "SILVER": "#64748B",
    "GOLD": "#F59E0B",
    "PLATINUM": "#06B6D4",
    "TITANIUM": "#0EA5E9",
    "AMBASSADOR": "#EF4444",
    "CORPORATE": "#22C55E",
    "OTHER": "#94A3B8",
  };

  // match aproximado
  if (hard[key]) return hard[key];
  if (key.includes("SILV")) return hard["SILVER"];
  if (key.includes("GOLD")) return hard["GOLD"];
  if (key.includes("PLAT")) return hard["PLATINUM"];
  if (key.includes("TITA")) return hard["TITANIUM"];
  if (key.includes("AMB")) return hard["AMBASSADOR"];

  // fallback hash -> HSL-like simple
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 55%)`;
}

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("es-AR");
}

function pct(n: number) {
  return (n * 100).toFixed(1).replace(".", ",") + "%";
}

export default function MembershipSummary({
  filePath,
  allowedHotels,
  defaultYear,
  title = "Membership — distribución y variación",
}: Props) {
  const [loading, setLoading] = useState(true);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [debug, setDebug] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await readXlsxFromPublic(filePath);
        if (!alive) return;
        setRawRows(res.rows ?? []);
        setDebug({
          sheet: res.sheetName,
          sheets: res.sheetNames,
          sampleKeys: Object.keys((res.rows?.[0] ?? {}) as any),
        });
      } catch (e: any) {
        if (!alive) return;
        setRawRows([]);
        setDebug({ error: String(e?.message ?? e) });
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [filePath]);

  // Detectar columnas
  const detected = useMemo(() => {
    const keys = Object.keys(rawRows?.[0] ?? {});
    const hotelCol = pickColumn(keys, ["Empresa", "Hotel", "Propiedad"]);
    const memCol = pickColumn(keys, ["Bonboy", "Membership", "Membresia", "Membresía", "Tier"]);
    const qtyCol = pickColumn(keys, ["Cantidad", "Qty", "Quantity", "Count", "Total"]);
    const dateCol = pickColumn(keys, ["Fecha", "Date", "Dia", "Día"]);
    return { keys, hotelCol, memCol, qtyCol, dateCol };
  }, [rawRows]);

  // Parse a filas limpias
  const rows: ParsedRow[] = useMemo(() => {
    if (!rawRows || rawRows.length === 0) return [];
    const { hotelCol, memCol, qtyCol, dateCol } = detected;

    if (!hotelCol || !memCol || !qtyCol || !dateCol) return [];

    const out: ParsedRow[] = [];

    for (const r of rawRows) {
      const hotel = upper(r[hotelCol]);
      const membership = normStr(r[memCol]);
      const qty = parseNumberSmart(r[qtyCol]);
      const year = parseDateYear(r[dateCol]);

      if (!hotel || !membership || !qty || !year || isNaN(year)) continue;

      out.push({ hotel, membership, qty, year });
    }

    return out;
  }, [rawRows, detected]);

  // Años disponibles
  const years = useMemo(() => {
    const ys = Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => a - b);
    return ys;
  }, [rows]);

  const DEFAULT_YEAR = useMemo(() => {
    if (defaultYear && years.includes(defaultYear)) return defaultYear;
    return years.length ? years[years.length - 1] : new Date().getFullYear();
  }, [defaultYear, years]);

  const [year, setYear] = useState<number>(DEFAULT_YEAR);
  const [hotel, setHotel] = useState<string>(allowedHotels?.[0] ?? "JCR"); // primer item del selector

  // Sync cuando carga data
  useEffect(() => {
    if (years.length && !years.includes(year)) setYear(DEFAULT_YEAR);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years.join("|")]);

  useEffect(() => {
    if (!allowedHotels?.length) return;
    if (!allowedHotels.includes(hotel)) setHotel(allowedHotels[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedHotels?.join("|")]);

  // Filtrado por hotel
  const rowsHotelYear = useMemo(() => {
    const list = rows.filter((r) => r.year === year);

    if (hotel === "JCR") {
      return list.filter((r) => JCR_SET.has(r.hotel));
    }
    return list.filter((r) => r.hotel === upper(hotel));
  }, [rows, hotel, year]);

  // Agregación: membership -> qty
  const sumMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rowsHotelYear) {
      const key = normStr(r.membership);
      m.set(key, (m.get(key) ?? 0) + r.qty);
    }
    return m;
  }, [rowsHotelYear]);

  const totalQty = useMemo(() => {
    const vals = Array.from(sumMap.values());
    let s = 0;
    for (let i = 0; i < vals.length; i++) s += vals[i];
    return s;
  }, [sumMap]);

  const list = useMemo(() => {
    const entries = Array.from(sumMap.entries()).map(([membership, qty]) => ({
      membership,
      qty,
      share: totalQty > 0 ? qty / totalQty : 0,
      color: stablePalette(membership),
    }));
    entries.sort((a, b) => b.qty - a.qty);
    return entries;
  }, [sumMap, totalQty]);

  // Donut CSS con conic-gradient
  const donutStyle = useMemo(() => {
    if (!list.length) return { background: "conic-gradient(#e5e7eb 0% 100%)" };
    let acc = 0;
    const parts: string[] = [];
    for (const it of list) {
      const start = acc;
      acc += it.share;
      const a = start * 100;
      const b = acc * 100;
      parts.push(`${it.color} ${a.toFixed(2)}% ${b.toFixed(2)}%`);
    }
    return { background: `conic-gradient(${parts.join(",")})` };
  }, [list]);

  const hasData = !loading && list.length > 0;

  return (
    <section className="section" style={{ marginTop: "2.25rem" }}>
      <div className="sectionHeader">
        <div>
          <div className="sectionKicker">Membresías</div>
          <h3 className="sectionTitle">{title}</h3>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            {hotel === "JCR"
              ? "JCR = Marriott + Sheraton MDQ + Sheraton BCR."
              : `Hotel: ${hotel}.`}{" "}
            Distribución del año seleccionado.
          </div>
        </div>
      </div>

      {/* Filtros: hotel + año (mismo estilo botones) */}
      <div className="stickyControls" style={{ marginTop: "1rem" }}>
        <div>
          <div className="stickyTitle">Filtros</div>
          <div className="stickyHint">Seleccioná hotel (o JCR) y año.</div>
        </div>

        <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
          <div className="toggle" style={{ margin: 0 }}>
            {(allowedHotels ?? []).map((h) => (
              <button
                key={h}
                className={`toggleBtn ${hotel === h ? "active" : ""}`}
                onClick={() => setHotel(h)}
                type="button"
              >
                {h}
              </button>
            ))}
          </div>

          <div className="toggle" style={{ margin: 0 }}>
            {years.length ? (
              years.map((y) => (
                <button
                  key={y}
                  className={`toggleBtn ${year === y ? "active" : ""}`}
                  onClick={() => setYear(y)}
                  type="button"
                >
                  {y}
                </button>
              ))
            ) : (
              <button className="toggleBtn active" type="button">
                —
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) minmax(0,1.25fr)",
          gap: "1.25rem",
          marginTop: "1rem",
        }}
      >
        {/* Card Donut */}
        <div className="card" style={{ position: "relative", overflow: "hidden" }}>
          <div className="cardTop">
            <div>
              <div className="cardTitle">Distribución (share)</div>
              <div className="cardNote">Total membresías: <strong>{fmtInt(totalQty)}</strong></div>
            </div>
          </div>

          {loading ? (
            <div className="cardNote" style={{ marginTop: ".75rem" }}>Cargando...</div>
          ) : !hasData ? (
            <div className="cardNote" style={{ marginTop: ".75rem" }}>
              Sin datos para <strong>{hotel}</strong> en <strong>{year}</strong>.
              <div style={{ marginTop: ".35rem", fontSize: ".8rem", color: "var(--muted)" }}>
                Detectado: hotel=<strong>{detected.hotelCol || "—"}</strong> · membership=<strong>{detected.memCol || "—"}</strong> · qty=<strong>{detected.qtyCol || "—"}</strong> · fecha=<strong>{detected.dateCol || "—"}</strong>
              </div>
              {!!debug?.sampleKeys?.length && (
                <div style={{ marginTop: ".35rem", fontSize: ".8rem", color: "var(--muted)" }}>
                  Keys ejemplo: {debug.sampleKeys.slice(0, 10).join(", ")}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "1rem", alignItems: "center", marginTop: "1rem" }}>
              <div
                aria-label="Donut membership"
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: "999px",
                  ...donutStyle,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 14,
                    borderRadius: "999px",
                    background: "var(--card)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                    border: "1px solid rgba(0,0,0,.06)",
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: "1.15rem" }}>{year}</div>
                  <div style={{ fontSize: ".8rem", color: "var(--muted)" }}>{hotel}</div>
                </div>
              </div>

              <div style={{ display: "grid", gap: ".5rem" }}>
                {list.slice(0, 6).map((it) => (
                  <div key={it.membership} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: ".55rem", minWidth: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 99, background: it.color, flex: "0 0 auto" }} />
                      <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {it.membership}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: ".75rem", alignItems: "baseline" }}>
                      <div style={{ fontWeight: 800 }}>{fmtInt(it.qty)}</div>
                      <div style={{ fontSize: ".85rem", color: "var(--muted)" }}>{pct(it.share)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Card barras */}
        <div className="card">
          <div className="cardTop">
            <div>
              <div className="cardTitle">Detalle por membresía</div>
              <div className="cardNote">Top a menor (con barras y color).</div>
            </div>
          </div>

          {loading ? (
            <div className="cardNote" style={{ marginTop: ".75rem" }}>Cargando...</div>
          ) : !hasData ? (
            <div className="cardNote" style={{ marginTop: ".75rem" }}>Sin datos para graficar.</div>
          ) : (
            <div style={{ marginTop: "1rem", display: "grid", gap: ".55rem" }}>
              {list.map((it) => {
                const w = Math.max(2, Math.round(it.share * 100));
                return (
                  <div key={it.membership} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 120px", gap: ".75rem", alignItems: "center" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem" }}>
                        <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {it.membership}
                        </div>
                        <div style={{ color: "var(--muted)", fontSize: ".85rem" }}>{pct(it.share)}</div>
                      </div>

                      <div style={{ height: 10, borderRadius: 999, background: "rgba(0,0,0,.06)", overflow: "hidden", marginTop: ".35rem" }}>
                        <div style={{ height: "100%", width: `${w}%`, background: it.color, borderRadius: 999 }} />
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 900 }}>{fmtInt(it.qty)}</div>
                      <div style={{ fontSize: ".8rem", color: "var(--muted)" }}>cantidad</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Debug opcional (no molesta) */}
      {!!debug?.sheet && (
        <div style={{ marginTop: ".75rem", fontSize: ".78rem", color: "var(--muted)" }}>
          Fuente: {filePath} · Hoja: <strong>{debug.sheet}</strong>
        </div>
      )}
    </section>
  );
}
