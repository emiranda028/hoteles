// app/components/xlsxClient.ts
export type XlsxRow = Record<string, any>;

export async function readXlsxFromPublic(
  filePath: string,
  options?: { sheetName?: string }
): Promise<{ sheet: string; sheetName: string; rows: XlsxRow[] }> {
  const res = await fetch(filePath, { cache: "no-store" });
  if (!res.ok) throw new Error(`No pude leer XLSX: ${filePath} (${res.status})`);

  const buf = await res.arrayBuffer();

  // xlsx corre en client; lo importamos dinámico para que Next no lo intente “server”
  const XLSX = await import("xlsx");

  const wb = XLSX.read(buf, { type: "array" });

  const wanted = options?.sheetName?.trim();
  const sheetName = wanted && wb.SheetNames.includes(wanted) ? wanted : wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, {
    defval: "",
    raw: false, // deja strings; luego vos parseás si querés
  }) as XlsxRow[];

  return { sheet: sheetName, sheetName, rows };
}
