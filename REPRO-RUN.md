# Recorded runs

Two runs, each from a fresh `git clone` of this repository at commit `8643e6a`, on macOS with Node.js 25.8.1 and pnpm 10.33.2. Each run did, for the repo root and then for `v4-beta/`:

```sh
pnpm i --frozen-lockfile
pnpm seed
PORT=<port> pnpm dev &
BASE_URL=http://localhost:<port> node scripts/repro-locks.mjs        # from v4-beta/: node ../scripts/...
BASE_URL=http://localhost:<port> node scripts/repro-bulk-delete.mjs
BASE_URL=http://localhost:<port> node scripts/repro-bulk-update.mjs
```

Run 2 also ran each script with `--reps 10` (locks) or `--reps 5` (bulk), the repetition counts of the original measurements. Every run seeded its own database with freshly generated keys and passwords; the scripts mask them, and the output below contains none.

## Results

| Script | Run 1, 3.93.0 | Run 2, 3.93.0 | Run 2, 3.93.0 repeated | Run 1, 4.0.0-beta.9 | Run 2, 4.0.0-beta.9 | Run 2, 4.0.0-beta.9 repeated |
|---|---|---|---|---|---|---|
| `repro-locks.mjs` | BUG REPRODUCED (5/5 checks), exit 0 | BUG REPRODUCED (5/5 checks), exit 0 | BUG REPRODUCED (5/5 checks), exit 0 | BUG REPRODUCED (5/5 checks), exit 0 | BUG REPRODUCED (5/5 checks), exit 0 | BUG REPRODUCED (5/5 checks), exit 0 |
| `repro-bulk-delete.mjs` | BUG REPRODUCED (2/2 checks), exit 0 | BUG REPRODUCED (2/2 checks), exit 0 | BUG REPRODUCED (2/2 checks), exit 0 | BUG REPRODUCED (2/2 checks), exit 0 | BUG REPRODUCED (2/2 checks), exit 0 | BUG REPRODUCED (2/2 checks), exit 0 |
| `repro-bulk-update.mjs` | BUG REPRODUCED (1/1 checks), exit 0 | BUG REPRODUCED (1/1 checks), exit 0 | BUG REPRODUCED (1/1 checks), exit 0 | NOT REPRODUCED (0/1 checks; see the [ok ] lines), exit 1 | NOT REPRODUCED (0/1 checks; see the [ok ] lines), exit 1 | NOT REPRODUCED (0/1 checks; see the [ok ] lines), exit 1 |

On 4.0.0-beta.9 `repro-bulk-update.mjs` does not reproduce, as expected: the update tool now sets `isError: true` when a bulk update has errors. The bulk delete tool does not.

Run 1 started 2026-11-13T19:27:44Z; run 2 started 2026-11-13T19:28:26Z.

## Run 1: full output

### Payload 3.93.0 (repo root): `repro-locks.mjs` (exit code 0)

```text
repro-locks: payload 3.93.0, @payloadcms/plugin-mcp 3.93.0, @payloadcms/db-sqlite 3.93.0, next 16.3.3, Node.js v25.8.1
MCP server: mcp-typescript server on vercel 0.1.0, protocol 2025-06-18; tools for user A's key: createPosts, updatePosts, findPosts, deletePosts

=== 1. MCP updatePosts while user B holds the lock (rep 1)

  post 1 created by user A; user B now holds its lock: {"id":1,"document":{"relationTo":"posts","value":1},"user":"user-b@example.test","updatedAt":"2026-11-13T19:27:59.522Z"}
  MCP POST /api/mcp   (Authorization: Bearer <user A API key>)
  request: {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"updatePosts","arguments":{"id":1,"title":"changed through MCP 1"}}}
  -> HTTP 200, result.isError: unset
  result.content[0].text:
    | Document updated successfully in collection "posts"!
    | Updated document:
    | ```json
    | {"id":1,"title":"changed through MCP 1","batch":"locks-mwfdd0cq","archived":false,"updatedAt":"2026-11-13T19:27:59.547Z","createdAt":"2026-11-13T19:27:59.510Z"}
    | ```
  read back: title "changed through MCP 1"; lock rows on the post: 0

=== 2. Control: REST PATCH by the same user under the same kind of lock (rep 1)

  post 2 created by user A; user B now holds its lock: {"id":1,"document":{"relationTo":"posts","value":2},"user":"user-b@example.test","updatedAt":"2026-11-13T19:27:59.592Z"}
  REST PATCH /api/posts/2   (Authorization: JWT <token>)
  request body: {"title":"changed through REST 1"}
  -> HTTP 423
  response body: {"errors":[{"message":"Document with ID 2 is currently locked by another user and cannot be updated."}]}
  read back: title "original title (rest update)"; lock rows on the post: 1

=== 3. MCP updatePosts with overrideLock: false (rep 1)

  post 3 created by user A; user B now holds its lock: {"id":1,"document":{"relationTo":"posts","value":3},"user":"user-b@example.test","updatedAt":"2026-11-13T19:27:59.708Z"}
  MCP POST /api/mcp   (Authorization: Bearer <user A API key>)
  request: {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"updatePosts","arguments":{"id":3,"title":"opt-out 1","overrideLock":false}}}
  -> HTTP 200, result.isError: unset
  result.content[0].text:
    | Error updating resource in collection "posts": Document with ID 3 is currently locked by another user and cannot be updated.
  read back: title "original title (mcp opt-out)"

=== 4. MCP deletePosts while user B holds the lock (rep 1)

  post 4 created by user A; user B now holds its lock: {"id":1,"document":{"relationTo":"posts","value":4},"user":"user-b@example.test","updatedAt":"2026-11-13T19:27:59.776Z"}
  MCP POST /api/mcp   (Authorization: Bearer <user A API key>)
  request: {"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"deletePosts","arguments":{"id":4}}}
  -> HTTP 200, result.isError: unset
  result.content[0].text:
    | Document deleted successfully from collection "posts"!
    | Deleted document:
    | ```json
    | {"id":4,"title":"original title (mcp delete)","batch":"locks-mwfdd0cq","archived":false,"updatedAt":"2026-11-13T19:27:59.767Z","createdAt":"2026-11-13T19:27:59.767Z"}
    | ```
  read back: post 4 no longer exists

=== 5. Control: REST DELETE by the same user under the same kind of lock (rep 1)

  post 4 created by user A; user B now holds its lock: {"id":1,"document":{"relationTo":"posts","value":4},"user":"user-b@example.test","updatedAt":"2026-11-13T19:27:59.827Z"}
  REST DELETE /api/posts/4   (Authorization: JWT <token>)
  -> HTTP 423
  response body: {"errors":[{"message":"Document with ID 4 is currently locked and cannot be deleted."}]}
  read back: post 4 still exists

=== Summary over 1 repetition(s) (user B held the lock every time)
  controls (REST, user A): PATCH 423 1/1, post and lock kept 1/1; DELETE 423 1/1, post kept 1/1
  opt-out (MCP updatePosts overrideLock:false): refused 1/1, isError set 0/1
  [BUG] MCP updatePosts wrote through user B's lock (1/1)
  [BUG] MCP updatePosts deleted user B's lock row (1/1)
  [BUG] MCP updatePosts answered "updated successfully" with isError unset (success 1/1, isError 0/1)
  [BUG] MCP deletePosts deleted the post user B had locked (1/1)
  [BUG] MCP deletePosts answered "deleted successfully" with isError unset (success 1/1, isError 0/1)
  [note] the overrideLock:false refusal came back as plain text with isError unset

RESULT locks: BUG REPRODUCED (5/5 checks)
```

### Payload 3.93.0 (repo root): `repro-bulk-delete.mjs` (exit code 0)

```text
repro-bulk-delete: payload 3.93.0, @payloadcms/plugin-mcp 3.93.0, @payloadcms/db-sqlite 3.93.0, next 16.3.3, Node.js v25.8.1
MCP server: mcp-typescript server on vercel 0.1.0, protocol 2025-06-18; tools for user A's key: createPosts, updatePosts, findPosts, deletePosts

=== 1. MCP bulk delete, 5 matched, 1 archived (rep 1)

  created 5 posts with batch "bulk-delete-partial-mcp-mwfdd0ys-1" (ids 5, 6, 7, 8, 9); 1 archived
  MCP POST /api/mcp   (Authorization: Bearer <user A API key>)
  request: {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"deletePosts","arguments":{"where":"{\"batch\":{\"equals\":\"bulk-delete-partial-mcp-mwfdd0ys-1\"}}"}}}
  -> HTTP 200, result.isError: unset
  result.content[0].text:
    | Document deleted successfully from collection "posts"!
    | Deleted: 4 documents
    | Errors: 1
    | ---
    | 
    | Deleted documents:
    | ```json
    | [{"id":8,"title":"bulk-delete-partial-mcp-mwfdd0ys-1 post 4","batch":"bulk-delete-partial-mcp-mwfdd0ys-1","archived":false,"updatedAt":"2026-11-13T19:28:00.333Z","createdAt":"2026-11-13T19:28:00.333Z"},{"id":7,"title":"bulk-delete-partial-mcp-mwfdd0ys-1 post 3","batch":"bulk-delete-partial-mcp-mwfdd0ys-1","archived":false,"updatedAt":"2026-11-13T19:28:00.323Z","createdAt":"2026-11-13T19:28:00.323Z"},{"id":6,"title":"bulk-delete-partial-mcp-mwfdd0ys-1 post 2","batch":"bulk-delete-partial-mcp-mwfdd0ys-1","archived":false,"updatedAt":"2026-11-13T19:28:00.312Z","createdAt":"2026-11-13T19:28:00.312Z"},{"id":5,"title":"bulk-delete-partial-mcp-mwfdd0ys-1 post 1","batch":"bulk-delete-partial-mcp-mwfdd0ys-1","archived":false,"updatedAt":"2026-11-13T19:28:00.299Z","createdAt":"2026-11-13T19:28:00.299Z"}]
    | ```
    | 
    | Errors:
    | ```json
    | [{"id":9,"isPublic":true,"message":"Post \"bulk-delete-partial-mcp-mwfdd0ys-1 post 5 (archived)\" is archived and cannot be deleted"}]
    | ```
  read back: 1 of 5 posts with this batch remain

=== 1c. Control: REST bulk DELETE with the same where, identical set (rep 1)

  created 5 posts with batch "bulk-delete-partial-rest-mwfdd0ys-1" (ids 10, 11, 12, 13, 14); 1 archived
  REST DELETE /api/posts?where[batch][equals]=bulk-delete-partial-rest-mwfdd0ys-1&depth=0   (Authorization: JWT <token>)
  -> HTTP 400
  response body: {"docs":[{"id":13,"title":"bulk-delete-partial-rest-mwfdd0ys-1 post 4","batch":"bulk-delete-partial-rest-mwfdd0ys-1","archived":false,"updatedAt":"2026-11-13T19:28:00.441Z","createdAt":"2026-11-13T19:28:00.441Z"},{"id":12,"title":"bulk-delete-partial-rest-mwfdd0ys-1 post 3","batch":"bulk-delete-partial-rest-mwfdd0ys-1","archived":false,"updatedAt":"2026-11-13T19:28:00.429Z","createdAt":"2026-11-13T19:28:00.429Z"},{"id":11,"title":"bulk-delete-partial-rest-mwfdd0ys-1 post 2","batch":"bulk-delete-partial-rest-mwfdd0ys-1","archived":false,"updatedAt":"2026-11-13T19:28:00.418Z","createdAt":"2026-11-13T19:28:00.418Z"},{"id":10,"title":"bulk-delete-partial-rest-mwfdd0ys-1 post 1","batch":"bulk-delete-partial-rest-mwfdd0ys-1","archived":false,"updatedAt":"2026-11-13T19:28:00.408Z","createdAt":"2026-11-13T19:28:00.407Z"}],"errors":[{"id":14,"isPublic":true,"message":"Post \"bulk-delete-partial-rest-mwfdd0ys-1 post 5 (archived)\" is archived and cannot be deleted"}],"message":"Unable to delete 1 out of 5 Posts."}
  read back: 1 of 5 posts with this batch remain

=== 2. MCP bulk delete, 2 matched, both archived: nothing can be deleted (rep 1)

  created 2 posts with batch "bulk-delete-none-mcp-mwfdd0ys-1" (ids 15, 16); 2 archived
  MCP POST /api/mcp   (Authorization: Bearer <user A API key>)
  request: {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"deletePosts","arguments":{"where":"{\"batch\":{\"equals\":\"bulk-delete-none-mcp-mwfdd0ys-1\"}}"}}}
  -> HTTP 200, result.isError: unset
  result.content[0].text:
    | Document deleted successfully from collection "posts"!
    | Deleted: 0 documents
    | Errors: 2
    | ---
    | 
    | Errors:
    | ```json
    | [{"id":16,"isPublic":true,"message":"Post \"bulk-delete-none-mcp-mwfdd0ys-1 post 2 (archived)\" is archived and cannot be deleted"},{"id":15,"isPublic":true,"message":"Post \"bulk-delete-none-mcp-mwfdd0ys-1 post 1 (archived)\" is archived and cannot be deleted"}]
    | ```
  read back: 2 of 2 posts with this batch remain

=== 2c. Control: REST bulk DELETE with the same where, identical set (rep 1)

  created 2 posts with batch "bulk-delete-none-rest-mwfdd0ys-1" (ids 17, 18); 2 archived
  REST DELETE /api/posts?where[batch][equals]=bulk-delete-none-rest-mwfdd0ys-1&depth=0   (Authorization: JWT <token>)
  -> HTTP 400
  response body: {"docs":[],"errors":[{"id":18,"isPublic":true,"message":"Post \"bulk-delete-none-rest-mwfdd0ys-1 post 2 (archived)\" is archived and cannot be deleted"},{"id":17,"isPublic":true,"message":"Post \"bulk-delete-none-rest-mwfdd0ys-1 post 1 (archived)\" is archived and cannot be deleted"}],"message":"Unable to delete 2 out of 2 Posts."}
  read back: 2 of 2 posts with this batch remain

=== 3. MCP deletePosts with neither id nor where (rep 1)
  MCP POST /api/mcp   (Authorization: Bearer <user A API key>)
  request: {"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"deletePosts","arguments":{}}}
  -> HTTP 200, result.isError: unset
  result.content[0].text:
    | Error: Either id or where clause must be provided

=== Summary over 1 repetition(s)
  controls (REST bulk DELETE, user A): 1 refused of 5 -> HTTP 400 1/1, 4 deleted 1/1; 2 refused of 2 -> HTTP 400 1/1, 0 deleted 1/1
  [BUG] partial bulk delete (4 of 5 deleted): MCP answered "deleted successfully" with isError unset (4 deleted 1/1, success text 1/1, isError 0/1)
  [BUG] bulk delete that deleted nothing (0 of 2): MCP answered "deleted successfully" with isError unset (0 deleted 1/1, success text 1/1, isError 0/1)
  [note] deletePosts with neither id nor where: the error answer has isError unset (1/1 error text, isError 0/1)

RESULT bulk-delete: BUG REPRODUCED (2/2 checks)
```

### Payload 3.93.0 (repo root): `repro-bulk-update.mjs` (exit code 0)

```text
repro-bulk-update: payload 3.93.0, @payloadcms/plugin-mcp 3.93.0, @payloadcms/db-sqlite 3.93.0, next 16.3.3, Node.js v25.8.1
MCP server: mcp-typescript server on vercel 0.1.0, protocol 2025-06-18; tools for user A's key: createPosts, updatePosts, findPosts, deletePosts

=== 1. MCP bulk update, 5 matched, 1 archived (rep 1)

  created 5 posts with batch "bulk-update-mcp-mwfdd1k5-1" (ids 19, 20, 21, 22, 23); the last one archived
  MCP POST /api/mcp   (Authorization: Bearer <user A API key>)
  request: {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"updatePosts","arguments":{"where":"{\"batch\":{\"equals\":\"bulk-update-mcp-mwfdd1k5-1\"}}","title":"bulk edit"}}}
  -> HTTP 200, result.isError: unset
  result.content[0].text:
    | Multiple documents updated in collection "posts"!
    | Updated: 4 documents
    | Errors: 1
    | ---
    | 
    | Updated documents:
    | ```json
    | [{"id":22,"title":"bulk edit","batch":"bulk-update-mcp-mwfdd1k5-1","archived":false,"updatedAt":"2026-11-13T19:28:01.175Z","createdAt":"2026-11-13T19:28:01.117Z"},{"id":21,"title":"bulk edit","batch":"bulk-update-mcp-mwfdd1k5-1","archived":false,"updatedAt":"2026-11-13T19:28:01.175Z","createdAt":"2026-11-13T19:28:01.099Z"},{"id":20,"title":"bulk edit","batch":"bulk-update-mcp-mwfdd1k5-1","archived":false,"updatedAt":"2026-11-13T19:28:01.175Z","createdAt":"2026-11-13T19:28:01.085Z"},{"id":19,"title":"bulk edit","batch":"bulk-update-mcp-mwfdd1k5-1","archived":false,"updatedAt":"2026-11-13T19:28:01.175Z","createdAt":"2026-11-13T19:28:01.071Z"}]
    | ```
    | 
    | Errors:
    | ```json
    | [{"id":23,"isPublic":true,"message":"Post \"bulk-update-mcp-mwfdd1k5-1 post 5 (archived)\" is archived and cannot be changed"}]
    | ```
  read back: 4 of 5 posts now have the title "bulk edit"

=== 1c. Control: REST bulk PATCH with the same where, identical set (rep 1)

  created 5 posts with batch "bulk-update-rest-mwfdd1k5-1" (ids 24, 25, 26, 27, 28); the last one archived
  REST PATCH /api/posts?where[batch][equals]=bulk-update-rest-mwfdd1k5-1&depth=0   (Authorization: JWT <token>)
  request body: {"title":"bulk edit"}
  -> HTTP 400
  response body: {"docs":[{"id":27,"title":"bulk edit","batch":"bulk-update-rest-mwfdd1k5-1","archived":false,"updatedAt":"2026-11-13T19:28:01.312Z","createdAt":"2026-11-13T19:28:01.253Z"},{"id":26,"title":"bulk edit","batch":"bulk-update-rest-mwfdd1k5-1","archived":false,"updatedAt":"2026-11-13T19:28:01.312Z","createdAt":"2026-11-13T19:28:01.235Z"},{"id":25,"title":"bulk edit","batch":"bulk-update-rest-mwfdd1k5-1","archived":false,"updatedAt":"2026-11-13T19:28:01.312Z","createdAt":"2026-11-13T19:28:01.224Z"},{"id":24,"title":"bulk edit","batch":"bulk-update-rest-mwfdd1k5-1","archived":false,"updatedAt":"2026-11-13T19:28:01.312Z","createdAt":"2026-11-13T19:28:01.210Z"}],"errors":[{"id":28,"isPublic":true,"message":"Post \"bulk-update-rest-mwfdd1k5-1 post 5 (archived)\" is archived and cannot be changed"}],"message":"Unable to update 1 out of 5 Posts."}
  read back: 4 of 5 posts now have the title "bulk edit"

=== Summary over 1 repetition(s)
  control (REST bulk PATCH, user A): HTTP 400 1/1, 4 changed 1/1
  [BUG] partial bulk update (4 of 5 changed): MCP answered "Multiple documents updated" with isError unset (4 changed 1/1, success text 1/1, isError 0/1)

RESULT bulk-update: BUG REPRODUCED (1/1 checks)
```

### Payload 4.0.0-beta.9 (`v4-beta/`): `repro-locks.mjs` (exit code 0)

```text
repro-locks: payload 4.0.0-beta.9, @payloadcms/plugin-mcp 4.0.0-beta.9, @payloadcms/db-sqlite 4.0.0-beta.9, next 16.4.2, Node.js v25.8.1
MCP server: Payload MCP Server 1.0.0, protocol 2025-06-18; tools for user A's key: countDocuments, createDocuments, deleteDocuments, findDocuments, findDistinct, getCollectionSchema, updateDocument, duplicateDocument, getConfigInfo

=== 1. MCP updateDocument while user B holds the lock (rep 1)

  post 1 created by user A; user B now holds its lock: {"id":1,"document":{"relationTo":"posts","value":1},"user":"user-b@example.test","updatedAt":"2026-11-13T19:28:17.043Z"}
  MCP POST /api/mcp   (Authorization: users API-Key <user A API key>)
  request: {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"updateDocument","arguments":{"slug":"posts","id":1,"data":{"title":"changed through MCP 1"}}}}
  -> HTTP 200, result.isError: unset
  result.content[0].text:
    | Document updated successfully in collection "posts"!
    | Result:
    | ```json
    | {"id":1}
    | ```
  read back: title "changed through MCP 1"; lock rows on the post: 0

=== 2. Control: REST PATCH by the same user under the same kind of lock (rep 1)

  post 2 created by user A; user B now holds its lock: {"id":1,"document":{"relationTo":"posts","value":2},"user":"user-b@example.test","updatedAt":"2026-11-13T19:28:17.105Z"}
  REST PATCH /api/posts/2   (Authorization: JWT <token>)
  request body: {"title":"changed through REST 1"}
  -> HTTP 423
  response body: {"errors":[{"message":"Document with ID 2 is currently locked by another user and cannot be updated."}]}
  read back: title "original title (rest update)"; lock rows on the post: 1

=== 3. MCP updateDocument with overrideLock: false (rep 1)

  post 3 created by user A; user B now holds its lock: {"id":1,"document":{"relationTo":"posts","value":3},"user":"user-b@example.test","updatedAt":"2026-11-13T19:28:17.152Z"}
  MCP POST /api/mcp   (Authorization: users API-Key <user A API key>)
  request: {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"updateDocument","arguments":{"slug":"posts","id":3,"data":{"title":"opt-out 1"},"overrideLock":false}}}
  -> HTTP 200, result.isError: true
  result.content[0].text:
    | Error updating document in collection "posts": Document with ID 3 is currently locked by another user and cannot be updated.
  read back: title "original title (mcp opt-out)"

=== 4. MCP deleteDocuments while user B holds the lock (rep 1)

  post 4 created by user A; user B now holds its lock: {"id":1,"document":{"relationTo":"posts","value":4},"user":"user-b@example.test","updatedAt":"2026-11-13T19:28:17.205Z"}
  MCP POST /api/mcp   (Authorization: users API-Key <user A API key>)
  request: {"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"deleteDocuments","arguments":{"slug":"posts","id":4}}}
  -> HTTP 200, result.isError: unset
  result.content[0].text:
    | Document deleted successfully from collection "posts"!
    | Deleted document:
    | ```json
    | {"id":4,"title":"original title (mcp delete)","batch":"locks-mwfdddve","archived":false,"createdBy":{"relationTo":"users","value":1},"updatedBy":{"relationTo":"users","value":1},"updatedAt":"2026-11-13T19:28:17.193Z","createdAt":"2026-11-13T19:28:17.193Z"}
    | ```
  read back: post 4 no longer exists

=== 5. Control: REST DELETE by the same user under the same kind of lock (rep 1)

  post 4 created by user A; user B now holds its lock: {"id":1,"document":{"relationTo":"posts","value":4},"user":"user-b@example.test","updatedAt":"2026-11-13T19:28:17.262Z"}
  REST DELETE /api/posts/4   (Authorization: JWT <token>)
  -> HTTP 423
  response body: {"errors":[{"message":"Document with ID 4 is currently locked and cannot be deleted."}]}
  read back: post 4 still exists

=== Summary over 1 repetition(s) (user B held the lock every time)
  controls (REST, user A): PATCH 423 1/1, post and lock kept 1/1; DELETE 423 1/1, post kept 1/1
  opt-out (MCP updateDocument overrideLock:false): refused 1/1, isError set 1/1
  [BUG] MCP updateDocument wrote through user B's lock (1/1)
  [BUG] MCP updateDocument deleted user B's lock row (1/1)
  [BUG] MCP updateDocument answered "updated successfully" with isError unset (success 1/1, isError 0/1)
  [BUG] MCP deleteDocuments deleted the post user B had locked (1/1)
  [BUG] MCP deleteDocuments answered "deleted successfully" with isError unset (success 1/1, isError 0/1)
  [note] the overrideLock:false refusal set isError (1/1)

RESULT locks: BUG REPRODUCED (5/5 checks)
```

### Payload 4.0.0-beta.9 (`v4-beta/`): `repro-bulk-delete.mjs` (exit code 0)

```text
repro-bulk-delete: payload 4.0.0-beta.9, @payloadcms/plugin-mcp 4.0.0-beta.9, @payloadcms/db-sqlite 4.0.0-beta.9, next 16.4.2, Node.js v25.8.1
MCP server: Payload MCP Server 1.0.0, protocol 2025-06-18; tools for user A's key: countDocuments, createDocuments, deleteDocuments, findDocuments, findDistinct, getCollectionSchema, updateDocument, duplicateDocument, getConfigInfo

=== 1. MCP bulk delete, 5 matched, 1 archived (rep 1)

  created 5 posts with batch "bulk-delete-partial-mcp-mwfdde9w-1" (ids 5, 6, 7, 8, 9); 1 archived
  MCP POST /api/mcp   (Authorization: users API-Key <user A API key>)
  request: {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"deleteDocuments","arguments":{"slug":"posts","where":{"batch":{"equals":"bulk-delete-partial-mcp-mwfdde9w-1"}}}}}
  -> HTTP 200, result.isError: unset
  result.content[0].text:
    | Document deleted successfully from collection "posts"!
    | Deleted: 4 documents
    | Errors: 1
    | ---
    | 
    | Deleted documents:
    | ```json
    | [{"id":8,"title":"bulk-delete-partial-mcp-mwfdde9w-1 post 4","batch":"bulk-delete-partial-mcp-mwfdde9w-1","archived":false,"createdBy":{"relationTo":"users","value":1},"updatedBy":{"relationTo":"users","value":1},"updatedAt":"2026-11-13T19:28:17.582Z","createdAt":"2026-11-13T19:28:17.582Z"},{"id":7,"title":"bulk-delete-partial-mcp-mwfdde9w-1 post 3","batch":"bulk-delete-partial-mcp-mwfdde9w-1","archived":false,"createdBy":{"relationTo":"users","value":1},"updatedBy":{"relationTo":"users","value":1},"updatedAt":"2026-11-13T19:28:17.571Z","createdAt":"2026-11-13T19:28:17.571Z"},{"id":6,"title":"bulk-delete-partial-mcp-mwfdde9w-1 post 2","batch":"bulk-delete-partial-mcp-mwfdde9w-1","archived":false,"createdBy":{"relationTo":"users","value":1},"updatedBy":{"relationTo":"users","value":1},"updatedAt":"2026-11-13T19:28:17.556Z","createdAt":"2026-11-13T19:28:17.556Z"},{"id":5,"title":"bulk-delete-partial-mcp-mwfdde9w-1 post 1","batch":"bulk-delete-partial-mcp-mwfdde9w-1","archived":false,"createdBy":{"relationTo":"users","value":1},"updatedBy":{"relationTo":"users","value":1},"updatedAt":"2026-11-13T19:28:17.544Z","createdAt":"2026-11-13T19:28:17.544Z"}]
    | ```
    | 
    | Errors:
    | ```json
    | [{"id":9,"isPublic":true,"message":"Post \"bulk-delete-partial-mcp-mwfdde9w-1 post 5 (archived)\" is archived and cannot be deleted"}]
    | ```
  read back: 1 of 5 posts with this batch remain

=== 1c. Control: REST bulk DELETE with the same where, identical set (rep 1)

  created 5 posts with batch "bulk-delete-partial-rest-mwfdde9w-1" (ids 10, 11, 12, 13, 14); 1 archived
  REST DELETE /api/posts?where[batch][equals]=bulk-delete-partial-rest-mwfdde9w-1&depth=0   (Authorization: JWT <token>)
  -> HTTP 400
  response body: {"docs":[{"id":13,"title":"bulk-delete-partial-rest-mwfdde9w-1 post 4","batch":"bulk-delete-partial-rest-mwfdde9w-1","archived":false,"createdBy":{"relationTo":"users","value":1},"updatedBy":{"relationTo":"users","value":1},"updatedAt":"2026-11-13T19:28:17.657Z","createdAt":"2026-11-13T19:28:17.657Z"},{"id":12,"title":"bulk-delete-partial-rest-mwfdde9w-1 post 3","batch":"bulk-delete-partial-rest-mwfdde9w-1","archived":false,"createdBy":{"relationTo":"users","value":1},"updatedBy":{"relationTo":"users","value":1},"updatedAt":"2026-11-13T19:28:17.648Z","createdAt":"2026-11-13T19:28:17.647Z"},{"id":11,"title":"bulk-delete-partial-rest-mwfdde9w-1 post 2","batch":"bulk-delete-partial-rest-mwfdde9w-1","archived":false,"createdBy":{"relationTo":"users","value":1},"updatedBy":{"relationTo":"users","value":1},"updatedAt":"2026-11-13T19:28:17.637Z","createdAt":"2026-11-13T19:28:17.637Z"},{"id":10,"title":"bulk-delete-partial-rest-mwfdde9w-1 post 1","batch":"bulk-delete-partial-rest-mwfdde9w-1","archived":false,"createdBy":{"relationTo":"users","value":1},"updatedBy":{"relationTo":"users","value":1},"updatedAt":"2026-11-13T19:28:17.627Z","createdAt":"2026-11-13T19:28:17.627Z"}],"errors":[{"id":14,"isPublic":true,"message":"Post \"bulk-delete-partial-rest-mwfdde9w-1 post 5 (archived)\" is archived and cannot be deleted"}],"message":"Unable to delete 1 out of 5 Posts."}
  read back: 1 of 5 posts with this batch remain

=== 2. MCP bulk delete, 2 matched, both archived: nothing can be deleted (rep 1)

  created 2 posts with batch "bulk-delete-none-mcp-mwfdde9w-1" (ids 15, 16); 2 archived
  MCP POST /api/mcp   (Authorization: users API-Key <user A API key>)
  request: {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"deleteDocuments","arguments":{"slug":"posts","where":{"batch":{"equals":"bulk-delete-none-mcp-mwfdde9w-1"}}}}}
  -> HTTP 200, result.isError: unset
  result.content[0].text:
    | Document deleted successfully from collection "posts"!
    | Deleted: 0 documents
    | Errors: 2
    | ---
    | 
    | Errors:
    | ```json
    | [{"id":16,"isPublic":true,"message":"Post \"bulk-delete-none-mcp-mwfdde9w-1 post 2 (archived)\" is archived and cannot be deleted"},{"id":15,"isPublic":true,"message":"Post \"bulk-delete-none-mcp-mwfdde9w-1 post 1 (archived)\" is archived and cannot be deleted"}]
    | ```
  read back: 2 of 2 posts with this batch remain

=== 2c. Control: REST bulk DELETE with the same where, identical set (rep 1)

  created 2 posts with batch "bulk-delete-none-rest-mwfdde9w-1" (ids 17, 18); 2 archived
  REST DELETE /api/posts?where[batch][equals]=bulk-delete-none-rest-mwfdde9w-1&depth=0   (Authorization: JWT <token>)
  -> HTTP 400
  response body: {"docs":[],"errors":[{"id":18,"isPublic":true,"message":"Post \"bulk-delete-none-rest-mwfdde9w-1 post 2 (archived)\" is archived and cannot be deleted"},{"id":17,"isPublic":true,"message":"Post \"bulk-delete-none-rest-mwfdde9w-1 post 1 (archived)\" is archived and cannot be deleted"}],"message":"Unable to delete 2 out of 2 Posts."}
  read back: 2 of 2 posts with this batch remain

=== 3. MCP deleteDocuments with neither id nor where (rep 1)
  MCP POST /api/mcp   (Authorization: users API-Key <user A API key>)
  request: {"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"deleteDocuments","arguments":{"slug":"posts"}}}
  -> HTTP 200, result.isError: true
  result.content[0].text:
    | Input validation error: Invalid arguments for tool deleteDocuments: id: Either id or where must be provided.

=== Summary over 1 repetition(s)
  controls (REST bulk DELETE, user A): 1 refused of 5 -> HTTP 400 1/1, 4 deleted 1/1; 2 refused of 2 -> HTTP 400 1/1, 0 deleted 1/1
  [BUG] partial bulk delete (4 of 5 deleted): MCP answered "deleted successfully" with isError unset (4 deleted 1/1, success text 1/1, isError 0/1)
  [BUG] bulk delete that deleted nothing (0 of 2): MCP answered "deleted successfully" with isError unset (0 deleted 1/1, success text 1/1, isError 0/1)
  [note] deleteDocuments with neither id nor where: the error answer sets isError (1/1 error text, isError 1/1)

RESULT bulk-delete: BUG REPRODUCED (2/2 checks)
```

### Payload 4.0.0-beta.9 (`v4-beta/`): `repro-bulk-update.mjs` (exit code 1)

```text
repro-bulk-update: payload 4.0.0-beta.9, @payloadcms/plugin-mcp 4.0.0-beta.9, @payloadcms/db-sqlite 4.0.0-beta.9, next 16.4.2, Node.js v25.8.1
MCP server: Payload MCP Server 1.0.0, protocol 2025-06-18; tools for user A's key: countDocuments, createDocuments, deleteDocuments, findDocuments, findDistinct, getCollectionSchema, updateDocument, duplicateDocument, getConfigInfo

=== 1. MCP bulk update, 5 matched, 1 archived (rep 1)

  created 5 posts with batch "bulk-update-mcp-mwfddemx-1" (ids 19, 20, 21, 22, 23); the last one archived
  MCP POST /api/mcp   (Authorization: users API-Key <user A API key>)
  request: {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"updateDocument","arguments":{"slug":"posts","where":{"batch":{"equals":"bulk-update-mcp-mwfddemx-1"}},"data":{"title":"bulk edit"}}}}
  -> HTTP 200, result.isError: true
  result.content[0].text:
    | Multiple documents updated in collection "posts"!
    | Updated: 4 documents
    | Errors: 1
    | ---
    | 
    | Updated documents:
    | ```json
    | [{"id":22},{"id":21},{"id":20},{"id":19}]
    | ```
    | 
    | Errors:
    | ```json
    | [{"id":23,"isPublic":true,"message":"Post \"bulk-update-mcp-mwfddemx-1 post 5 (archived)\" is archived and cannot be changed"}]
    | ```
    | 
    | Use this schema for data:
    | ```json
    | {"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","additionalProperties":false,"title":"PostInput","properties":{"id":{"type":"number"},"title":{"type":"string"},"batch":{"description":"Groups the posts a repro script creates","type":["string","null"]},"archived":{"type":["boolean","null"]},"createdBy":{"$ref":"#/$defs/shared_0"},"updatedBy":{"$ref":"#/$defs/shared_0"}},"required":["title"],"$defs":{"shared_0":{"oneOf":[{"type":["object","null"],"additionalProperties":false,"properties":{"relationTo":{"const":"users"},"value":{"type":"number"}},"required":["value","relationTo"]}]}}}
    | ```
  read back: 4 of 5 posts now have the title "bulk edit"

=== 1c. Control: REST bulk PATCH with the same where, identical set (rep 1)

  created 5 posts with batch "bulk-update-rest-mwfddemx-1" (ids 24, 25, 26, 27, 28); the last one archived
  REST PATCH /api/posts?where[batch][equals]=bulk-update-rest-mwfddemx-1&depth=0   (Authorization: JWT <token>)
  request body: {"title":"bulk edit"}
  -> HTTP 400
  response body: {"docs":[{"title":"bulk edit","batch":"bulk-update-rest-mwfddemx-1","archived":false,"createdBy":{"relationTo":"users","value":1},"updatedBy":{"relationTo":"users","value":1},"updatedAt":"2026-11-13T19:28:18.154Z","createdAt":"2026-11-13T19:28:18.134Z","id":27},{"title":"bulk edit","batch":"bulk-update-rest-mwfddemx-1","archived":false,"createdBy":{"relationTo":"users","value":1},"updatedBy":{"relationTo":"users","value":1},"updatedAt":"2026-11-13T19:28:18.154Z","createdAt":"2026-11-13T19:28:18.125Z","id":26},{"title":"bulk edit","batch":"bulk-update-rest-mwfddemx-1","archived":false,"createdBy":{"relationTo":"users","value":1},"updatedBy":{"relationTo":"users","value":1},"updatedAt":"2026-11-13T19:28:18.154Z","createdAt":"2026-11-13T19:28:18.116Z","id":25},{"title":"bulk edit","batch":"bulk-update-rest-mwfddemx-1","archived":false,"createdBy":{"relationTo":"users","value":1},"updatedBy":{"relationTo":"users","value":1},"updatedAt":"2026-11-13T19:28:18.154Z","createdAt":"2026-11-13T19:28:18.107Z","id":24}],"errors":[{"id":28,"isPublic":true,"message":"Post \"bulk-update-rest-mwfddemx-1 post 5 (archived)\" is archived and cannot be changed"}],"message":"Unable to update 1 out of 5 Posts."}
  read back: 4 of 5 posts now have the title "bulk edit"

=== Summary over 1 repetition(s)
  control (REST bulk PATCH, user A): HTTP 400 1/1, 4 changed 1/1
  [ok ] partial bulk update (4 of 5 changed): MCP answered "Multiple documents updated" with isError unset (4 changed 1/1, success text 1/1, isError 1/1)

RESULT bulk-update: NOT REPRODUCED (0/1 checks; see the [ok ] lines)
```

## Run 2: summaries

### Payload 3.93.0 (repo root): `repro-locks.mjs`, one repetition (exit code 0)

```text
repro-locks: payload 3.93.0, @payloadcms/plugin-mcp 3.93.0, @payloadcms/db-sqlite 3.93.0, next 16.3.3, Node.js v25.8.1
...
=== Summary over 1 repetition(s) (user B held the lock every time)
  controls (REST, user A): PATCH 423 1/1, post and lock kept 1/1; DELETE 423 1/1, post kept 1/1
  opt-out (MCP updatePosts overrideLock:false): refused 1/1, isError set 0/1
  [BUG] MCP updatePosts wrote through user B's lock (1/1)
  [BUG] MCP updatePosts deleted user B's lock row (1/1)
  [BUG] MCP updatePosts answered "updated successfully" with isError unset (success 1/1, isError 0/1)
  [BUG] MCP deletePosts deleted the post user B had locked (1/1)
  [BUG] MCP deletePosts answered "deleted successfully" with isError unset (success 1/1, isError 0/1)
  [note] the overrideLock:false refusal came back as plain text with isError unset

RESULT locks: BUG REPRODUCED (5/5 checks)
```

### Payload 3.93.0 (repo root): `repro-locks.mjs`, repeated (exit code 0)

```text
repro-locks: payload 3.93.0, @payloadcms/plugin-mcp 3.93.0, @payloadcms/db-sqlite 3.93.0, next 16.3.3, Node.js v25.8.1
...
=== Summary over 10 repetition(s) (user B held the lock every time)
  controls (REST, user A): PATCH 423 10/10, post and lock kept 10/10; DELETE 423 10/10, post kept 10/10
  opt-out (MCP updatePosts overrideLock:false): refused 10/10, isError set 0/10
  [BUG] MCP updatePosts wrote through user B's lock (10/10)
  [BUG] MCP updatePosts deleted user B's lock row (10/10)
  [BUG] MCP updatePosts answered "updated successfully" with isError unset (success 10/10, isError 0/10)
  [BUG] MCP deletePosts deleted the post user B had locked (10/10)
  [BUG] MCP deletePosts answered "deleted successfully" with isError unset (success 10/10, isError 0/10)
  [note] the overrideLock:false refusal came back as plain text with isError unset

RESULT locks: BUG REPRODUCED (5/5 checks)
```

### Payload 3.93.0 (repo root): `repro-bulk-delete.mjs`, one repetition (exit code 0)

```text
repro-bulk-delete: payload 3.93.0, @payloadcms/plugin-mcp 3.93.0, @payloadcms/db-sqlite 3.93.0, next 16.3.3, Node.js v25.8.1
...
=== Summary over 1 repetition(s)
  controls (REST bulk DELETE, user A): 1 refused of 5 -> HTTP 400 1/1, 4 deleted 1/1; 2 refused of 2 -> HTTP 400 1/1, 0 deleted 1/1
  [BUG] partial bulk delete (4 of 5 deleted): MCP answered "deleted successfully" with isError unset (4 deleted 1/1, success text 1/1, isError 0/1)
  [BUG] bulk delete that deleted nothing (0 of 2): MCP answered "deleted successfully" with isError unset (0 deleted 1/1, success text 1/1, isError 0/1)
  [note] deletePosts with neither id nor where: the error answer has isError unset (1/1 error text, isError 0/1)

RESULT bulk-delete: BUG REPRODUCED (2/2 checks)
```

### Payload 3.93.0 (repo root): `repro-bulk-delete.mjs`, repeated (exit code 0)

```text
repro-bulk-delete: payload 3.93.0, @payloadcms/plugin-mcp 3.93.0, @payloadcms/db-sqlite 3.93.0, next 16.3.3, Node.js v25.8.1
...
=== Summary over 5 repetition(s)
  controls (REST bulk DELETE, user A): 1 refused of 5 -> HTTP 400 5/5, 4 deleted 5/5; 2 refused of 2 -> HTTP 400 5/5, 0 deleted 5/5
  [BUG] partial bulk delete (4 of 5 deleted): MCP answered "deleted successfully" with isError unset (4 deleted 5/5, success text 5/5, isError 0/5)
  [BUG] bulk delete that deleted nothing (0 of 2): MCP answered "deleted successfully" with isError unset (0 deleted 5/5, success text 5/5, isError 0/5)
  [note] deletePosts with neither id nor where: the error answer has isError unset (5/5 error text, isError 0/5)

RESULT bulk-delete: BUG REPRODUCED (2/2 checks)
```

### Payload 3.93.0 (repo root): `repro-bulk-update.mjs`, one repetition (exit code 0)

```text
repro-bulk-update: payload 3.93.0, @payloadcms/plugin-mcp 3.93.0, @payloadcms/db-sqlite 3.93.0, next 16.3.3, Node.js v25.8.1
...
=== Summary over 1 repetition(s)
  control (REST bulk PATCH, user A): HTTP 400 1/1, 4 changed 1/1
  [BUG] partial bulk update (4 of 5 changed): MCP answered "Multiple documents updated" with isError unset (4 changed 1/1, success text 1/1, isError 0/1)

RESULT bulk-update: BUG REPRODUCED (1/1 checks)
```

### Payload 3.93.0 (repo root): `repro-bulk-update.mjs`, repeated (exit code 0)

```text
repro-bulk-update: payload 3.93.0, @payloadcms/plugin-mcp 3.93.0, @payloadcms/db-sqlite 3.93.0, next 16.3.3, Node.js v25.8.1
...
=== Summary over 5 repetition(s)
  control (REST bulk PATCH, user A): HTTP 400 5/5, 4 changed 5/5
  [BUG] partial bulk update (4 of 5 changed): MCP answered "Multiple documents updated" with isError unset (4 changed 5/5, success text 5/5, isError 0/5)

RESULT bulk-update: BUG REPRODUCED (1/1 checks)
```

### Payload 4.0.0-beta.9 (`v4-beta/`): `repro-locks.mjs`, one repetition (exit code 0)

```text
repro-locks: payload 4.0.0-beta.9, @payloadcms/plugin-mcp 4.0.0-beta.9, @payloadcms/db-sqlite 4.0.0-beta.9, next 16.4.2, Node.js v25.8.1
...
=== Summary over 1 repetition(s) (user B held the lock every time)
  controls (REST, user A): PATCH 423 1/1, post and lock kept 1/1; DELETE 423 1/1, post kept 1/1
  opt-out (MCP updateDocument overrideLock:false): refused 1/1, isError set 1/1
  [BUG] MCP updateDocument wrote through user B's lock (1/1)
  [BUG] MCP updateDocument deleted user B's lock row (1/1)
  [BUG] MCP updateDocument answered "updated successfully" with isError unset (success 1/1, isError 0/1)
  [BUG] MCP deleteDocuments deleted the post user B had locked (1/1)
  [BUG] MCP deleteDocuments answered "deleted successfully" with isError unset (success 1/1, isError 0/1)
  [note] the overrideLock:false refusal set isError (1/1)

RESULT locks: BUG REPRODUCED (5/5 checks)
```

### Payload 4.0.0-beta.9 (`v4-beta/`): `repro-locks.mjs`, repeated (exit code 0)

```text
repro-locks: payload 4.0.0-beta.9, @payloadcms/plugin-mcp 4.0.0-beta.9, @payloadcms/db-sqlite 4.0.0-beta.9, next 16.4.2, Node.js v25.8.1
...
=== Summary over 10 repetition(s) (user B held the lock every time)
  controls (REST, user A): PATCH 423 10/10, post and lock kept 10/10; DELETE 423 10/10, post kept 10/10
  opt-out (MCP updateDocument overrideLock:false): refused 10/10, isError set 10/10
  [BUG] MCP updateDocument wrote through user B's lock (10/10)
  [BUG] MCP updateDocument deleted user B's lock row (10/10)
  [BUG] MCP updateDocument answered "updated successfully" with isError unset (success 10/10, isError 0/10)
  [BUG] MCP deleteDocuments deleted the post user B had locked (10/10)
  [BUG] MCP deleteDocuments answered "deleted successfully" with isError unset (success 10/10, isError 0/10)
  [note] the overrideLock:false refusal set isError (10/10)

RESULT locks: BUG REPRODUCED (5/5 checks)
```

### Payload 4.0.0-beta.9 (`v4-beta/`): `repro-bulk-delete.mjs`, one repetition (exit code 0)

```text
repro-bulk-delete: payload 4.0.0-beta.9, @payloadcms/plugin-mcp 4.0.0-beta.9, @payloadcms/db-sqlite 4.0.0-beta.9, next 16.4.2, Node.js v25.8.1
...
=== Summary over 1 repetition(s)
  controls (REST bulk DELETE, user A): 1 refused of 5 -> HTTP 400 1/1, 4 deleted 1/1; 2 refused of 2 -> HTTP 400 1/1, 0 deleted 1/1
  [BUG] partial bulk delete (4 of 5 deleted): MCP answered "deleted successfully" with isError unset (4 deleted 1/1, success text 1/1, isError 0/1)
  [BUG] bulk delete that deleted nothing (0 of 2): MCP answered "deleted successfully" with isError unset (0 deleted 1/1, success text 1/1, isError 0/1)
  [note] deleteDocuments with neither id nor where: the error answer sets isError (1/1 error text, isError 1/1)

RESULT bulk-delete: BUG REPRODUCED (2/2 checks)
```

### Payload 4.0.0-beta.9 (`v4-beta/`): `repro-bulk-delete.mjs`, repeated (exit code 0)

```text
repro-bulk-delete: payload 4.0.0-beta.9, @payloadcms/plugin-mcp 4.0.0-beta.9, @payloadcms/db-sqlite 4.0.0-beta.9, next 16.4.2, Node.js v25.8.1
...
=== Summary over 5 repetition(s)
  controls (REST bulk DELETE, user A): 1 refused of 5 -> HTTP 400 5/5, 4 deleted 5/5; 2 refused of 2 -> HTTP 400 5/5, 0 deleted 5/5
  [BUG] partial bulk delete (4 of 5 deleted): MCP answered "deleted successfully" with isError unset (4 deleted 5/5, success text 5/5, isError 0/5)
  [BUG] bulk delete that deleted nothing (0 of 2): MCP answered "deleted successfully" with isError unset (0 deleted 5/5, success text 5/5, isError 0/5)
  [note] deleteDocuments with neither id nor where: the error answer sets isError (5/5 error text, isError 5/5)

RESULT bulk-delete: BUG REPRODUCED (2/2 checks)
```

### Payload 4.0.0-beta.9 (`v4-beta/`): `repro-bulk-update.mjs`, one repetition (exit code 1)

```text
repro-bulk-update: payload 4.0.0-beta.9, @payloadcms/plugin-mcp 4.0.0-beta.9, @payloadcms/db-sqlite 4.0.0-beta.9, next 16.4.2, Node.js v25.8.1
...
=== Summary over 1 repetition(s)
  control (REST bulk PATCH, user A): HTTP 400 1/1, 4 changed 1/1
  [ok ] partial bulk update (4 of 5 changed): MCP answered "Multiple documents updated" with isError unset (4 changed 1/1, success text 1/1, isError 1/1)

RESULT bulk-update: NOT REPRODUCED (0/1 checks; see the [ok ] lines)
```

### Payload 4.0.0-beta.9 (`v4-beta/`): `repro-bulk-update.mjs`, repeated (exit code 1)

```text
repro-bulk-update: payload 4.0.0-beta.9, @payloadcms/plugin-mcp 4.0.0-beta.9, @payloadcms/db-sqlite 4.0.0-beta.9, next 16.4.2, Node.js v25.8.1
...
=== Summary over 5 repetition(s)
  control (REST bulk PATCH, user A): HTTP 400 5/5, 4 changed 5/5
  [ok ] partial bulk update (4 of 5 changed): MCP answered "Multiple documents updated" with isError unset (4 changed 5/5, success text 5/5, isError 5/5)

RESULT bulk-update: NOT REPRODUCED (0/1 checks; see the [ok ] lines)
```
