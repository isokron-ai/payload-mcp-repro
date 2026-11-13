# payload-mcp-repro

Minimal reproduction for three behaviours of `@payloadcms/plugin-mcp`, each next to Payload's REST API as a control:

1. **Locks, update.** The MCP update tool writes to a document that another user has locked, deletes that user's
   lock row, and answers "Document updated successfully" with `isError` unset. REST answers 423.
2. **Locks, delete.** The MCP delete tool deletes a document that another user has locked and answers "Document
   deleted successfully" with `isError` unset. REST answers 423.
3. **Bulk delete with failures.** A bulk delete where some or all matched documents are refused answers "Document
   deleted successfully" with `isError` unset. REST answers 400 with an `errors` list.
   (Bulk *update* had the same problem on 3.93.0; it is fixed in 4.0.0-beta.9. A script for it is included.)

Payload's docs say a locked document cannot be updated or deleted by other users through the Local or REST API
(`docs/admin/locked-documents.mdx`). The MCP tools act for an external client, so we expected REST's behaviour.

The app is the `create-payload-app` blank template, trimmed to one collection (`posts`) and two users, with the MCP
plugin on. The repo root runs **Payload 3.93.0**; `v4-beta/` is the same app on **Payload 4.0.0-beta.9**.

## Results

| Script | What it checks | 3.93.0 (root) | 4.0.0-beta.9 (`v4-beta/`) |
|---|---|---|---|
| `scripts/repro-locks.mjs` | update and delete under another user's lock | reproduced | reproduced |
| `scripts/repro-bulk-delete.mjs` | bulk delete with 1 of 5, and 2 of 2, documents refused | reproduced | reproduced |
| `scripts/repro-bulk-update.mjs` | bulk update with 1 of 5 documents refused | reproduced | not reproduced (fixed: `isError: true`) |

Recorded runs from clean clones: [`REPRO-RUN.md`](REPRO-RUN.md).

## Run it (about 5 minutes)

Needs Node.js (22.23+ or 24.22+; `v4-beta/` needs 24.22+) and pnpm. Nothing else: the database is a local SQLite
file. The runs in `REPRO-RUN.md` used Node.js 25.8.1.

```sh
pnpm i
pnpm seed      # writes .env with generated test values, creates user A and user B and their MCP API keys
pnpm dev       # http://localhost:3000; leave it running
```

In a second terminal, in the same folder:

```sh
node scripts/repro-locks.mjs
node scripts/repro-bulk-delete.mjs
node scripts/repro-bulk-update.mjs
```

Each script prints every request it sends and every response in full (keys and tokens masked), then one line per
check and a final line such as:

```text
RESULT locks: BUG REPRODUCED (5/5 checks)
```

Exit code: `0` the bug reproduced, `1` it did not (or only partly), `2` setup problem (for example the REST control
was not refused, so the lock was not in force). `--reps N` repeats every case N times; the first repetition is
printed in full, the rest as counts. The scripts are deterministic and talk only to the local app.

**On 4.0.0-beta.9:** the same steps in `v4-beta/` (`cd v4-beta && pnpm i && pnpm seed && pnpm dev`, then
`pnpm repro:locks`, `pnpm repro:bulk-delete`, `pnpm repro:bulk-update` from `v4-beta/`). The scripts are shared: they
detect the 4.x tool names (`updateDocument`, `deleteDocuments`) and send 4.x arguments (`slug`, `data`, `where` as
an object).

If port 3000 is taken: `PORT=3100 pnpm dev`, and run the scripts with `BASE_URL=http://localhost:3100`.

## What each script does

All MCP calls are JSON-RPC 2.0 over Streamable HTTP (`POST /api/mcp`) with user A's key, as an MCP client sends
them: `initialize`, `notifications/initialized`, `tools/list`, then `tools/call`. All REST controls are made by the
same user A, with a JWT from `POST /api/users/login`.

**Holding the lock.** User B holds the lock by creating a `payload-locked-documents` row for the post through REST,
which is the row the admin panel writes when B opens the post for editing. To see it by hand instead: log in to
`/admin` as user B (credentials in `.env`), open a post, and send the MCP call from step 1 below for that post.

### `repro-locks.mjs`

For each case user A creates a fresh post and user B then holds its lock.

| Step | Call (user A) | Expected (as REST) | Actual on 3.93.0 | Actual on 4.0.0-beta.9 |
|---|---|---|---|---|
| 1 | MCP `updatePosts {id, title}` (4.x: `updateDocument {slug, id, data}`) | refused | title changed, B's lock row deleted, "Document updated successfully", `isError` unset | same |
| 2 | REST `PATCH /api/posts/:id` (control) | 423 | 423, title and lock kept | same |
| 3 | MCP update with `overrideLock: false` | refused | refused, as plain text with `isError` unset | refused, `isError: true` |
| 4 | MCP `deletePosts {id}` (4.x: `deleteDocuments {slug, id}`) | refused | post deleted, "Document deleted successfully", `isError` unset | same |
| 5 | REST `DELETE /api/posts/:id` (control) | 423 | 423, post kept | same |

The update tool's `overrideLock` argument defaults to `true`. The delete tool has no `overrideLock` argument, so the
Local API default (`true`) applies.

### `repro-bulk-delete.mjs`

The `posts` collection refuses to delete an archived post (a `beforeDelete` hook throws `APIError` 400), an ordinary
per-document failure.

| Step | Call (user A) | Expected (as REST) | Actual on 3.93.0 and 4.0.0-beta.9 |
|---|---|---|---|
| 1 | MCP bulk delete, `where` matches 5 posts, 1 archived | error signalled | 4 deleted, "Document deleted successfully" with "Deleted: 4 documents, Errors: 1" in the text, `isError` unset |
| 1c | REST `DELETE /api/posts?where[...]` on an identical set | | 400 "Unable to delete 1 out of 5 Posts." with `errors`, the same 4 deleted |
| 2 | MCP bulk delete, `where` matches 2 posts, both archived | error signalled | nothing deleted, "Document deleted successfully" with "Deleted: 0 documents, Errors: 2", `isError` unset |
| 2c | REST bulk `DELETE` on an identical set | | 400 "Unable to delete 2 out of 2 Posts." |
| 3 (note) | MCP delete with neither `id` nor `where` | error with `isError` | 3.93.0: "Error: Either id or where clause must be provided", `isError` unset. 4.0.0-beta.9: refused by input validation with `isError: true` |

Deleted documents stay deleted on both surfaces; the difference is only the signal.

### `repro-bulk-update.mjs`

The same set-up with a `beforeChange` hook that refuses changes to an archived post. MCP bulk update over 5 posts,
1 archived: on 3.93.0, 4 changed, "Multiple documents updated", `isError` unset; REST `PATCH` with the same `where`
answers 400 with `errors` and changes the same 4. On 4.0.0-beta.9 the MCP answer sets `isError: true` (fixed).

## Versions

| | Repo root | `v4-beta/` |
|---|---|---|
| `payload`, `@payloadcms/plugin-mcp`, `@payloadcms/next`, `@payloadcms/ui`, `@payloadcms/db-sqlite` | 3.93.0 (npm `latest` on 13 Nov 2026) | 4.0.0-beta.9 (npm `beta`, published 13 Nov 2026) |
| `next` | 16.3.3 | 16.4.2 |
| `react`, `react-dom` | 19.2.6 | 19.3.1 |
| MCP auth | plugin API key (`payload-mcp-api-keys`), `Authorization: Bearer <key>` | user API key, `Authorization: users API-Key <key>` |

Recorded with Node.js 25.8.1 and pnpm 10.33.2 on macOS. Dependencies are pinned and the lockfiles are committed.

## Files

- `src/collections/Posts.ts`: the collection (title, batch, archived) and the two hooks that refuse archived posts.
- `src/payload.config.ts`: SQLite adapter, `mcpPlugin({ collections: { posts: { enabled: true } } })`.
- `scripts/seed.mjs`, `scripts/seed-db.ts`: write `.env` (gitignored) with generated test values if it does not
  exist, then reset the database and create the two users and their keys. Safe to re-run.
- `scripts/lib.mjs`: the MCP and REST clients and the printing.
- `.env.example`: the variables `pnpm seed` fills in.
- `v4-beta/`: the same app on 4.0.0-beta.9 (its own `package.json`, config, seed and `.env.example`).

## Licence

MIT, see [`LICENSE`](LICENSE).
