/**
 * Small, dependency-free encoders the live adapter needs in the browser, so
 * /demo doesn't ship the whole Stellar SDK. Each one matches what
 * @stellar/stellar-sdk 15 produces (see tests/demo-webauthn-codec.test.ts for
 * the reference vectors).
 */

/* base64url / hex -------------------------------------------------------- */

export function b64uEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64uDecode(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function hexEncode(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexDecode(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.trim().replace(/^0x/i, "");
  if (clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) throw new Error("Invalid hex string");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/* P-256 signature -------------------------------------------------------- */

/** secp256r1 group order. */
const P256_N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
const HALF_N = P256_N >> BigInt(1);

function bytesToBigInt(bytes: Uint8Array): bigint {
  let n = BigInt(0);
  for (const b of bytes) n = (n << BigInt(8)) | BigInt(b);
  return n;
}

function bigIntTo32(n: bigint): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(n & BigInt(0xff));
    n >>= BigInt(8);
  }
  return out;
}

/**
 * WebAuthn returns an ASN.1 DER ECDSA signature; Soroban's secp256r1 verify
 * wants 64-byte r || s with s normalised to the low half of the order.
 */
export function derToCompactLowS(der: Uint8Array): Uint8Array {
  let i = 0;
  const expect = (tag: number) => {
    if (der[i++] !== tag) throw new Error("Invalid DER signature");
  };
  const readLength = () => {
    let len = der[i++];
    if (len & 0x80) {
      const bytes = len & 0x7f;
      len = 0;
      for (let k = 0; k < bytes; k++) len = (len << 8) | der[i++];
    }
    return len;
  };
  expect(0x30);
  readLength();
  expect(0x02);
  const rLen = readLength();
  const r = bytesToBigInt(der.subarray(i, i + rLen));
  i += rLen;
  expect(0x02);
  const sLen = readLength();
  let s = bytesToBigInt(der.subarray(i, i + sLen));
  if (s > HALF_N) s = P256_N - s;
  const out = new Uint8Array(64);
  out.set(bigIntTo32(r), 0);
  out.set(bigIntTo32(s), 32);
  return out;
}

/* XDR -------------------------------------------------------------------- */

const SCV_BYTES = 13;
const SCV_SYMBOL = 15;
const SCV_MAP = 17;

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function opaque(bytes: Uint8Array): number[] {
  const pad = (4 - (bytes.length % 4)) % 4;
  return [...u32(bytes.length), ...bytes, ...new Array(pad).fill(0)];
}

/**
 * XDR of WebAuthnSigData { authenticator_data, client_data, signature } as
 * the OZ WebAuthn verifier reads it: an ScMap with symbol keys in sorted
 * order and bytes values. Sent to latch-api's submit-webauthn as hex.
 */
export function encodeWebAuthnSigData(sig: {
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  signature: Uint8Array;
}): Uint8Array {
  const entries: [string, Uint8Array][] = [
    ["authenticator_data", sig.authenticatorData],
    ["client_data", sig.clientDataJSON],
    ["signature", sig.signature],
  ];
  const out: number[] = [...u32(SCV_MAP), ...u32(1), ...u32(entries.length)];
  for (const [key, value] of entries) {
    out.push(...u32(SCV_SYMBOL), ...opaque(new TextEncoder().encode(key)));
    out.push(...u32(SCV_BYTES), ...opaque(value));
  }
  return new Uint8Array(out);
}

/* StrKey (C… contract addresses) ---------------------------------------- */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const CONTRACT_VERSION_BYTE = 2 << 3;

function crc16Xmodem(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let k = 0; k < 8; k++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** 32-byte contract id from a C… address; throws on a bad checksum or kind. */
export function decodeContractAddress(address: string): Uint8Array {
  const bits: number[] = [];
  for (const char of address.trim()) {
    const value = BASE32.indexOf(char);
    if (value < 0) throw new Error("Invalid contract address");
    for (let k = 4; k >= 0; k--) bits.push((value >> k) & 1);
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    let b = 0;
    for (let k = 0; k < 8; k++) b = (b << 1) | bits[i * 8 + k];
    bytes[i] = b;
  }
  if (bytes.length !== 35 || bytes[0] !== CONTRACT_VERSION_BYTE) throw new Error("Not a contract address");
  const checksum = crc16Xmodem(bytes.subarray(0, 33));
  if (bytes[33] !== (checksum & 0xff) || bytes[34] !== checksum >> 8) throw new Error("Invalid contract address checksum");
  return bytes.slice(1, 33);
}

/**
 * Base64 XDR LedgerKey for a contract's instance entry. If Soroban RPC's
 * getLedgerEntries finds it on testnet, the contract exists on testnet.
 */
export function contractInstanceLedgerKey(address: string): string {
  const LEDGER_KEY_CONTRACT_DATA = 6;
  const SC_ADDRESS_TYPE_CONTRACT = 1;
  const SCV_LEDGER_KEY_CONTRACT_INSTANCE = 20;
  const PERSISTENT = 1;
  const bytes = new Uint8Array([
    ...u32(LEDGER_KEY_CONTRACT_DATA),
    ...u32(SC_ADDRESS_TYPE_CONTRACT),
    ...decodeContractAddress(address),
    ...u32(SCV_LEDGER_KEY_CONTRACT_INSTANCE),
    ...u32(PERSISTENT),
  ]);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/* keyData ---------------------------------------------------------------- */

/** WebAuthn credential id (base64url) from key_data: 65-byte 0x04 public key || credential id. */
export function credentialIdFromKeyDataHex(keyDataHex: string): string {
  const bytes = hexDecode(keyDataHex);
  if (bytes.length <= 65 || bytes[0] !== 0x04) throw new Error("Invalid keyDataHex");
  return b64uEncode(bytes.subarray(65));
}
