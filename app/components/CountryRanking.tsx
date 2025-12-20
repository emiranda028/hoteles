"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Props = {
  year: number;
  filePath?: string;
  hotelFilter?: string; // "JCR" o nombre de hotel
  limit?: number;
};

type Row = {
  hotel: string;
  country: string;
  continent: string;
  qty: number;
  year: number | null;
};

function normStr(s: any) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function safeNum(v: any): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const out = s.replace(/\./g, "").replace(",", ".");
  const n = Number(out);
  return Number.isFinite(n) ? n : 0;
}

function parseYear(v: any): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.getFullYear() : null;
}

/* =====================
   ISO → BANDERA (SAFE)
   ===================== */
function iso2ToFlag(iso2: string) {
  const s = iso2.toUpperCase();
  if (s.length !== 2) return "🏳️";
  const A = 0x1f1e6;
  return String.fromCodePoint(
    A + (s.charCodeAt(0) - 65),
    A + (s.charCodeAt(1) - 65)
  );
}

/* =====================
   COUNTRY → ISO2 MAP
   (CLAVES CON COMILLAS)
   ===================== */
const COUNTRY_TO_ISO2: Record<string, string> = {
  "ARGENTINA": "AR",
  "BRASIL": "BR",
  "BRAZIL": "BR",
  "URUGUAY": "UY",
  "CHILE": "CL",
  "PARAGUAY": "PY",
  "BOLIVIA": "BO",
  "PERU": "PE",
  "PERÚ": "PE",
  "COLOMBIA": "CO",
  "MEXICO": "MX",
  "MÉXICO": "MX",
  "UNITED STATES": "US",
  "ESTADOS UNIDOS": "US",
  "USA": "US",
  "SPAIN": "ES",
  "ESPAÑA": "ES",
  "ITALY": "IT",
  "ITALIA": "IT",
  "FRANCE": "FR",
  "FRANCIA": "FR",
  "GERMANY": "DE",
  "ALEMANIA": "DE",
  "UNITED KINGDOM": "GB",
  "REINO UNIDO": "GB",
};

function countryToIso2(country: string) {
  return COUNTRY_TO_ISO2[normStr(country)] ?? "";
}

export default function CountryRanking({
  year,
  filePath = "/data/jcr_nacionalidades.xlsx",
  hotelFilter = "JCR",
  limit = 12,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [
