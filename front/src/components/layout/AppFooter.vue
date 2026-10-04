<script setup lang="ts">
import { lienWhatsApp, WHATSAPP_AFFICHAGE, RESEAUX_SOCIAUX, HORAIRES } from '@/config/contact'

const annee = new Date().getFullYear()
</script>

<template>
  <footer id="contact" class="bg-white border-t border-creme2 pt-16 pb-8 text-noir">
    <div class="max-w-6xl mx-auto px-4">

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">

        <div>
          <div class="flex items-center gap-2 mb-3">
            <img src="/logo-ahitche-96.webp" alt="" width="40" height="40" loading="lazy" class="w-10 h-10" />
            <span class="text-2xl font-display font-bold tracking-tight"><span class="text-foret">Ahi</span><span class="text-or-deep">tché</span></span>
          </div>
          <p class="text-gris text-sm mb-4">Le marché, organisé pour vous.</p>
          <a
            :href="lienWhatsApp()"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 min-h-11 text-savane font-bold hover:text-foret transition-colors text-sm"
          >
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.971 0C5.362 0 0 5.373 0 11.994c0 2.117.554 4.103 1.523 5.828L.057 23.882l6.218-1.632A11.946 11.946 0 0011.97 24c6.61 0 11.972-5.373 11.972-11.994C23.942 5.372 18.58 0 11.97 0zm.001 21.818a9.917 9.917 0 01-5.062-1.384l-.363-.216-3.761.987 1.004-3.665-.237-.376a9.918 9.918 0 01-1.523-5.295c0-5.475 4.453-9.934 9.942-9.934 5.488 0 9.941 4.46 9.941 9.934 0 5.476-4.453 9.935-9.941 9.935z" fill-rule="evenodd" clip-rule="evenodd"/>
            </svg>
            <span><span class="sr-only">WhatsApp : </span>{{ WHATSAPP_AFFICHAGE }}</span>
          </a>

          <!-- Réseaux sociaux : liens centralisés dans config/contact.ts -->
          <p class="text-xs font-bold text-foret uppercase tracking-wider mt-5 mb-2">Suivez-nous</p>
          <ul class="flex gap-3">
            <li v-for="reseau in RESEAUX_SOCIAUX" :key="reseau.nom">
              <a
                :href="reseau.url"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="reseau.libelle"
                class="flex items-center justify-center w-11 h-11 rounded-full bg-foret text-white transition-all duration-200 hover:bg-or hover:text-noir hover:-translate-y-0.5 active:bg-or active:text-noir active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-or"
              >
                <svg v-if="reseau.nom === 'Facebook'" class="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.3H7.5V14h2.7v8z"/></svg>
                <svg v-else class="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true"><path d="M16.6 3c.4 2.2 1.9 3.8 4.1 4v3.1c-1.5 0-2.9-.4-4.1-1.2v6.3a5.7 5.7 0 1 1-5.7-5.7c.3 0 .6 0 .9.1v3.2a2.6 2.6 0 1 0 1.8 2.4V3z"/></svg>
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 class="text-sm font-bold text-foret uppercase tracking-wider mb-3 font-body">Horaires</h3>
          <p class="text-gris text-sm leading-relaxed">{{ HORAIRES }}</p>
        </div>

        <div>
          <h3 class="text-sm font-bold text-foret uppercase tracking-wider mb-3 font-body">Zone de livraison</h3>
          <p class="text-gris text-sm leading-relaxed">
            Cotonou &amp; Abomey-Calavi<br />
            <span class="text-savane font-medium">22 zones de livraison</span>
          </p>
        </div>

        <div>
          <h3 class="text-sm font-bold text-foret uppercase tracking-wider mb-3 font-body">Liens utiles</h3>
          <ul class="space-y-2 text-sm">
            <li><a href="#formules" class="text-gris hover:text-savane transition-colors">Nos formules</a></li>
            <li><a href="#comment" class="text-gris hover:text-savane transition-colors">Comment ça marche</a></li>
            <li><RouterLink to="/blog" class="text-gris hover:text-savane transition-colors">Actualités et médias</RouterLink></li>
          </ul>
        </div>
      </div>

      <div class="border-t border-creme2 pt-8 mt-8">
        <p class="text-xs text-gris leading-relaxed mb-6">
          Ce projet est développé avec le soutien financier du Programme de Formation Professionnelle et d'Entrepreneuriat des jeunes (FP2E), à travers le programme Next Impact mis en œuvre par l'Agence de Développement de Sèmè City, et financé par la Banque mondiale.
        </p>
        <p class="text-xs text-gris">© {{ annee }} Ahitché · Tous droits réservés</p>
      </div>

    </div>
  </footer>
</template>
