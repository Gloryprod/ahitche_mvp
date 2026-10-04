<script setup lang="ts">
import LienAccueil from '@/components/ui/LienAccueil.vue'
import { lienWhatsApp, WHATSAPP_AFFICHAGE, RESEAUX_SOCIAUX } from '@/config/contact'
</script>

<template>
  <main class="min-h-screen bg-creme px-4 py-10 md:py-16">
    <article class="max-w-3xl mx-auto bg-white rounded-3xl border border-creme2 p-6 md:p-10 text-gris leading-relaxed">
      <LienAccueil />

      <h1 class="mt-6 mb-8 font-display text-3xl md:text-4xl font-bold text-foret">Mentions légales</h1>

      <section class="mb-8">
        <h2 class="text-lg font-bold text-noir mb-2">Éditeur du site</h2>
        <p>
          Ahitché, service d'approvisionnement et de livraison alimentaire à domicile à Cotonou et Abomey-Calavi (Bénin).
        </p>
        <p class="mt-2">
          Contact : WhatsApp
          <a :href="lienWhatsApp()" target="_blank" rel="noopener noreferrer" class="font-semibold text-foret underline underline-offset-4">{{ WHATSAPP_AFFICHAGE }}</a>,
          du lundi au samedi, de 9h00 à 18h00.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="text-lg font-bold text-noir mb-2">Cadre du projet</h2>
        <p>
          Ahitché est développé sous l'Agence de Développement de Sèmè City, à travers le programme Next Impact,
          avec le soutien financier du Programme de Formation Professionnelle et d'Entrepreneuriat des jeunes (FP2E),
          financé par la Banque mondiale.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="text-lg font-bold text-noir mb-2">Données personnelles</h2>
        <p>
          Ahitché collecte les seules données nécessaires à votre service : nom, adresse e-mail, téléphone, quartier et
          adresse de livraison, ainsi que l'historique de vos commandes. Elles servent à préparer et livrer vos commandes,
          à vous recontacter pour leur renouvellement et à assurer votre suivi alimentaire. Elles ne sont ni vendues ni cédées.
        </p>
        <p class="mt-2">
          Conformément à la loi n° 2017-20 du 20 avril 2018 portant Code du numérique en République du Bénin, vous pouvez
          demander l'accès à vos données, leur rectification ou leur suppression en nous écrivant sur WhatsApp.
          Les informations de votre suivi alimentaire se suppriment aussi directement depuis votre espace client.
          Vous pouvez saisir l'Autorité de Protection des Données à caractère Personnel (APDP) en cas de difficulté.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="text-lg font-bold text-noir mb-2">Cookies</h2>
        <p>
          Le site n'utilise qu'un cookie technique, déposé lorsque vous vous connectez à votre espace : il maintient votre
          session et disparaît à la déconnexion ou à son expiration. Aucun cookie publicitaire ni de mesure d'audience n'est utilisé.
        </p>
      </section>

      <section class="mb-8">
        <h2 class="text-lg font-bold text-noir mb-2">Propriété intellectuelle</h2>
        <p>
          Le nom Ahitché, son logo et les textes du site appartiennent à Ahitché. Toute reproduction sans autorisation est interdite.
          Les témoignages sont publiés avec l'accord des clients concernés.
        </p>
      </section>

      <section>
        <h2 class="text-lg font-bold text-noir mb-2">Liens externes</h2>
        <p>
          Les commandes passent par WhatsApp, et Ahitché est présent sur
          <template v-for="(reseau, i) in RESEAUX_SOCIAUX" :key="reseau.nom">
            <a :href="reseau.url" target="_blank" rel="noopener noreferrer" class="font-semibold text-foret underline underline-offset-4">{{ reseau.nom }}</a>{{ i < RESEAUX_SOCIAUX.length - 1 ? ' et ' : '' }}
          </template>.
          Ces services appliquent leurs propres conditions d'utilisation et règles de confidentialité.
        </p>
      </section>
    </article>
  </main>
</template>
