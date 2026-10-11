<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { PRODUITS_INCLUS as produits, EXCLUS_ESSENTIEL as exclus, ANIMATION_PRODUITS as reglages } from '@/config/formules'

// Produits de base présentés par groupes successifs, en boucle (réglages dans config/formules.ts).
// L'animation ne tourne que si la section est à l'écran, l'onglet actif et la souris ailleurs (sur téléphone, un
// toucher ne la fige pas) ; le visiteur peut
// la mettre en pause, choisir un groupe ou tout afficher. La liste complète reste lisible par les lecteurs d'écran.

const groupes = computed(() => {
  const taille = Math.max(1, reglages.produitsParGroupe)
  return Array.from({ length: Math.ceil(produits.length / taille) }, (_, g) => produits.slice(g * taille, (g + 1) * taille))
})
const debutGroupe = (g: number) => g * Math.max(1, reglages.produitsParGroupe) + 1

const actif = ref(0)
const precedent = ref(-1) // Groupe qui sort (glissement vers le haut)
const enPause = ref(false) // Choix du visiteur
const toutVoir = ref(false)
const animationReduite = ref(false)
const aLEcran = ref(false)
const survol = ref(false)
const zone = ref<HTMLElement | null>(null)
const anime = computed(() => !toutVoir.value && !animationReduite.value && groupes.value.length > 1)

let minuterie: number | undefined
let observateur: IntersectionObserver | undefined

function afficher(g: number) {
  if (g === actif.value) return
  precedent.value = actif.value
  actif.value = g
}
function relancer() {
  window.clearInterval(minuterie)
  minuterie = undefined
  if (!anime.value || enPause.value || survol.value || !aLEcran.value || document.hidden) return
  minuterie = window.setInterval(() => afficher((actif.value + 1) % groupes.value.length), reglages.affichageMs + reglages.transitionMs)
}
// Choix d'un groupe par le visiteur : la minuterie repart de zéro pour lui laisser le temps de lire
function choisir(g: number) {
  afficher(g)
  relancer()
}

watch([anime, enPause, survol, aLEcran], relancer)

onMounted(() => {
  animationReduite.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (zone.value && 'IntersectionObserver' in window) {
    observateur = new IntersectionObserver(([entree]) => { aLEcran.value = !!entree?.isIntersecting }, { threshold: 0.3 })
    observateur.observe(zone.value)
  } else {
    aLEcran.value = true
  }
  document.addEventListener('visibilitychange', relancer)
})
onBeforeUnmount(() => {
  window.clearInterval(minuterie)
  observateur?.disconnect()
  document.removeEventListener('visibilitychange', relancer)
})

const puce = 'bg-creme text-foret text-sm font-medium px-4 py-2 rounded-full border border-creme2/60'
</script>

<template>
  <div
    ref="zone"
    @pointerenter="survol = $event.pointerType === 'mouse'"
    @pointerleave="survol = false"
  >
    <!-- Liste complète pour les lecteurs d'écran et les moteurs de recherche (la partie animée est décorative) -->
    <ul class="sr-only">
      <li v-for="produit in produits" :key="produit">{{ produit }}{{ exclus.includes(produit) ? ' (non incluse dans la formule AHI Essentiel)' : '' }}</li>
    </ul>

    <!-- Tous les produits d'un coup : choix du visiteur, ou animations réduites sur l'appareil -->
    <div v-if="!anime" class="flex flex-wrap justify-center gap-2" aria-hidden="true">
      <span v-for="produit in produits" :key="produit" :class="puce">
        {{ produit }}<span v-if="exclus.includes(produit)">*</span>
      </span>
    </div>

    <!-- Groupes empilés au même endroit : la hauteur est celle du plus grand, la page ne bouge pas -->
    <div
      v-else
      class="pile"
      :class="`effet-${reglages.effet}`"
      :style="{ '--transition': `${reglages.transitionMs}ms` }"
      aria-hidden="true"
    >
      <div
        v-for="(groupe, g) in groupes"
        :key="g"
        class="groupe flex flex-wrap justify-center content-center gap-2"
        :class="{ actif: g === actif, sortant: g === precedent }"
      >
        <span v-for="(produit, i) in groupe" :key="produit" class="puce" :class="puce" :style="{ '--i': i }">
          {{ produit }}<span v-if="exclus.includes(produit)">*</span>
        </span>
      </div>
    </div>

    <!-- Commandes : groupe, pause, tout voir -->
    <div class="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <template v-if="anime">
        <div class="flex items-center" role="group" aria-label="Groupes de produits">
          <button
            v-for="(groupe, g) in groupes"
            :key="g"
            type="button"
            class="cursor-pointer w-7 h-7 flex items-center justify-center"
            :aria-label="`Produits ${debutGroupe(g)} à ${debutGroupe(g) + groupe.length - 1}`"
            :aria-pressed="g === actif"
            @click="choisir(g)"
          >
            <span class="block h-2.5 rounded-full transition-all duration-300" :class="g === actif ? 'w-6 bg-foret' : 'w-2.5 bg-foret/25'"></span>
          </button>
        </div>
        <button
          type="button"
          class="cursor-pointer w-9 h-9 rounded-full bg-creme border border-creme2 text-foret flex items-center justify-center hover:bg-creme2"
          :aria-label="enPause ? 'Relancer l\'animation des produits' : 'Mettre l\'animation des produits en pause'"
          @click="enPause = !enPause"
        >
          <svg v-if="enPause" class="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          <svg v-else class="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
        </button>
      </template>
      <button
        v-if="!animationReduite && groupes.length > 1"
        type="button"
        class="cursor-pointer min-h-9 text-xs font-bold text-foret underline underline-offset-4 decoration-foret/30 hover:decoration-foret"
        @click="toutVoir = !toutVoir"
      >
        {{ toutVoir ? 'Revoir l\'animation' : `Voir les ${produits.length} produits` }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.pile {
  display: grid;
}
.pile > .groupe {
  grid-area: 1 / 1;
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--transition) ease, transform var(--transition) ease, visibility 0s linear var(--transition);
}
.pile > .groupe.actif {
  opacity: 1;
  visibility: visible;
  transition: opacity var(--transition) ease, transform var(--transition) ease, visibility 0s;
}

/* Glissement : arrive par le bas, repart par le haut */
.effet-glissement > .groupe { transform: translateY(14px); }
.effet-glissement > .groupe.actif { transform: none; }
.effet-glissement > .groupe.sortant { transform: translateY(-14px); }

/* Cascade : les produits du groupe apparaissent l'un après l'autre */
.effet-cascade .puce {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
  transition: opacity 300ms ease, transform 300ms ease;
}
.effet-cascade .actif .puce {
  opacity: 1;
  transform: none;
  transition-delay: calc(var(--i) * 90ms);
}

@media (prefers-reduced-motion: reduce) {
  .pile > .groupe,
  .effet-cascade .puce {
    transition: none;
  }
}
</style>
