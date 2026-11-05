<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { House, Menu } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { peutLire } from '@/config/roles'
import { entreeMenu, type EntreeMenu } from '@/config/menuAdmin'
import { useCompteursAdmin, texteCompteur } from '@/composables/useCompteursAdmin'

// Barre fixe du téléphone (moins de lg) : Accueil, Commandes, Logistique selon le rôle, et Menu (tiroir complet)
defineProps<{ menuOuvert: boolean }>()
const emit = defineEmits<{ 'ouvrir-menu': [] }>()

const route = useRoute()
const authStore = useAuthStore()
const { compteur } = useCompteursAdmin()

const raccourcis = computed(() => {
  const accueil = entreeMenu('dashboard')
  const liste: (EntreeMenu & { libelle: string })[] = []
  if (accueil) liste.push({ ...accueil, libelle: 'Accueil', icone: House })
  for (const id of ['commandes', 'logistique']) {
    const entree = entreeMenu(id)
    if (entree) liste.push({ ...entree, libelle: entree.nom })
  }
  return liste.filter(entree => peutLire(authStore.role.value, entree.section))
})

const estActive = (chemin: string) => route.path.replace(/\/$/, '') === chemin
</script>

<template>
  <nav
    aria-label="Raccourcis du back-office"
    class="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-white border-t border-creme2 pb-[env(safe-area-inset-bottom)]"
  >
    <ul class="flex items-stretch justify-around max-w-xl mx-auto">
      <li v-for="raccourci in raccourcis" :key="raccourci.id" class="flex-1">
        <RouterLink
          :to="raccourci.chemin"
          :class="[
            'relative min-h-14 w-full flex flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foret',
            estActive(raccourci.chemin) ? 'text-foret' : 'text-gris hover:text-noir'
          ]"
        >
          <span class="relative">
            <component :is="raccourci.icone" class="w-5 h-5 stroke-2" aria-hidden="true" />
            <span
              v-if="raccourci.compteur && compteur(raccourci.compteur) !== null"
              class="absolute -top-1.5 -right-3 min-w-4 h-4 px-1 rounded-full bg-or text-noir text-[9px] font-bold inline-flex items-center justify-center tabular-nums"
            >
              {{ texteCompteur(compteur(raccourci.compteur) ?? 0) }}<span class="sr-only">&nbsp;en attente</span>
            </span>
          </span>
          <span>{{ raccourci.libelle }}</span>
        </RouterLink>
      </li>
      <li class="flex-1">
        <button
          type="button"
          :aria-expanded="menuOuvert"
          aria-controls="tiroir-menu-admin"
          @click="emit('ouvrir-menu')"
          class="min-h-14 w-full flex flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold text-gris hover:text-noir cursor-pointer transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foret"
        >
          <Menu class="w-5 h-5 stroke-2" aria-hidden="true" />
          <span>Menu</span>
        </button>
      </li>
    </ul>
  </nav>
</template>
