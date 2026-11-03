<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { BandeauSite } from '@/services/valeursSite'

// Bandeau d'annonce publié depuis l'admin (« Site public ») : pages publiques seulement (App.vue), chargé à la
// demande quand une annonce existe. Barre fixe en bas de l'écran : il ne pousse jamais le contenu. Sa hauteur est
// réservée tout en bas de la page (rien ne bouge au-dessus) et remonte les boutons flottants (--hauteur-bandeau).
// « Fermer » le cache pour la session ; une nouvelle annonce réapparaît.
// Avec « apercu », rendu simple dans la page, pour l'écran admin.
const props = defineProps<{ bandeau: BandeauSite; apercu?: boolean }>()

const CLE_FERME = 'ahitche-bandeau-ferme'
const empreinte = computed(() => `${props.bandeau.message}|${props.bandeau.lien}`)

function dejaFerme() {
  try {
    return sessionStorage.getItem(CLE_FERME) === empreinte.value
  } catch {
    return false // Stockage refusé (navigation privée…) : le bandeau reste affiché
  }
}

const ferme = ref(!props.apercu && dejaFerme())
const barre = ref<HTMLElement | null>(null)
let observateur: ResizeObserver | null = null

const racine = () => document.documentElement
function reserverHauteur(hauteur: number) {
  if (hauteur > 0) racine().style.setProperty('--hauteur-bandeau', `${Math.ceil(hauteur)}px`)
  else racine().style.removeProperty('--hauteur-bandeau')
}

onMounted(() => {
  if (props.apercu || !barre.value) return
  reserverHauteur(barre.value.offsetHeight)
  if ('ResizeObserver' in window) {
    observateur = new ResizeObserver(() => { if (barre.value) reserverHauteur(barre.value.offsetHeight) })
    observateur.observe(barre.value)
  }
})

function liberer() {
  observateur?.disconnect()
  observateur = null
  if (!props.apercu) reserverHauteur(0)
}
onBeforeUnmount(liberer)

function fermer() {
  if (props.apercu) return
  try {
    sessionStorage.setItem(CLE_FERME, empreinte.value)
  } catch {
    // Sans stockage, il reste fermé jusqu'au prochain chargement
  }
  liberer()
  ferme.value = true
}

const important = computed(() => props.bandeau.ton === 'important')
const lienInterne = computed(() => props.bandeau.lien.startsWith('/'))
</script>

<template>
  <template v-if="!ferme">
    <!-- Hauteur réservée après le pied de page : la fin de la page n'est jamais cachée par la barre -->
    <div v-if="!apercu" aria-hidden="true" class="h-(--hauteur-bandeau)"></div>
    <div
      ref="barre"
      :role="apercu ? undefined : 'status'"
      :class="[
        'font-body',
        apercu ? 'rounded-2xl overflow-hidden' : 'bandeau-annonce fixed inset-x-0 bottom-0 z-95 shadow-[0_-6px_20px_rgba(17,17,17,0.18)] pb-[env(safe-area-inset-bottom)]',
        important ? 'bg-or text-noir' : 'bg-foret text-white',
      ]"
    >
      <div class="max-w-[1160px] mx-auto flex items-center gap-2 pl-4 pr-1.5 py-1.5 sm:pl-6">
        <p class="flex-1 min-w-0 py-1.5 text-sm leading-snug">
          <span class="font-semibold">{{ bandeau.message }}</span>
          <template v-if="bandeau.lien && bandeau.texteLien">
            {{ ' ' }}
            <!-- Aperçu de l'admin : lien montré sans quitter l'écran -->
            <span v-if="apercu" :class="['inline-block font-bold underline underline-offset-4 decoration-2', important ? 'text-noir' : 'text-or']">{{ bandeau.texteLien }}</span>
            <RouterLink
              v-else-if="lienInterne"
              :to="bandeau.lien"
              :class="['inline-block font-bold underline underline-offset-4 decoration-2', important ? 'text-noir' : 'text-or']"
            >{{ bandeau.texteLien }}</RouterLink>
            <a
              v-else
              :href="bandeau.lien"
              data-mesure="bandeau"
              target="_blank"
              rel="noopener noreferrer"
              :class="['inline-block font-bold underline underline-offset-4 decoration-2', important ? 'text-noir' : 'text-or']"
            >{{ bandeau.texteLien }}</a>
          </template>
        </p>
        <button
          type="button"
          :aria-label="apercu ? undefined : 'Fermer l\'annonce'"
          :aria-hidden="apercu ? 'true' : undefined"
          :tabindex="apercu ? -1 : undefined"
          title="Fermer"
          :class="[
            'shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2',
            important ? 'hover:bg-noir/10 focus-visible:outline-noir' : 'hover:bg-white/15 focus-visible:outline-or',
          ]"
          @click="fermer"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
    </div>
  </template>
</template>

<style scoped>
/* Arrivée par le bas (transformation seule : aucun décalage de mise en page), sauf « réduire les animations » */
@media (prefers-reduced-motion: no-preference) {
  .bandeau-annonce {
    animation: monter 0.3s ease-out;
  }
}
@keyframes monter {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
</style>
