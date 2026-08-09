import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// node-postgres emits 'error' on the pool whenever an *idle* client's
// connection is dropped (a network blip, the DB restarting, a host-side
// idle-connection timeout) — this has nothing to do with any particular
// query or request. Without a listener, Node treats an unhandled 'error'
// event as fatal and kills the whole process; the in-flight request that
// happened to be running at that moment never gets a real response, which
// is indistinguishable from the app being broken. Logging and letting the
// pool reconnect on the next query (its normal behavior) is the standard
// fix recommended by node-postgres itself.
pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client", err);
});

export const db = drizzle({ client: pool, schema });
