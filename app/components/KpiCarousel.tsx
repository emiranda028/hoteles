"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type KpiItem = {
  label: string;
  value: string;
  sub?: string;
};

type Props = {
  items: KpiItem[];
  tone?: "red" | "blue" | "neutral";
  /** ms entre slides */
  intervalMs?: number;
  /** si querés mostrar bullets */
  showDots?: boolean;
};

function gradForTone(tone: "red" | "blue" | "neutral", idx: number) {
  const red = [
    "linear-gradient(135deg, rgba(220,38,38,.95), rgba(251,113,133,.70))",
    "linear-gradient(135deg, rgba(249,115,22,.95), rgba(244,63,94,.65))",
    "linear-gradient(135deg, rgba(168,85,247,.95), rgba(244,63,94,.55))",
    "linear-gradient(135deg, rgba(59,130,246,.95), rgba(244,63,94,.50))",
  ];
  const blue = [
    "linear-gradient(135deg, rgba(59,130,246,.95), rgba(14,165,233,.70))",
    "linear-gradient(135deg, rgba(14,165,233,.95), rgba(56,189,248,.65))",
    "linear-gradient(135deg, rgba(16,185,129,.95), rgba(59,130,246,.55))",
    "linear-gradient(135deg, rgba(168,85,247,.95), rgba(59,130,246,.50))",
  ];
  const neutral = [
    "linear-gradient(135deg, rgba(255,255,255,.22), rgba(255,255,255,.06))",
    "linear-gradient(135deg, rgba(255,255,255,.18), rgba(255,255,255,.06))",
    "linear-gradient(135deg, rgba(255,255,255,.16), rgba(255,255,255,.06))",
    "linear-gradient(135deg, rgba(255,255,255,.14), rgba(255,255,255,.06))",
  ];

  const bank = tone === "blue" ? blue : tone === "red" ? red : neutral;
  return bank[idx % bank.length];
}

function Card({
  children,
  bg,
}: React.PropsWithChildren<{ bg: string }>) {
  return (
    <div
      style={{
        minWidth: 0,
        borderRadius: 18,
        padding: "1rem",
        border: "1px solid rgba(255,255,255,.12)",
        background: "rgba(255,255,255,.05)",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 16px 34px rgba(0,0,0,.18)",
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: bg, opacity: 0.18 }} />
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}

export default function KpiCarousel({
  items,
  tone = "neutral",
  intervalMs = 3800,
  showDots = true,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [idx, setIdx] = useState(0);

  const slides = useMemo(() => items ?? [], [items]);
  const count = slides.length;

  // auto-advance
  useEffect(() => {
    if (count <= 1) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % count);
    }, intervalMs);
    return () => clearInterval(t);
  }, [count, intervalMs]);

  // scroll to active
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const child = el.children[idx] as HTMLElement | undefined;
    if (!child) return;

    // scrollIntoView suave
    child.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }, [idx]);

  if (!count) return null;

  return (
    <div style={{ display: "grid", gap: ".55rem" }}>
      <div
        ref={trackRef}
        style={{
          display: "grid",
          gridAutoFlow: "column",
          gridAutoColumns: "minmax(260px, 1fr)",
          gap: ".85rem",
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          paddingBottom: ".25rem",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {slides.map((it, i) => (
          <div
            key={`${it.label}-${i}`}
            style={{
              scrollSnapAlign: "start",
              minWidth: 0,
            }}
            onMouseEnter={() => setIdx(i)}
          >
            <Card bg={gradForTone(tone, i)}>
              <div style={{ fontSize: ".92rem", opacity: 0.85, fontWeight: 850 }}>{it.label}</div>
              <div style={{ fontSize: "1.65rem", fontWeight: 950, marginTop: ".25rem" }}>{it.value}</div>
              {it.sub ? (
                <div style={{ marginTop: ".35rem", opacity: 0.78, fontSize: ".92rem" }}>{it.sub}</div>
              ) : null}
            </Card>
          </div>
        ))}
      </div>

      {showDots && count > 1 ? (
        <div style={{ display: "flex", gap: ".45rem", justifyContent: "center", alignItems: "center" }}>
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Ir a slide ${i + 1}`}
              style={{
                width: i === idx ? 26 : 10,
                height: 10,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,.20)",
                background:
                  i === idx
                    ? gradForTone(tone, i)
                    : "rgba(255,255,255,.10)",
                cursor: "pointer",
                transition: "all .18s ease",
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
