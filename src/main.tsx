import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { reloadOnceForNewVersion } from './lib/loadExcelJS'

// Fichier haché introuvable après un redéploiement : recharger pour obtenir la nouvelle version.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  reloadOnceForNewVersion()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
