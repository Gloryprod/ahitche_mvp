import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import api from '@/stores/api'
import { estOuvert, nomPack, type Pack } from '@/services/packs'

// Liste des packs (collection Formules, ordre de l'admin), pour toute l'équipe : colonnes de quantités, écran Formules,
// simulateurs, prévision d'achats, idées de repas, import du référentiel. Invalider ['packs'] après une création.
export function usePacks() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['packs'],
    queryFn: async (): Promise<Pack[]> => (await api.get<Pack[]>('/api/admin/packs')).data.map(p => ({ ...p, nom: nomPack(p.nom) })),
    staleTime: 5 * 60_000, // Change rarement (création d'un pack par l'admin)
  })
  const packs = computed(() => data.value ?? [])
  return {
    packs,
    packsOuverts: computed(() => packs.value.filter(estOuvert)),
    chargementPacks: isLoading,
    erreurPacks: isError,
  }
}
