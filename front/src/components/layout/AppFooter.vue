<script setup lang="ts">
// Pas de logique requise, composants d'ancrage standards nativement gérés par le layout global
</script>

<template>
  <footer id="contact" class="bg-white border-t border-creme2 pt-16 pb-8 text-noir">
    <div class="max-w-6xl mx-auto px-4">
      
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
        
        <div>
          <div class="text-2xl font-bold font-body tracking-tight mb-3">
            <span class="text-foret">Ahi</span><span class="text-or">tché</span>
          </div>
          <p class="text-gris text-sm mb-4">Le marché, organisé pour vous.</p>
          <a 
            href="https://wa.me/22998136635" 
            target="_blank" 
            rel="noopener" 
            aria-label="Contacter Ahitché sur WhatsApp"
            class="inline-flex items-center gap-2 text-savane font-bold hover:text-foret transition-colors text-sm"
          >
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.971 0C5.362 0 0 5.373 0 11.994c0 2.117.554 4.103 1.523 5.828L.057 23.882l6.218-1.632A11.946 11.946 0 0011.97 24c6.61 0 11.972-5.373 11.972-11.994C23.942 5.372 18.58 0 11.97 0zm.001 21.818a9.917 9.917 0 01-5.062-1.384l-.363-.216-3.761.987 1.004-3.665-.237-.376a9.918 9.918 0 01-1.523-5.295c0-5.475 4.453-9.934 9.942-9.934 5.488 0 9.941 4.46 9.941 9.934 0 5.476-4.453 9.935-9.941 9.935z" fill-rule="evenodd" clip-rule="evenodd"/>
            </svg>
            +229 98 13 66 35
          </a>
        </div>

        <div>
          <h4 class="text-sm font-bold text-foret uppercase tracking-wider mb-3 font-body">Horaires</h4>
          <p class="text-gris text-sm leading-relaxed">
            Lundi – Samedi<br />
            9h00 – 18h00
          </p>
        </div>

        <div>
          <h4 class="text-sm font-bold text-foret uppercase tracking-wider mb-3 font-body">Zone de livraison</h4>
          <p class="text-gris text-sm leading-relaxed">
            Cotonou &amp; Abomey-Calavi<br />
            <span class="text-savane font-medium">Calavi Kpota (zone prioritaire)</span>
          </p>
        </div>

        <div>
          <h4 class="text-sm font-bold text-foret uppercase tracking-wider mb-3 font-body">Formules</h4>
          <ul class="space-y-2 text-sm">
            <li>
              <a href="#formules" class="text-gris hover:text-savane transition-colors">AHI Essentiel</a>
            </li>
            <li>
              <a href="#formules" class="text-gris hover:text-savane transition-colors">AHI Équilibré</a>
            </li>
            <li>
              <a href="#formules" class="text-gris hover:text-savane transition-colors">AHI Confort</a>
            </li>
          </ul>
        </div>
      </div>

      <div class="border-t border-creme2 pt-8 mt-8">
        <p class="text-xs text-gris-lt leading-relaxed mb-6 text-justify">
          Ce projet est développé avec le soutien financier du Programme de Formation Professionnelle et d'Entrepreneuriat des jeunes (FP2E), à travers le programme Next Impact mis en œuvre par l'Agence de Développement de Sèmè City, et financé par la Banque mondiale.
        </p>
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gris-lt">
          <p>© 2026 Ahitché · Convention NEXT IMPACT N°171</p>
        </div>
      </div>

    </div>
  </footer>
</template>