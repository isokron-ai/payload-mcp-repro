#!/usr/bin/env node
// Bulk update: the MCP update tool answers "Multiple documents updated" with isError unset when one of the matched
// documents was refused. REST answers 400 with an errors list for the same request. Both commit the other documents.
//
//   node scripts/repro-bulk-update.mjs            one repetition, every request and response printed
//   node scripts/repro-bulk-update.mjs --reps 5   five repetitions (the first printed in full, then counts)
//
// The posts collection refuses to change an archived post (a beforeChange hook throws).
//   1. 5 posts match the where, 1 is archived: MCP updatePosts {where, title}   4 changed, 1 refused
//      control: REST PATCH /api/posts?where=... on an identical set             400 with errors, same 4 changed
// Exit code: 0 bug reproduced, 1 not reproduced, 2 setup problem.
import { McpClient, always, check, createPost, login, preflight, rest, say, setQuiet, verdict, versions } from './lib.mjs'

const repsArg = process.argv.indexOf('--reps')
const REPS = repsArg > 0 ? Math.max(1, Number(process.argv[repsArg + 1]) || 1) : 1

await preflight()
always(`repro-bulk-update: ${await versions()}`)
const A = await login('A')
const mcp = await new McpClient('A').connect()
const U = mcp.v4 ? 'updateDocument' : 'updatePosts', D = mcp.v4 ? 'deleteDocuments' : 'deletePosts'
always(`MCP server: ${mcp.server?.name} ${mcp.server?.version ?? ''}, protocol ${mcp.protocol}; tools for user A's key: ${mcp.tools.join(', ')}`)
const stamp = Date.now().toString(36)

async function makeSet(batch) {
  const ids = []
  for (let i = 1; i <= 5; i++) {
    const archived = i === 5
    ids.push((await createPost(A.token, { title: `${batch} post ${i}${archived ? ' (archived)' : ''}`, batch, archived })).id)
  }
  say(`\n  created 5 posts with batch "${batch}" (ids ${ids.join(', ')}); the last one archived`)
}
async function changed(batch, title) {
  const r = await rest('GET', `/api/posts?where[batch][equals]=${encodeURIComponent(batch)}&where[title][equals]=${encodeURIComponent(title)}&depth=0&limit=100`, { token: A.token, quiet: true })
  return r.data.totalDocs
}

const n = { changed4: 0, success: 0, isError: 0, rest400: 0, restChanged4: 0 }
for (let rep = 1; rep <= REPS; rep++) {
  setQuiet(rep > 1)
  say(`\n=== 1. MCP bulk update, 5 matched, 1 archived (rep ${rep})`)
  let batch = `bulk-update-mcp-${stamp}-${rep}`
  await makeSet(batch)
  const u = await mcp.updatePost({ where: { batch: { equals: batch } }, data: { title: 'bulk edit' } })
  let c = await changed(batch, 'bulk edit')
  say(`  read back: ${c} of 5 posts now have the title "bulk edit"`)
  if (c === 4) n.changed4++
  if (/Multiple documents updated/i.test(u.text)) n.success++
  if (u.isError) n.isError++

  say(`\n=== 1c. Control: REST bulk PATCH with the same where, identical set (rep ${rep})`)
  batch = `bulk-update-rest-${stamp}-${rep}`
  await makeSet(batch)
  const r = await rest('PATCH', `/api/posts?where[batch][equals]=${encodeURIComponent(batch)}&depth=0`, { token: A.token, body: { title: 'bulk edit' } })
  c = await changed(batch, 'bulk edit')
  say(`  read back: ${c} of 5 posts now have the title "bulk edit"`)
  if (r.status === 400) n.rest400++
  if (c === 4) n.restChanged4++
}
setQuiet(false)

always(`\n=== Summary over ${REPS} repetition(s)`)
always(`  control (REST bulk PATCH, user A): HTTP 400 ${n.rest400}/${REPS}, 4 changed ${n.restChanged4}/${REPS}`)
if (n.rest400 !== REPS) {
  always('\nRESULT bulk-update: INCONCLUSIVE: the REST control did not answer 400. Check the setup.')
  process.exit(2)
}
const checks = []
check(checks, 'partial bulk update (4 of 5 changed): MCP answered "Multiple documents updated" with isError unset',
  n.changed4 === REPS && n.success === REPS && n.isError === 0,
  `4 changed ${n.changed4}/${REPS}, success text ${n.success}/${REPS}, isError ${n.isError}/${REPS}`)
verdict('bulk-update', checks)
