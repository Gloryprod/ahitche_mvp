import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import api from '@/stores/api'
import { useAuthStore } from '@/stores/auth'
import { peutLire } from '@/config/roles'
import type { CleCompteur } from '@/config/menuAdmin'

type Compteurs = Partial<Record<CleCompteur, number>>

/**
 * Pastilles du menu admin (commandes en attente, avis à valider), partagées par le menu et la barre du téléphone
 * (même clé : une seule requête). Rafraîchies toutes les 60 s, seulement quand l'onglet est visible
 * (TanStack Query suspend l'intervalle en arrière-plan). Une erreur n'affiche rien : pas de pastille.
 */
export function useCompteursAdmin() {
  const authStore = useAuthStore()
  const { data } = useQuery({
    queryKey: ['admin', 'compteurs'],
    queryFn: async (): Promise<Compteurs> => (await api.get('/api/admin/compteurs')).data ?? {},
    enabled: computed(() => peutLire(authStore.role.value, 'commandes') || peutLire(authStore.role.value, 'avis')),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
    retry: false,
  })

  // Nombre à afficher, ou null (clé absente, 0, valeur invalide ou erreur) : pas de pastille
  const compteur = (cle: CleCompteur | undefined): number | null => {
    if (!cle) return null
    const valeur = data.value?.[cle]
    return typeof valeur === 'number' && Number.isFinite(valeur) && valeur > 0 ? valeur : null
  }

  return { compteur }
}

// « 120 » -> « 99+ » : la pastille reste petite
export const texteCompteur = (nombre: number) => (nombre > 99 ? '99+' : String(nombre))
