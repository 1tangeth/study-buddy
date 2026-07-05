import { marked } from 'marked'
import markedKatex from 'marked-katex-extension'

marked.use(markedKatex({ throwOnError: false, nonStandard: true }))
marked.use({ breaks: true })

export { marked }
