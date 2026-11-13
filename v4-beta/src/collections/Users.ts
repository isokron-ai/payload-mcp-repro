import type { CollectionConfig } from 'payload'

// Two users, A and B (created by `pnpm seed`). Every user can do everything in this app.
// In 4.x the MCP endpoint authenticates with Payload's own auth, so the users carry API keys.
export const Users: CollectionConfig = {
  slug: 'users',
  admin: { useAsTitle: 'email' },
  auth: { useAPIKey: true },
  fields: [{ name: 'name', type: 'text' }],
  versions: false,
}
