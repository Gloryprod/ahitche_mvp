import Swal from 'sweetalert2'
import api from '@/stores/api'
import { TRANSITIONS, ETAPE_SUIVANTE, type StatutCommande } from '@/config/commandes'

interface CommandeCiblee {
  id: string
  reference: string
  statut: StatutCommande
  modePaiement: string
}

const STYLE_SWAL = {
  confirmButtonColor: '#1A5C38',
  customClass: { popup: 'rounded-2xl font-body' }
}

/**
 * Changement de statut guidé, partagé par les écrans Commandes et Logistique.
 * Le passage en « Livrée » demande la référence Mobile Money, ou une note pour Espèces / Acompte.
 * Renvoie le message du serveur, ou null si l'utilisateur a abandonné.
 */
export function useChangementStatut() {
  async function changerVers(commande: CommandeCiblee, statut: StatutCommande): Promise<string | null> {
    const corps: Record<string, string> = { statut }

    if (statut === 'Livrée') {
      const mobileMoney = commande.modePaiement === 'Mobile Money'
      const paiement = await Swal.fire({
        ...STYLE_SWAL,
        title: 'Paiement reçu',
        text: mobileMoney ? 'Référence de la transaction Mobile Money' : `Paiement « ${commande.modePaiement} » : précisez le cas`,
        input: mobileMoney ? 'text' : 'textarea',
        inputPlaceholder: mobileMoney ? 'Ex : MP241005.1234.A12345' : 'Ex : réglé en espèces au livreur',
        inputValidator: (valeur: string) => (!valeur?.trim() ? 'Ce champ est obligatoire.' : null),
        showCancelButton: true,
        confirmButtonText: 'Marquer comme livrée',
        cancelButtonText: 'Annuler',
      })
      if (!paiement.isConfirmed) return null
      corps[mobileMoney ? 'referencePaiement' : 'notePaiement'] = paiement.value
    }

    if (statut === 'Échec' || statut === 'Annulée') {
      const confirmation = await Swal.fire({
        ...STYLE_SWAL,
        title: statut === 'Échec' ? `Livraison de ${commande.reference} échouée ?` : `Annuler ${commande.reference} ?`,
        text: statut === 'Échec' ? 'La commande reviendra dans « À planifier ».' : 'Cette action est définitive.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Oui',
        cancelButtonText: 'Non',
      })
      if (!confirmation.isConfirmed) return null
    }

    const response = await api.patch(`/api/admin/orders/${commande.id}/status`, corps)
    return response.data.message
  }

  // Choix libre parmi les passages autorisés (écran Commandes)
  async function choisirEtChanger(commande: CommandeCiblee): Promise<string | null> {
    const possibles = TRANSITIONS[commande.statut] || []
    const choix = await Swal.fire({
      ...STYLE_SWAL,
      title: `Commande ${commande.reference}`,
      text: `Statut actuel : ${commande.statut}`,
      input: 'select',
      inputOptions: Object.fromEntries(possibles.map(s => [s, s])),
      inputValue: ETAPE_SUIVANTE[commande.statut] ?? possibles[0],
      showCancelButton: true,
      confirmButtonText: 'Valider',
      cancelButtonText: 'Fermer',
    })
    if (!choix.isConfirmed) return null
    return changerVers(commande, choix.value as StatutCommande)
  }

  return { changerVers, choisirEtChanger }
}
