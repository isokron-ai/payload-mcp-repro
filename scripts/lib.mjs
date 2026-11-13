// Shared helpers for the repro scripts. Plain Node (18+), no dependencies.
// - reads .env (written by `pnpm seed`)
// - an MCP client that speaks JSON-RPC over Streamable HTTP (POST /api/mcp), the way an MCP client does
// - a REST client for the control calls
// - printing: every request and response is printed in full, with secrets masked
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// The app folder is the current directory: the repo root (Payload 3.93.0) or v4-beta/ (Payload 4.0.0-beta.9).
const root = process.cwd()

export function loadEnv() {
  const p = join(root, '.env')
  if (!existsSync(p)) {
    console.error('No .env found. Run `pnpm seed` first (it writes .env and creates the two users and their MCP keys).')
    process.exit(2)
  }
  const env = {}
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return { ...env, ...pick(process.env, ['BASE_URL']) }
}
const pick = (o, ks) => Object.fromEntries(ks.filter((k) => o[k]).map((k) => [k, o[k]]))

const env = loadEnv()
export const BASE_URL = (env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const SECRETS = ['USER_A_PASSWORD', 'USER_B_PASSWORD', 'USER_A_MCP_API_KEY', 'USER_B_MCP_API_KEY', 'PAYLOAD_SECRET']
  .map((k) => env[k])
  .filter((v) => v && v.length >= 8)
const tokens = []
export const mask = (s) => {
  let out = String(s)
  for (const v of [...SECRETS, ...tokens]) out = out.split(v).join('<redacted>')
  return out
}
let quiet = false
export const setQuiet = (q) => { quiet = q }
export const say = (s = '') => { if (!quiet) console.log(mask(s)) }
export const always = (s = '') => console.log(mask(s))
export const json = (v) => JSON.stringify(v, null, 2)

// ---------- REST ----------
export async function rest(method, path, { token, body, quiet } = {}) {
  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = `JWT ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(BASE_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  if (!quiet) {
    say(`  REST ${method} ${path}${token ? '   (Authorization: JWT <token>)' : ''}`)
    if (body !== undefined) say(`  request body: ${JSON.stringify(body)}`)
    say(`  -> HTTP ${res.status}`)
    say(`  response body: ${typeof data === 'string' ? data : JSON.stringify(data)}`)
  }
  return { status: res.status, data }
}

export async function login(who) {
  const email = env[`USER_${who}_EMAIL`], password = env[`USER_${who}_PASSWORD`]
  const r = await rest('POST', '/api/users/login', { body: { email, password }, quiet: true })
  if (r.status !== 200 || !r.data?.token) throw new Error(`login as user ${who} failed: HTTP ${r.status} ${JSON.stringify(r.data)}`)
  tokens.push(r.data.token)
  return { token: r.data.token, id: r.data.user.id, email }
}

// ---------- MCP (Streamable HTTP, JSON-RPC 2.0) ----------
export class McpClient {
  constructor(who) {
    this.who = who
    this.key = env[`USER_${who}_MCP_API_KEY`]
    // 3.x: a key from the plugin's payload-mcp-api-keys collection, sent as a Bearer token.
    // 4.x: the user's own Payload API key, sent as `users API-Key <key>`.
    this.authScheme = env.MCP_AUTH_SCHEME || 'Bearer'
    this.nextId = 1
    this.session = null
  }
  async post(msg) {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `${this.authScheme} ${this.key}`,
    }
    if (this.session) headers['mcp-session-id'] = this.session
    if (this.protocol) headers['mcp-protocol-version'] = this.protocol
    const res = await fetch(`${BASE_URL}/api/mcp`, { method: 'POST', headers, body: JSON.stringify(msg) })
    const sid = res.headers.get('mcp-session-id')
    if (sid) this.session = sid
    const text = await res.text()
    if (!('id' in msg)) return { status: res.status }
    // The answer is either plain JSON or one SSE "message" event carrying the JSON-RPC response.
    let body = null
    if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
      for (const line of text.split('\n')) if (line.startsWith('data:')) {
        try { const m = JSON.parse(line.slice(5)); if (m.id === msg.id) body = m } catch {}
      }
    } else {
      try { body = JSON.parse(text) } catch {}
    }
    if (!body) throw new Error(`MCP ${msg.method}: HTTP ${res.status}, unreadable answer: ${text.slice(0, 500)}`)
    return { status: res.status, body }
  }
  async request(method, params) {
    return this.post({ jsonrpc: '2.0', id: this.nextId++, method, params })
  }
  async connect() {
    const r = await this.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'payload-mcp-repro', version: '1.0.0' },
    })
    if (r.body.error) throw new Error(`MCP initialize failed: ${JSON.stringify(r.body.error)}`)
    this.protocol = r.body.result.protocolVersion
    this.server = r.body.result.serverInfo
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' })
    const t = await this.request('tools/list', {})
    this.tools = (t.body.result?.tools ?? []).map((x) => x.name)
    this.v4 = this.tools.includes('updateDocument')
    return this
  }
  // The same operation on posts in either tool shape:
  //   3.x: updatePosts {id | where: "<JSON string>", <fields>..., overrideLock}; deletePosts {id | where: "<JSON string>"}
  //   4.x: updateDocument {slug, id | where: {object}, data: {fields}, overrideLock}; deleteDocuments {slug, id | where}
  updatePost({ id, where, data, ...rest }) {
    if (this.v4) return this.call('updateDocument', { slug: 'posts', ...(id !== undefined && { id }), ...(where && { where }), data, ...rest })
    return this.call('updatePosts', { ...(id !== undefined && { id }), ...(where && { where: JSON.stringify(where) }), ...data, ...rest })
  }
  deletePost({ id, where } = {}) {
    if (this.v4) return this.call('deleteDocuments', { slug: 'posts', ...(id !== undefined && { id }), ...(where && { where }) })
    return this.call('deletePosts', { ...(id !== undefined && { id }), ...(where && { where: JSON.stringify(where) }) })
  }
  // Prints the exact JSON-RPC request and the tool result, and returns { isError, text, result }.
  async call(name, args) {
    const msg = { jsonrpc: '2.0', id: this.nextId++, method: 'tools/call', params: { name, arguments: args } }
    say(`  MCP POST /api/mcp   (Authorization: ${this.authScheme} <user ${this.who} API key>)`)
    say(`  request: ${JSON.stringify(msg)}`)
    const r = await this.post(msg)
    if (r.body.error) {
      say(`  -> HTTP ${r.status}, JSON-RPC error: ${JSON.stringify(r.body.error)}`)
      return { isError: true, rpcError: r.body.error, text: '' }
    }
    const result = r.body.result
    const text = (result.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n')
    say(`  -> HTTP ${r.status}, result.isError: ${result.isError === undefined ? 'unset' : result.isError}`)
    say(`  result.content[0].text:`)
    say(text.split('\n').map((l) => '    | ' + l).join('\n'))
    return { isError: result.isError === true, text, result }
  }
}

// ---------- fixtures (through REST, as user A) ----------
export async function createPost(token, data) {
  const r = await rest('POST', '/api/posts', { token, body: data, quiet: true })
  if (r.status !== 201) throw new Error(`create post failed: HTTP ${r.status} ${JSON.stringify(r.data)}`)
  return r.data.doc
}
export async function getPost(token, id) {
  const r = await rest('GET', `/api/posts/${id}?depth=0`, { token, quiet: true })
  return r.status === 200 ? r.data : null
}
export async function locksOn(token, id) {
  const q = `where[document.relationTo][equals]=posts&where[document.value][equals]=${id}&depth=0&limit=10`
  const r = await rest('GET', `/api/payload-locked-documents?${q}`, { token, quiet: true })
  return r.data?.docs ?? []
}
// Hold a document lock as a user: the same payload-locked-documents row the admin panel writes when that user
// opens the document for editing (fresh updatedAt, so it is inside the default 300 s lock duration).
export async function holdLock(as, id) {
  const r = await rest('POST', '/api/payload-locked-documents', {
    token: as.token,
    body: { document: { relationTo: 'posts', value: id }, user: { relationTo: 'users', value: as.id } },
    quiet: true,
  })
  if (r.status !== 201) throw new Error(`could not create the lock: HTTP ${r.status} ${JSON.stringify(r.data)}`)
  return r.data.doc
}
export async function releaseLocks(token, id) {
  for (const l of await locksOn(token, id)) await rest('DELETE', `/api/payload-locked-documents/${l.id}`, { token, quiet: true })
}

export async function preflight() {
  try {
    const r = await fetch(`${BASE_URL}/api/users/me`)
    if (!r.ok && r.status !== 401) throw new Error(`HTTP ${r.status}`)
  } catch (e) {
    console.error(`The app is not answering at ${BASE_URL} (${e.message}). Start it with \`pnpm dev\` (after \`pnpm seed\`).`)
    process.exit(2)
  }
}

export async function versions() {
  const read = (p) => { try { return JSON.parse(readFileSync(join(root, 'node_modules', p, 'package.json'), 'utf8')).version } catch { return '?' } }
  return `payload ${read('payload')}, @payloadcms/plugin-mcp ${read('@payloadcms/plugin-mcp')}, @payloadcms/db-sqlite ${read('@payloadcms/db-sqlite')}, next ${read('next')}, Node.js ${process.version}`
}

// ---------- verdict ----------
export function check(list, label, ok, detail) {
  list.push({ label, ok })
  always(`  [${ok ? 'BUG' : 'ok '}] ${label}${detail ? ` (${detail})` : ''}`)
}
export function verdict(name, list) {
  const n = list.filter((c) => c.ok).length
  always('')
  if (n === list.length) {
    always(`RESULT ${name}: BUG REPRODUCED (${n}/${list.length} checks)`)
    process.exitCode = 0
  } else if (n === 0) {
    always(`RESULT ${name}: NOT REPRODUCED (0/${list.length} checks; see the [ok ] lines)`)
    process.exitCode = 1
  } else {
    always(`RESULT ${name}: PARTLY REPRODUCED (${n}/${list.length} checks; see the [ok ] lines)`)
    process.exitCode = 1
  }
}
