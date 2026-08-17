import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../supabase/migrations/20260813010000_add_owned_site_page_view_counter.sql",
  import.meta.url,
);
const serverUrl = new URL("../server/index.ts", import.meta.url);

test("owned site page-view counter stores only atomic daily aggregates", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
    `);
    await db.exec(await readFile(migrationUrl, "utf8"));

    const first = await db.query<{ count: number }>(
      `select public.increment_site_page_view_count('public_home')::int as count`,
    );
    const second = await db.query<{ count: number }>(
      `select public.increment_site_page_view_count('public_home')::int as count`,
    );
    const otherPage = await db.query<{ count: number }>(
      `select public.increment_site_page_view_count('public_privacy')::int as count`,
    );

    assert.equal(first.rows[0].count, 1);
    assert.equal(second.rows[0].count, 2);
    assert.equal(otherPage.rows[0].count, 1);

    const rows = await db.query<{
      view_date: string;
      page_key: string;
      view_count: number;
    }>(
      `select view_date::text as view_date, page_key, view_count::int as view_count
       from public.site_page_view_counts
       order by page_key`,
    );
    assert.equal(rows.rows.length, 2);
    assert.deepEqual(
      rows.rows.map((row) => ({ page_key: row.page_key, view_count: row.view_count })),
      [
        { page_key: "public_home", view_count: 2 },
        { page_key: "public_privacy", view_count: 1 },
      ],
    );

    await assert.rejects(
      db.query(`select public.increment_site_page_view_count('contract_private')`),
      /Invalid public page key/,
    );
  } finally {
    await db.close();
  }
});

test("owned page-view counter migration blocks direct public table access", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /enable row level security/);
  assert.match(
    migration,
    /revoke all on table public\.site_page_view_counts from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /revoke execute on function public\.increment_site_page_view_count\(text\)\s+from public, anon, authenticated/,
  );
  assert.match(migration, /grant execute on function public\.increment_site_page_view_count\(text\)\s+to service_role/);
});

test("owned page-view endpoint rate-limits a one-way transient client bucket", async () => {
  const server = await readFile(serverUrl, "utf8");
  const routeStart = server.indexOf('app.post("/api/site-page-views"');
  const routeEnd = server.indexOf('app.get("/api/health"', routeStart);
  const route = server.slice(routeStart, routeEnd);

  assert.notEqual(routeStart, -1);
  assert.notEqual(routeEnd, -1);
  assert.match(route, /consumeLocalRateLimitBucket/);
  assert.match(route, /sha256Hex\(getClientIp\(request\)\)/);
  assert.match(route, /sitePageViewRateLimitMaxAttempts/);
  assert.match(route, /response\.status\(204\)\.end\(\)/);
  assert.doesNotMatch(route, /p_(?:ip|user|device)|cookie|user_id|profile_id/);
});
