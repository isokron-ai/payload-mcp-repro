import type { CollectionConfig } from 'payload'

// Two users, A and B (created by `pnpm seed`). Every user can do everything in this app.
export const Users: CollectionConfig = {
  slug: 'users',
  admin: { useAsTitle: 'email' },
  auth: true,
  fields: [{ name: 'name', type: 'text' }],
}
