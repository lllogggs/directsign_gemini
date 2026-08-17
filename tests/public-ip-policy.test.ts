import assert from "node:assert/strict";
import test from "node:test";
import { isPrivateOrReservedIpAddress } from "../server/public-ip-policy.js";

test("external fetch IP policy allows ordinary global-unicast addresses", () => {
  assert.equal(isPrivateOrReservedIpAddress("8.8.8.8"), false);
  assert.equal(
    isPrivateOrReservedIpAddress("2606:4700:4700::1111"),
    false,
  );
});

test("external fetch IP policy rejects private, metadata, and reserved IPv4", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.0.1",
    "100.64.0.1",
    "192.0.2.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
  ]) {
    assert.equal(isPrivateOrReservedIpAddress(address), true, address);
  }
});

test("external fetch IP policy rejects IPv6 encodings and transition ranges", () => {
  for (const address of [
    "::",
    "::1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:a9fe:a9fe",
    "64:ff9b::7f00:1",
    "64:ff9b:1::7f00:1",
    "2002:7f00:1::",
    "2001:0000:4136:e378:8000:63bf:3fff:fdd2",
  ]) {
    assert.equal(isPrivateOrReservedIpAddress(address), true, address);
  }
});

test("external fetch IP policy fails closed for malformed input", () => {
  assert.equal(isPrivateOrReservedIpAddress("not-an-ip"), true);
  assert.equal(isPrivateOrReservedIpAddress(""), true);
});
