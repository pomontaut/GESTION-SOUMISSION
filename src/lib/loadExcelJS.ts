// Chargement paresseux d'ExcelJS, résistant à un redéploiement : un onglet resté ouvert
// référence encore l'ancien fichier (nom haché) qui n'existe plus sur le serveur.
// On réessaie, puis on recharge la page une fois pour récupérer la nouvelle version.
export async function loadExcelJS() {
  for (let i = 0; i < 2; i++) {
    try {
      return (await import('exceljs')).default
    } catch {
      await new Promise((r) => setTimeout(r, 400))
    }
  }
  reloadOnceForNewVersion()
  throw new Error(
    'Une nouvelle version de l’application est disponible : la page se recharge. Relancez ensuite votre action.',
  )
}

export function reloadOnceForNewVersion() {
  try {
    const key = 'chunk-reload-at'
    const last = Number(sessionStorage.getItem(key) || 0)
    if (Date.now() - last > 30_000) {
      sessionStorage.setItem(key, String(Date.now()))
      window.location.reload()
    }
  } catch {
    window.location.reload()
  }
}
