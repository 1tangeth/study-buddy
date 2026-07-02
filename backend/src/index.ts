import 'dotenv/config'
import { app } from './app'

const PORT = process.env.PORT ?? 8000
app.listen(PORT, () => console.log(`Study Buddy API → http://localhost:${PORT}`))
