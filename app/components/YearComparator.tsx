// app/components/csvClient.ts
// Cliente liviano para leer CSV desde /public (por ej: /data/hf_diario.csv)
// - Devuelve { rows, columns } para compatibilidad con .then(({ rows }) => ...)
// - Incluye helpers numéricos/formatos para KPIs y carrouseles

export type CsvRow = Record<string, string>;

export type ReadCsvResult = {
  rows: CsvRow[];
  columns: string[];
};

function detectDelimiter(headerLine: string): "," | ";" | "\t" {
  const commas = (headerLine.match(/,/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  const tabs = (headerLine.match(/\t/g) || []).length;

  if (tabs >= semis && tabs >= commas) return "\t";
  if (semis >= commas) return ";";
  return ",";
}

// Parser CSV simple pero robusto (maneja comillas)
function parseLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur =
