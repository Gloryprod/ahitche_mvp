<script setup lang="ts">
// Bande de confiance, juste sous le hero : rassurer avant le choix d'une formule.
// Soutien institutionnel cité en texte (logos des partenaires seulement avec leur autorisation).
const elements = [
  {
    icone: 'soutien',
    titre: 'Projet soutenu',
    texte: 'Programme Next Impact (FP2E), Agence de Développement de Sèmè City, financement Banque mondiale.',
  },
  {
    icone: 'paiement',
    titre: 'Vous payez à la livraison',
    texte: 'MTN MoMo ou Moov Money, une fois vos vivres reçus.',
  },
  {
    icone: 'garantie',
    titre: 'Garantie Ahitché',
    texte: 'Produit manquant ou retard de plus de 24 h : compensé à la livraison suivante.',
  },
] as const
</script>

<template>
  <section aria-label="Pourquoi nous faire confiance" class="bg-white border-b border-creme2">
    <ul class="max-w-[1160px] mx-auto px-6 py-8 grid gap-6 md:grid-cols-3">
      <li v-for="e in elements" :key="e.titre" class="flex items-start gap-4">
        <span class="shrink-0 flex items-center justify-center w-11 h-11 rounded-2xl bg-foret/8 text-foret" aria-hidden="true">
          <svg v-if="e.icone === 'soutien'" class="w-5.5 h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V10M19 21V10M9 21v-7M15 21v-7M2 10l10-6 10 6z"/></svg>
          <svg v-else-if="e.icone === 'paiement'" class="w-5.5 h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10 18h4M9 8l2 2 4-4"/></svg>
          <svg v-else class="w-5.5 h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>
        </span>
        <div>
          <p class="text-sm font-bold text-foret">{{ e.titre }}</p>
          <p class="text-sm text-gris leading-relaxed">{{ e.texte }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>
