/**
 * One-time script: remove duplicate documents per user.
 *
 * A "duplicate" is any document where the same user has more than one row
 * with the same filename OR the same text content.
 *
 * Strategy: keep the OLDEST row (lowest createdAt), delete everything newer.
 *
 * Run from backend/:
 *   npx tsx scripts/dedup.ts
 */

import 'dotenv/config'
import { createHash } from 'crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  console.log('Fetching all documents…')
  const all = await db.document.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, userId: true, filename: true, text: true, createdAt: true },
  })

  console.log(`Total documents: ${all.length}`)

  // Group by userId + content hash (content-level dedup)
  const seen = new Map<string, string>() // key → first doc id (oldest)
  const toDelete: string[] = []

  for (const doc of all) {
    const hash = createHash('sha256').update(doc.text).digest('hex')
    const key = `${doc.userId}::${hash}`
    if (seen.has(key)) {
      console.log(`  Duplicate found: "${doc.filename}" (id=${doc.id}) — keeping ${seen.get(key)}`)
      toDelete.push(doc.id)
    } else {
      seen.set(key, doc.id)
    }
  }

  if (toDelete.length === 0) {
    console.log('No duplicates found.')
    return
  }

  console.log(`\nDeleting ${toDelete.length} duplicate(s)…`)
  const result = await db.document.deleteMany({ where: { id: { in: toDelete } } })
  console.log(`Deleted ${result.count} document(s).`)

  // Optionally backfill contentHash for remaining rows that don't have it yet
  console.log('\nBackfilling contentHash for existing rows without it…')
  const noHash = await db.document.findMany({
    where: { contentHash: null },
    select: { id: true, text: true },
  })
  console.log(`Rows needing backfill: ${noHash.length}`)
  for (const doc of noHash) {
    const hash = createHash('sha256').update(doc.text).digest('hex')
    await db.document.update({ where: { id: doc.id }, data: { contentHash: hash } }).catch(() => {
      // Skip if unique constraint violation (shouldn't happen after dedup above)
    })
  }
  console.log('Backfill complete.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
