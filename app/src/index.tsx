// Entry point for the React app.
// This file mounts the top-level <App /> component into the HTML div#root.

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// document.getElementById('root') can technically return null,
// so we use the non-null assertion operator (!) to tell TypeScript
// we are sure it exists (it is in index.html).
const rootElement = document.getElementById('root')!

ReactDOM.createRoot(rootElement).render(
  // StrictMode renders components twice in development to help catch bugs.
  // It has no effect in production.
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
