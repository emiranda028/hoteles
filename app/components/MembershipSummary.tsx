"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;                 // año seleccionado global
  baseYear: number;             // año base (ej 2024)
  hotelsJCR: string[];          // nombres “bonitos” (Marriott Buenos Aires, etc.) si lo usás arriba
  filePath: string;             // "/data/jcr_membership.xlsx"
  title?: string;               // opcional
  allowedHotels?: string[];     // ["MARRIOTT","SHERATON BCR","SHERATON MDQ"]
  defaultHotel?: string;        // "CONSOLIDADO" o "MARRIOTT"
};

type RowAny = Record<string, any>;

type Agg = {
  total: number;
  byTier: Map<string, number>;
};

const DEFAULT_ALLOWED = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];

/** ---------- Helpers ---------- */
const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR");

function tryParseNumber(v: any): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return 0;
  const s = v.trim();
  if (!s) return 0;

  // Soporta "7.301" o "7,301" o "7301"
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function excelSerialToDate(n: number): Date {
  // Excel serial -> JS Date (epoch 1899-12-30)
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const ms = n * 86400000;
  return new Date(epoch.getTime() + ms);
}

function parseAnyDate(v: any): Date | null {
  if (!v) return null;

  // Date real
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  // Excel serial
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = excelSerialToDate(v);
    return isNaN(d.getTime()) ? null : d;
  }

  // Strings típicos "dd/mm/yyyy" o "yyyy-mm-dd"
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;

    // dd/mm/yyyy
    const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m1) {
      const dd = Number(m1[1]);
      const mm = Number(m1[2]);
      const yy = Number(m1[3]);
      const d = new Date(yy, mm - 1, dd);
      return isNaN(d.getTime()) ? null : d;
    }

    // yyyy-mm-dd
    const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m2) {
      const yy = Number(m2[1]);
      const mm = Number(m2[2]);
      const dd = Number(m2[3]);
      const d = new Date(yy, mm - 1, dd);
      return isNaN(d.getTime()) ? null : d;
    }

    // fallback
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function normStr(v: any) {
  return String(v ?? "").trim();
}

function normalizeHotelName(v: any): string {
  const s = normStr(v).toUpperCase();

  // normalizaciones comunes
  if (s.includes("MARRIOTT")) return "MARRIOTT";
  if (s.includes("BARILOCHE") || s.includes("BCR")) return "SHERATON BCR";
  if (s.includes("MAR DEL PLATA") || s.includes("MDQ")) return "SHERATON MDQ";

  // ya viene bien
  if (s === "SHERATON BCR") return "SHERATON BCR";
  if (s === "SHERATON MDQ") return "SHERATON MDQ";
  if (s === "MARRIOTT") return "MARRIOTT";

  return s;
}

function pickColumn(rows: RowAny[], candidates: string[]) {
  if (!rows || rows.length === 0) return "";
  const keys = Object.keys(rows[0] ?? {});
  const norm = (k: string) => k.trim().toLowerCase();

  for (const c of candidates) {
    const cNorm = c.trim().toLowerCase();
    const found = keys.find((k) => norm(k) === cNorm);
    if (found) return found;
  }

  // fallback “includes”
  for (const c of candidates) {
    const cNorm = c.trim().toLowerCase();
    const found = keys.find((k) => norm(k).includes(cNorm));
    if (found) return found;
  }

  return "";
}

function sumAgg(rows: RowAny[], hotel: string | "CONSOLIDADO", year: number, allowedHotels: string[]): Agg {
  const byTier = new Map<string, number>();
  let total = 0;

  for (const r of rows) {
    const h = normalizeHotelName(r.__hotel);
    if (hotel !== "CONSOLIDADO" && h !== hotel) continue;
    if (hotel === "CONSOLIDADO" && !allowedHotels.includes(h)) continue;

    const d: Date | null = r.__date;
    if (!d || d.getFullYear() !== year) continue;

    const tier = normStr(r.__tier) || "Sin clasificar";
    const qty = Number(r.__qty) || 0;

    total += qty;
    byTier.set(tier, (byTier.get(tier) ?? 0) + qty);
  }

  return { total, byTier };
}

/** ---------- UI ---------- */
function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;

  return (
    <div className="mRow">
      <div className="mLabel">{label}</div>
      <div className="mBarTrack">
        <div className="mBarFill" style={{ width: `${pct}%` }} />
      </div>
      <div className="mValue">{fmtInt(value)}</div>
    </div>
  );
}

export default function MembershipSummary({
  year,
  baseYear,
  filePath,
  title = "Membership (JCR)",
  allowedHotels = DEFAULT_ALLOWED,
  defaultHotel = "CONSOLIDADO",
}: Props) {
  const [rows, setRows] = useState<RowAny[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  const [hotel, setHotel] = useState<string>(defaultHotel);

  useEffect(() => {
    setHotel(defaultHotel);
  }, [defaultHotel]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr("");

      try {
        const { rows: raw, sheetName, sheetNames } = await readXlsxFromPublic(filePath);

        if (!alive) return;

        if (!raw || raw.length === 0) {
          setRows([]);
          setErr(`Excel sin filas. Hojas: ${sheetNames?.join(", ") || "—"}`);
          setLoading(false);
          return;
        }

        // Detectar columnas
        const hotelCol = pickColumn(raw, ["Empresa", "Hotel", "Propiedad"]);
        const tierCol = pickColumn(raw, ["Bonboy", "Membership", "Tier", "Nivel"]);
        const qtyCol = pickColumn(raw, ["Cantidad", "Qty", "Quantity", "Count"]);
        const dateCol = pickColumn(raw, ["Fecha", "Date"]);

        // Normalizar filas a un esquema común
        const normalized = raw
          .map((r) => {
            const h = hotelCol ? r[hotelCol] : "";
            const t = tierCol ? r[tierCol] : "";
            const q = qtyCol ? r[qtyCol] : "";
            const d = dateCol ? r[dateCol] : "";

            return {
              ...r,
              __sheet: sheetName,
              __hotel: h,
              __tier: t,
              __qty: tryParseNumber(q),
              __date: parseAnyDate(d),
              __debugKeys: Object.keys(r ?? {}),
              __hotelCol: hotelCol,
              __tierCol: tierCol,
              __qtyCol: qtyCol,
              __dateCol: dateCol,
            };
          })
          .filter((r) => normalizeHotelName(r.__hotel)); // quita vacíos totales

        setRows(normalized);

        // Si faltan columnas críticas, avisar
        if (!hotelCol || !tierCol || !qtyCol || !dateCol) {
          setErr(
            `Headers detectados (hoja "${sheetName}"): hotel=${hotelCol || "—"} · membership=${tierCol || "—"} · qty=${qtyCol || "—"} · fecha=${dateCol || "—"}`
          );
        }

        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Error al leer Excel");
        setRows([]);
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [filePath]);

  const yearsAvailable = useMemo(() => {
    const set = new Set<number>();
    for (const r of rows) {
      const d: Date | null = r.__date;
      if (d && !isNaN(d.getTime())) set.add(d.getFullYear());
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [rows]);

  const aggCur = useMemo(() => sumAgg(rows, hotel as any, year, allowedHotels), [rows, hotel, year, allowedHotels]);
  const aggBase = useMemo(
    () => sumAgg(rows, hotel as any, baseYear, allowedHotels),
    [rows, hotel, baseYear, allowedHotels]
  );

  const deltaPct = useMemo(() => {
    const b = aggBase.total;
    if (!b) return null;
    return ((aggCur.total / b) - 1) * 100;
  }, [aggCur.total, aggBase.total]);

  const tiersList = useMemo(() => {
    const keys = Array.from(new Set<string>([
      ...Array.from(aggCur.byTier.keys()),
      ...Array.from(aggBase.byTier.keys()),
    ]));

    // Orden por valor actual desc
    const list = keys
      .map((k) => ({
        key: k,
        cur: aggCur.byTier.get(k) ?? 0,
        base: aggBase.byTier.get(k) ?? 0,
      }))
      .sort((a, b) => b.cur - a.cur);

    return list;
  }, [aggCur.byTier, aggBase.byTier]);

  const maxVal = useMemo(() => {
    let m = 0;
    for (const t of tiersList) m = Math.max(m, t.cur);
    return m;
  }, [tiersList]);

  return (
    <section className="section" id="membership">
      <div className="sectionHeader">
        <div>
          <div className="sectionKicker">Membership</div>
          <h3 className="sectionTitle">{title}</h3>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            Cantidades + gráficos (desde Excel). Usa el filtro global de año.
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        {/* Header + filtros */}
        <div className="mHeader">
          <div>
            <div className="mTitle">{title}</div>
            <div className="mSub">
              {hotel === "CONSOLIDADO" ? "Consolidado JCR" : hotel} — Acumulado {year} · vs {baseYear}
            </div>
          </div>

          <div className="mHotelFilters">
            <button
              type="button"
              className={`mBtn ${hotel === "CONSOLIDADO" ? "active" : ""}`}
              onClick={() => setHotel("CONSOLIDADO")}
            >
              JCR
            </button>
            {allowedHotels.map((h) => (
              <button
                key={h}
                type="button"
                className={`mBtn ${hotel === h ? "active" : ""}`}
                onClick={() => setHotel(h)}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="cardNote">Cargando membership...</div>
        ) : (
          <>
            {/* Estado sin datos */}
            {aggCur.total === 0 ? (
              <div className="mEmpty">
                <div className="mEmptyTitle">Sin datos para {hotel === "CONSOLIDADO" ? "JCR" : hotel} en {year}.</div>
                <div className="mEmptySub">Años disponibles: {yearsAvailable.length ? yearsAvailable.join(", ") : "—"}</div>
                <div className="mEmptySub" style={{ marginTop: ".4rem" }}>
                  {err ? err : "Si el año existe pero igual dice “sin datos”, revisá que la columna Fecha sea fecha real y que Empresa coincida."}
                </div>
                {rows?.[0]?.__debugKeys?.length ? (
                  <div className="mEmptyKeys">
                    Keys ejemplo: {rows[0].__debugKeys.slice(0, 12).join(", ")}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mGrid">
                {/* Total */}
                <div className="mTotal">
                  <div className="mTotalLabel">Total</div>
                  <div className="mTotalValue">{fmtInt(aggCur.total)}</div>
                  {deltaPct === null ? (
                    <div className="mDelta muted">Base ({baseYear})</div>
                  ) : (
                    <div className={`mDelta ${deltaPct >= 0 ? "up" : "down"}`}>
                      {deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1).replace(".", ",")}% vs {baseYear}
                    </div>
                  )}
                </div>

                {/* Barras */}
                <div className="mBars">
                  {tiersList.map((t) => (
                    <BarRow key={t.key} label={t.key} value={t.cur} max={maxVal} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Estilos locales (para que quede prolijo sin tocar globals) */}
      <style jsx>{`
        .mHeader{
          display:flex;
          justify-content:space-between;
          gap:1rem;
          align-items:flex-start;
          padding: .25rem .25rem .75rem .25rem;
        }
        .mTitle{ font-weight:800; font-size:1.05rem; }
        .mSub{ color: var(--muted); margin-top:.15rem; font-size:.95rem; }

        .mHotelFilters{
          display:flex;
          gap:.5rem;
          flex-wrap:wrap;
          justify-content:flex-end;
        }
        .mBtn{
          border:1px solid rgba(0,0,0,.08);
          padding:.45rem .7rem;
          border-radius:999px;
          background:#fff;
          font-weight:700;
          cursor:pointer;
          transition: all .15s ease;
        }
        .mBtn:hover{ transform: translateY(-1px); }
        .mBtn.active{
          background: var(--primary);
          color:#fff;
          border-color: transparent;
        }

        .mGrid{
          display:grid;
          grid-template-columns: 320px minmax(0,1fr);
          gap:1rem;
          align-items:stretch;
          margin-top:.5rem;
        }
        @media (max-width: 980px){
          .mGrid{ grid-template-columns: 1fr; }
        }

        .mTotal{
          background: rgba(0,0,0,.03);
          border:1px solid rgba(0,0,0,.06);
          border-radius: 18px;
          padding: 1.1rem;
          display:flex;
          flex-direction:column;
          justify-content:center;
          min-height: 180px;
        }
        .mTotalLabel{ color: var(--muted); font-weight:700; }
        .mTotalValue{
          font-size: 3rem;
          line-height: 1;
          font-weight: 900;
          margin-top:.6rem;
          letter-spacing: -0.03em;
        }
        .mDelta{
          margin-top:.8rem;
          display:inline-flex;
          gap:.4rem;
          font-weight:800;
          padding:.35rem .6rem;
          border-radius:999px;
          width: fit-content;
          border:1px solid rgba(0,0,0,.08);
        }
        .mDelta.up{ background: rgba(16,185,129,.12); color:#0f766e; border-color: rgba(16,185,129,.25); }
        .mDelta.down{ background: rgba(239,68,68,.12); color:#b91c1c; border-color: rgba(239,68,68,.25); }
        .mDelta.muted{ background: rgba(0,0,0,.05); color: var(--muted); }

        .mBars{
          padding: .5rem .25rem;
        }
        .mRow{
          display:grid;
          grid-template-columns: 240px minmax(0,1fr) 90px;
          gap: .75rem;
          align-items:center;
          padding: .45rem 0;
        }
        @media (max-width: 980px){
          .mRow{ grid-template-columns: 1fr; gap:.35rem; }
        }
        .mLabel{ font-weight: 800; }
        .mBarTrack{
          height: 12px;
          background: rgba(0,0,0,.08);
          border-radius: 999px;
          overflow:hidden;
        }
        .mBarFill{
          height: 100%;
          background: linear-gradient(90deg, rgba(244,63,94,.95), rgba(99,102,241,.9));
          border-radius: 999px;
        }
        .mValue{ text-align:right; font-weight:900; }

        .mEmpty{
          padding: 1rem;
          margin-top:.5rem;
          border-radius: 16px;
          border: 1px dashed rgba(0,0,0,.15);
          background: rgba(0,0,0,.02);
        }
        .mEmptyTitle{ font-weight:900; }
        .mEmptySub{ color: var(--muted); }
        .mEmptyKeys{
          margin-top:.6rem;
          font-size:.85rem;
          color: var(--muted);
        }
      `}</style>
    </section>
  );
}
