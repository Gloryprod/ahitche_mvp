<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-vue-next'
import api from '@/stores/api'
import CarteFiche from '@/components/fiches/CarteFiche.vue'

// Bandeau publicitaire de l'espace client : fiches produits publiées par l'équipe (GET /api/auth/fiches).
// Deux façons de le parcourir :
//  - défilement automatique lent, carte par carte, en boucle : la liste est suivie d'une copie (ignorée des lecteurs
//    d'écran) qui permet de repartir au début sans à-coup ;
//  - glissement au doigt avec arrêt sur chaque carte (scroll-snap), ou boutons précédent et suivant.
// Le défilement s'arrête au survol, au toucher, au focus clavier, hors de l'écran et quand l'onglet est caché ; il reprend
// 3 s après la dernière interaction. Le bouton « pause » l'arrête durablement. Rien ne bouge tout seul si l'appareil
// demande de réduire les animations. Sans fiche publiée, le bloc n'apparaît pas.

interface Fiche { id: string; nom: string; format: string; prix: number; mention: string; photo: string }

const GLISSEMENT_MS = 1200 // Passage d'une carte à la suivante (défilement automatique)
const ARRET_MS = 2500 // Temps passé sur chaque carte
const REPRISE_MS = 3000 // Reprise après la dernière interaction du visiteur
const BOUTON_MS = 400 // Glissement après « précédent » ou « suivant »

const fiches = ref<Fiche[]>([])
const bandeau = ref<HTMLElement | null>(null)
const piste = ref<HTMLUListElement | null>(null)
const deborde = ref(false) // La liste dépasse la largeur : boutons utiles
const boucle = ref(false) // Copie ajoutée : défilement automatique en boucle
const animationsReduites = ref(false)
const pauseVoulue = ref(false)
const auDebut = ref(true)
const aLaFin = ref(false)

// État du mouvement (rien à afficher : simples variables)
let survol = false
let toucher = false
let focus = false
let attente = false // Pause de 3 s après une interaction
let visible = false
let minuterie: number | undefined // Prochain pas automatique
let reprise: number | undefined
let animation = 0 // Glissement en cours (requestAnimationFrame)
let animationAuto = false
let ecritureScript = 0 // Instant du dernier défilement fait par le script (à distinguer de ceux du visiteur)
let demonte = false
let observateurVisibilite: IntersectionObserver | undefined
let observateurTaille: ResizeObserver | undefined
let requeteMouvement: MediaQueryList | undefined

const peutBouger = () => boucle.value && !animationsReduites.value && !pauseVoulue.value
  && visible && !document.hidden && !survol && !toucher && !focus && !attente

// --- Mesures ---
// Largeur d'une série de cartes (écart compris) : distance entre la première carte et sa copie
function largeurSerie(): number {
  const el = piste.value
  const n = fiches.value.length
  if (!el || !boucle.value || el.children.length < 2 * n) return 0
  return (el.children[n] as HTMLElement).offsetLeft - (el.children[0] as HTMLElement).offsetLeft
}

// Positions d'arrêt : début de chaque carte, aligné sur la marge intérieure de la liste
function pointsArret(): number[] {
  const el = piste.value
  if (!el) return []
  const marge = parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0
  const max = el.scrollWidth - el.clientWidth
  return [...el.children].map(li => Math.min(max, Math.max(0, (li as HTMLElement).offsetLeft - marge)))
}

let bordsPrevus = false
function majBords() {
  if (bordsPrevus) return
  bordsPrevus = true
  requestAnimationFrame(() => {
    bordsPrevus = false
    const el = piste.value
    if (!el) return
    auDebut.value = el.scrollLeft <= 2
    aLaFin.value = el.scrollLeft >= el.scrollWidth - el.clientWidth - 2
  })
}

async function mesurer() {
  const el = piste.value
  if (!el || demonte) return
  // La liste tient dans la largeur (écran agrandi) : la copie ne sert plus
  if (boucle.value && largeurSerie() <= el.clientWidth + 1) {
    arreterAuto()
    boucle.value = false
    await nextTick()
  }
  if (!boucle.value) {
    deborde.value = el.scrollWidth > el.clientWidth + 1
    if (deborde.value && !animationsReduites.value && fiches.value.length > 1) {
      boucle.value = true
      await nextTick()
    }
  } else {
    deborde.value = true
  }
  majBords()
  relancer()
}
let mesurePrevue = false
function prevoirMesure() {
  if (mesurePrevue) return
  mesurePrevue = true
  requestAnimationFrame(() => { mesurePrevue = false; void mesurer() })
}

// --- Glissement ---
function ecrire(x: number) {
  const el = piste.value
  if (!el) return
  ecritureScript = performance.now()
  el.scrollLeft = x
}

function annulerGlissement() {
  if (!animation) return
  cancelAnimationFrame(animation)
  animation = 0
  piste.value?.style.removeProperty('scroll-snap-type') // Le navigateur ramène la liste sur la carte la plus proche
}

function glisser(cible: number, duree: number, auto: boolean, fin?: () => void) {
  const el = piste.value
  if (!el) return
  annulerGlissement()
  const depart = el.scrollLeft
  const distance = cible - depart
  if (Math.abs(distance) < 1 || duree <= 0) {
    ecrire(cible)
    fin?.()
    return
  }
  // Pendant le glissement, l'arrêt sur les cartes est suspendu : sinon chaque image serait ramenée en arrière
  el.style.scrollSnapType = 'none'
  animationAuto = auto
  const debut = performance.now()
  const image = (t: number) => {
    const p = Math.max(0, Math.min(1, (t - debut) / duree))
    const e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2 // Démarre et s'arrête en douceur
    ecrire(depart + distance * e)
    if (p < 1) {
      animation = requestAnimationFrame(image)
      return
    }
    animation = 0
    el.style.removeProperty('scroll-snap-type') // Arrivée pile sur une carte : rien ne bouge
    fin?.()
  }
  animation = requestAnimationFrame(image)
}

// Position de la carte suivante (+1) ou précédente (-1). En boucle, au bout de la série, saut invisible d'une série :
// la copie est identique à la liste.
function cible(sens: 1 | -1): number | null {
  const el = piste.value
  if (!el) return null
  const serie = largeurSerie()
  if (serie) {
    if (sens === 1 && el.scrollLeft >= serie - 2) ecrire(el.scrollLeft - serie)
    else if (sens === -1 && el.scrollLeft <= 2) ecrire(el.scrollLeft + serie)
  }
  const x = el.scrollLeft
  const points = pointsArret()
  return sens === 1 ? (points.find(p => p > x + 2) ?? null) : ([...points].reverse().find(p => p < x - 2) ?? null)
}

// --- Défilement automatique ---
function planifier() {
  window.clearTimeout(minuterie)
  minuterie = peutBouger() ? window.setTimeout(pas, ARRET_MS) : undefined
}
function pas() {
  minuterie = undefined
  if (!peutBouger()) return
  const x = cible(1)
  if (x === null) return planifier()
  glisser(x, GLISSEMENT_MS, true, planifier)
}
function arreterAuto() {
  window.clearTimeout(minuterie)
  minuterie = undefined
  if (animationAuto) annulerGlissement()
}
function relancer() {
  if (!peutBouger() || minuterie !== undefined || animation) return
  planifier()
}

// Toute action du visiteur : arrêt tout de suite, reprise 3 s après la dernière
function interaction() {
  arreterAuto()
  attente = true
  window.clearTimeout(reprise)
  reprise = window.setTimeout(() => { attente = false; relancer() }, REPRISE_MS)
}

// --- Gestes du visiteur ---
function entreeSouris(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return
  survol = true
  arreterAuto()
}
function sortieSouris(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return
  survol = false
  interaction()
}
function debutToucher(e: PointerEvent) {
  if (e.pointerType === 'mouse') return
  toucher = true
  arreterAuto()
}
function finToucher(e: PointerEvent) {
  if (e.pointerType === 'mouse') return
  toucher = false
  interaction()
}
// Focus au clavier seulement : un clic ou un toucher est déjà suivi par le survol et le toucher
// (navigateur sans :focus-visible : tout focus compte)
function focusClavier(cible: EventTarget | null) {
  if (!(cible instanceof HTMLElement)) return false
  try {
    return cible.matches(':focus-visible')
  } catch {
    return true
  }
}
function entreeFocus(e: FocusEvent) {
  if (!focusClavier(e.target)) return
  focus = true
  arreterAuto()
}
function sortieFocus(e: FocusEvent) {
  if (!focus || bandeau.value?.contains(e.relatedTarget as Node | null)) return
  focus = false
  interaction()
}
// Défilement du visiteur (doigt, molette, clavier) : pause ; ceux du script sont ignorés
function surDefilement() {
  majBords()
  if (!animation && performance.now() - ecritureScript > 150) interaction()
}

function defiler(sens: 1 | -1) {
  interaction()
  const x = cible(sens)
  if (x !== null) glisser(x, animationsReduites.value ? 0 : BOUTON_MS, false)
}

function basculerPause() {
  pauseVoulue.value = !pauseVoulue.value
  if (pauseVoulue.value) {
    arreterAuto()
    return
  }
  // Reprise demandée : le défilement repart tout de suite, même sous la souris ou le focus
  survol = false
  focus = false
  attente = false
  window.clearTimeout(reprise)
  relancer()
}

function changementOnglet() {
  if (document.hidden) arreterAuto()
  else relancer()
}
async function changementMouvement(e: MediaQueryListEvent) {
  animationsReduites.value = e.matches
  if (e.matches) {
    arreterAuto()
    boucle.value = false
    await nextTick()
  }
  void mesurer()
}

onMounted(async () => {
  requeteMouvement = window.matchMedia('(prefers-reduced-motion: reduce)')
  animationsReduites.value = requeteMouvement.matches
  requeteMouvement.addEventListener('change', changementMouvement)
  try {
    fiches.value = (await api.get('/api/auth/fiches')).data.fiches ?? []
  } catch {
    // Bloc secondaire : sans réponse, il reste caché et le reste de l'espace client fonctionne
  }
  if (demonte || !fiches.value.length) return
  await nextTick()
  if (!piste.value || !bandeau.value) return
  if ('ResizeObserver' in window) {
    observateurTaille = new ResizeObserver(prevoirMesure)
    observateurTaille.observe(piste.value)
  }
  if ('IntersectionObserver' in window) {
    observateurVisibilite = new IntersectionObserver(([entree]) => {
      visible = !!entree?.isIntersecting
      if (visible) relancer()
      else arreterAuto()
    }, { threshold: 0.3 })
    observateurVisibilite.observe(bandeau.value)
  } else {
    visible = true
  }
  document.addEventListener('visibilitychange', changementOnglet)
  await mesurer()
})

onBeforeUnmount(() => {
  demonte = true
  window.clearTimeout(minuterie)
  window.clearTimeout(reprise)
  annulerGlissement()
  observateurTaille?.disconnect()
  observateurVisibilite?.disconnect()
  document.removeEventListener('visibilitychange', changementOnglet)
  requeteMouvement?.removeEventListener('change', changementMouvement)
})

const bouton = 'cursor-pointer w-11 h-11 inline-flex items-center justify-center rounded-xl border border-creme2 text-foret hover:bg-creme disabled:opacity-40 disabled:cursor-default'
</script>

<template>
  <section
    v-if="fiches.length"
    ref="bandeau"
    aria-labelledby="titre-fiches"
    class="bg-white rounded-2xl border border-creme2 shadow-sm py-5 space-y-3"
    @pointerenter="entreeSouris"
    @pointerleave="sortieSouris"
    @focusin="entreeFocus"
    @focusout="sortieFocus"
  >
    <div class="px-5 sm:px-6 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <h2 id="titre-fiches" class="font-display font-bold text-xl">À découvrir</h2>
        <p class="text-xs text-gris">Nos produits, leurs formats et leurs prix.</p>
      </div>
      <div v-if="deborde" class="flex items-center gap-1.5 shrink-0">
        <button
          v-if="boucle"
          type="button"
          :class="bouton"
          :aria-label="pauseVoulue ? 'Reprendre le défilement' : 'Mettre le défilement en pause'"
          :title="pauseVoulue ? 'Reprendre le défilement' : 'Mettre en pause'"
          @click="basculerPause"
        >
          <Play v-if="pauseVoulue" class="w-4 h-4" aria-hidden="true" />
          <Pause v-else class="w-4 h-4" aria-hidden="true" />
        </button>
        <button type="button" :class="bouton" aria-controls="piste-fiches" aria-label="Produit précédent" :disabled="!boucle && auDebut" @click="defiler(-1)">
          <ChevronLeft class="w-5 h-5" aria-hidden="true" />
        </button>
        <button type="button" :class="bouton" aria-controls="piste-fiches" aria-label="Produit suivant" :disabled="!boucle && aLaFin" @click="defiler(1)">
          <ChevronRight class="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </div>

    <ul
      id="piste-fiches"
      ref="piste"
      v-defilable="'Produits à découvrir'"
      class="relative flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-5 sm:scroll-px-6 px-5 sm:px-6 pb-1 [scrollbar-width:none]"
      @pointerdown="debutToucher"
      @pointerup="finToucher"
      @pointercancel="finToucher"
      @scroll.passive="surDefilement"
    >
      <li v-for="f in fiches" :key="f.id" class="snap-start shrink-0 w-40 sm:w-44">
        <CarteFiche :nom="f.nom" :format="f.format" :prix="f.prix" :mention="f.mention" :photo="f.photo" />
      </li>
      <!-- Copie pour la boucle : identique, ignorée des lecteurs d'écran -->
      <template v-if="boucle">
        <li v-for="f in fiches" :key="`copie-${f.id}`" aria-hidden="true" class="snap-start shrink-0 w-40 sm:w-44">
          <CarteFiche :nom="f.nom" :format="f.format" :prix="f.prix" :mention="f.mention" :photo="f.photo" />
        </li>
      </template>
    </ul>
  </section>
</template>
