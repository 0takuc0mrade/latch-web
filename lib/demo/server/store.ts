import "server-only";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getDatabaseUrl } from "../../waitlist/config";
import { demoPasskeys } from "./schema";

export interface DemoPasskeyRecord {
  credentialId: string;
  cosePublicKey: Uint8Array;
  keyDataHex: string;
  accountAddress: string;
  rpId: string;
  signCount: number;
}

export interface DemoPasskeyStore {
  save(record: DemoPasskeyRecord): Promise<void>;
  find(credentialId: string): Promise<DemoPasskeyRecord | null>;
  updateSignCount(credentialId: string, signCount: number): Promise<void>;
}

let database: ReturnType<typeof drizzle> | undefined;

function db() {
  database ??= drizzle(getDatabaseUrl());
  return database;
}

export const demoPasskeyStore: DemoPasskeyStore = {
  async save(record) {
    const row = {
      credentialId: record.credentialId,
      publicKey: Buffer.from(record.cosePublicKey).toString("base64url"),
      keyDataHex: record.keyDataHex,
      accountAddress: record.accountAddress,
      rpId: record.rpId,
      signCount: record.signCount,
    };
    await db().insert(demoPasskeys).values(row).onConflictDoUpdate({ target: demoPasskeys.credentialId, set: row });
  },
  async find(credentialId) {
    const [row] = await db().select().from(demoPasskeys).where(eq(demoPasskeys.credentialId, credentialId)).limit(1);
    if (!row) return null;
    return {
      credentialId: row.credentialId,
      cosePublicKey: new Uint8Array(Buffer.from(row.publicKey, "base64url")),
      keyDataHex: row.keyDataHex,
      accountAddress: row.accountAddress,
      rpId: row.rpId,
      signCount: row.signCount,
    };
  },
  async updateSignCount(credentialId, signCount) {
    await db().update(demoPasskeys).set({ signCount }).where(eq(demoPasskeys.credentialId, credentialId));
  },
};
