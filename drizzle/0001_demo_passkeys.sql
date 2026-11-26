CREATE TABLE "demo_passkeys" (
	"credential_id" varchar(512) PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"key_data_hex" text NOT NULL,
	"account_address" varchar(56) NOT NULL,
	"rp_id" varchar(253) NOT NULL,
	"sign_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
