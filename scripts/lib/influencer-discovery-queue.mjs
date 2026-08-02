import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const FORMAT_VERSION = "1";
const DISCOVERY_KIND = "influencer-discovery";
const NAVER_VISITOR_KIND = "naver-blog-visitor";
const QUEUE_RELATIVE_PATH = path.join("data", "influencer-discovery-queue");
const DEFAULT_ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const PACKAGE_RELS_XML = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const STYLES_XML = `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F1"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`;
const CONTENT_TYPES_XML = `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
const WORKBOOK_XML = `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="profiles" sheetId="1" r:id="rId1"/><sheet name="meta" sheetId="2" r:id="rId2"/></sheets></workbook>`;
const WORKBOOK_RELS_XML = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

function queueRoot(rootDir = DEFAULT_ROOT_DIR) {
  return path.join(path.resolve(rootDir), QUEUE_RELATIVE_PATH);
}

function pendingDirectory(rootDir, kind) {
  return path.join(
    queueRoot(rootDir),
    "pending",
    kind === NAVER_VISITOR_KIND ? "naver-blog-visitors" : "profiles",
  );
}

function archiveDirectory(rootDir, kind) {
  return path.join(
    queueRoot(rootDir),
    "archive",
    kind === NAVER_VISITOR_KIND ? "naver-blog-visitors" : "profiles",
  );
}

function quarantineDirectory(rootDir, kind) {
  return path.join(
    queueRoot(rootDir),
    "quarantine",
    kind === NAVER_VISITOR_KIND ? "naver-blog-visitors" : "profiles",
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeIsoDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError(`${label} must be a valid date.`);
  }
  return date.toISOString();
}

function safeSegment(value, label) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  if (!normalized) throw new TypeError(`${label} is required.`);
  return normalized;
}

function timestampSegment(value) {
  return value.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeXml(value) {
  return String(value ?? "")
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 || code === 9 || code === 10 || code === 13;
    })
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#([0-9]+);/g, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function columnName(index) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function worksheetXml(rows) {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const lastColumn = columnName(columnCount - 1);
  const rowXml = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = Array.from({ length: columnCount }, (_, columnIndex) => {
        const value = row[columnIndex] ?? "";
        const style = rowIndex === 0 ? ' s="1"' : "";
        return `<c r="${columnName(columnIndex)}${rowNumber}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
      }).join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");
  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${Math.max(rows.length, 1)}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${rowXml}</sheetData></worksheet>`;
}

function rowIdentifier(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new TypeError("Every queued row must be an object.");
  }
  for (const key of [
    "id",
    "profile_id",
    "profileId",
    "discovered_influencer_profile_id",
    "influencer_id",
    "blog_id",
  ]) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }
  throw new TypeError("Every queued row must have a stable id.");
}

function serializedRows(rows) {
  if (!Array.isArray(rows)) throw new TypeError("rows must be an array.");
  return rows.map((row) => {
    const id = rowIdentifier(row);
    const payload = JSON.stringify(row);
    if (payload === undefined) {
      throw new TypeError(`Queued row ${id} is not JSON serializable.`);
    }
    return { id, payload };
  });
}

function countryConfidenceRank(value) {
  const confidence = String(value ?? "").trim().toLowerCase();
  if (confidence === "manual_verified") return 6;
  if (confidence === "official") return 5;
  if (confidence === "explicit") return 4;
  if (confidence === "curated") return 3;
  if (confidence === "inherited") return 2;
  return 0;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value ?? null;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function mergeUniqueValues(earlier = [], later = []) {
  const merged = [];
  const seen = new Set();
  for (const value of [...earlier, ...later]) {
    const key = JSON.stringify(stableValue(value));
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(value);
  }
  return merged;
}

function mergeEvidenceValue(earlier, later, key = "") {
  if (later === undefined || later === null || later === "") return earlier;
  if (earlier === undefined || earlier === null || earlier === "") return later;
  if (Array.isArray(earlier) || Array.isArray(later)) {
    const merged = mergeUniqueValues(
      Array.isArray(earlier) ? earlier : [earlier],
      Array.isArray(later) ? later : [later],
    );
    if (key === "recentPosts") {
      return merged
        .sort((left, right) =>
          String(right?.publishedDate ?? "").localeCompare(
            String(left?.publishedDate ?? ""),
          ),
        )
        .slice(0, 3);
    }
    return merged;
  }
  if (
    typeof earlier === "object" &&
    typeof later === "object" &&
    !Array.isArray(earlier) &&
    !Array.isArray(later)
  ) {
    const result = { ...earlier };
    for (const [childKey, value] of Object.entries(later)) {
      result[childKey] = mergeEvidenceValue(earlier[childKey], value, childKey);
    }
    return result;
  }
  return later;
}

function normalizeStringList(value) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((item) => String(item ?? "").trim())
        .filter(Boolean),
    ),
  );
}

function mergePendingRows(earlier, later) {
  const earlierEvidence = earlier?.source_evidence ?? {};
  const laterEvidence = later?.source_evidence ?? {};
  const hasSourceEvidence =
    Boolean(earlier?.source_evidence) || Boolean(later?.source_evidence);
  const mergedEvidence = mergeEvidenceValue(earlierEvidence, laterEvidence) ?? {};
  const earlierCountryRank = countryConfidenceRank(earlierEvidence.countryConfidence);
  const laterCountryRank = countryConfidenceRank(laterEvidence.countryConfidence);
  const earlierCountries = normalizeStringList(earlier?.audience_countries);
  const laterCountries = normalizeStringList(later?.audience_countries);

  let audienceCountries = laterCountries;
  if (earlierCountryRank > laterCountryRank) {
    audienceCountries = earlierCountries;
    mergedEvidence.countryConfidence = earlierEvidence.countryConfidence;
  } else if (earlierCountryRank === laterCountryRank && earlierCountryRank >= 4) {
    audienceCountries = normalizeStringList([...earlierCountries, ...laterCountries]);
  }
  mergedEvidence.countrySignals = mergeUniqueValues(
    Array.isArray(earlierEvidence.countrySignals) ? earlierEvidence.countrySignals : [],
    Array.isArray(laterEvidence.countrySignals) ? laterEvidence.countrySignals : [],
  );
  if (earlierEvidence.countryLock === true || laterEvidence.countryLock === true) {
    mergedEvidence.countryLock = true;
  }
  if (
    earlierEvidence.countryStatusLock === true ||
    laterEvidence.countryStatusLock === true
  ) {
    mergedEvidence.countryStatusLock = true;
  }

  const sourceUrls = mergeUniqueValues(
    [
      ...(Array.isArray(earlierEvidence.sourceUrls) ? earlierEvidence.sourceUrls : []),
      earlierEvidence.sourceUrl,
      earlier?.source_url,
    ].filter(Boolean),
    [
      ...(Array.isArray(laterEvidence.sourceUrls) ? laterEvidence.sourceUrls : []),
      laterEvidence.sourceUrl,
      later?.source_url,
    ].filter(Boolean),
  );
  if (sourceUrls.length > 0) mergedEvidence.sourceUrls = sourceUrls;

  let status = later?.status;
  if (
    ["hidden", "claimed"].includes(String(earlier?.status ?? "")) &&
    !["hidden", "claimed"].includes(String(later?.status ?? ""))
  ) {
    status = earlier.status;
  }

  return {
    ...earlier,
    ...later,
    ...(audienceCountries.length > 0 || "audience_countries" in later
      ? { audience_countries: audienceCountries }
      : {}),
    ...(status ? { status } : {}),
    ...(hasSourceEvidence ? { source_evidence: mergedEvidence } : {}),
  };
}

function buildWorkbookBytes({
  kind,
  runId,
  createdAt,
  category,
  platform,
  rows,
  extraMeta = {},
}) {
  const encodedRows = serializedRows(rows);
  const profiles = [
    ["id", "created_at", "category", "platform", "payload_json"],
    ...encodedRows.map(({ id, payload }) => [
      id,
      createdAt,
      category,
      platform,
      payload,
    ]),
  ];
  const payloadChecksum = sha256(
    encodedRows.map(({ id, payload }) => `${id}\0${payload}\n`).join(""),
  );
  const metaValues = {
    format_version: FORMAT_VERSION,
    kind,
    run_id: runId,
    created_at: createdAt,
    category,
    platform,
    row_count: String(rows.length),
    payload_sha256: payloadChecksum,
    ...extraMeta,
  };
  const meta = [
    ["key", "value"],
    ...Object.entries(metaValues).map(([key, value]) => [key, String(value ?? "")]),
  ];
  return zipSync(
    {
      "[Content_Types].xml": strToU8(CONTENT_TYPES_XML),
      "_rels/.rels": strToU8(PACKAGE_RELS_XML),
      "xl/workbook.xml": strToU8(WORKBOOK_XML),
      "xl/_rels/workbook.xml.rels": strToU8(WORKBOOK_RELS_XML),
      "xl/styles.xml": strToU8(STYLES_XML),
      "xl/worksheets/sheet1.xml": strToU8(worksheetXml(profiles)),
      "xl/worksheets/sheet2.xml": strToU8(worksheetXml(meta)),
    },
    { level: 6 },
  );
}

function parseWorksheet(xml) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b[^>]*>([\s\S]*?)<\/c>/g)) {
      const textMatch = cellMatch[1].match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
      cells.push(unescapeXml(textMatch?.[1] ?? ""));
    }
    rows.push(cells);
  }
  return rows;
}

function parseWorkbookBytes(bytes, filePath = "") {
  let files;
  try {
    files = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  } catch (error) {
    throw new Error(`Invalid XLSX queue workbook${filePath ? `: ${filePath}` : ""}`, {
      cause: error,
    });
  }
  const profilesXml = files["xl/worksheets/sheet1.xml"];
  const metaXml = files["xl/worksheets/sheet2.xml"];
  const workbookXml = files["xl/workbook.xml"];
  if (!profilesXml || !metaXml || !workbookXml) {
    throw new Error(`Queue workbook is missing required profiles/meta sheets: ${filePath}`);
  }
  const workbookText = strFromU8(workbookXml);
  if (!workbookText.includes('name="profiles"') || !workbookText.includes('name="meta"')) {
    throw new Error(`Queue workbook has an unexpected sheet layout: ${filePath}`);
  }

  const profileRows = parseWorksheet(strFromU8(profilesXml));
  const metaRows = parseWorksheet(strFromU8(metaXml));
  const profileHeaders = profileRows[0] ?? [];
  const payloadIndex = profileHeaders.indexOf("payload_json");
  const idIndex = profileHeaders.indexOf("id");
  if (payloadIndex < 0 || idIndex < 0) {
    throw new Error(`Queue workbook is missing id or payload_json columns: ${filePath}`);
  }
  const meta = Object.fromEntries(
    metaRows.slice(1).filter((row) => row[0]).map((row) => [row[0], row[1] ?? ""]),
  );
  if (meta.format_version !== FORMAT_VERSION) {
    throw new Error(`Unsupported queue workbook format: ${meta.format_version ?? "missing"}`);
  }

  const rows = profileRows.slice(1).map((row, index) => {
    try {
      const payload = JSON.parse(row[payloadIndex] ?? "");
      const id = rowIdentifier(payload);
      if (id !== row[idIndex]) {
        throw new Error(`id mismatch (${row[idIndex]} vs ${id})`);
      }
      return payload;
    } catch (error) {
      throw new Error(`Invalid payload_json in queue workbook row ${index + 2}: ${filePath}`, {
        cause: error,
      });
    }
  });
  if (Number.parseInt(meta.row_count ?? "", 10) !== rows.length) {
    throw new Error(`Queue workbook row count verification failed: ${filePath}`);
  }
  const expectedPayloadChecksum = sha256(
    rows
      .map((row) => `${rowIdentifier(row)}\0${JSON.stringify(row)}\n`)
      .join(""),
  );
  if (meta.payload_sha256 !== expectedPayloadChecksum) {
    throw new Error(`Queue workbook payload checksum verification failed: ${filePath}`);
  }

  return {
    filePath,
    kind: meta.kind,
    runId: meta.run_id,
    createdAt: normalizeIsoDate(meta.created_at, "workbook created_at"),
    category: meta.category ?? "",
    platform: meta.platform ?? "",
    rows,
    meta,
  };
}

async function atomicWriteImmutable(filePath, bytes) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
    const error = new Error(`Immutable queue workbook already exists: ${filePath}`);
    error.code = "EEXIST";
    throw error;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const partialPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.partial`,
  );
  let handle;
  try {
    handle = await fs.open(partialPath, "wx");
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    try {
      await fs.access(filePath);
      const error = new Error(`Immutable queue workbook already exists: ${filePath}`);
      error.code = "EEXIST";
      throw error;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await fs.rename(partialPath, filePath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.rm(partialPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function stageWorkbook({
  rootDir,
  kind,
  runId,
  createdAt,
  category = "",
  platform = "",
  rows,
}) {
  const normalizedRunId = safeSegment(runId, "runId");
  const normalizedCreatedAt = normalizeIsoDate(createdAt, "createdAt");
  const fileName = `${timestampSegment(normalizedCreatedAt)}--${normalizedRunId}.xlsx`;
  const filePath = path.join(pendingDirectory(rootDir, kind), fileName);
  const bytes = buildWorkbookBytes({
    kind,
    runId: normalizedRunId,
    createdAt: normalizedCreatedAt,
    category: String(category ?? ""),
    platform: String(platform ?? ""),
    rows,
  });
  await atomicWriteImmutable(filePath, bytes);
  const written = await fs.readFile(filePath);
  const parsed = parseWorkbookBytes(written, filePath);
  return {
    filePath,
    path: filePath,
    relativePath: path.relative(queueRoot(rootDir), filePath).replace(/\\/g, "/"),
    checksum: sha256(written),
    runId: parsed.runId,
    createdAt: parsed.createdAt,
    rowCount: parsed.rows.length,
    kind,
  };
}

export async function stageInfluencerDiscoveryWorkbook({
  rootDir,
  runId,
  createdAt,
  category,
  platform,
  rows,
}) {
  return stageWorkbook({
    rootDir,
    kind: DISCOVERY_KIND,
    runId,
    createdAt,
    category,
    platform,
    rows,
  });
}

export async function stageNaverVisitorWorkbook({
  rootDir,
  runId,
  createdAt,
  rows,
}) {
  return stageWorkbook({
    rootDir,
    kind: NAVER_VISITOR_KIND,
    runId,
    createdAt,
    category: "naver-blog-visitors",
    platform: "naver_blog",
    rows,
  });
}

export async function readInfluencerDiscoveryWorkbook(filePath) {
  const bytes = await fs.readFile(filePath);
  return parseWorkbookBytes(bytes, filePath);
}

async function readPendingBatch({ rootDir, kind }) {
  const directory = pendingDirectory(rootDir, kind);
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".xlsx"))
    .map((entry) => entry.name)
    .sort();
  const files = [];
  const quarantinedFiles = [];
  const latestById = new Map();

  for (const fileName of fileNames) {
    const filePath = path.join(directory, fileName);
    let bytes;
    let checksum;
    let workbook;
    try {
      bytes = await fs.readFile(filePath);
      checksum = sha256(bytes);
      workbook = parseWorkbookBytes(bytes, filePath);
      if (workbook.kind !== kind) {
        throw new Error(`Unexpected queue workbook kind ${workbook.kind}: ${filePath}`);
      }
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      const targetDirectory = quarantineDirectory(rootDir, kind);
      await fs.mkdir(targetDirectory, { recursive: true });
      const extension = path.extname(fileName);
      const stem = path.basename(fileName, extension);
      const suffix = checksum?.slice(0, 12) ?? randomUUID().slice(0, 12);
      const quarantinePath = path.join(
        targetDirectory,
        `${stem}--${suffix}${extension || ".xlsx"}`,
      );
      await fs.rename(filePath, quarantinePath);
      await fs.writeFile(
        `${quarantinePath}.error.txt`,
        `${error instanceof Error ? error.message : String(error)}\n`,
        "utf8",
      );
      quarantinedFiles.push({
        filePath: quarantinePath,
        originalFilePath: filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const relativePath = path.relative(queueRoot(rootDir), filePath).replace(/\\/g, "/");
    files.push({
      filePath,
      path: filePath,
      relativePath,
      checksum,
      size: bytes.byteLength,
      runId: workbook.runId,
      createdAt: workbook.createdAt,
      rowCount: workbook.rows.length,
      category: workbook.category,
      platform: workbook.platform,
    });
    for (const row of workbook.rows) {
      const id = rowIdentifier(row);
      const current = latestById.get(id);
      const incomingIsLater =
        !current ||
        workbook.createdAt > current.createdAt ||
        (workbook.createdAt === current.createdAt && relativePath > current.relativePath);
      if (!current) {
        latestById.set(id, {
          row,
          createdAt: workbook.createdAt,
          relativePath,
        });
      } else if (incomingIsLater) {
        latestById.set(id, {
          row: mergePendingRows(current.row, row),
          createdAt: workbook.createdAt,
          relativePath,
        });
      } else {
        latestById.set(id, {
          row: mergePendingRows(row, current.row),
          createdAt: current.createdAt,
          relativePath: current.relativePath,
        });
      }
    }
  }

  const checksum = sha256(
    files.map((file) => `${file.relativePath}\0${file.checksum}\n`).join(""),
  );
  const batchId = `${kind}-${checksum.slice(0, 24)}`;
  const rows = [...latestById.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, candidate]) => candidate.row);
  const oldestPendingAt = files.reduce(
    (oldest, file) => (!oldest || file.createdAt < oldest ? file.createdAt : oldest),
    null,
  );
  return {
    kind,
    batchId,
    checksum,
    files,
    rows,
    oldestPendingAt,
    quarantinedFiles,
  };
}

export async function readPendingInfluencerBatch({ rootDir } = {}) {
  return readPendingBatch({ rootDir, kind: DISCOVERY_KIND });
}

export async function readPendingNaverVisitorBatch({ rootDir } = {}) {
  return readPendingBatch({ rootDir, kind: NAVER_VISITOR_KIND });
}

function stateUploadDate(state) {
  if (!state || typeof state !== "object") return null;
  for (const key of [
    "lastSuccessfulUploadAt",
    "lastSuccessAt",
    "lastCompletedAt",
    "completedAt",
    "lastUploadedAt",
    "lastUploadAt",
  ]) {
    if (state[key]) return normalizeIsoDate(state[key], `state.${key}`);
  }
  return null;
}

/**
 * @param {{
 *   state?: Record<string, unknown> | null,
 *   now?: string | number | Date,
 *   intervalHours?: number,
 *   oldestPendingAt?: string | number | Date | null,
 * }} options
 */
export function isInfluencerBatchDue({
  state,
  now = new Date(),
  intervalHours = 12,
  oldestPendingAt,
}) {
  const interval = Number(intervalHours);
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new TypeError("intervalHours must be greater than zero.");
  }
  if (!oldestPendingAt) return false;
  const normalizedNow = normalizeIsoDate(now, "now");
  const normalizedOldest = normalizeIsoDate(oldestPendingAt, "oldestPendingAt");
  const anchor = stateUploadDate(state) ?? normalizedOldest;
  const dueAt = new Date(anchor).getTime() + interval * 60 * 60 * 1000;
  return new Date(normalizedNow).getTime() >= dueAt;
}

function normalizeSnapshotFile(file) {
  if (typeof file === "string") return { filePath: file, checksum: null };
  const filePath = file?.filePath ?? file?.path;
  if (!filePath) throw new TypeError("Every snapshot file must include filePath.");
  return { filePath, checksum: file.checksum ?? null };
}

function assertPathWithin(directory, filePath) {
  const expected = path.resolve(directory);
  const resolved = path.resolve(filePath);
  const relative = path.relative(expected, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Snapshot file is outside the pending queue: ${filePath}`);
  }
  return resolved;
}

async function verifySnapshotFiles({ rootDir, kind, files }) {
  const directory = pendingDirectory(rootDir, kind);
  return Promise.all(
    files.map(async (source) => {
      const normalized = normalizeSnapshotFile(source);
      const filePath = assertPathWithin(directory, normalized.filePath);
      const bytes = await fs.readFile(filePath);
      const checksum = sha256(bytes);
      if (normalized.checksum && normalized.checksum !== checksum) {
        throw new Error(`Pending queue workbook changed after snapshot: ${filePath}`);
      }
      const workbook = parseWorkbookBytes(bytes, filePath);
      if (workbook.kind !== kind) {
        throw new Error(`Unexpected queue workbook kind ${workbook.kind}: ${filePath}`);
      }
      return { filePath, checksum };
    }),
  );
}

async function archiveBatch({
  rootDir,
  kind,
  batchId,
  files,
  rows,
  completedAt,
}) {
  const normalizedBatchId = safeSegment(batchId, "batchId");
  const normalizedCompletedAt = normalizeIsoDate(completedAt, "completedAt");
  if (!Array.isArray(files) || files.length === 0) {
    throw new TypeError("files must contain the successful upload snapshot.");
  }
  if (!Array.isArray(rows)) throw new TypeError("rows must be an array.");

  const verifiedSources = await verifySnapshotFiles({ rootDir, kind, files });
  const archivePath = path.join(
    archiveDirectory(rootDir, kind),
    `${timestampSegment(normalizedCompletedAt)}--${normalizedBatchId}.xlsx`,
  );
  const bytes = buildWorkbookBytes({
    kind,
    runId: normalizedBatchId,
    createdAt: normalizedCompletedAt,
    category: "merged",
    platform: kind === NAVER_VISITOR_KIND ? "naver_blog" : "mixed",
    rows,
    extraMeta: {
      archive_batch_id: normalizedBatchId,
      archived_source_count: String(verifiedSources.length),
    },
  });

  let archiveBytes;
  try {
    await atomicWriteImmutable(archivePath, bytes);
    archiveBytes = await fs.readFile(archivePath);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    archiveBytes = await fs.readFile(archivePath);
  }
  const archived = parseWorkbookBytes(archiveBytes, archivePath);
  const expectedPayloads = rows.map((row) => JSON.stringify(row));
  const archivedPayloads = archived.rows.map((row) => JSON.stringify(row));
  if (
    archived.kind !== kind ||
    archived.meta.archive_batch_id !== normalizedBatchId ||
    JSON.stringify(archivedPayloads) !== JSON.stringify(expectedPayloads)
  ) {
    throw new Error(`Archived queue workbook verification failed: ${archivePath}`);
  }

  await verifySnapshotFiles({
    rootDir,
    kind,
    files: verifiedSources,
  });
  const removedFiles = [];
  for (const source of verifiedSources) {
    await fs.rm(source.filePath);
    removedFiles.push(source.filePath);
  }
  return {
    archivePath,
    path: archivePath,
    batchId: normalizedBatchId,
    checksum: sha256(archiveBytes),
    rowCount: archived.rows.length,
    removedFiles,
  };
}

export async function archiveInfluencerBatch({
  rootDir,
  batchId,
  files,
  rows,
  completedAt,
}) {
  return archiveBatch({
    rootDir,
    kind: DISCOVERY_KIND,
    batchId,
    files,
    rows,
    completedAt,
  });
}

export async function archiveNaverVisitorBatch({
  rootDir,
  batchId,
  files,
  rows,
  completedAt,
}) {
  return archiveBatch({
    rootDir,
    kind: NAVER_VISITOR_KIND,
    batchId,
    files,
    rows,
    completedAt,
  });
}
