import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is required (postgres://...). Dev: copy the connection string from " +
    "GCP Secret Manager (flowkit-database-url) into server/.env, or run local Postgres via compose.yaml.",
  );
}

const pool = new pg.Pool({
  connectionString: url,
  // SSL only when explicitly requested (public-IP connections). The Cloud SQL
  // connector socket is already authenticated+encrypted at the transport layer.
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
  max: 5,
});

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
