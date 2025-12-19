"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Row = {
  year: number;
  hotel: string;
  membership: string;
  value: number;
};

type Props = {
  year: number;
  baseYear: number;
  hotelsJCR: string[];
  filePath?: string;
};

const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR");

function normalizeKey(s: string) {
  return (s ?? "")
    .toString()
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function pctDelta(cur: number, base: number) {
  if (!base || base === 0) return cur ? 100 : 0;
  return ((cur / base) - 1) * 100;
}

export default function MembershipSummary({
  year,
  baseYear,
  hotelsJCR,
  filePath = "/data/jcr_membership.xlsx",
}: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setError("");
        const wb = await readXlsxFromPublic(filePath);

        // Agarra la primera sheet disponible
        const sheetName = wb.SheetNames?.[0];
        if (!sheetName) throw new Error("El Excel no tiene hojas.");

        const sheet = wb.Sheets[sheetName];
        const json: any[] = (window as any).XLSX.utils.sheet_to_json(sheet, { defval: "" });

        // Mapea columnas posibles (tolerante)
        const mapped: Row[] = json
          .map((r) => {
            const YEAR = Number(r["Año"] ?? r["ANIO"] ?? r["Year"] ?? r["YEAR"] ?? r["anio"] ?? "");
            const HOTEL = String(r["Hotel"] ?? r["HOTEL"] ?? r["Empresa"] ?? r["EMPRESA"] ?? r["empresa"] ?? "").trim();
            const MEMB = String(
              r["Membership"] ?? r["MEMBERSHIP"] ?? r["Membresía"] ?? r["MEMBRESIA"] ?? r["membresia"] ?? r["Tipo"] ?? r["TIPO"] ?? ""
            ).trim();
            const VAL = Number(
              String(r["Importe"] ?? r["IMPORTE"] ?? r["Cantidad"] ?? r["CANTIDAD"] ?? r["Value"] ?? r["VALUE"] ?? r["valor"] ?? "0")
                .replace(/\./g, "")
                .replace(",", ".")
            );

            if (!YEAR || !HOTEL || !MEMB) return null;
            return {
              year: YEAR,
              hotel: HOTEL,
              membership: MEMB,
              value: isFinite(VAL) ? VAL : 0,
            } as Row;
          })
          .filter(Boolean) as Row[];

        if (alive) setRows(mapped);
      } catch (e: any) {
        if (alive) setError(e?.message ?? "Error cargando Excel.");
      }
    })();

    return () => {
      alive = false;
    };
  }, [filePath]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const hotelsSet = new Set((hotelsJCR ?? []).map(normalizeKey));
    return rows.filter((r) => hotelsSet.has(normalizeKey(r.hotel)));
  }, [rows, hotelsJCR]);

  const yearsAvailable = useMemo(() => {
    const ys = Array.from(new Set(filtered.map((r) => r.year))).sort((a, b) => a - b);
    return ys;
  }, [filtered]);

  const sumMap = (y: number) => {
    const m = new Map<string, number>();
    filtered
      .filter((r) => r.year === y)
      .forEach((r) => {
        const k = String(r.membership ?? "").trim();
        m.set(k, (m.get(k) ?? 0) + (r.value ?? 0));
      });
    return m;
  };

  const computed = useMemo(() => {
    const cur = sumMap(year);
    const base = sumMap(baseYear);

    // ✅ FIX VERCEL/TS: NO usar spreads sobre Iterator (cur.keys(), base.keys()).
    const keys = Array.from(new Set([...Array.from(cur.keys()), ...Array.from(base.keys())]));

    const list = keys
      .map((k) => {
        const curVal = cur.get(k) ?? 0;
        const baseVal = base.get(k) ?? 0;
        const d = pctDelta(curVal, baseVal);
        return { membership: k, key: normalizeKey(k), cur: curVal, base: baseVal, deltaPct: d };
      })
      .sort((a, b) => b.cur - a.cur);

    const totalCur = list.reduce((acc, x) => acc + (x.cur ?? 0), 0);
    const totalBase = list.reduce((acc, x) => acc + (x.base ?? 0), 0);

    return { list, totalCur, totalBase };
  }, [filtered, year, baseYear]);

  if (error) {
    return (
      <div className="card">
        <div className="cardTitle">Membership (JCR)</div>
        <div className="cardNote" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      </div>
    );
  }

  if (!rows) {
    return (
      <div className="card">
        <div className="cardTitle">Membership (JCR)</div>
        <div className="cardNote">Cargando Excel…</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="cardTop" style={{ alignItems: "baseline" }}>
        <div>
          <div className="cardTitle">Membership (JCR)</div>
          <div className="cardNote" style={{ marginTop: ".25rem" }}>
            Consolidado desde Excel · {year} vs {baseYear}
          </div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div className="cardNote">Total {year}</div>
          <div className="cardValue">{fmtInt(computed.totalCur)}</div>
        </div>
      </div>

      {computed.list.length === 0 ? (
        <div className="cardNote" style={{ marginTop: ".75rem" }}>
          Sin datos para {year}. Años disponibles: {yearsAvailable.length ? yearsAvailable.join(", ") : "—"}
        </div>
      ) : (
        <div style={{ marginTop: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr .8fr .8fr .7fr", gap: ".6rem" }}>
            <div className="cardNote" style={{ fontWeight: 700 }}>
              Tipo
            </div>
            <div className="cardNote" style={{ fontWeight: 700, textAlign: "right" }}>
              {year}
            </div>
            <div className="cardNote" style={{ fontWeight: 700, textAlign: "right" }}>
              {baseYear}
            </div>
            <div className="cardNote" style={{ fontWeight: 700, textAlign: "right" }}>
              Δ
            </div>

            {computed.list.map((r) => {
              const up = (r.deltaPct ?? 0) >= 0;
              return (
                <div
                  key={r.key}
                  style={{
                    display: "contents",
                  }}
                >
                  <div className="cardNote" style={{ padding: ".15rem 0" }}>
                    {r.membership}
                  </div>
                  <div className="cardNote" style={{ padding: ".15rem 0", textAlign: "right" }}>
                    <strong>{fmtInt(r.cur)}</strong>
                  </div>
                  <div className="cardNote" style={{ padding: ".15rem 0", textAlign: "right", opacity: 0.8 }}>
                    {fmtInt(r.base)}
                  </div>
                  <div
                    className="cardNote"
                    style={{
                      padding: ".15rem 0",
                      textAlign: "right",
                      color: up ? "var(--success)" : "var(--danger)",
                      fontWeight: 700,
                    }}
                  >
                    {up ? "+" : ""}
                    {r.deltaPct.toFixed(1).replace(".", ",")}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

