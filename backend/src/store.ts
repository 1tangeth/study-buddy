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
const order: string[] = []

export function saveDoc(filename: string, text: string): string {
  const docId = crypto.randomUUID()
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
