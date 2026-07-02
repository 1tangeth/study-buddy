export async function uploadFile(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/upload', { method: 'POST', body: form })
  const body = await res.json()
  if (!res.ok) throw new Error(body.detail || 'Upload failed')
  return body
}
