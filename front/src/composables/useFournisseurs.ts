import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import api from '@/stores/api'
import type { Prestataire } from '@/type'
import { useAuthStore } from '@/stores/auth'
import { peutLire } from '@/config/roles'

// Liste des fournisseurs actifs (section Prestataires), pour les entrées de stock et les bons de commande
export function useFournisseurs() {
  const authStore = useAuthStore()
  const { data, isLoading } = useQuery({
    queryKey: ['prestataires', 'fournisseurs-actifs'],
    queryFn: async (): Promise<Prestataire[]> => {
      const response = await api.get('/api/admin/prestataires', { params: { type: 'Fournisseur', actif: 'true', limit: 200 } })
      return response.data.prestataires
    },
    staleTime: 60_000,
    enabled: computed(() => peutLire(authStore.role.value, 'prestataires')), // L'auditeur n'a pas accès aux prestataires
  })

  return { fournisseurs: computed(() => data.value ?? []), chargementFournisseurs: isLoading }
}
