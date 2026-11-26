import { defineConfig } from "drizzle-kit";

const migrationUrl = process.env.DATABASE_MIGRATION_URL;

if (!migrationUrl) {
  throw new Error("DATABASE_MIGRATION_URL is required to run Drizzle migrations");
}

export default defineConfig({
  dialect: "postgresql",
  schema: ["./lib/waitlist/schema.ts", "./lib/demo/server/schema.ts"],
  out: "./drizzle",
  dbCredentials: { url: migrationUrl },
  strict: true,
  verbose: true,
});
