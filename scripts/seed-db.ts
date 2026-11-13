// Run by `pnpm seed` (through `payload run`). Uses the Local API; no server needed.
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../src/payload.config'

const need = (k: string): string => {
  const v = process.env[k]
  if (!v) throw new Error(`${k} is missing from .env (run pnpm seed, which writes it)`)
  return v
}

const payload = await getPayload({ config })

for (const collection of ['payload-locked-documents', 'payload-mcp-api-keys', 'posts', 'users'] as const) {
  await payload.delete({ collection, where: { id: { exists: true } }, overrideAccess: true, context: { reset: true } })
}

const users = [
  { key: 'A', email: need('USER_A_EMAIL'), password: need('USER_A_PASSWORD'), apiKey: need('USER_A_MCP_API_KEY') },
  { key: 'B', email: need('USER_B_EMAIL'), password: need('USER_B_PASSWORD'), apiKey: need('USER_B_MCP_API_KEY') },
]

for (const u of users) {
  const user = await payload.create({
    collection: 'users',
    data: { email: u.email, password: u.password, name: `User ${u.key}` },
    overrideAccess: true,
  })
  await payload.create({
    collection: 'payload-mcp-api-keys',
    data: {
      user: user.id,
      label: `User ${u.key} MCP key`,
      description: 'Created by pnpm seed for the reproduction scripts',
      enableAPIKey: true,
      apiKey: u.apiKey,
      posts: { find: true, create: true, update: true, delete: true },
    } as any,
    overrideAccess: true,
  })
  payload.logger.info(`seeded user ${u.key} (${u.email}, id ${user.id}) with an MCP API key`)
}

payload.logger.info('seed done')
process.exit(0)
