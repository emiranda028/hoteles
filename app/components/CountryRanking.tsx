"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  filePath: string;
  baseYear?: number;
  limit?: number;
};

type Row = Record<string, any>;

function norm(s: any) {
  return String(s ?? "").trim();
}

function upper(s: any) {
  return norm(s).toUpperCase();
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

  const n = Number(s);
  if (Number.isFinite(n) && n > 20000) {
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

// Bandera simple por código ISO2 (si tu dataset tiene país en texto, lo dejamos sin flag o lo mappeás luego)
function flagEmojiFromISO2(iso2: string) {
  const s = upper(iso2);
  if (s.length !== 2) return "";
  const A = 0x1f1e6;
  const codePoints = [...s].map((c) => A + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...codePoints);
}

export default function CountryRanking({ year, filePath, baseYear, limit = 18 }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string>("");

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
        setErr(e?.message ?? "Error leyendo nacionalidades");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  const detected = useMemo(() => {
    const keys = Object.keys(rows[0] ?? {});
    const lower = new Map(keys.map((k) => [String(k).trim().toLowerCase(), k]));

    const fechaKey = lower.get("fecha") ?? lower.get("date") ?? "";
    const paisKey =
      lower.get("pais") ??
      lower.get("país") ??
      lower.get("country") ??
      lower.get("nationality") ??
      "";
    const iso2Key = lower.get("iso2") ?? lower.get("country_code") ?? lower.get("code") ?? "";
    const continenteKey = lower.get("continente") ?? lower.get("continent") ?? "";
    const qtyKey = lower.get("cantidad") ?? lower.get("qty") ?? lower.get("count") ?? "";

    return { fechaKey, paisKey, iso2Key, continenteKey, qtyKey, keys };
  }, [rows]);

  const filtered = useMemo(() => {
    const { fechaKey, paisKey, continenteKey, qtyKey, iso2Key } = detected;
    if (!rows.length || !fechaKey || !paisKey || !continenteKey || !qtyKey) return [];

    return rows
      .map((r) => {
        const y = tryYear(r[fechaKey]);
        const pais = norm(r[paisKey]);
        const cont = norm(r[continenteKey]);
        const iso2 = iso2Key ? norm(r[iso2Key]) : "";
        const qty = parseEsNumber(r[qtyKey]);
        return { y, pais, cont, iso2, qty };
      })
      .filter((r) => r.y === year);
  }, [rows, detected, year]);

  const byCountry = useMemo(() => {
    const m = new Map<string, { pais: string; iso2: string; qty: number; cont: string }>();
    for (const r of filtered) {
      const key = upper(r.pais) || "SIN_PAIS";
      const prev = m.get(key);
      if (!prev) m.set(key, { pais: r.pais || "—", iso2: r.iso2, qty: r.qty || 0, cont: r.cont || "—" });
      else prev.qty += r.qty || 0;
    }
    const list = Array.from(m.values()).sort((a, b) => b.qty - a.qty);
    return list.slice(0, limit);
  }, [filtered, limit]);

  const byCont = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) {
      const key = upper(r.cont) || "—";
      m.set(key, (m.get(key) ?? 0) + (r.qty || 0));
    }
    return Array.from(m.entries())
      .map(([k, v]) => ({ cont: k, qty: v }))
      .sort((a, b) => b.qty - a.qty);
  }, [filtered]);

  const total = byCont.reduce((acc, x) => acc + x.qty, 0);
  const maxCountry = Math.max(1, ...byCountry.map((x) => x.qty));
  const maxCont = Math.max(1, ...byCont.map((x) => x.qty));

  return (
    <div>
      <div style={{ display: "flex", gap: ".75rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 950, fontSize: "1.1rem" }}>Nacionalidades — {year}</div>
        <div style={{ marginLeft: "auto", opacity: 0.85, fontWeight: 800 }}>
          Total registros: {fmtInt(total)}
        </div>
      </div>

      {err ? <div style={{ marginTop: ".8rem", color: "#ffb4b4", fontWeight: 700 }}>{err}</div> : null}

      {!err && rows.length > 0 && (!detected.fechaKey || !detected.paisKey || !detected.continenteKey || !detected.qtyKey) ? (
        <div style={{ marginTop: ".8rem", opacity: 0.85 }}>
          No pude detectar headers (Fecha / País / Continente / Cantidad).
          <div style={{ marginTop: ".35rem", opacity: 0.8 }}>
            Keys ejemplo: {detected.keys.slice(0, 12).join(", ")}
          </div>
        </div>
      ) : null}

      {!err && rows.length > 0 && filtered.length === 0 ? (
        <div style={{ marginTop: ".8rem", opacity: 0.85 }}>
          Sin datos para {year}. (Revisá que la columna Fecha tenga fechas válidas para ese año.)
        </div>
      ) : null}

      {/* Layout: País grande / Continente chico */}
      <div
        style={{
          marginTop: "1rem",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)",
          gap: "1rem",
          alignItems: "start",
        }}
      >
        {/* País (grande) */}
        <div
          style={{
            padding: "1rem",
            borderRadius: 22,
            border: "1px solid rgba(255,255,255,.10)",
            background: "rgba(255,255,255,.03)",
          }}
        >
          <div style={{ fontWeight: 950, marginBottom: ".65rem" }}>Ranking por país</div>

          <div style={{ display: "grid", gap: ".55rem" }}>
            {byCountry.map((c, idx) => {
              const w = Math.max(2, (c.qty / maxCountry) * 100);
              const flag = flagEmojiFromISO2(c.iso2);
              return (
                <div
                  key={`${c.pais}-${idx}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "42px 1fr 1fr 90px",
                    gap: ".6rem",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: 42,
                      height: 32,
                      borderRadius: 12,
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(255,255,255,.06)",
                      border: "1px solid rgba(255,255,255,.08)",
                      fontSize: "1.1rem",
                    }}
                    title={c.iso2}
                  >
                    {flag || "🌍"}
                  </div>

                  <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {idx + 1}. {c.pais}
                    <div style={{ opacity: 0.7, fontWeight: 700, fontSize: ".85rem" }}>{c.cont}</div>
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
                        borderRadius: 999,
                        background: "linear-gradient(90deg, #60A5FA, #A78BFA)",
                      }}
                    />
                  </div>

                  <div style={{ textAlign: "right", fontWeight: 950 }}>{fmtInt(c.qty)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Continente (chico) */}
        <div
          style={{
            padding: "1rem",
            borderRadius: 22,
            border: "1px solid rgba(255,255,255,.10)",
            background: "rgba(255,255,255,.02)",
          }}
        >
          <div style={{ fontWeight: 950, marginBottom: ".65rem" }}>Por continente</div>

          <div style={{ display: "grid", gap: ".55rem" }}>
            {byCont.map((c) => {
              const w = Math.max(2, (c.qty / maxCont) * 100);
              return (
                <div key={c.cont} style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: ".6rem", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{c.cont}</div>
                    <div
                      style={{
                        marginTop: ".35rem",
                        height: 10,
                        borderRadius: 999,
                        background: "rgba(255,255,255,.08)",
                        overflow: "hidden",
                        border: "1px solid rgba(255,255,255,.08)",
                      }}
                    >
                      <div style={{ width: `${w}%`, height: "100%", borderRadius: 999, background: "#34D399" }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontWeight: 950 }}>{fmtInt(c.qty)}</div>
                </div>
              );
            })}
          </div>

          {/* Mapa: si ya tenés el <img> del mapa, lo podés sumar acá */}
          <div style={{ marginTop: ".9rem", opacity: 0.75, fontSize: ".9rem" }}>
            Mapa: si tu versión anterior lo traía como imagen/svg, lo reintegramos acá en el mismo bloque.
          </div>
        </div>
      </div>
    </div>
  );
}
