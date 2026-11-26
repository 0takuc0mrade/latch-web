import { describe, expect, test } from "bun:test";
import { createSign, generateKeyPairSync, webcrypto } from "node:crypto";
import {
  b64uDecode,
  b64uEncode,
  contractInstanceLedgerKey,
  credentialIdFromKeyDataHex,
  decodeContractAddress,
  derToCompactLowS,
  encodeWebAuthnSigData,
  hexDecode,
  hexEncode,
} from "../lib/demo/webauthn-codec";

// Reference vectors generated with @stellar/stellar-sdk 15.0.1.
const AUTH_DATA_HEX = "49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d97630500000001";
const CLIENT_DATA = '{"type":"webauthn.get","challenge":"abc","origin":"https://uselatch.app"}';
const SIG_DATA_HEX =
  "0000001100000001000000030000000f0000001261757468656e74696361746f725f6461746100000000000d0000002549960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d976305000000010000000000000f0000000b636c69656e745f64617461000000000d000000497b2274797065223a22776562617574686e2e676574222c226368616c6c656e6765223a22616263222c226f726967696e223a2268747470733a2f2f7573656c617463682e617070227d0000000000000f000000097369676e61747572650000000000000d0000004007070707070707070707070707070707070707070707070707070707070707070707070707070707070707070707070707070707070707070707070707070707";
const CONTRACT = "CDK44EDWIUM6JTSAHPAMBFNMICGQLTBGUD3LAP7NF47Q6VBVUSPSCJIL";
const CONTRACT_ID_HEX = "d5ce10764519e4ce403bc0c095ac408d05cc26a0f6b03fed2f3f0f5435a49f21";
const LEDGER_KEY_B64 = "AAAABgAAAAHVzhB2RRnkzkA7wMCVrECNBcwmoPawP+0vPw9UNaSfIQAAABQAAAAB";
const HALF_N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551") >> BigInt(1);

describe("webauthn codec", () => {
  test("base64url and hex round-trip", () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    expect(b64uEncode(bytes)).toBe("AAH6-_z9_v8");
    expect(Array.from(b64uDecode("AAH6-_z9_v8"))).toEqual(Array.from(bytes));
    expect(hexEncode(hexDecode("00ff10ab"))).toBe("00ff10ab");
    expect(() => hexDecode("abc")).toThrow();
  });

  test("WebAuthnSigData XDR matches the Stellar SDK byte for byte", () => {
    const xdr = encodeWebAuthnSigData({
      authenticatorData: hexDecode(AUTH_DATA_HEX),
      clientDataJSON: new TextEncoder().encode(CLIENT_DATA),
      signature: new Uint8Array(64).fill(7),
    });
    expect(hexEncode(xdr)).toBe(SIG_DATA_HEX);
  });

  test("contract address decoding and the instance ledger key match the SDK", () => {
    expect(hexEncode(decodeContractAddress(CONTRACT))).toBe(CONTRACT_ID_HEX);
    expect(contractInstanceLedgerKey(CONTRACT)).toBe(LEDGER_KEY_B64);
  });

  test("rejects a bad checksum or a non-contract address", () => {
    expect(() => decodeContractAddress(CONTRACT.slice(0, -1) + "K")).toThrow();
    expect(() => decodeContractAddress("GCOWPY2RHD6Y764NAEIB2SMJITDJLAJ7X4WVAQWQQKQTPRNRQKMT2W5K")).toThrow("Not a contract address");
  });

  test("DER signatures become 64-byte low-S r||s that still verify", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const verifyKey = await webcrypto.subtle.importKey(
      "spki",
      publicKey.export({ type: "spki", format: "der" }),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    for (let i = 0; i < 24; i++) {
      const message = new TextEncoder().encode(`latch demo ${i}`);
      const der = createSign("SHA256").update(message).sign(privateKey);
      const compact = derToCompactLowS(new Uint8Array(der));
      expect(compact.length).toBe(64);
      const s = BigInt("0x" + hexEncode(compact.subarray(32)));
      expect(s <= HALF_N).toBe(true);
      const ok = await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, verifyKey, compact, message);
      expect(ok).toBe(true);
    }
  });

  test("credential id comes back out of keyDataHex", () => {
    const credentialId = new Uint8Array([9, 8, 7, 6, 5]);
    const keyData = new Uint8Array([0x04, ...new Array(64).fill(1), ...credentialId]);
    expect(credentialIdFromKeyDataHex(hexEncode(keyData))).toBe(b64uEncode(credentialId));
    expect(() => credentialIdFromKeyDataHex("04" + "01".repeat(64))).toThrow();
  });
});
