const textFields = ["display_name", "platform_handle", "headline", "bio"];

export function isMalformedCollectedCharacter(character) {
  const codePoint = character.codePointAt(0);
  return (
    codePoint === 0xfffd ||
    (codePoint <= 0x1f && ![0x09, 0x0a, 0x0d].includes(codePoint))
  );
}

export function hasMalformedCollectedText(value) {
  return Array.from(String(value ?? "")).some(isMalformedCollectedCharacter);
}

export function sanitizeCollectedText(value) {
  if (value == null) return value;
  return Array.from(String(value), (character) =>
    isMalformedCollectedCharacter(character) ? " " : character,
  )
    .join("")
    .replace(/[ \t]{2,}/gu, " ")
    .trim();
}

export function sanitizeInfluencerCollectedRow(row) {
  const sanitized = { ...row };
  for (const field of textFields) {
    if (!hasMalformedCollectedText(sanitized[field])) continue;
    sanitized[field] = sanitizeCollectedText(sanitized[field]);
  }
  return sanitized;
}
