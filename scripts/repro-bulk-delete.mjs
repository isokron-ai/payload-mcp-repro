#!/usr/bin/env node
// Bulk delete: the MCP delete tool answers "Document deleted successfully" with isError unset when some or all of
// the matched documents were not deleted. REST answers 400 with an errors list for the same request.
//
//   node scripts/repro-bulk-delete.mjs            one repetition of each case, every request and response printed
//   node scripts/repro-bulk-delete.mjs --reps 5   five repetitions (the first printed in full, then counts)
//
// The posts collection refuses to delete an archived post (a beforeDelete hook throws), which is an ordinary
// per-document failure inside a bulk delete.
//   1. 5 posts match the where, 1 is archived: MCP deletePosts {where}     4 deleted, 1 refused
//      control: REST DELETE /api/posts?where=... on an identical set       400 with errors, same 4 deleted
//   2. 2 posts match the where, both archived: MCP deletePosts {where}     nothing deleted
//      control: REST DELETE on an identical set                            400 with errors, nothing deleted
//   3. MCP deletePosts with neither id nor where                           the error answer (a note, not in the verdict)
// Exit code: 0 bug reproduced, 1 not reproduced (or only partly), 2 setup problem.
import { McpClient, always, check, createPost, login, preflight, rest, say, setQuiet, verdict, versions } from './lib.mjs'

const repsArg = process.argv.indexOf('--reps')
const REPS = repsArg > 0 ? Math.max(1, Number(process.argv[repsArg + 1]) || 1) : 1

await preflight()
always(`repro-bulk-delete: ${await versions()}`)
const A = await login('A')
const mcp = await new McpClient('A').connect()
const U = mcp.v4 ? 'updateDocument' : 'updatePosts', D = mcp.v4 ? 'deleteDocuments' : 'deletePosts'
always(`MCP server: ${mcp.server?.name} ${mcp.server?.version ?? ''}, protocol ${mcp.protocol}; tools for user A's key: ${mcp.tools.join(', ')}`)
const stamp = Date.now().toString(36)

async function makeSet(batch, total, archivedCount) {
  const ids = []
  for (let i = 1; i <= total; i++) {
    const archived = i > total - archivedCount
    ids.push((await createPost(A.token, { title: `${batch} post ${i}${archived ? ' (archived)' : ''}`, batch, archived })).id)
  }
  say(`\n  created ${total} posts with batch "${batch}" (ids ${ids.join(', ')}); ${archivedCount} archived`)
  return ids
}
async function remaining(batch) {
  const r = await rest('GET', `/api/posts?where[batch][equals]=${encodeURIComponent(batch)}&depth=0&limit=100`, { token: A.token, quiet: true })
  return r.data.totalDocs
}
const whereFor = (batch) => ({ batch: { equals: batch } })
const restWhere = (batch) => `/api/posts?where[batch][equals]=${encodeURIComponent(batch)}&depth=0`

const n = {
  partial: { deleted4: 0, success: 0, isError: 0, rest400: 0, restDeleted4: 0 },
  none: { deleted0: 0, success: 0, isError: 0, rest400: 0, restDeleted0: 0 },
  noArgs: { errorText: 0, isError: 0 },
}

for (let rep = 1; rep <= REPS; rep++) {
  setQuiet(rep > 1)
  say(`\n=== 1. MCP bulk delete, 5 matched, 1 archived (rep ${rep})`)
  let batch = `bulk-delete-partial-mcp-${stamp}-${rep}`
  await makeSet(batch, 5, 1)
  const d1 = await mcp.deletePost({ where: whereFor(batch) })
  let left = await remaining(batch)
  say(`  read back: ${left} of 5 posts with this batch remain`)
  if (left === 1) n.partial.deleted4++
  if (/deleted successfully/i.test(d1.text)) n.partial.success++
  if (d1.isError) n.partial.isError++

  say(`\n=== 1c. Control: REST bulk DELETE with the same where, identical set (rep ${rep})`)
  batch = `bulk-delete-partial-rest-${stamp}-${rep}`
  await makeSet(batch, 5, 1)
  const r1 = await rest('DELETE', restWhere(batch), { token: A.token })
  left = await remaining(batch)
  say(`  read back: ${left} of 5 posts with this batch remain`)
  if (r1.status === 400) n.partial.rest400++
  if (left === 1) n.partial.restDeleted4++

  say(`\n=== 2. MCP bulk delete, 2 matched, both archived: nothing can be deleted (rep ${rep})`)
  batch = `bulk-delete-none-mcp-${stamp}-${rep}`
  await makeSet(batch, 2, 2)
  const d2 = await mcp.deletePost({ where: whereFor(batch) })
  left = await remaining(batch)
  say(`  read back: ${left} of 2 posts with this batch remain`)
  if (left === 2) n.none.deleted0++
  if (/deleted successfully/i.test(d2.text)) n.none.success++
  if (d2.isError) n.none.isError++

  say(`\n=== 2c. Control: REST bulk DELETE with the same where, identical set (rep ${rep})`)
  batch = `bulk-delete-none-rest-${stamp}-${rep}`
  await makeSet(batch, 2, 2)
  const r2 = await rest('DELETE', restWhere(batch), { token: A.token })
  left = await remaining(batch)
  say(`  read back: ${left} of 2 posts with this batch remain`)
  if (r2.status === 400) n.none.rest400++
  if (left === 2) n.none.restDeleted0++

  say(`\n=== 3. MCP ${D} with neither id nor where (rep ${rep})`)
  const d3 = await mcp.deletePost({})
  if (/must be provided/i.test(d3.text)) n.noArgs.errorText++
  if (d3.isError) n.noArgs.isError++
}
setQuiet(false)

always(`\n=== Summary over ${REPS} repetition(s)`)
always(`  controls (REST bulk DELETE, user A): 1 refused of 5 -> HTTP 400 ${n.partial.rest400}/${REPS}, 4 deleted ${n.partial.restDeleted4}/${REPS}; 2 refused of 2 -> HTTP 400 ${n.none.rest400}/${REPS}, 0 deleted ${n.none.restDeleted0}/${REPS}`)
if (n.partial.rest400 !== REPS || n.none.rest400 !== REPS || n.partial.deleted4 + n.partial.restDeleted4 === 0) {
  always('\nRESULT bulk-delete: INCONCLUSIVE: the REST control did not answer 400, or the archived post was deleted. Check the setup.')
  process.exit(2)
}
const checks = []
check(checks, 'partial bulk delete (4 of 5 deleted): MCP answered "deleted successfully" with isError unset',
  n.partial.deleted4 === REPS && n.partial.success === REPS && n.partial.isError === 0,
  `4 deleted ${n.partial.deleted4}/${REPS}, success text ${n.partial.success}/${REPS}, isError ${n.partial.isError}/${REPS}`)
check(checks, 'bulk delete that deleted nothing (0 of 2): MCP answered "deleted successfully" with isError unset',
  n.none.deleted0 === REPS && n.none.success === REPS && n.none.isError === 0,
  `0 deleted ${n.none.deleted0}/${REPS}, success text ${n.none.success}/${REPS}, isError ${n.none.isError}/${REPS}`)
always(`  [note] ${D} with neither id nor where: ${n.noArgs.isError === 0 ? 'the error answer has isError unset' : 'the error answer sets isError'} (${n.noArgs.errorText}/${REPS} error text, isError ${n.noArgs.isError}/${REPS})`)
verdict('bulk-delete', checks)
