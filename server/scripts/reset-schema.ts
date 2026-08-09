// One-time recovery script for a production database whose schema has
// drifted so far from shared/schema.ts that `drizzle-kit push` can no
// longer reconcile it (e.g. "column \"id\" is in a primary key" — Postgres
// refusing an ALTER that push generated against a column it doesn't
// realize is part of a constraint history it can't safely rewrite).
//
// Drops and recreates the `public` schema — every table, sequence, and
// constraint in it — then `db:push` (run right after, in the same build)
// rebuilds everything from shared/schema.ts against a clean slate instead
// of trying to reconcile years of incremental drift.
//
// DESTRUCTIVE: deletes all data in the database. Only wired into the build
// command temporarily, for one deploy, and only because this production
// database has no real accounts/teams/players in it yet to lose — remove
// the wiring immediately after confirming the next deploy succeeds.
import { Pool } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.log("Resetting schema: dropping and recreating 'public'...");
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    console.log("Schema reset complete.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Schema reset failed:", err);
  process.exit(1);
});
