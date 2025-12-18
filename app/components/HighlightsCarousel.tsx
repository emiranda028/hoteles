"use client";

import { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic } from "./csvClient";

/* =========================
   Tipos y helpers
========================= */

type HofRow = {
  empresa: string;
  year: number;
  occupied: number;
  guests: number;
  revenue: number;
};

const AVAIL_PER_DAY: Record<string, number> = {
  MARRIOTT: 300,
  "SHERATON MDQ": 194,
  "SHERATON BCR": 161,
};

function toNumberIntl(x: any) {
  if (!x) return 0;
  const s = String(x).replace("%", "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseYear(fecha: any) {
  const s = String(fecha ?? "");
  const parts = s.split(/[\/\-]/);
  return Number(parts[2]);
}

function fmtInt(n: number) {
  return n.toLocaleString("es-AR");
}

function fmtMoney(n: number) {
  return "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtPct(p: number) {
  return p.toFixed(1).replace(".", ",") + "%";
}

/* =========================
   Componente
========================= */

export default function HighlightsCarousel({
  filePath = "/data/hf_diario.csv",
  year,
  baseYear,
}: {
  filePath?: string;
  year: number;
  baseYear: number;
}) {
  const [rows, setRows] = useState<HofRow[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    readCsvFromPublic(filePath).then(({ rows }) => {
      const parsed: HofRow[] = rows
        .map((r: any) => ({
          empresa: r["Empresa"],
          year: parseYear(r["Fecha"]),
          occupied: toNumberIntl(r["Total Occ."]),
          guests: toNumberIntl(r["Adl. & Chl."]),
          revenue: toNumberIntl(r["Room Revenue"]),
        }))
        .filter(r => r.year);

      setRows(parsed);
    });
  }, [filePath]);

  // auto-rotación
  useEffect(() => {
    const id = setInterval(() => {
      setIndex(i => (i + 1) % 4);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const metrics = useMemo(() => {
    const byYear = (y: number) => rows.filter(r => r.year === y);

    const cur = byYear(year);
    const base = byYear(baseYear);

    const guestsCur = cur.reduce((s, r) => s + r.guests, 0);
    const guestsBase = base.reduce((s, r) => s + r.guests, 0);

    const revCur = cur.reduce((s, r) => s + r.revenue, 0);
    const revBase = base.reduce((s, r) => s + r.revenue, 0);

    const occ = (arr: HofRow[]) => {
      let occ = 0;
      let avail = 0;
      arr.forEach(r => {
        occ += r.occupied;
        avail += AVAIL_PER_DAY[r.empresa] ?? 0;
      });
      return avail > 0 ? occ / avail : 0;
    };

    return {
      guestsCur,
      guestsDeltaPct: guestsBase ? ((guestsCur / guestsBase) - 1) * 100 : 0,
      revCur,
      revDeltaPct: revBase ? ((revCur / revBase) - 1) * 100 : 0,
      occCur: occ(cur),
      occDeltaPP: (occ(cur) - occ(base)) * 100,
    };
  }, [rows, year, baseYear]);

  const slides = [
    {
      bg: "linear-gradient(135deg, #1e3a8a, #2563eb)",
      title: `${year} en el Grupo JCR`,
      big: `${fmtInt(metrics.guestsCur)} huéspedes`,
      sub: `${metrics.guestsDeltaPct >= 0 ? "+" : ""}${fmtPct(metrics.guestsDeltaPct)} vs ${baseYear}`,
    },
    {
      bg: "linear-gradient(135deg, #065f46, #10b981)",
      title: "Ocupación promedio",
      big: fmtPct(metrics.occCur * 100),
      sub: `${metrics.occDeltaPP >= 0 ? "+" : ""}${metrics.occDeltaPP.toFixed(1).replace(".", ",")} p.p.`,
    },
    {
      bg: "linear-gradient(135deg, #7c2d12, #f97316)",
      title: "Room Revenue",
      big: fmtMoney(metrics.revCur),
      sub: `${metrics.revDeltaPct >= 0 ? "+" : ""}${fmtPct(metrics.revDeltaPct)} interanual`,
    },
    {
      bg: "linear-gradient(135deg, #312e81, #6366f1)",
      title: "Insight clave",
      big: "Crecimiento sostenido",
      sub: "Mejora simultánea en ocupación y revenue",
    },
  ];

  return (
    <section
      style={{
        width: "100%",
        overflow: "hidden",
        borderRadius: "18px",
        marginBottom: "2rem",
      }}
    >
      <div
        style={{
          display: "flex",
          transform: `translateX(-${index * 100}%)`,
          transition: "transform .8s ease",
        }}
      >
        {slides.map((s, i) => (
          <div
            key={i}
            style={{
              minWidth: "100%",
              padding: "3rem 2.5rem",
              color: "white",
              background: s.bg,
            }}
          >
            <div style={{ fontSize: "1.1rem", opacity: .9 }}>{s.title}</div>
            <div style={{ fontSize: "3.2rem", fontWeight: 800, margin: ".6rem 0" }}>
              {s.big}
            </div>
            <div style={{ fontSize: "1.2rem", opacity: .9 }}>{s.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
