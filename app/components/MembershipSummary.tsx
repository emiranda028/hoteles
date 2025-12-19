"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type RowAny = Record<string, any>;

type Props = {
  year: number;               // año activo (global)
  baseYear: number;           // año base para comparación (ej 2024)
  hotelsJCR: string[];        // lista de hoteles JCR (strings tal cual Excel)
  filePath: string;           // "/data/jcr_membership.xlsx"
  title?: string;             // opcional
};

type PeriodMode = "YEAR" | "MONTH";

type MembershipAgg = {
  key: string;
  label: string;
  value: number;
  share01: number; // 0-1
};

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const MONTH_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Colores por membresía (los que “identifican” visualmente cada una)
const MEMBERSHIP_COLORS: Record<string, string> = {
  "Member (MRD)": "#ef6a6a",
  "Gold Elite (GLD)": "#f2b134",
  "Titanium Elite (TTM)": "#a875ff",
  "Platinum Elite (PLT)": "#94a3b8",
  "Silver Elite (SLR)": "#cbd5e1",
  "Ambassador Elite (AMB)": "#52c3ff",
};

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("es-AR");
}
function fmtPct(n: number) {
  return (n * 100).toFixed(1).replace(".", ",") + "%";
}
function safeNum(v: any) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeHotel(s: any) {
  return String(s ?? "").trim().toUpperCase();
}

function normalizeMembership(s: any) {
  return String(s ?? "").trim();
}

function findFirstKey(obj: RowAny, candidates: string[]) {
  const keys = Object.keys(obj || {});
  const found = candidates.find((c) => keys.includes(c));
  if (found) return found;

  // fallback case-insensitive
  const lower = new Map(keys.map((k) => [k.toLowerCase(), k]));
  for (const c of candidates) {
    const hit = lower.get(c.toLowerCase());
    if (hit) return hit;
  }
  return "";
}

function parseExcelDate(value: any): Date | null {
  if (!value) return null;

  // XLSX puede darte Date directo
  if (value instanceof Date && !isNaN(value.getTime())) return value;

  // o número serial
  if (typeof value === "number") {
    const d = XLSX.SSF.parse_date_code(value);
    if (d && d.y && d.m && d.d) {
      return new Date(d.y, d.m - 1, d.d);
    }
  }

  // o string tipo "2024-10-22" / "22/10/2024"
  const s = String(value).trim();
  // ISO
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;

  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
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

async function readXlsxFromPublic(filePath: string): Promise<RowAny[]> {
  const res = await fetch(filePath, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer ${filePath} (${res.status})`);
  const ab = await res.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<RowAny>(ws, { defval: null });
  return json;
}

function uniqueStrings(list: string[]) {
  const seen: Record<string, boolean> = {};
  const out: string[] = [];
  for (const x of list) {
    const k = String(x);
    if (!seen[k]) {
      seen[k] = true;
      out.push(k);
    }
  }
  return out;
}

function sumMap(rows: RowAny[], hotelFilter: string[], year: number, mode: PeriodMode, monthIdx: number | null) {
  let total = 0;
  const by = new Map<string, number>();

  // detectar columnas desde primera fila útil
  const sample = rows.find((r) => r && Object.keys(r).length > 0) || {};
  const kHotel = findFirstKey(sample, ["Empresa", "Hotel", "HOTEL"]);
  const kMem = findFirstKey(sample, ["Bonboy", "Membership", "Membresia", "Membresía", "Tipo"]);
  const kQty = findFirstKey(sample, ["Cantidad", "Qty", "QTY", "Total", "Count"]);
  const kDate = findFirstKey(sample, ["Fecha", "Date", "FECHA"]);

  for (const r of rows) {
    const hotel = normalizeHotel(r[kHotel]);
    if (!hotel) continue;
    if (hotelFilter.length > 0 && !hotelFilter.includes(hotel)) continue;

    const d = parseExcelDate(r[kDate]);
    if (!d) continue;

    const y = d.getFullYear();
    if (y !== year) continue;

    if (mode === "MONTH" && monthIdx != null) {
      if (d.getMonth() !== monthIdx) continue;
    }

    const mem = normalizeMembership(r[kMem]);
    if (!mem) continue;

    const qty = safeNum(r[kQty]);
    if (qty <= 0) continue;

    total += qty;
    by.set(mem, (by.get(mem) ?? 0) + qty);
  }

  return { total, by, detected: { kHotel, kMem, kQty, kDate } };
}

function buildAgg(by: Map<string, number>, total: number): MembershipAgg[] {
  const keys = Array.from(by.keys()); // ✅ sin iterators raros
  const list: MembershipAgg[] = keys
    .map((k) => {
      const v = by.get(k) ?? 0;
      return {
        key: k,
        label: k,
        value: v,
        share01: total > 0 ? v / total : 0,
      };
    })
    .sort((a, b) => b.value - a.value);

  return list;
}

function TopPills({
  active,
  onChange,
}: {
  active: string;
  onChange: (v: string) => void;
}) {
  const pills = ["JCR", "MARRIOTT", "SHERATON BCR", "SHERATON MDQ"];
  return (
    <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
      {pills.map((p) => (
        <button
          key={p}
          type="button"
          className={`pillBtn ${active === p ? "active" : ""}`}
          onClick={() => onChange(p)}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function PeriodTabs({
  mode,
  monthIdx,
  onYear,
  onMonth,
}: {
  mode: PeriodMode;
  monthIdx: number | null;
  onYear: () => void;
  onMonth: (m: number) => void;
}) {
  return (
    <div className="segTabs">
      <button type="button" className={`segTab ${mode === "YEAR" ? "active" : ""}`} onClick={onYear}>
        Año
      </button>
      {MONTH_SHORT.map((m, idx) => (
        <button
          key={m}
          type="button"
          className={`segTab ${mode === "MONTH" && monthIdx === idx ? "active" : ""}`}
          onClick={() => onMonth(idx)}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function StackedBar({ items }: { items: MembershipAgg[] }) {
  const totalShare = items.reduce((acc, it) => acc + it.share01, 0);
  return (
    <div style={{ marginTop: "1rem" }}>
      <div style={{ fontSize: ".82rem", color: "var(--muted)" }}>Composición</div>
      <div className="stackBar">
        {items.map((it) => {
          const w = totalShare > 0 ? it.share01 / totalShare : 0;
          const color = MEMBERSHIP_COLORS[it.label] || "#e5e7eb";
          return (
            <div
              key={it.key}
              title={`${it.label}: ${fmtInt(it.value)} (${fmtPct(it.share01)})`}
              style={{
                width: `${Math.max(0, w * 100)}%`,
                background: color,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function BarsList({ items }: { items: MembershipAgg[] }) {
  const maxVal = items.reduce((m, it) => Math.max(m, it.value), 0) || 1;

  return (
    <div style={{ marginTop: "1.1rem", display: "grid", gap: ".85rem" }}>
      {items.map((it) => {
        const color = MEMBERSHIP_COLORS[it.label] || "#9ca3af";
        const w = (it.value / maxVal) * 100;
        return (
          <div key={it.key} className="mRow">
            <div className="mLabel">
              <div className="dot" style={{ background: color }} />
              <div>
                <div className="mName">{it.label}</div>
                <div className="mMeta">{fmtPct(it.share01)} del total</div>
              </div>
            </div>

            <div className="mBarWrap">
              <div className="mBarBg">
                <div className="mBarFill" style={{ width: `${Math.max(0, w)}%`, background: color }} />
              </div>
            </div>

            <div className="mValue">{fmtInt(it.value)}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function MembershipSummary({
  year,
  baseYear,
  hotelsJCR,
  filePath,
  title = "Membership (JCR)",
}: Props) {
  const [rows, setRows] = useState<RowAny[] | null>(null);
  const [err, setErr] = useState<string>("");

  // Filtros UI
  const [scope, setScope] = useState<"JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ">("JCR");
  const [mode, setMode] = useState<PeriodMode>("YEAR");
  const [monthIdx, setMonthIdx] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setErr("");
    readXlsxFromPublic(filePath)
      .then((data) => {
        if (!alive) return;
        setRows(data);
      })
      .catch((e: any) => {
        if (!alive) return;
        setErr(e?.message || "Error leyendo Excel");
        setRows([]);
      });
    return () => {
      alive = false;
    };
  }, [filePath]);

  const hotelFilter = useMemo(() => {
    // Normalizamos a MAYÚSCULA para matchear el Excel (que viene MARRIOTT / SHERATON...)
    const hotelsUpper = hotelsJCR.map((h) => normalizeHotel(h));

    if (scope === "JCR") return hotelsUpper;
    return [normalizeHotel(scope)];
  }, [scope, hotelsJCR]);

  const cur = useMemo(() => {
    if (!rows) return null;
    return sumMap(rows, hotelFilter, year, mode, monthIdx);
  }, [rows, hotelFilter, year, mode, monthIdx]);

  const base = useMemo(() => {
    if (!rows) return null;
    return sumMap(rows, hotelFilter, baseYear, mode, monthIdx);
  }, [rows, hotelFilter, baseYear, mode, monthIdx]);

  const curAgg = useMemo(() => {
    if (!cur) return [];
    return buildAgg(cur.by, cur.total);
  }, [cur]);

  const baseAgg = useMemo(() => {
    if (!base) return [];
    return buildAgg(base.by, base.total);
  }, [base]);

  const totalCur = cur?.total ?? 0;
  const totalBase = base?.total ?? 0;

  const deltaPct = useMemo(() => {
    if (!totalBase) return null;
    return ((totalCur / totalBase) - 1) * 100;
  }, [totalCur, totalBase]);

  const scopeLabel =
    scope === "JCR" ? "Consolidado JCR" : `Membership (${scope})`;

  const periodLabel =
    mode === "YEAR"
      ? `Acumulado ${year} · vs ${baseYear}`
      : `${MONTHS_ES[monthIdx ?? 0]} ${year} · vs ${MONTHS_ES[monthIdx ?? 0]} ${baseYear}`;

  const hasData = totalCur > 0;

  return (
    <section className="section" style={{ marginTop: "2.5rem" }}>
      <div className="sectionHeader" style={{ alignItems: "center" }}>
        <div>
          <div className="sectionKicker">Fidelización</div>
          <h3 className="sectionTitle">{title}</h3>
          <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
            {scopeLabel} — {periodLabel}
          </div>
        </div>

        <TopPills active={scope} onChange={(v) => setScope(v as any)} />
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div className="cardTitle">{scopeLabel}</div>
            <div className="cardNote">{periodLabel}</div>
          </div>

          <PeriodTabs
            mode={mode}
            monthIdx={monthIdx}
            onYear={() => {
              setMode("YEAR");
              setMonthIdx(null);
            }}
            onMonth={(m) => {
              setMode("MONTH");
              setMonthIdx(m);
            }}
          />
        </div>

        {err ? (
          <div style={{ marginTop: "1rem", color: "#b91c1c" }}>{err}</div>
        ) : !rows ? (
          <div style={{ marginTop: "1rem", color: "var(--muted)" }}>Cargando…</div>
        ) : (
          <div className="mGrid">
            {/* Columna izquierda: Total */}
            <div className="mTotalCard">
              <div className="mTotalLabel">Total</div>
              <div className="mTotalValue">{hasData ? fmtInt(totalCur) : "—"}</div>

              {deltaPct == null ? (
                <div className="mDelta muted">Sin base {baseYear}</div>
              ) : (
                <div className={`mDelta ${deltaPct >= 0 ? "up" : "down"}`}>
                  {deltaPct >= 0 ? "+" : ""}
                  {deltaPct.toFixed(1).replace(".", ",")}% vs {baseYear}
                </div>
              )}

              {hasData && curAgg.length > 0 && <StackedBar items={curAgg} />}
            </div>

            {/* Columna derecha: barras por membresía */}
            <div>
              {!hasData ? (
                <div style={{ color: "var(--muted)", marginTop: ".5rem" }}>
                  Sin datos para {scope} en {year}
                  {mode === "MONTH" && monthIdx != null ? ` (${MONTHS_ES[monthIdx]})` : ""}.
                </div>
              ) : (
                <BarsList items={curAgg} />
              )}

              {/* Debug suave por si vuelve a fallar por headers */}
              {!hasData && rows?.length ? (
                <div style={{ marginTop: "1rem", fontSize: ".82rem", color: "var(--muted)" }}>
                  <div><strong>Diagnóstico:</strong> si el año existe pero igual dice “sin datos”, suele ser Fecha vacía/no-fecha o Empresa no coincide.</div>
                  <div style={{ marginTop: ".35rem" }}>
                    <strong>Detectado:</strong>{" "}
                    hotel={cur?.detected.kHotel || "—"} · membership={cur?.detected.kMem || "—"} · qty={cur?.detected.kQty || "—"} · fecha={cur?.detected.kDate || "—"}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* estilos locales del componente (para que no dependas de tocar globals.css) */}
      <style jsx>{`
        .pillBtn{
          border: 1px solid rgba(0,0,0,.08);
          background: #fff;
          padding: .55rem .9rem;
          border-radius: 999px;
          font-weight: 650;
          letter-spacing: .2px;
          transition: transform .06s ease, background .15s ease, border-color .15s ease;
        }
        .pillBtn:hover{ transform: translateY(-1px); }
        .pillBtn.active{
          background: #111;
          color: #fff;
          border-color: transparent;
        }

        .segTabs{
          display: flex;
          gap: .35rem;
          flex-wrap: wrap;
          align-items: center;
          padding: .35rem;
          border: 1px solid rgba(0,0,0,.08);
          border-radius: 999px;
          background: rgba(0,0,0,.02);
        }
        .segTab{
          border: 0;
          background: transparent;
          padding: .5rem .75rem;
          border-radius: 999px;
          color: #6b7280;
          font-weight: 650;
          transition: background .15s ease, color .15s ease;
        }
        .segTab.active{
          background: #9f1239; /* bordó elegante */
          color: #fff;
        }

        .mGrid{
          display: grid;
          grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
          gap: 1.25rem;
          margin-top: 1.25rem;
          align-items: start;
        }
        @media (max-width: 980px){
          .mGrid{ grid-template-columns: 1fr; }
        }

        .mTotalCard{
          border: 1px solid rgba(0,0,0,.06);
          background: rgba(0,0,0,.02);
          border-radius: 18px;
          padding: 1.2rem;
        }
        .mTotalLabel{
          font-size: 1.05rem;
          color: #6b7280;
          font-weight: 650;
        }
        .mTotalValue{
          font-size: 3.2rem;
          line-height: 1;
          font-weight: 850;
          margin-top: .55rem;
          color: #111827;
        }
        .mDelta{
          display: inline-flex;
          margin-top: .85rem;
          padding: .45rem .7rem;
          border-radius: 999px;
          font-weight: 750;
          border: 1px solid rgba(0,0,0,.08);
          background: #fff;
        }
        .mDelta.up{ color: #0f766e; border-color: rgba(15,118,110,.25); background: rgba(15,118,110,.08); }
        .mDelta.down{ color: #b91c1c; border-color: rgba(185,28,28,.25); background: rgba(185,28,28,.08); }
        .mDelta.muted{ color: #6b7280; background: rgba(0,0,0,.02); }

        .stackBar{
          height: 12px;
          border-radius: 999px;
          overflow: hidden;
          display: flex;
          background: rgba(0,0,0,.06);
          border: 1px solid rgba(0,0,0,.06);
          margin-top: .35rem;
        }

        .mRow{
          display: grid;
          grid-template-columns: minmax(220px, 320px) minmax(0, 1fr) 90px;
          gap: .9rem;
          align-items: center;
        }
        @media (max-width: 640px){
          .mRow{ grid-template-columns: 1fr; }
        }

        .mLabel{
          display: flex;
          gap: .8rem;
          align-items: center;
        }
        .dot{
          width: 12px;
          height: 12px;
          border-radius: 999px;
          flex: 0 0 auto;
          box-shadow: 0 0 0 3px rgba(0,0,0,.04);
        }
        .mName{
          font-weight: 780;
          color: #111827;
        }
        .mMeta{
          font-size: .82rem;
          color: #6b7280;
          margin-top: .15rem;
        }

        .mBarWrap{ width: 100%; }
        .mBarBg{
          height: 12px;
          border-radius: 999px;
          background: rgba(0,0,0,.06);
          overflow: hidden;
          border: 1px solid rgba(0,0,0,.06);
        }
        .mBarFill{
          height: 100%;
          border-radius: 999px;
          transition: width .35s ease;
        }
        .mValue{
          text-align: right;
          font-weight: 800;
          color: #111827;
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </section>
  );
}
