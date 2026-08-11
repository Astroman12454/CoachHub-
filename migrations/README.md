# Database migrations

This app used to run `drizzle-kit push` in production — it diffs the live
database against `shared/schema.ts` on every deploy and applies whatever it
finds different. That's convenient for local iteration, but it has no
history (no way to see what changed and when, or to roll a change back),
and a genuinely destructive-looking diff (e.g. adding a `UNIQUE` constraint
to a column on a table that already has data) makes it stop and ask an
interactive yes/no question — which just hangs a non-interactive deploy.

Production now applies versioned migration files from this folder instead
(`npm run db:migrate`, i.e. `drizzle-kit migrate` — see `render.yaml`).
Each file here is plain, reviewable SQL, tracked (once applied) in a
`drizzle.__drizzle_migrations` table so migrate only ever runs what a given
database hasn't seen yet.

## Changing the schema

1. Edit `shared/schema.ts` as usual.
2. Generate a migration from the diff: `npm run db:generate`. Give it a
   name when prompted, or pass one directly: `npx drizzle-kit generate
   --name add_foo_column`.
3. **Read the generated SQL file before committing it.** Drizzle's diffing
   is usually right but isn't infallible — this is exactly the step that
   catches an accidental drop/rename/truncate before it ships.
4. Apply it locally and run the test suite: `npm run db:migrate && npm test`.
5. Commit the new `.sql` file together with its `meta/` snapshot entry and
   the `schema.ts` change, in the same commit/PR.

`npm run db:push` still exists and is fine for quick local-only
experiments (spinning up a throwaway feature branch, trying a schema idea
before committing to it) — just don't use it against a database anyone
else depends on, and always follow up with `db:generate` once the shape is
settled so the change actually gets a migration file.
