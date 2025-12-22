// app/components/HofExplorer.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic, normalizeHofRows, HofNormalized } from "./csvClient";

type Props = {
  filePath: string; // ej: "/data/hf_diario.csv"
};

function upper(s: any) {
  return String(s ?? "").trim().toUpperCase();
}

export default function HofExplorer({ filePath }: Props) {
  const [rows, setRows] = useState<HofNormalized[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr("");

    readCsvFromPublic(filePath)
      .then((raw) => normalizeHofRows(raw))
      .then((norm) => {
        if (!mounted) return;
        setRows(norm);
        setLoading(false);
      })
      .catch((e: any) => {
        if (!mounted) return;
        setErr(String(e?.message ?? e));
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [filePath]);

  const stats = useMemo(() => {
    const empresas = new Map<string, number>();
    const years = new Map<number, number>();

    for (const r of rows) {
      const emp = upper(r.empresa);
      if (emp) empresas.set(emp, (empresas.get(emp) ?? 0) + 1);
      if (typeof r.year === "number") years.set(r.year, (years.get(r.year) ?? 0) + 1);
    }

    const empresasTop = Array.from(empresas.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    const yearsTop = Array.from(years.entries()).sort((a, b) => b[0] - a[0]);

    return { empresasTop, yearsTop, total: rows.length };
  }, [rows]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Cargando H&amp;F Explorer…
      </div>
    );
  }

  if (err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Error cargando CSV: {err}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: "1rem", borderRadius: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 950 }}>H&amp;F Explorer</div>
        <div style={{ opacity: 0.75, fontSize: ".9rem" }}>{stats.total} filas</div>
      </div>

      <div style={{ marginTop: ".6rem", opacity: 0.75, fontSize: ".9rem" }}>
        Archivo: <b>{filePath}</b>
      </div>

      <div style={{ marginTop: "1rem", display: "grid", gap: "1rem", gridTemplateColumns: "minmax(0,1fr)" }}>
        <div>
          <div style={{ fontWeight: 900, marginBottom: ".5rem" }}>Años detectados</div>
          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            {stats.yearsTop.length ? (
              stats.yearsTop.slice(0, 12).map(([y, n]) => (
                <span
                  key={y}
                  style={{
                    padding: ".35rem .55rem",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,.12)",
                    fontSize: ".85rem",
                  }}
                >
                  {y} <span style={{ opacity: 0.7 }}>({n})</span>
                </span>
              ))
            ) : (
              <span style={{ opacity: 0.7 }}>No se detectaron años.</span>
            )}
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 900, marginBottom: ".5rem" }}>Empresas detectadas (Top 15)</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.8 }}>
                  <th style={{ padding: ".45rem .35rem" }}>Empresa</th>
                  <th style={{ padding: ".45rem .35rem" }}>Filas</th>
                </tr>
              </thead>
              <tbody>
                {stats.empresasTop.length ? (
                  stats.empresasTop.map(([emp, n]) => (
                    <tr key={emp} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }}>
                      <td style={{ padding: ".5rem .35rem", fontWeight: 900 }}>{emp}</td>
                      <td style={{ padding: ".5rem .35rem", opacity: 0.85 }}>{n}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td style={{ padding: ".5rem .35rem", opacity: 0.7 }} colSpan={2}>
                      No hay empresas parseadas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ opacity: 0.75, fontSize: ".85rem" }}>
          Tip: si acá ves <b>MARRIOTT / SHERATON BCR / SHERATON MDQ / MAITEI</b> con filas, entonces el problema NO es el CSV
          sino el filtro/cálculo en otro componente.
        </div>
      </div>
    </div>
  );
}
