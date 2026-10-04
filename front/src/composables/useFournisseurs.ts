import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import api from '@/stores/api'
import type { Prestataire } from '@/type'

// Liste des fournisseurs actifs (section Prestataires), pour les entrées de stock et les bons de commande
export function useFournisseurs() {
  const { data, isLoading } = useQuery({
    queryKey: ['prestataires', 'fournisseurs-actifs'],
    queryFn: async (): Promise<Prestataire[]> => {
      const response = await api.get('/api/admin/prestataires', { params: { type: 'Fournisseur', actif: 'true', limit: 200 } })
      return response.data.prestataires
    },
    staleTime: 60_000,
  })

  return { fournisseurs: computed(() => data.value ?? []), chargementFournisseurs: isLoading }
}
