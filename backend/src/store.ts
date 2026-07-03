export interface Doc {
  docId: string
  filename: string
  text: string
  charCount: number
  preview: string
  uploadedAt: number
}

const MAX_DOCS = 20
const store = new Map<string, Doc>()
// stores all the document ids
const order: string[] = []

/**
 * 
 * @param filename 
 * @param text 
 * @returns 
 */
export function saveDoc(filename: string, text: string): string {
  // create a number id for document
  const docId = crypto.randomUUID()
  // remove oldest doc if I now have more than maximum document allowed
  if (order.length >= MAX_DOCS) {
    const oldest = order.shift()!
    store.delete(oldest)
  }

  store.set(docId, {
    docId,
    filename,
    text,
    charCount: text.length,
    preview: text.slice(0, 300),
    uploadedAt: Date.now(),
  })
  order.push(docId)
  return docId
}

export function getDoc(docId: string): Doc | undefined {
  return store.get(docId)
}
