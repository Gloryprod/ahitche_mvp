import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { useToast } from 'vue-toastification'
import Swal from 'sweetalert2'
import { useAuthStore } from '@/stores/auth'

/**
 * Déconnexion partagée par l'espace client et le back-office :
 * confirmation, fermeture de la session par le serveur, effacement des données en cache,
 * puis retour immédiat à l'accueil du site.
 */
export function useDeconnexion() {
  const router = useRouter()
  const authStore = useAuthStore()
  const queryClient = useQueryClient()
  const toast = useToast()
  const deconnexionEnCours = ref(false)

  async function seDeconnecter() {
    const confirmation = await Swal.fire({
      title: 'Se déconnecter ?',
      text: 'Vous allez quitter votre espace et revenir à l\'accueil du site.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#1A5C38',
      confirmButtonText: 'Oui, me déconnecter',
      cancelButtonText: 'Annuler',
      customClass: { popup: 'rounded-2xl font-body' }
    })
    if (!confirmation.isConfirmed) return

    deconnexionEnCours.value = true
    try {
      await authStore.logout()
    } catch {
      // Le serveur n'a pas confirmé la fermeture de la session (réseau lent ou coupé) :
      // on reste connecté plutôt que de laisser croire à une déconnexion sur un appareil partagé.
      toast.error('Déconnexion impossible : vérifiez votre connexion internet puis réessayez.')
      return
    } finally {
      deconnexionEnCours.value = false
    }

    // Aucune donnée de la session précédente ne doit rester visible pour la personne suivante
    queryClient.clear()

    // « replace » : le bouton retour du navigateur ne ramène pas vers l'espace protégé
    await router.replace('/')
    window.scrollTo(0, 0)
    toast.success('À bientôt ! Vous êtes déconnecté.')
  }

  return { seDeconnecter, deconnexionEnCours }
}
