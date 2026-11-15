// Contenus du site publiés depuis l'admin (écran « Site public ») : GET /api/public/site, une seule fois par
// chargement de page, sans bloquer l'affichage. Délai maximal de 5 s ; en cas d'échec, le site garde les valeurs
// du code (config/contact.ts, config/formules.ts) et aucun bandeau ne s'affiche. Jamais appelé pendant le rendu de
// l'accueil au build. Lot B : textes des cartes des formules et prix de vente de la base (null : prix du code).
// Lot C : questions fréquentes (visibles seulement) et actualités (liste vide : section masquée) ; null : celles du code.
// Lot D : photos de la frise (emplacement vide : photo du code) et témoignages (visibles seulement) ; null : ceux du code.
import { shallowRef } from 'vue'
import { appliquerInfos } from '@/config/contact'
import { appliquerFormules } from '@/config/formules'
import { appliquerFaq } from '@/config/faq'
import { appliquerActualites } from '@/config/actualites'
import { appliquerPhotos } from '@/config/photos'
import { appliquerTemoignages } from '@/config/temoignages'
import { lireBandeau, type BandeauSite } from './valeursSite'

const API = import.meta.env.PROD ? 'https://api.ahitchebj.com' : ''
const DELAI_MAX_MS = 5000

// Bandeau d'annonce à afficher (le serveur a déjà vérifié qu'il est actif et dans ses dates), sinon null
export const bandeauSite = shallowRef<BandeauSite | null>(null)

// Vrai dès que les valeurs publiées sont appliquées, ou que la demande a échoué ou dépassé 5 s. Les photos de la frise
// attendent ce signal pour recevoir leur adresse : chacune n'est téléchargée qu'une fois (publiée ou du code).
export const valeursSiteConnues = shallowRef(false)

let chargement: Promise<void> | null = null

export function chargerContenuSite(): Promise<void> {
  chargement ??= (async () => {
    const controleur = new AbortController()
    const minuterie = setTimeout(() => {
      controleur.abort()
      valeursSiteConnues.value = true
    }, DELAI_MAX_MS)
    try {
      // Requête publique sans cookie (en-tête de cache du serveur : 60 s)
      const reponse = await fetch(`${API}/api/public/site`, { signal: controleur.signal, credentials: 'omit' })
      if (!reponse.ok) return
      const donnees: unknown = await reponse.json()
      if (typeof donnees !== 'object' || donnees === null) return
      const { infos, bandeau, formules, prix, faq, actualites, photos, temoignages } = donnees as Record<string, unknown>
      if (infos) appliquerInfos(infos)
      if (formules || prix) appliquerFormules(formules, prix)
      if (faq) appliquerFaq(faq)
      if (actualites) appliquerActualites(actualites)
      if (photos) appliquerPhotos(photos)
      if (temoignages) appliquerTemoignages(temoignages)
      bandeauSite.value = lireBandeau(bandeau)
    } catch {
      // Hors ligne, délai dépassé ou réponse illisible : les valeurs du code restent affichées
    } finally {
      clearTimeout(minuterie)
      valeursSiteConnues.value = true
    }
  })()
  return chargement
}
