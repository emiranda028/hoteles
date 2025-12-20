"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  baseYear: number;
  allowedHotels: string[]; // hoteles disponibles en el archivo (para JCR: los 3)
  filePath: string;
  groupLabel?: string;
  enableHotelFilter?: boolean;
};

type Row = Record<string, any>;

function norm(s: any) {
  return String(s ?? "").trim().toUpperCase();
}

function parseEsNumber(v: any): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  if (hasComma && !hasDot) {
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function tryYear(fecha: any): number | null {
  const s = String(fecha ?? "").trim();
  if (!s) return null;

  const m1 = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m1) {
    let y = Number(m1[3]);
    if (y < 100) y += 2000;
    return Number.isFinite(y) ? y : null;
  }
  const m2 = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) return Number(m2[1]);

  // Excel serial (a veces)
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000) {
    // aproximación: Excel 1900 system
    const ms = Math.round((n - 25569) * 86400 * 1000);
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    return Number.isFinite(y) ? y : null;
  }

  return null;
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n || 0);
}

const MEMBERSHIP_COLORS: Record<string, string> = {
  BONBOY: "#7C3AED",
  MARRIOTT: "#2563EB",
  MARRIOTT_BONVOY: "#2563EB",
  "MARRIOTT BONVOY": "#2563EB",
  HILTON: "#10B981",
  ACCOR: "#F59E0B",
  WYNDHAM: "#EF4444",
  OTHER: "#94A3B8",
};

function colorFor(label: string) {
  const k = norm(label).replace(/\s+/g, "_");
  return MEMBERSHIP_COLORS[k] ?? MEMBERSHIP_COLORS[norm(label)] ?? "#94A3B8";
}

export default function MembershipSummary({
  year,
  baseYear,
  allowedHotels,
  filePath,
  groupLabel = "Grupo",
  enableHotelFilter = true,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string>("");

  // hotel selector:
  // - "JCR" = suma (solo si enableHotelFilter)
  // - o hotel individual
  const [hotel, setHotel] = useState<string>(enableHotelFilter ? "JCR" : (allowedHotels[0] ?? "JCR"));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const out = await readXlsxFromPublic(filePath);
        if (cancelled) return;
        setRows(out.rows ?? []);
        setErr("");
      } catch (e: any) {
        if (cancelled) return;
        setRows([]);
        setErr(e?.message ?? "Error leyendo membership");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // Detect headers flexibles
  const detected = useMemo(() => {
    const keys = Object.keys(rows[0] ?? {});
    const lower = new Map(keys.map((k) => [String(k).trim().toLowerCase(), k]));

    const hotelKey =
      lower.get("empresa") ??
      lower.get("hotel") ??
      lower.get("property") ??
      lower.get("brand") ??
      "";

    const membershipKey =
      lower.get("bonboy") ??
      lower.get("membership") ??
      lower.get("membresia") ??
      lower.get("programa") ??
      "";

    const qtyKey =
      lower.get("cantidad") ??
      lower.get("qty") ??
      lower.get("count") ??
      lower.get("cant") ??
      "";

    const fechaKey = lower.get("fecha") ?? lower.get("date") ?? "";

    return { hotelKey, membershipKey, qtyKey, fechaKey, keys };
  }, [rows]);

  const filtered = useMemo(() => {
    const { hotelKey, membershipKey, qtyKey, fechaKey } = detected;
    if (!rows.length || !hotelKey || !membershipKey || !qtyKey || !fechaKey) return [];

    const allowSet = new Set(allowedHotels.map((h) => norm(h)));

    return rows
      .map((r) => {
        const h = norm(r[hotelKey]);
        const y = tryYear(r[fechaKey]);
        const mem = String(r[membershipKey] ?? "").trim();
        const qty = parseEsNumber(r[qtyKey]);
        return { h, y, mem, qty };
      })
      .filter((r) => {
        if (!r.y) return false;
        if (r.y !== year && r.y !== baseYear) return false;

        // Si hotel selector = JCR -> suma hoteles permitidos
        if (enableHotelFilter && hotel === "JCR") return allowSet.has(r.h);

        // hotel individual
        return r.h === norm(hotel);
      });
  }, [rows, detected, allowedHotels, year, baseYear, hotel, enableHotelFilter]);

  const sumMap = (y: number) => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      if (r.y !== y) continue;
      const k = norm(r.mem) || "OTHER";
      m.set(k, (m.get(k) ?? 0) + (r.qty || 0));
    }
    return m;
  };

  const cur = useMemo(() => sumMap(year), [filtered, year]);
  const base = useMemo(() => sumMap(baseYear), [filtered, baseYear]);

  // IMPORTANTÍSIMO para no caer en el error de TS "downlevelIteration":
  // NO usamos spread de iteradores ( ...map.keys() )
  const mergedKeys = useMemo(() => {
    const s = new Set<string>();
    Array.from(cur.keys()).forEach((k) => s.add(k));
    Array.from(base.keys()).forEach((k) => s.add(k));
    return Array.from(s);
  }, [cur, base]);

  const list = useMemo(() => {
    const out = mergedKeys.map((k) => ({
      key: k,
      label: k === "OTHER" ? "Otros" : k.replace(/_/g, " "),
      cur: cur.get(k) ?? 0,
      base: base.get(k) ?? 0,
    }));
    out.sort((a, b) => b.cur - a.cur);
    return out;
  }, [mergedKeys, cur, base]);

  const totalCur = list.reduce((acc, x) => acc + x.cur, 0);
  const totalBase = list.reduce((acc, x) => acc + x.base, 0);
  const delta = totalBase ? ((totalCur - totalBase) / totalBase) * 100 : 0;

  const maxCur = Math.max(1, ...list.map((x) => x.cur));

  return (
    <div>
      <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
        Membership ({groupLabel}) — Acumulado {year} · vs {baseYear}
      </div>

      <div className="sectionDesc" style={{ marginTop: ".35rem" }}>
        Conteos por membresía (bonvoy/bonboy u otros) con comparativa interanual.
      </div>

      <div className="card" style={{ marginTop: "1rem", padding: "1rem", borderRadius: 22 }}>
        {/* Header + filtros */}
        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 900 }}>
            {enableHotelFilter ? (
              <span>
                Hotel:{" "}
                <select
                  className="select"
                  value={hotel}
                  onChange={(e) => setHotel(e.target.value)}
                  style={{ padding: ".45rem .6rem", borderRadius: 12, marginLeft: ".4rem" }}
                >
                  <option value="JCR">JCR (suma)</option>
                  {allowedHotels.map((h) => (
                    <option value={h} key={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </span>
            ) : (
              <span>Hotel: {allowedHotels[0] ?? "—"}</span>
            )}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            <div style={{ opacity: 0.85, fontWeight: 800, padding: ".45rem .6rem", borderRadius: 12, border: "1px solid rgba(255,255,255,.10)" }}>
              Año: {year}
            </div>
            <div style={{ opacity: 0.85, fontWeight: 800, padding: ".45rem .6rem", borderRadius: 12, border: "1px solid rgba(255,255,255,.10)" }}>
              Base: {baseYear}
            </div>
          </div>
        </div>

        {/* errores / sin datos */}
        {err ? (
          <div style={{ marginTop: ".8rem", color: "#ffb4b4", fontWeight: 700 }}>{err}</div>
        ) : null}

        {!err && rows.length === 0 ? (
          <div style={{ marginTop: ".8rem", opacity: 0.8 }}>
            Sin datos. Verificá que el Excel esté en <code>{filePath}</code>.
          </div>
        ) : null}

        {!err && rows.length > 0 && (!detected.hotelKey || !detected.membershipKey || !detected.qtyKey || !detected.fechaKey) ? (
          <div style={{ marginTop: ".8rem", opacity: 0.85 }}>
            No pude detectar headers. Detectado: hotel=<b>{detected.hotelKey || "—"}</b> · membership=
            <b>{detected.membershipKey || "—"}</b> · qty=<b>{detected.qtyKey || "—"}</b> · fecha=
            <b>{detected.fechaKey || "—"}</b>
            <div style={{ marginTop: ".35rem", opacity: 0.8 }}>
              Keys ejemplo: {detected.keys.slice(0, 12).join(", ")}
            </div>
          </div>
        ) : null}

        {/* KPIs */}
        <div
          style={{
            marginTop: "1rem",
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: ".75rem",
          }}
        >
          <div style={{ padding: ".85rem", borderRadius: 18, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.10)" }}>
            <div style={{ opacity: 0.8, fontWeight: 800 }}>Total {year}</div>
            <div style={{ fontWeight: 950, fontSize: "1.7rem" }}>{fmtInt(totalCur)}</div>
          </div>
          <div style={{ padding: ".85rem", borderRadius: 18, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.10)" }}>
            <div style={{ opacity: 0.8, fontWeight: 800 }}>Total {baseYear}</div>
            <div style={{ fontWeight: 950, fontSize: "1.7rem" }}>{fmtInt(totalBase)}</div>
          </div>
          <div style={{ padding: ".85rem", borderRadius: 18, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.10)" }}>
            <div style={{ opacity: 0.8, fontWeight: 800 }}>Variación</div>
            <div style={{ fontWeight: 950, fontSize: "1.7rem" }}>
              {Number.isFinite(delta) ? `${delta.toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>

        {/* Gráfico compacto */}
        <div style={{ marginTop: "1rem" }}>
          <div style={{ fontWeight: 900, marginBottom: ".5rem" }}>Distribución por membresía</div>

          <div style={{ display: "grid", gap: ".5rem" }}>
            {list.slice(0, 10).map((it) => {
              const w = Math.max(2, (it.cur / maxCur) * 100);
              const c = colorFor(it.key);
              return (
                <div
                  key={it.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "180px 1fr 90px",
                    alignItems: "center",
                    gap: ".6rem",
                  }}
                >
                  <div style={{ fontWeight: 850, opacity: 0.9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {it.label}
                  </div>

                  <div
                    style={{
                      height: 14,
                      borderRadius: 999,
                      background: "rgba(255,255,255,.08)",
                      overflow: "hidden",
                      border: "1px solid rgba(255,255,255,.08)",
                    }}
                  >
                    <div
                      style={{
                        width: `${w}%`,
                        height: "100%",
                        background: c,
                        borderRadius: 999,
                      }}
                    />
                  </div>

                  <div style={{ textAlign: "right", fontWeight: 900 }}>{fmtInt(it.cur)}</div>
                </div>
              );
            })}
          </div>

          {list.length > 10 ? (
            <div style={{ marginTop: ".65rem", opacity: 0.75 }}>
              Mostrando Top 10 (de {list.length}). Si querés, lo hacemos scrolleable o con “ver más”.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
