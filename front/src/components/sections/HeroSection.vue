<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import BaseButton from '../ui/BaseButton.vue'

interface Props {
  slides?: string[]
}

const props = withDefaults(defineProps<Props>(), {
  slides: () => [
    '/marche-cotonou.jpg',
    '/panier-frais.jpg',
    '/pack.jpg',
    '/produits-frais.jpg',
  ],
})

// Timing de la cascade
const ENTRANCE_BASE_DELAY = 2   // délai avant la toute première apparition
const ENTRANCE_STAGGER = 0.5    // écart entre chaque cadre au sein d'une cascade
const ENTRANCE_DURATION = 0.9   // durée de l'animation de pop-in
const DISPLAY_DURATION = 4      // temps d'affichage plein avant la cascade suivante

const frames = [
  { position: 'top-6 left-4 lg:left-14', size: 'w-24 h-32 lg:w-40 lg:h-52', rotate: -7, floatDuration: '6.5s', visible: 'block' },
  { position: 'top-10 right-4 lg:right-16', size: 'w-20 h-28 lg:w-32 lg:h-44', rotate: 8, floatDuration: '7.5s', visible: 'hidden lg:block' },
  { position: 'bottom-28 left-6 lg:left-24', size: 'w-24 h-32 lg:w-36 lg:h-48', rotate: 5, floatDuration: '8s', visible: 'hidden lg:block' },
  { position: 'bottom-16 right-6 lg:right-12', size: 'w-24 h-32 lg:w-40 lg:h-52', rotate: -4, floatDuration: '7s', visible: 'block' },
]

const cycleDurationMs =
  (ENTRANCE_STAGGER * (frames.length - 1) + ENTRANCE_DURATION + DISPLAY_DURATION) * 1000

const cycleKey = ref(0) // incrémenté à chaque cascade -> force le replay des animations
const prefersReducedMotion = ref(false)
const pointerFine = ref(false)
const px = ref(0)
const py = ref(0)

let cycleTimeout: ReturnType<typeof setTimeout> | null = null

// Les animations ne tournent que si le hero est à l'écran et l'onglet visible (économie de batterie et de CPU)
const sectionRef = ref<HTMLElement | null>(null)
const heroVisible = ref(true)
let observer: IntersectionObserver | null = null

function stopCycle() {
  if (cycleTimeout) clearTimeout(cycleTimeout)
  cycleTimeout = null
}

function majAnimations(enVue: boolean) {
  heroVisible.value = enVue && !document.hidden
  if (prefersReducedMotion.value) return
  if (heroVisible.value && !cycleTimeout) scheduleCycle(cycleKey.value === 0 ? ENTRANCE_BASE_DELAY * 1000 : cycleDurationMs)
  if (!heroVisible.value) stopCycle()
}

let heroEnVue = true
const onVisibilityChange = () => majAnimations(heroEnVue)

function scheduleCycle(delayMs: number) {
  cycleTimeout = setTimeout(() => {
    cycleKey.value++
    scheduleCycle(cycleDurationMs)
  }, delayMs)
}

// Délai d'entrée du cadre i : décalage de base uniquement au tout premier cycle
function entranceDelay(i: number) {
  return cycleKey.value === 0 ? ENTRANCE_BASE_DELAY + i * ENTRANCE_STAGGER : i * ENTRANCE_STAGGER
}

// Le flottement démarre juste après la fin de l'entrée du cadre
function floatDelay(i: number) {
  return entranceDelay(i) + ENTRANCE_DURATION
}

// Image affichée dans le cadre i pour le cycle courant
function currentSlide(i: number) {
  return props.slides[(cycleKey.value + i) % props.slides.length]
}

function onMouseMove(e: MouseEvent) {
  if (!pointerFine.value || prefersReducedMotion.value) return
  const { innerWidth, innerHeight } = window
  px.value = (e.clientX / innerWidth - 0.5) * 2
  py.value = (e.clientY / innerHeight - 0.5) * 2
}

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  pointerFine.value = window.matchMedia('(pointer: fine)').matches

  if (!prefersReducedMotion.value) {
    if (pointerFine.value) window.addEventListener('mousemove', onMouseMove, { passive: true })
    scheduleCycle(ENTRANCE_BASE_DELAY * 1000)
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  if (sectionRef.value && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(([entree]) => {
      heroEnVue = !!entree?.isIntersecting
      majAnimations(heroEnVue)
    })
    observer.observe(sectionRef.value)
  }
})

onUnmounted(() => {
  stopCycle()
  observer?.disconnect()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('mousemove', onMouseMove)
})
</script>

<template>
  <section
    id="accueil"
    ref="sectionRef"
    class="min-h-svh flex items-center relative overflow-hidden bg-foret px-6 py-27.5 md:py-22.5"
  >
    <!-- Halos + grain -->
    <div class="absolute inset-0 pointer-events-none">
      <div class="absolute rounded-full filter blur-[80px] w-150 h-150 bg-savane -top-50 -right-37.5 opacity-30"></div>
      <div class="absolute rounded-full filter blur-[80px] w-100 h-100 bg-or -bottom-30 -left-37.5 opacity-12"></div>
      <div class="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.035\'/%3E%3C/svg%3E')] opacity-60"></div>
    </div>

    <!-- Cadres photo flottants autour du texte -->
    <div
      v-for="(frame, i) in frames"
      :key="i"
      class="absolute z-1 pointer-events-none"
      :class="[frame.position, frame.visible]"
      :style="{
        transform: `translate(${px * 18}px, ${py * 18}px)`,
        transition: 'transform 0.3s ease-out',
      }"
    >
      <!-- :key sur cycleKey -> recrée le noeud à chaque cycle -> l'animation CSS se rejoue -->
      <div
        :key="`entrance-${i}-${cycleKey}`"
        class="opacity-0"
        :class="!prefersReducedMotion ? 'animate-[frameIn_0.9s_cubic-bezier(0.16,1,0.3,1)_backwards]' : 'opacity-100'"
        :style="!prefersReducedMotion
          ? { animationDelay: `${entranceDelay(i)}s`, '--rotate': `${frame.rotate}deg` }
          : { transform: `rotate(${frame.rotate}deg)` }"
      >
        <div
          class="relative overflow-hidden rounded-2xl shadow-[0_20px_45px_-10px_rgba(0,0,0,0.55)] ring-1 ring-white/15"
          :class="[frame.size, !prefersReducedMotion ? 'animate-[float_var(--fd)_ease-in-out_infinite]' : '', heroVisible ? '' : '[animation-play-state:paused]']"
          :style="{ '--fd': frame.floatDuration, animationDelay: !prefersReducedMotion ? `${floatDelay(i)}s` : '0s' }"
        >
          <img
            :src="currentSlide(i)"
            alt=""
            class="absolute inset-0 w-full h-full object-cover"
          />
          <div class="absolute inset-0 bg-linear-to-t from-foret/40 to-transparent"></div>
        </div>
      </div>
    </div>

    <!-- Contenu -->
    <div class="relative z-2 max-w-175 mx-auto text-center">
      <div class="inline-flex items-center gap-2 bg-white/12 backdrop-blur-md border border-white/20 text-white/92 text-xs font-semibold px-4 py-1.5 rounded-full mb-7">
        <!-- Halo animé en transform/opacity (composité par le GPU, contrairement à box-shadow) -->
        <span class="relative flex w-1.75 h-1.75 shrink-0" aria-hidden="true">
          <span class="absolute inset-0 rounded-full bg-[#4ade80] opacity-60 motion-safe:animate-ping"></span>
          <span class="relative w-1.75 h-1.75 bg-[#4ade80] rounded-full shadow-[0_0_0_3px_rgba(74,222,128,0.3)]"></span>
        </span>
        Livraisons actives à Cotonou & Abomey-Calavi.
      </div>

      <h1 class="font-display text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-[1.15] mb-5">
        Votre alimentation, <br />
        <em class="text-or not-italic">suivie et organisée sans stress.</em>
      </h1>

      <p class="text-sm sm:text-lg text-white/72 mb-9 lm:leading-relaxed">
        Un ravitaillement régulier et adapté à votre foyer, <br />
        pour ne plus courir le marché ni y perdre votre santé nutritionnelle.
      </p>

      <div class="flex gap-3.5 justify-center flex-wrap mb-12">
        <BaseButton href="https://wa.me/22998136635?text=Bonjour%20Ahitch%C3%A9%20!..." external>
          Commander sur WhatsApp
        </BaseButton>
        <BaseButton href="#formules" variant="secondary">
          Voir les formules
        </BaseButton>
      </div>

      <div class="flex items-center justify-center gap-5 flex-wrap">
        <div class="flex items-center gap-1.5 text-white/68 text-xs font-medium"><span aria-hidden="true">🚀</span> Livraison 72h</div>
        <div class="w-px h-5 bg-white/18 hidden sm:block"></div>
        <div class="flex items-center gap-1.5 text-white/68 text-xs font-medium"><span aria-hidden="true">📦</span> Composition adaptée à vos besoins, 17 produits de base</div>
        <div class="w-px h-5 bg-white/18 hidden sm:block"></div>
        <div class="flex items-center gap-1.5 text-white/68 text-xs font-medium"><span aria-hidden="true">🛡️</span> Satisfait ou compensé</div>
      </div>
    </div>

    <div class="absolute bottom-7 left-1/2 -translate-x-1/2 z-2">
      <div class="w-px h-11 bg-linear-to-b from-white/45 to-transparent mx-auto motion-safe:animate-[scrollHint_2s_ease-in-out_infinite]"></div>
    </div>
  </section>
</template>