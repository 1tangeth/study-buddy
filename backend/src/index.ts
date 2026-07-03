import 'dotenv/config' // loads enviornment from .env file so I can do process.env.PORT or process.env.OPENAI_API_KEY
import { app } from './app'

/**
 * This file is the backend startup file.
 *  It does not define the app’s routes itself. Its job is to load config, import the Express app, choose a port, and start the server.
 */
const PORT = process.env.PORT ?? 8000
app.listen(PORT, () => console.log(`Study Buddy API → http://localhost:${PORT}`)) // start backend server
