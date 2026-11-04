<!-- src/views/HomeView.vue -->
<script setup lang="ts">
import HeroSection from '../components/sections/HeroSection.vue'
import BandeConfiance from '../components/sections/BandeConfiance.vue'
import FermeAVous from '../components/sections/FermeAVous.vue'
import ProblemGrid from '../components/sections/ProblemGrid.vue'
import NosFormules from '../components/sections/NosFormules.vue'
import CommentCaMarche from '../components/sections/CommentCaMarche.vue'
import ProduitsSemaine from '../components/sections/ProduitsSemaine.vue'
import TemoignagesAndGarantie from '../components/sections/TemoignagesAndGarantie.vue'
import FaqSection from '../components/sections/FaqSection.vue'
import ActualitesSection from '../components/sections/ActualitesSection.vue'
import ActionsFlottantes from '../components/layout/ActionsFlottantes.vue'
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { ajouterDonneesStructurees, donneesCommerce } from '@/services/referencement'

// Fiche « commerce local » pour Google : zone desservie, horaires, formules et prix ; remise à jour à l'arrivée des
// valeurs publiées depuis l'admin (numéro, horaires, paiement, réseaux, textes et prix des formules)
const donnees = computed(donneesCommerce)
let retirer: (() => void) | undefined
onMounted(() => { retirer = ajouterDonneesStructurees('donnees-commerce', donnees.value) })
watch(donnees, d => { retirer = ajouterDonneesStructurees('donnees-commerce', d) })
onUnmounted(() => retirer?.())
</script>

<!-- Ordre validé pour la refonte : comprendre, être rassuré, voir la chaîne, choisir, commander -->
<template>
  <div>
    <HeroSection />
    <BandeConfiance />
    <FermeAVous />
    <NosFormules />
    <CommentCaMarche />
    <ProblemGrid />
    <ProduitsSemaine />
    <TemoignagesAndGarantie />
    <FaqSection />
    <ActualitesSection />
  </div>
  <!-- Commande WhatsApp collante (mobile) et retour en haut de page -->
  <ActionsFlottantes />
</template>
