import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// This is the frontend startup file.
// It finds <div id="root"></div> in index.html and renders the React App component inside it.
createRoot(document.getElementById('root')).render(<App />)
