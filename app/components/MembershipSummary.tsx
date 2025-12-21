"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./readXlsxFromPublic";

type Props = {
  year: number;
  baseYear: number;
  allowedHotels: string[]; // ["MARRIOTT","SHERATON BCR","SHERATON MDQ"]
  filePath: string; // "/data/jcr_membership.xlsx"
  title: string;
  hotelFilter: string; // "JCR"|"MARRIOTT"|"SHERATON BCR"|"SHERATON MDQ"
};

type Row = Record<string, any>;

function normStr(v: any) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function upperNoAccents(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function toNumber(v: any): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const cleaned = s
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function yearFromAnyDate(value: any): number | null {
  if (!value) return null;

  if (value instanceof Date && !isNaN(value.getTime())) return value.getFullYear();

  if (typeof value === "number" && value > 20000 && value < 60000) {
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.getFullYear();
  }

  const s = String(value).trim();
  if (!s) return null;

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getFullYear();

  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const yyyy = m[3].length === 2 ? Number("20" + m[3]) : Number(m[3]);
    if (yyyy > 1900 && yyyy < 2100) return yyyy;
  }

  const m2 = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m2) {
    const yyyy = Number(m2[1]);
    if (yyyy > 1900 && yyyy < 2100) return yyyy;
  }

  return null;
}

function pickKeyByCandidates(sample: Row, candidates: string[]) {
  const keys = Object.keys(sample || {});
  const map = new Map<string, string>();
  keys.forEach((k) => map.set(upperNoAccents(k), k));
  for (const c of candidates) {
    const found = map.get(upperNoAccents(c));
    if (found) return found;
  }
  return "";
}

function hotelMatches(raw: string, filter: string, allowed: string[]) {
  const H = upperNoAccents(raw);
  const F = upperNoAccents(filter);

  if (!filter || F === "JCR" || F === "GRUPO JCR") return true;

  if (F.includes("MARRIOTT")) return H.includes("MARRIOTT");
  if (F.includes("SHERATON BCR") || F.includes("BCR")) return H.includes("BCR");
  if (F.includes("SHERATON MDQ") || F.includes("MDQ")) return H.includes("MDQ");

  // fallback: si coincide con alguno allowed
  for (let i = 0; i < allowed.length; i++) {
    const a = upperNoAccents(allowed[i]);
    if (F === a) return H.includes(a);
  }

  return H.includes(F);
}

// Colores (degradé) por membresía
function membershipColor(name: string) {
  const n = upperNoAccents(name);
  if (n.includes("MRD") || n.includes("MEMBER")) return "linear-gradient(90deg, rgba(238,90,90,.95), rgba(255,140,0,.85))";
  if (n.includes("GLD") || n.includes("GOLD")) return "linear-gradient(90deg, rgba(255,191,0,.95), rgba(255,140,0,.85))";
  if (n.includes("TTM") || n.includes("TITANIUM")) return "linear-gradient(90deg, rgba(156,110,255,.95), rgba(90,190,255,.85))";
  if (n.includes("PLT") || n.includes("PLATINUM")) return "linear-gradient(90deg, rgba(140,160,190,.95), rgba(200,210,220,.85))";
  if (n.includes("SLR") || n.includes("SILVER")) return "linear-gradient(90deg, rgba(210,210,210,.95), rgba(140,160,190,.85))";
  if (n.includes("AMB") || n.includes("AMBASSADOR")) return "linear-gradient(90deg, rgba(80,190,255,.95), rgba(0,140,120,.85))";
  return "linear-gradient(90deg, rgba(140,0,50,.85), rgba(255,140,0,.75))";
}

export default function MembershipSummary({
  year,
  baseYear,
  allowedHotels,
  filePath,
  title,
  hotelFilter,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");

    (async () => {
      try {
        const r = await readXlsxFromPublic(filePath);
        if (!alive) return;
        setRows(r.rows || []);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Error cargando membership");
        setRows([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [filePath]);

  const meta = useMemo(() => {
    const sample = rows[0] || {};
    const hotelKey = pickKeyByCandidates(sample, ["Empresa", "Hotel", "Property"]);
    const membershipKey = pickKeyByCandidates(sample, ["Bonboy", "Membership", "Membresia", "Membresía"]);
    const qtyKey = pickKeyByCandidates(sample, ["Cantidad", "Qty", "Cantidad Pax"]);
    const dateKey = pickKeyByCandidates(sample, ["Fecha", "Date", "Día", "Dia"]);
    return { hotelKey, membershipKey, qtyKey, dateKey, sampleKeys: Object.keys(sample) };
  }, [rows]);

  const filteredForYear = useMemo(() => {
    if (!rows.length) return [];
    const out: Row[] = [];
    const { hotelKey, dateKey } = meta;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const hotelVal = hotelKey ? normStr(r[hotelKey]) : "";
      if (!hotelMatches(hotelVal, hotelFilter, allowedHotels)) continue;

      const y = dateKey ? yearFromAnyDate(r[dateKey]) : null;
      if (y !== year) continue;

      out.push(r);
    }
    return out;
  }, [rows, meta, year, hotelFilter, allowedHotels]);

  const filteredBase = useMemo(() => {
    if (!rows.length) return [];
    const out: Row[] = [];
    const { hotelKey, dateKey } = meta;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const hotelVal = hotelKey ? normStr(r[hotelKey]) : "";
      if (!hotelMatches(hotelVal, hotelFilter, allowedHotels)) continue;

      const y = dateKey ? yearFromAnyDate(r[dateKey]) : null;
      if (y !== baseYear) continue;

      out.push(r);
    }
    return out;
  }, [rows, meta, baseYear, hotelFilter, allowedHotels]);

  function sumMap(list: Row[]) {
    const m = new Map<string, number>();
    const { membershipKey, qtyKey } = meta;
    if (!membershipKey || !qtyKey) return m;

    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const k = normStr(r[membershipKey]);
      if (!k) continue;
      const v = toNumber(r[qtyKey]);
      m.set(k, (m.get(k) || 0) + v);
    }
    return m;
  }

  const cur = useMemo(() => sumMap(filteredForYear), [filteredForYear, meta]);
  const base = useMemo(() => sumMap(filteredBase), [filteredBase, meta]);

  const keys = useMemo(() => {
    // NO usar ...cur.keys() (downlevelIteration)
    const a = Array.from(cur.keys());
    const b = Array.from(base.keys());
    const s = new Set<string>();
    a.forEach((x) => s.add(x));
    b.forEach((x) => s.add(x));
    return Array.from(s);
  }, [cur, base]);

  const list = useMemo(() => {
    const arr = keys
      .map((k) => {
        const curVal = cur.get(k) || 0;
        const baseVal = base.get(k) || 0;
        return { k, curVal, baseVal };
      })
      .sort((x, y) => y.curVal - x.curVal);
    return arr;
  }, [keys, cur, base]);

  const totalCur = useMemo(() => list.reduce((acc, it) => acc + it.curVal, 0), [list]);
  const totalBase = useMemo(() => list.reduce((acc, it) => acc + it.baseVal, 0), [list]);

  const yoyPct = useMemo(() => {
    if (totalBase <= 0) return null;
    return ((totalCur - totalBase) / totalBase) * 100;
  }, [totalCur, totalBase]);

  if (loading) {
    return <div style={{ padding: "1rem" }}>Cargando membership…</div>;
  }

  if (error) {
    return (
      <div style={{ padding: "1rem" }}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        <div style={{ color: "#b00020", marginTop: ".5rem" }}>{error}</div>
        <div style={{ opacity: 0.75, fontSize: 12, marginTop: ".5rem" }}>
          Archivo: <code>{filePath}</code>
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div style={{ padding: "1rem" }}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        <div style={{ opacity: 0.75, marginTop: ".5rem" }}>Sin filas en el archivo.</div>
      </div>
    );
  }

  if (!filteredForYear.length) {
    return (
      <div style={{ padding: "1rem" }}>
        <div style={{ fontWeight: 950 }}>{title}</div>
        <div style={{ marginTop: ".35rem", opacity: 0.75 }}>
          Sin datos para {hotelFilter} en {year}.
        </div>
        <div style={{ marginTop: ".6rem", opacity: 0.8, fontSize: 12 }}>
          Detectado: hotel=<b>{meta.hotelKey || "—"}</b> · membership=<b>{meta.membershipKey || "—"}</b> ·
          qty=<b>{meta.qtyKey || "—"}</b> · fecha=<b>{meta.dateKey || "—"}</b>
        </div>
        <div style={{ marginTop: ".4rem", opacity: 0.7, fontSize: 12 }}>
          Keys ejemplo: {meta.sampleKeys.slice(0, 12).join(", ")}
        </div>
      </div>
    );
  }

  const max = Math.max(...list.map((it) => it.curVal), 1);

  return (
    <div style={{ padding: "1rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: ".75rem" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>{title}</div>
          <div style={{ marginTop: ".25rem", opacity: 0.75 }}>
            Acumulado {year} · vs {baseYear} · {hotelFilter}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 950, fontSize: "1.35rem" }}>{totalCur.toLocaleString("es-AR")}</div>
          <div style={{ marginTop: ".25rem" }}>
            {yoyPct === null ? (
              <span style={{ opacity: 0.7 }}>Sin base {baseYear}</span>
            ) : (
              <span
                style={{
                  padding: ".35rem .65rem",
                  borderRadius: 999,
                  fontWeight: 900,
                  background: "rgba(0,140,120,.12)",
                  border: "1px solid rgba(0,140,120,.25)",
                }}
              >
                {yoyPct >= 0 ? "+" : ""}
                {yoyPct.toFixed(1)}% vs {baseYear}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* barras más chicas (como vos pediste) */}
      <div style={{ marginTop: "1rem", display: "grid", gap: ".6rem" }}>
        {list.map((it) => {
          const pct = totalCur > 0 ? (it.curVal / totalCur) * 100 : 0;
          const w = Math.max(2, (it.curVal / max) * 100);
          return (
            <div key={it.k} style={{ display: "grid", gridTemplateColumns: "220px 1fr 90px", gap: ".75rem" }}>
              <div style={{ fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.k}
                <div style={{ opacity: 0.7, fontSize: 12 }}>{pct.toFixed(1)}% del total</div>
              </div>

              <div
                style={{
                  height: 12,
                  borderRadius: 999,
                  background: "rgba(0,0,0,.06)",
                  overflow: "hidden",
                  alignSelf: "center",
                }}
              >
                <div style={{ width: `${w}%`, height: "100%", background: membershipColor(it.k) }} />
              </div>

              <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                <div style={{ fontWeight: 950 }}>{it.curVal.toLocaleString("es-AR")}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: ".85rem", opacity: 0.7, fontSize: 12 }}>
        Archivo: <code>{filePath}</code>
      </div>
    </div>
  );
}
