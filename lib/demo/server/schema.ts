import { integer, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Demo passkeys, so "Sign in" can find an account on a new device (the
 * passkey's public key is needed to verify the assertion). Testnet demo data
 * only: no email or other personal data. latch-playground kept the same
 * fields in its webauthn_credentials / smart_accounts tables.
 */
export const demoPasskeys = pgTable("demo_passkeys", {
  credentialId: varchar("credential_id", { length: 512 }).primaryKey(),
  /** COSE public key, base64url. */
  publicKey: text("public_key").notNull(),
  /** 65-byte public key || credential id, hex: the account's signer key data. */
  keyDataHex: text("key_data_hex").notNull(),
  accountAddress: varchar("account_address", { length: 56 }).notNull(),
  rpId: varchar("rp_id", { length: 253 }).notNull(),
  signCount: integer("sign_count").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
