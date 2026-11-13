import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

// The one collection the reproduction needs.
// - Document locking is on (Payload's default for every collection).
// - `archived` posts are read-only: a hook refuses to change or delete them. This gives a realistic
//   per-document failure inside a bulk update or bulk delete. (`pnpm seed` passes context.reset to clear them.)
export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: { useAsTitle: 'title' },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'batch', type: 'text', admin: { description: 'Groups the posts a repro script creates' } },
    { name: 'archived', type: 'checkbox', defaultValue: false },
  ],
  hooks: {
    beforeChange: [
      ({ context, operation, originalDoc }) => {
        if (operation === 'update' && originalDoc?.archived && !context?.reset) {
          throw new APIError(`Post "${originalDoc.title}" is archived and cannot be changed`, 400)
        }
      },
    ],
    beforeDelete: [
      async ({ context, id, req }) => {
        if (context?.reset) return
        const doc = await req.payload.findByID({ collection: 'posts', id, depth: 0, req, overrideAccess: true })
        if (doc?.archived) {
          throw new APIError(`Post "${doc.title}" is archived and cannot be deleted`, 400)
        }
      },
    ],
  },
}
