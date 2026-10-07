import { watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { useToast } from 'vue-toastification'
import { useAuthStore } from '@/stores/auth'
import api from '@/stores/api'

// Gestes qui comptent comme une activité ; la frappe et le défilement aussi dans les zones défilantes (capture)
const EVENEMENTS_ACTIVITE = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
// Dernière activité partagée entre les onglets : travailler dans un onglet garde les autres connectés
const CLE_ACTIVITE = 'ahitche:derniere-activite'

/**
 * Déconnexion automatique des comptes de l'équipe (sauf l'admin principal) après une période sans activité,
 * utile sur les appareils partagés. La durée vient du serveur (authStore.inactivite, en minutes).
 * - Avertissement quelques minutes avant (2 au plus) : un geste suffit pour rester connecté.
 * - Pendant l'activité, une requête régulière prolonge la session côté serveur (jeton glissant, voir
 *   back/src/services/sessionService.js) : lire une longue page sans cliquer ne déconnecte pas.
 * - À l'échéance : fermeture de la session, cache vidé ; une page protégée renvoie vers la connexion.
 * À appeler une seule fois, dans App.vue.
 */
export function useDeconnexionInactivite() {
  const authStore = useAuthStore()
  const router = useRouter()
  const queryClient = useQueryClient()
  const toast = useToast()

  let derniereActivite = 0
  let dernierProlongement = 0
  let minuteur: number | undefined
  let avertissement: ReturnType<typeof toast.warning> | null = null
  let deconnexionEnCours = false

  const limiteMs = () => (authStore.inactivite.value ?? 0) * 60_000

  function partagerActivite(instant: number) {
    try { localStorage.setItem(CLE_ACTIVITE, String(instant)) } catch { /* stockage indisponible : suivi par onglet */ }
  }

  function activitePartagee() {
    try { return Number(localStorage.getItem(CLE_ACTIVITE)) || 0 } catch { return 0 }
  }

  // Prolonge la session côté serveur (jeton glissant) ; un 401 est géré par l'intercepteur de l'API
  function prolongerSession() {
    dernierProlongement = Date.now()
    api.get('/api/auth/me').catch(() => { /* 401 : retour à la connexion par l'intercepteur */ })
  }

  function noterActivite() {
    const maintenant = Date.now()
    if (maintenant - derniereActivite < 2_000) return // Le défilement et la souris envoient des rafales d'événements
    derniereActivite = maintenant
    partagerActivite(maintenant)
    retirerAvertissement()
    // Pendant l'activité, la session serveur est prolongée régulièrement, et tout de suite à la reprise
    // après une pause : lire une longue page sans requête ne laisse pas expirer le jeton
    if (maintenant - dernierProlongement >= Math.min(10 * 60_000, limiteMs() / 3)) prolongerSession()
  }

  function afficherAvertissement(msRestantes: number) {
    const minutes = Math.max(1, Math.ceil(msRestantes / 60_000))
    const content = `Sans activité, vous serez déconnecté dans ${minutes} minute${minutes > 1 ? 's' : ''}. Touchez l'écran ou bougez la souris pour rester connecté.`
    if (avertissement === null) avertissement = toast.warning(content, { timeout: false })
    else toast.update(avertissement, { content })
  }

  function retirerAvertissement() {
    if (avertissement === null) return
    toast.dismiss(avertissement)
    avertissement = null
  }

  async function deconnecter() {
    deconnexionEnCours = true
    retirerAvertissement()
    const page = router.currentRoute.value
    try {
      await authStore.logout()
    } catch {
      // Réseau indisponible : la session est oubliée ici ; côté serveur, le jeton expire de lui-même
      authStore.effacerSessionLocale()
    }
    // Aucune donnée de la session ne doit rester visible pour la personne suivante
    queryClient.clear()
    if (page.meta.requiresAuth) {
      await router.replace({ path: '/login', query: { redirect: page.fullPath, session: 'inactivite' } })
    } else {
      toast.info("Par sécurité, vous avez été déconnecté après une période d'inactivité.", { timeout: false })
    }
    deconnexionEnCours = false
  }

  function verifier() {
    const limite = limiteMs()
    if (!limite || deconnexionEnCours) return
    const derniere = Math.max(derniereActivite, activitePartagee())
    const inactif = Date.now() - derniere
    if (inactif >= limite) {
      deconnecter()
      return
    }

    const preavis = Math.min(2 * 60_000, limite / 4)
    if (inactif >= limite - preavis) afficherAvertissement(limite - inactif)
    else retirerAvertissement() // Activité dans un autre onglet
  }

  // Retour sur l'onglet (téléphone déverrouillé, ordinateur réveillé) : vérification immédiate
  function surVisibilite() {
    if (document.visibilityState === 'visible') verifier()
  }

  function demarrer(minutes: number) {
    derniereActivite = dernierProlongement = Date.now() // Connexion ou chargement de la page : activité
    partagerActivite(derniereActivite)
    minuteur = window.setInterval(verifier, Math.min(30_000, (minutes * 60_000) / 6))
    for (const evenement of EVENEMENTS_ACTIVITE) {
      window.addEventListener(evenement, noterActivite, { capture: true, passive: true })
    }
    document.addEventListener('visibilitychange', surVisibilite)
  }

  function arreter() {
    if (minuteur === undefined) return
    window.clearInterval(minuteur)
    minuteur = undefined
    for (const evenement of EVENEMENTS_ACTIVITE) {
      window.removeEventListener(evenement, noterActivite, { capture: true })
    }
    document.removeEventListener('visibilitychange', surVisibilite)
    retirerAvertissement()
  }

  // Démarre quand la session connue impose une limite (connexion, rechargement), s'arrête à la déconnexion
  watch(() => authStore.inactivite.value, minutes => {
    arreter()
    if (minutes) demarrer(minutes)
  }, { immediate: true })

  onUnmounted(arreter)
}
