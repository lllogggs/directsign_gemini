import { timingSafeEqual } from "node:crypto";

const normalizeCampaignRevision = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

export const isExpectedCampaignRevisionCurrent = (
  expectedRevision: unknown,
  authoritativeRevision: unknown,
) => {
  const expected = normalizeCampaignRevision(expectedRevision);
  const authoritative = normalizeCampaignRevision(authoritativeRevision);

  return Boolean(expected && authoritative && safeEqual(expected, authoritative));
};
