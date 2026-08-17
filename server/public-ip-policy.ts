import { isIP } from "node:net";
import { Address6 } from "ip-address";

const isPrivateOrReservedIpv4Address = (address: string) => {
  const parts = address.split(".").map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some(
      (part) => !Number.isInteger(part) || part < 0 || part > 255,
    )
  ) {
    return true;
  }

  const [first, second, third, fourth] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224 ||
    (first === 255 && second === 255 && third === 255 && fourth === 255)
  );
};

/**
 * External fetches use a fail-closed, global-unicast-only IP policy.
 * This intentionally rejects transition mechanisms such as IPv4-mapped,
 * NAT64, 6to4, and Teredo addresses because they can encode a private target.
 */
export const isPrivateOrReservedIpAddress = (address: string) => {
  const normalized = address
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
  const version = isIP(normalized);

  if (version === 4) {
    return isPrivateOrReservedIpv4Address(normalized);
  }

  if (version === 6) {
    try {
      const parsed = new Address6(normalized);
      return parsed.isTeredo() || parsed.getType() !== "Global unicast";
    } catch {
      return true;
    }
  }

  return true;
};
