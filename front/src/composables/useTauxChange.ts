import Swal from 'sweetalert2'
import { useQueryClient } from '@tanstack/vue-query'
import api from '@/stores/api'

/**
 * Modification du taux USD/FCFA, depuis le tableau de bord ou l'onglet Finances.
 * Propose de saisir un nouveau taux ou de revenir au taux de la convention de subvention (571).
 * Chaque changement est historisé et journalisé par le serveur ; les dépenses déjà saisies gardent leur taux.
 * Renvoie le message du serveur, ou null si l'utilisateur a abandonné.
 */
export function useTauxChange() {
  const queryClient = useQueryClient()

  async function modifierTaux(courant: number, convention: number): Promise<string | null> {
    const choix = await Swal.fire({
      title: 'Taux USD/FCFA',
      html: `<p style="font-size:13px">Taux en vigueur : <strong>1 USD = ${courant} FCFA</strong><br>Taux de la convention de subvention : ${convention} FCFA</p>`,
      input: 'number',
      inputValue: String(courant),
      inputAttributes: { min: '1', step: '0.01', 'aria-label': 'Nouveau taux en FCFA pour 1 USD' },
      inputValidator: (valeur: string) => (!(Number(valeur) > 0) ? 'Indiquez un taux positif.' : null),
      showCancelButton: true,
      showDenyButton: courant !== convention,
      confirmButtonText: 'Enregistrer',
      denyButtonText: `Revenir à ${convention} (convention)`,
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#1A5C38',
      denyButtonColor: '#2E7D4F',
      customClass: { popup: 'rounded-2xl font-body' },
    })
    if (choix.isDismissed) return null

    const taux = choix.isDenied ? convention : Number(choix.value)
    if (taux === courant) return null
    const { data } = await api.post('/api/admin/finances/taux', { tauxUsdFcfa: taux })
    queryClient.invalidateQueries({ queryKey: ['finances'] })
    return data.message
  }

  return { modifierTaux }
}
