import pdfParse from 'pdf-parse'

export async function extractText(filename: string, buffer: Buffer): Promise<string> {
  if (filename.toLowerCase().endsWith('.pdf')) {
    const data = await pdfParse(buffer)
    return data.text.trim()
  }
  return buffer.toString('utf-8').trim()
}
