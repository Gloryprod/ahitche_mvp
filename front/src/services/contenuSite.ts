// Contenus du site publiés depuis l'admin (écran « Site public ») : GET /api/public/site, une seule fois par
// chargement de page, sans bloquer l'affichage. Délai maximal de 5 s ; en cas d'échec, le site garde les valeurs
// du code (config/contact.ts) et aucun bandeau ne s'affiche. Jamais appelé pendant le rendu de l'accueil au build.
import { shallowRef } from 'vue'
import { appliquerInfos } from '@/config/contact'
import { lireBandeau, type BandeauSite } from './valeursSite'

const API = import.meta.env.PROD ? 'https://api.ahitchebj.com' : ''
const DELAI_MAX_MS = 5000

// Bandeau d'annonce à afficher (le serveur a déjà vérifié qu'il est actif et dans ses dates), sinon null
export const bandeauSite = shallowRef<BandeauSite | null>(null)

let chargement: Promise<void> | null = null

export function chargerContenuSite(): Promise<void> {
  chargement ??= (async () => {
    const controleur = new AbortController()
    const minuterie = setTimeout(() => controleur.abort(), DELAI_MAX_MS)
    try {
      // Requête publique sans cookie (en-tête de cache du serveur : 60 s)
      const reponse = await fetch(`${API}/api/public/site`, { signal: controleur.signal, credentials: 'omit' })
      if (!reponse.ok) return
      const donnees: unknown = await reponse.json()
      if (typeof donnees !== 'object' || donnees === null) return
      const { infos, bandeau } = donnees as { infos?: unknown; bandeau?: unknown }
      if (infos) appliquerInfos(infos)
      bandeauSite.value = lireBandeau(bandeau)
    } catch {
      // Hors ligne, délai dépassé ou réponse illisible : les valeurs du code restent affichées
    } finally {
      clearTimeout(minuterie)
    }
  })()
  return chargement
}
