<script setup lang="ts">
import BaseButton from '../ui/BaseButton.vue'
</script>

<template>
  <section id="accueil" class="min-h-svh flex items-center relative overflow-hidden bg-foret px-6 py-[110px] md:py-[90px]">
    <div class="absolute inset-0 pointer-events-none">
      <div class="absolute rounded-full filter blur-[80px] w-[600px] h-[600px] bg-savane -top-[200px] -right-[150px] opacity-30"></div>
      <div class="absolute rounded-full filter blur-[80px] w-[400px] h-[400px] bg-or -bottom-[120px] -left-[100px] opacity-12"></div>
      <div class="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.035\'/%3E%3C/svg%3E')] opacity-60"></div>
    </div>

    <div class="relative z-1 max-w-[700px] mx-auto text-center">
      <div class="inline-flex items-center gap-2 bg-white/12 backdrop-blur-md border border-white/20 text-white/92 text-xs font-semibold px-4 py-1.5 rounded-full mb-7">
        <span class="w-[7px] h-[7px] bg-[#4ade80] rounded-full shrink-0 shadow-[0_0_0_3px_rgba(74,222,128,0.3)] animate-[pulse_2s_infinite]"></span>
        Livraisons actives à Calavi Kpota
      </div>

      <h1 class="font-display text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-[1.15] mb-5">
        Votre alimentation<br />
        <em class="text-or not-italic">organisée sans stress.</em>
      </h1>

      <p class="text-sm sm:text-lg text-white/72 mb-9 lm:leading-relaxed">
        Formules alimentaires complètes livrées à domicile chaque semaine.<br />
        Cotonou &amp; Abomey-Calavi — Commande en moins de 3 minutes.
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
        <div class="flex items-center gap-1.5 text-white/68 text-xs font-medium"><span>🚀</span> Livraison 72h</div>
        <div class="w-px h-5 bg-white/18 hidden sm:block"></div>
        <div class="flex items-center gap-1.5 text-white/68 text-xs font-medium"><span>📦</span> 16 produits garantis</div>
        <div class="w-px h-5 bg-white/18 hidden sm:block"></div>
        <div class="flex items-center gap-1.5 text-white/68 text-xs font-medium"><span>🛡️</span> Satisfait ou compensé</div>
      </div>
    </div>

    <div class="absolute bottom-7 left-1/2 -translate-x-1/2">
      <div class="w-px h-11 bg-gradient-to-b from-white/45 to-transparent mx-auto animate-[scrollHint_2s_ease-in-out_infinite]"></div>
    </div>
  </section>
</template>