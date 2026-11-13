#!/usr/bin/env node
// Document locks: the MCP update and delete tools write through a lock that REST respects.
//
//   node scripts/repro-locks.mjs            one repetition of each case, every request and response printed
//   node scripts/repro-locks.mjs --reps 10  ten repetitions (the first printed in full, then counts)
//
// Setup per case: user A creates a fresh post through REST. User B then holds the document lock on it (the
// payload-locked-documents row the admin panel writes when B opens the post for editing).
//   1. MCP updatePosts {id, title} as user A (default arguments)       expected like REST: refused; actual: written
//   2. REST PATCH /api/posts/:id as user A (control)                  423 "locked"
//   3. MCP updatePosts {id, title, overrideLock: false} as user A     refused (shows the lock is in force)
//   4. MCP deletePosts {id} as user A                                  expected like REST: refused; actual: deleted
//   5. REST DELETE /api/posts/:id as user A (control)                 423 "locked"
// Exit code: 0 bug reproduced, 1 not reproduced (or only partly), 2 setup problem.
import {
  McpClient, check, createPost, getPost, holdLock, locksOn, login, preflight, releaseLocks, rest, say,
  always, setQuiet, verdict, versions,
} from './lib.mjs'

const repsArg = process.argv.indexOf('--reps')
const REPS = repsArg > 0 ? Math.max(1, Number(process.argv[repsArg + 1]) || 1) : 1

await preflight()
always(`repro-locks: ${await versions()}`)
const A = await login('A')
const B = await login('B')
const mcp = await new McpClient('A').connect()
const U = mcp.v4 ? 'updateDocument' : 'updatePosts', D = mcp.v4 ? 'deleteDocuments' : 'deletePosts'
always(`MCP server: ${mcp.server?.name} ${mcp.server?.version ?? ''}, protocol ${mcp.protocol}; tools for user A's key: ${mcp.tools.join(', ')}`)
const batch = `locks-${Date.now().toString(36)}`
const created = []

async function lockedPost(label) {
  const post = await createPost(A.token, { title: `original title (${label})`, batch })
  created.push(post.id)
  const lock = await holdLock(B, post.id)
  say(`\n  post ${post.id} created by user A; user B now holds its lock: ${JSON.stringify({ id: lock.id, document: lock.document, user: lock.user?.value?.email ?? lock.user, updatedAt: lock.updatedAt })}`)
  return post
}

const n = { upd: { written: 0, lockGone: 0, success: 0, isError: 0 }, rest423: 0, restKept: 0, optRefused: 0, optIsError: 0,
  del: { deleted: 0, success: 0, isError: 0 }, restDel423: 0, restDelKept: 0 }

for (let rep = 1; rep <= REPS; rep++) {
  setQuiet(rep > 1)
  say(`\n=== 1. MCP ${U} while user B holds the lock (rep ${rep})`)
  let p = await lockedPost('mcp update')
  const u = await mcp.updatePost({ id: p.id, data: { title: `changed through MCP ${rep}` } })
  let after = await getPost(A.token, p.id)
  let locks = await locksOn(A.token, p.id)
  say(`  read back: title ${JSON.stringify(after?.title)}; lock rows on the post: ${locks.length}`)
  if (after?.title === `changed through MCP ${rep}`) n.upd.written++
  if (locks.length === 0) n.upd.lockGone++
  if (/updated successfully/i.test(u.text)) n.upd.success++
  if (u.isError) n.upd.isError++

  say(`\n=== 2. Control: REST PATCH by the same user under the same kind of lock (rep ${rep})`)
  p = await lockedPost('rest update')
  const r = await rest('PATCH', `/api/posts/${p.id}`, { token: A.token, body: { title: `changed through REST ${rep}` } })
  after = await getPost(A.token, p.id)
  locks = await locksOn(A.token, p.id)
  say(`  read back: title ${JSON.stringify(after?.title)}; lock rows on the post: ${locks.length}`)
  if (r.status === 423) n.rest423++
  if (after?.title === p.title && locks.length === 1) n.restKept++
  await releaseLocks(A.token, p.id)

  say(`\n=== 3. MCP ${U} with overrideLock: false (rep ${rep})`)
  p = await lockedPost('mcp opt-out')
  const o = await mcp.updatePost({ id: p.id, data: { title: `opt-out ${rep}` }, overrideLock: false })
  after = await getPost(A.token, p.id)
  say(`  read back: title ${JSON.stringify(after?.title)}`)
  if (after?.title === p.title && /locked/i.test(o.text)) n.optRefused++
  if (o.isError) n.optIsError++
  await releaseLocks(A.token, p.id)

  say(`\n=== 4. MCP ${D} while user B holds the lock (rep ${rep})`)
  p = await lockedPost('mcp delete')
  const d = await mcp.deletePost({ id: p.id })
  after = await getPost(A.token, p.id)
  say(`  read back: post ${p.id} ${after ? 'still exists' : 'no longer exists'}`)
  if (!after) n.del.deleted++
  if (/deleted successfully/i.test(d.text)) n.del.success++
  if (d.isError) n.del.isError++
  await releaseLocks(A.token, p.id)

  say(`\n=== 5. Control: REST DELETE by the same user under the same kind of lock (rep ${rep})`)
  p = await lockedPost('rest delete')
  const rd = await rest('DELETE', `/api/posts/${p.id}`, { token: A.token })
  after = await getPost(A.token, p.id)
  say(`  read back: post ${p.id} ${after ? 'still exists' : 'no longer exists'}`)
  if (rd.status === 423) n.restDel423++
  if (after) n.restDelKept++
  await releaseLocks(A.token, p.id)
}
setQuiet(false)

always(`\n=== Summary over ${REPS} repetition(s) (user B held the lock every time)`)
always(`  controls (REST, user A): PATCH 423 ${n.rest423}/${REPS}, post and lock kept ${n.restKept}/${REPS}; DELETE 423 ${n.restDel423}/${REPS}, post kept ${n.restDelKept}/${REPS}`)
if (n.rest423 !== REPS || n.restDel423 !== REPS) {
  always('\nRESULT locks: INCONCLUSIVE: the REST control was not refused with 423, so the lock was not in force. Check the setup.')
  process.exit(2)
}
always(`  opt-out (MCP ${U} overrideLock:false): refused ${n.optRefused}/${REPS}, isError set ${n.optIsError}/${REPS}`)
const checks = []
check(checks, `MCP ${U} wrote through user B's lock`, n.upd.written === REPS, `${n.upd.written}/${REPS}`)
check(checks, `MCP ${U} deleted user B's lock row`, n.upd.lockGone === REPS, `${n.upd.lockGone}/${REPS}`)
check(checks, `MCP ${U} answered "updated successfully" with isError unset`, n.upd.success === REPS && n.upd.isError === 0, `success ${n.upd.success}/${REPS}, isError ${n.upd.isError}/${REPS}`)
check(checks, `MCP ${D} deleted the post user B had locked`, n.del.deleted === REPS, `${n.del.deleted}/${REPS}`)
check(checks, `MCP ${D} answered "deleted successfully" with isError unset`, n.del.success === REPS && n.del.isError === 0, `success ${n.del.success}/${REPS}, isError ${n.del.isError}/${REPS}`)
always(`  [note] the overrideLock:false refusal ${n.optIsError === 0 ? 'came back as plain text with isError unset' : `set isError (${n.optIsError}/${REPS})`}`)
verdict('locks', checks)
