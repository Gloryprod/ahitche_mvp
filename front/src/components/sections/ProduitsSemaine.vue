<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/stores/api'
import { lienWhatsApp, MESSAGES_WHATSAPP } from '@/config/contact'
import CarteComplement from '@/components/complements/CarteComplement.vue'

// Compléments disponibles cette semaine, à ajouter à une formule : gérés dans le back-office (Compléments de la semaine)
interface Complement { id: string; nom: string; prix: number; unite: string; description: string; photo: string }

const produits = ref<Complement[]>([])
const etat = ref<'chargement' | 'pret' | 'vide'>('chargement')

onMounted(async () => {
  try {
    produits.value = (await api.get('/api/public/complements')).data
    etat.value = produits.value.length ? 'pret' : 'vide'
  } catch {
    etat.value = 'vide'
  }
})
</script>

<template>
  <section id="variables" class="py-20 bg-creme2">
    <div class="max-w-[1160px] mx-auto px-6 text-center">
      <div class="inline-block bg-foret/10 text-foret text-xs font-bold tracking-widest uppercase px-3.5 py-1 rounded-full mb-4">
        Compléments
      </div>

      <h2 class="font-display text-3xl sm:text-4xl font-bold mb-3 text-noir">Disponible cette semaine</h2>
      <p class="text-gris mb-8">À ajouter à votre formule, livré avec elle.</p>

      <!-- Mobile : rangée à faire glisser ; ordinateur : cartes centrées sur plusieurs lignes -->
      <ul
        v-if="etat !== 'vide'"
        tabindex="0"
        aria-label="Produits de la semaine"
        :aria-busy="etat === 'chargement'"
        class="flex lg:flex-wrap lg:justify-center gap-3 lg:gap-4 -mx-6 px-6 lg:mx-0 lg:px-0 mb-10 overflow-x-auto lg:overflow-visible snap-x snap-mandatory scroll-px-6 pb-2 [scrollbar-width:none]"
      >
        <template v-if="etat === 'chargement'">
          <!-- Emplacements de même taille que les cartes : la page ne saute pas à l'arrivée des produits -->
          <li v-for="n in 4" :key="n" class="snap-start shrink-0 w-44 lg:w-52 h-64 rounded-2xl bg-white/70 animate-pulse" aria-hidden="true"></li>
        </template>
        <template v-else>
          <li
            v-for="prod in produits"
            :key="prod.id"
            class="snap-start shrink-0 w-44 lg:w-52 transition-all duration-250 hover:-translate-y-1 hover:shadow-md rounded-2xl"
          >
            <CarteComplement
              :nom="prod.nom"
              :prix="prod.prix"
              :unite="prod.unite"
              :description="prod.description"
              :photo="prod.photo"
            />
          </li>
        </template>
      </ul>
      <p v-else class="text-sm text-gris mb-10">Les compléments de la semaine arrivent bientôt : demandez-nous ce qui est disponible sur WhatsApp.</p>

      <a
        :href="lienWhatsApp(MESSAGES_WHATSAPP.complements)"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center justify-center gap-2 min-h-11 bg-savane text-white font-bold text-sm px-6 rounded-full shadow-md transition-all duration-250 hover:bg-foret hover:-translate-y-0.5 active:scale-97"
      >
        <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.2.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2z"/></svg>
        Ajouter à ma formule
      </a>
    </div>
  </section>
</template>
