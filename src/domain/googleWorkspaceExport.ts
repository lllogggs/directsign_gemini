import { apiFetch } from "./api.js";
import type { XlsxWorkbook } from "./xlsxExport.js";

export type GoogleWorkspaceRole = "advertiser" | "influencer";

export type GoogleSheetsExportResult =
  | {
      status: "created";
      spreadsheet_id: string;
      spreadsheet_url: string;
    }
  | {
      status: "connection_required";
      authorization_url: string;
      error?: string;
    };

type GoogleSheetsExportResponse = {
  spreadsheet_id?: string;
  spreadsheet_url?: string;
  authorization_url?: string;
  code?: string;
  error?: string;
};

export async function exportWorkbookToGoogleSheets({
  role,
  workbook,
  returnPath,
}: {
  role: GoogleWorkspaceRole;
  workbook: XlsxWorkbook;
  returnPath: string;
}): Promise<GoogleSheetsExportResult> {
  const response = await apiFetch("/api/google/sheets/export", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role,
      return_path: returnPath,
      workbook,
    }),
  });
  const payload = (await response.json()) as GoogleSheetsExportResponse;

  if (response.status === 409 && payload.authorization_url) {
    return {
      status: "connection_required",
      authorization_url: payload.authorization_url,
      error: payload.error,
    };
  }

  if (!response.ok || !payload.spreadsheet_url || !payload.spreadsheet_id) {
    throw new Error(payload.error ?? "Google 스프레드시트 내보내기에 실패했습니다.");
  }

  return {
    status: "created",
    spreadsheet_id: payload.spreadsheet_id,
    spreadsheet_url: payload.spreadsheet_url,
  };
}
