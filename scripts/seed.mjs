#!/usr/bin/env node
// pnpm seed
// 1. Writes .env (gitignored) with generated test values, if it does not exist yet:
//    PAYLOAD_SECRET, two users' passwords, and one MCP API key per user.
// 2. Runs scripts/seed-db.ts through `payload run`: wipes users, posts, MCP keys and locks, then creates
//    user A and user B and an MCP API key for each (3.x: a payload-mcp-api-keys document with posts find, create,
//    update, delete; 4.x: the user's own Payload API key).
// Safe to re-run. Re-running keeps .env, so a running `pnpm dev` keeps working.
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = process.cwd() // the app folder: the repo root, or v4-beta/
const envPath = join(root, '.env')
const rnd = (n) => randomBytes(n).toString('hex')

if (!existsSync(envPath)) {
  const example = readFileSync(join(root, '.env.example'), 'utf8')
  const values = {
    PAYLOAD_SECRET: rnd(24),
    USER_A_PASSWORD: rnd(12),
    USER_B_PASSWORD: rnd(12),
    USER_A_MCP_API_KEY: rnd(20),
    USER_B_MCP_API_KEY: rnd(20),
  }
  const out = example
    .split('\n')
    .map((line) => {
      const m = line.match(/^([A-Z0-9_]+)=/)
      return m && values[m[1]] ? `${m[1]}=${values[m[1]]}` : line
    })
    .join('\n')
  writeFileSync(envPath, out, { mode: 0o600 })
  console.log('wrote .env with generated test values (gitignored)')
} else {
  console.log('.env exists; keeping its values')
}

const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'payload.cmd' : 'payload')
const r = spawnSync(bin, ['run', 'scripts/seed-db.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: '--no-deprecation' },
  shell: process.platform === 'win32',
})
process.exit(r.status ?? 1)
