import { createHash } from "node:crypto";
import { isOperationalTestEmail } from "./operational-test-email.js";

const resendEmailEndpoint = "https://api.resend.com/emails";
const defaultVerificationEmailFrom = "연락미 <no-reply@auth.yeollock.me>";
const verificationPageUrl = "https://yeollock.me/influencer/verification";
const emailLogoUrl = "https://yeollock.me/email-logo.png";
const emailRequestTimeoutMs = 5_000;
const sentDedupeTtlMs = 48 * 60 * 60 * 1_000;
const maxRememberedDedupeKeys = 2_000;

export type PlatformVerificationEmailStatus =
  | "pending"
  | "approved"
  | "rejected";

export interface PlatformVerificationEmailInput {
  requestId: string;
  recipientEmail: string;
  status: PlatformVerificationEmailStatus;
  platform?: "instagram" | "youtube" | "tiktok" | "naver_blog" | "other";
  ownershipMethod?:
    | "instagram_dm_code"
    | "profile_bio_code"
    | "public_post_code"
    | "channel_description_code"
    | "screenshot_review";
  dataOrigin?: "production" | "qa" | "demo" | "seed";
  isOperationalTest?: boolean;
}

export interface PlatformVerificationEmailContent {
  subject: string;
  html: string;
  text: string;
}

export type PlatformVerificationEmailResult =
  | { status: "sent"; idempotencyKey: string }
  | { status: "deduplicated"; idempotencyKey: string }
  | {
      status: "skipped";
      reason:
        | "not_configured"
        | "non_production"
        | "invalid_recipient"
        | "invalid_request";
    }
  | { status: "failed"; idempotencyKey: string };

interface PlatformVerificationEmailDependencies {
  apiKey?: string;
  from?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const sentDedupeKeys = new Map<string, number>();
const inFlightSends = new Map<string, Promise<PlatformVerificationEmailResult>>();

const normalizeSingleLine = (value: string | undefined) =>
  typeof value === "string" ? value.replace(/[\r\n]+/g, " ").trim() : "";

const isValidRecipientEmail = (value: string) =>
  value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const resolveFrom = (override: string | undefined) => {
  const rawCandidate = override ?? process.env.VERIFICATION_EMAIL_FROM;
  if (
    typeof rawCandidate !== "string" ||
    rawCandidate.length > 400 ||
    /[\r\n]/.test(rawCandidate)
  ) {
    return defaultVerificationEmailFrom;
  }

  const candidate = rawCandidate.trim();
  const match = /^[^<>]*<([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>$/.exec(candidate);
  const mailbox = match?.[1]?.toLowerCase() ?? "";
  return isValidRecipientEmail(mailbox)
    ? `연락미 <${mailbox}>`
    : defaultVerificationEmailFrom;
};

const platformLabel = (platform: PlatformVerificationEmailInput["platform"]) => {
  if (platform === "instagram") return "인스타그램";
  if (platform === "youtube") return "유튜브";
  if (platform === "tiktok") return "틱톡";
  if (platform === "naver_blog") return "네이버 블로그";
  return "플랫폼";
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const statusCopy = (input: PlatformVerificationEmailInput) => {
  const label = platformLabel(input.platform);

  if (input.status === "approved") {
    return {
      subject: `[연락미] ${label} 계정 인증이 완료되었습니다`,
      heading: `${label} 계정 인증을 완료했습니다`,
      description:
        "이제 연락미에서 인증 배지가 표시되며, 인증된 계정으로 활동할 수 있습니다.",
      button: "인증 계정 보기",
    };
  }

  if (input.status === "rejected") {
    return {
      subject: `[연락미] ${label} 계정 인증 요청을 확인해 주세요`,
      heading: `${label} 계정 정보를 다시 확인해 주세요`,
      description:
        "자세한 안내와 재시도 방법은 연락미 인증 화면에서 확인할 수 있습니다.",
      button: "인증 화면 열기",
    };
  }

  const isInstagramDm =
    input.platform === "instagram" &&
    input.ownershipMethod === "instagram_dm_code";

  return {
    subject: `[연락미] ${label} 계정 인증 요청이 접수되었습니다`,
    heading: `${label} 계정 인증 요청을 접수했습니다`,
    description: isInstagramDm
      ? "연락미 인증 화면의 안내에 따라 공식 인스타그램 계정으로 DM을 보내 주세요. 보안을 위해 이메일에는 인증 정보를 담지 않습니다."
      : "제출한 정보를 확인하고 있습니다. 확인이 끝나면 결과를 이메일로 알려드리겠습니다.",
    button: "인증 진행 상황 보기",
  };
};

export const buildPlatformVerificationEmail = (
  input: PlatformVerificationEmailInput,
): PlatformVerificationEmailContent => {
  const copy = statusCopy(input);
  const subject = normalizeSingleLine(copy.subject);
  const heading = escapeHtml(copy.heading);
  const description = escapeHtml(copy.description);
  const button = escapeHtml(copy.button);

  return {
    subject,
    text: `${copy.heading}\n\n${copy.description}\n\n${copy.button}: ${verificationPageUrl}\n\n본 메일은 발신 전용입니다.`,
    html: `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#f4f6f8;color:#15171a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Apple SD Gothic Neo','Noto Sans KR',Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e9ee;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:32px 36px 22px;border-bottom:1px solid #eef0f3;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="${emailLogoUrl}" width="42" height="42" alt="" style="display:block;width:42px;height:42px;border:0;border-radius:10px;" />
                    </td>
                    <td style="padding-left:11px;vertical-align:middle;color:#111827;font-size:21px;line-height:1;font-weight:800;letter-spacing:-0.045em;">연락미</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 36px 36px;">
                <h1 style="margin:0;color:#111827;font-size:25px;line-height:1.35;font-weight:750;letter-spacing:-0.035em;">${heading}</h1>
                <p style="margin:18px 0 0;color:#4b5563;font-size:15px;line-height:1.75;letter-spacing:-0.015em;">${description}</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:28px;">
                  <tr>
                    <td bgcolor="#3563e9" style="border-radius:10px;">
                      <a href="${verificationPageUrl}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:14px;line-height:20px;font-weight:700;">${button}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:28px 0 0;color:#9ca3af;font-size:12px;line-height:1.6;">본 메일은 연락미 계정 인증 요청에 따라 발송되었습니다.<br />발신 전용 메일이므로 회신되지 않습니다.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
};

const pruneSentDedupeKeys = (now: number) => {
  for (const [key, sentAt] of sentDedupeKeys) {
    if (now - sentAt > sentDedupeTtlMs) sentDedupeKeys.delete(key);
  }
  while (sentDedupeKeys.size > maxRememberedDedupeKeys) {
    const oldestKey = sentDedupeKeys.keys().next().value as string | undefined;
    if (!oldestKey) break;
    sentDedupeKeys.delete(oldestKey);
  }
};

const buildIdempotencyKey = (
  requestId: string,
  status: PlatformVerificationEmailStatus,
) => {
  const normalizedRequestId = normalizeSingleLine(requestId);
  if (!normalizedRequestId) return "";
  const digest = createHash("sha256")
    .update(`platform-verification:${normalizedRequestId}:${status}`)
    .digest("hex")
    .slice(0, 32);
  return `platform-verification-${digest}`;
};

export const sendPlatformVerificationEmail = async (
  input: PlatformVerificationEmailInput,
  dependencies: PlatformVerificationEmailDependencies = {},
): Promise<PlatformVerificationEmailResult> => {
  if (input.isOperationalTest || input.dataOrigin !== "production") {
    return { status: "skipped", reason: "non_production" };
  }

  const recipientEmail = normalizeSingleLine(input.recipientEmail).toLowerCase();
  if (
    !isValidRecipientEmail(recipientEmail) ||
    isOperationalTestEmail(recipientEmail)
  ) {
    return { status: "skipped", reason: "invalid_recipient" };
  }

  const idempotencyKey = buildIdempotencyKey(input.requestId, input.status);
  if (!idempotencyKey) {
    return { status: "skipped", reason: "invalid_request" };
  }

  const apiKey = normalizeSingleLine(
    dependencies.apiKey ?? process.env.RESEND_API_KEY,
  );
  if (!apiKey) {
    return { status: "skipped", reason: "not_configured" };
  }

  const now = dependencies.now?.() ?? Date.now();
  pruneSentDedupeKeys(now);
  if (sentDedupeKeys.has(idempotencyKey)) {
    return { status: "deduplicated", idempotencyKey };
  }

  const existingSend = inFlightSends.get(idempotencyKey);
  if (existingSend) {
    const existingResult = await existingSend;
    return existingResult.status === "sent"
      ? { status: "deduplicated", idempotencyKey }
      : existingResult;
  }

  const send = (async (): Promise<PlatformVerificationEmailResult> => {
    try {
      const content = buildPlatformVerificationEmail(input);
      const response = await (dependencies.fetchImpl ?? fetch)(
        resendEmailEndpoint,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
            "User-Agent": "yeollock-verification-email/1.0",
          },
          body: JSON.stringify({
            from: resolveFrom(dependencies.from),
            to: [recipientEmail],
            subject: content.subject,
            html: content.html,
            text: content.text,
          }),
          signal: AbortSignal.timeout(emailRequestTimeoutMs),
        },
      );

      if (!response.ok) return { status: "failed", idempotencyKey };
      sentDedupeKeys.set(idempotencyKey, dependencies.now?.() ?? Date.now());
      pruneSentDedupeKeys(dependencies.now?.() ?? Date.now());
      return { status: "sent", idempotencyKey };
    } catch {
      return { status: "failed", idempotencyKey };
    }
  })();

  inFlightSends.set(idempotencyKey, send);
  try {
    return await send;
  } finally {
    inFlightSends.delete(idempotencyKey);
  }
};

export const resetPlatformVerificationEmailDedupeForTests = () => {
  sentDedupeKeys.clear();
  inFlightSends.clear();
};
