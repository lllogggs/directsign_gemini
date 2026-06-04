import { strToU8, zipSync } from "fflate";

export type XlsxCellValue = string | number | boolean | null | undefined;

export type XlsxSheet = {
  name: string;
  columns: string[];
  rows: XlsxCellValue[][];
};

export type XlsxWorkbook = {
  fileName: string;
  sheets: XlsxSheet[];
};

const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const escapeXml = (value: XlsxCellValue) =>
  String(value ?? "")
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 || code === 9 || code === 10 || code === 13;
    })
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const sanitizeSheetName = (name: string, fallback: string) => {
  const cleaned = name.replace(/[\\/?*:[\]]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, 31);
};

const sanitizeFileName = (name: string) => {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.endsWith(".xlsx") ? cleaned : `${cleaned || "dashboard"}.xlsx`;
};

const columnName = (index: number) => {
  let value = index + 1;
  let label = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
};

const columnWidth = (column: string, rows: XlsxCellValue[][], index: number) => {
  const maxLength = rows.reduce(
    (max, row) => Math.max(max, String(row[index] ?? "").length),
    column.length,
  );
  return Math.min(Math.max(maxLength + 3, 10), 44);
};

const worksheetXml = (sheet: XlsxSheet) => {
  const rows = [sheet.columns, ...sheet.rows];
  const lastColumn = columnName(Math.max(sheet.columns.length - 1, 0));
  const dimension = `${rows.length > 0 ? "A1" : "A1"}:${lastColumn || "A"}${Math.max(rows.length, 1)}`;
  const columnDefinitions = sheet.columns
    .map((column, index) => {
      const width = columnWidth(column, sheet.rows, index);
      const position = index + 1;
      return `<col min="${position}" max="${position}" width="${width}" customWidth="1"/>`;
    })
    .join("");
  const rowXml = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = sheet.columns
        .map((_, columnIndex) => {
          const reference = `${columnName(columnIndex)}${rowNumber}`;
          const value = row[columnIndex];
          const style = rowIndex === 0 ? ' s="1"' : "";
          return `<c r="${reference}" t="inlineStr"${style}><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");

  return `${xmlHeader}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dimension}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columnDefinitions}</cols><sheetData>${rowXml}</sheetData></worksheet>`;
};

const workbookXml = (sheets: XlsxSheet[]) =>
  `${xmlHeader}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sanitizeSheetName(sheet.name, `Sheet ${index + 1}`))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("")}</sheets></workbook>`;

const workbookRelsXml = (sheets: XlsxSheet[]) =>
  `${xmlHeader}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map(
      (_sheet, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const contentTypesXml = (sheets: XlsxSheet[]) =>
  `${xmlHeader}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
    .map(
      (_sheet, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("")}</Types>`;

const stylesXml = `${xmlHeader}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F1"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`;

const packageRelsXml = `${xmlHeader}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

export function buildXlsx(workbook: XlsxWorkbook) {
  const sheets = workbook.sheets.length
    ? workbook.sheets
    : [{ name: "Sheet 1", columns: ["항목"], rows: [] }];
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypesXml(sheets)),
    "_rels/.rels": strToU8(packageRelsXml),
    "xl/workbook.xml": strToU8(workbookXml(sheets)),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelsXml(sheets)),
    "xl/styles.xml": strToU8(stylesXml),
  };

  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(worksheetXml(sheet));
  });

  return zipSync(files, { level: 6 });
}

export function downloadXlsx(workbook: XlsxWorkbook) {
  const bytes = buildXlsx(workbook);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = sanitizeFileName(workbook.fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
