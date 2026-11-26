/**
 * Passkey ceremonies for the demo, as in latch-playground
 * (app/api/webauthn/*): @simplewebauthn/server options and verification,
 * with the RP ID and origin taken from the demo's own host.
 *
 * Differences from the playground, all simplifications: challenges travel in
 * a signed token instead of a table, there are no sessions (the browser keeps
 * its account), and user verification is required, because the on-chain
 * WebAuthn verifier rejects signatures without it.
 */
import { randomBytes } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { cose, decodeCredentialPublicKey } from "@simplewebauthn/server/helpers";
import { signToken, verifyToken } from "./token";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 60_000;

interface CeremonyToken extends Record<string, unknown> {
  purpose: "register" | "signin";
  challenge: string;
  rpId: string;
  origin: string;
}

export interface RelyingParty {
  rpId: string;
  origin: string;
}

export async function registrationOptions(rp: RelyingParty, displayName: string, secret: string) {
  const options = await generateRegistrationOptions({
    rpID: rp.rpId,
    rpName: "Latch demo",
    // A fresh user per account: no session, so nothing to exclude and no InvalidStateError.
    userID: randomBytes(16),
    userName: displayName,
    userDisplayName: displayName,
    attestationType: "none",
    // Discoverable, so "Sign in" can find it on this or a synced device.
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    supportedAlgorithmIDs: [-7], // ES256 (P-256), the curve the on-chain verifier checks
    timeout: TIMEOUT_MS,
  });
  const token = signToken({ purpose: "register", challenge: options.challenge, rpId: rp.rpId, origin: rp.origin }, secret, CHALLENGE_TTL_MS);
  return { options, token };
}

/** 65-byte uncompressed P-256 public key (0x04 || x || y) from a COSE EC2 key. */
export function rawP256PublicKey(cosePublicKey: Uint8Array): Buffer {
  const key = decodeCredentialPublicKey(new Uint8Array(cosePublicKey));
  if (!cose.isCOSEPublicKeyEC2(key)) throw new Error("Passkey is not an EC2 key");
  const x = key.get(cose.COSEKEYS.x);
  const y = key.get(cose.COSEKEYS.y);
  if (key.get(cose.COSEKEYS.crv) !== cose.COSECRV.P256 || !x || !y || x.length !== 32 || y.length !== 32) {
    throw new Error("Passkey is not a P-256 key");
  }
  return Buffer.concat([Buffer.from([0x04]), Buffer.from(x), Buffer.from(y)]);
}

export interface VerifiedRegistration {
  credentialId: string;
  /** 65-byte public key || credential id: the account's signer key data. */
  keyDataHex: string;
  cosePublicKey: Uint8Array;
  signCount: number;
  rpId: string;
}

export async function verifyRegistration(token: unknown, response: RegistrationResponseJSON, secret: string): Promise<VerifiedRegistration> {
  const expected = verifyToken<CeremonyToken>(token, secret, "register");
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: expected.challenge,
    expectedOrigin: expected.origin,
    expectedRPID: expected.rpId,
    requireUserVerification: true,
  });
  if (!verification.verified || !verification.registrationInfo) throw new Error("Registration verification failed");
  const { credential } = verification.registrationInfo;
  const keyData = Buffer.concat([rawP256PublicKey(credential.publicKey), Buffer.from(credential.id, "base64url")]);
  return {
    credentialId: credential.id,
    keyDataHex: keyData.toString("hex"),
    cosePublicKey: credential.publicKey,
    signCount: credential.counter,
    rpId: expected.rpId,
  };
}

export async function authenticationOptions(rp: RelyingParty, secret: string) {
  const options = await generateAuthenticationOptions({ rpID: rp.rpId, userVerification: "required", timeout: TIMEOUT_MS });
  const token = signToken({ purpose: "signin", challenge: options.challenge, rpId: rp.rpId, origin: rp.origin }, secret, CHALLENGE_TTL_MS);
  return { options, token };
}

export interface StoredPasskey {
  credentialId: string;
  cosePublicKey: Uint8Array;
  signCount: number;
}

/** Verifies a sign-in assertion against the stored passkey; returns the new signature counter. */
export async function verifyAuthentication(token: unknown, response: AuthenticationResponseJSON, stored: StoredPasskey, secret: string): Promise<number> {
  const expected = verifyToken<CeremonyToken>(token, secret, "signin");
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: expected.challenge,
    expectedOrigin: expected.origin,
    expectedRPID: expected.rpId,
    credential: { id: stored.credentialId, publicKey: new Uint8Array(stored.cosePublicKey), counter: stored.signCount },
    requireUserVerification: true,
  });
  if (!verification.verified) throw new Error("Sign-in verification failed");
  return verification.authenticationInfo.newCounter;
}
