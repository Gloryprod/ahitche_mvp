<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';

// 1. Authentification et Routage
const authStore = useAuthStore();
const isLoading = ref(false);
const router = useRouter();

// Extraction de l'initiale du nom pour l'avatar
const avatarInitiale = computed(() => {
  return authStore.user?.value?.username ? authStore.user.value.username.charAt(0).toUpperCase() : 'C';
});

// 2. États réactifs pour les données spécifiques du dashboard client
const clientInfos = ref({
  quartier: '',
  adresse: '',
  formuleHabituelle: '',
  lienCommande: '#',
  lienWhatsApp: '#'
});

interface Commande {
  id: string;
  date: string;
  total: string;
  statut: string;
  statutClass: string; 
}

const commandes = ref<Commande[]>([]);
const chargementInfos = ref(true);
const chargementCommandes = ref(true);

// 3. Récupération des données métiers (Simulation ou API)
const fetchDashboardData = async () => {
  try {
    // Simulation d'un appel API pour l'adresse et les formules
    setTimeout(() => {
      clientInfos.value = {
        quartier: 'Haie Vive',
        adresse: 'Rue 128, Lot 452 - Cotonou',
        formuleHabituelle: 'Formule Hebdo - Midi & Soir',
        lienCommande: '/commander',
        lienWhatsApp: 'https://wa.me/22998136635?text=Bonjour,%20je%20souhaite%20renouveler%20ma%20commande%20habituelle.'
      };
      chargementInfos.value = false;
    }, 1000);

    // Simulation d'un appel API pour l'historique
    setTimeout(() => {
      commandes.value = [
        { id: '#CMD-1042', date: '02 Juin 2026', total: '15 000 FCFA', statut: 'Livré', statutClass: 'bg-green-100 text-green-800' },
        { id: '#CMD-0988', date: '26 Mai 2026', total: '15 000 FCFA', statut: 'Livré', statutClass: 'bg-green-100 text-green-800' },
        { id: '#CMD-0812', date: '19 Mai 2026', total: '12 500 FCFA', statut: 'Annulé', statutClass: 'bg-red-100 text-red-800' }
      ];
      chargementCommandes.value = false;
    }, 1500);
  } catch (error) {
    console.error("Erreur lors du chargement des données du dashboard", error);
  }
};

// Action de Déconnexion
const handleLogout = async () => {
  isLoading.value = true;
  try {
    await authStore.logout(); // On attend la déconnexion (destruction du cookie back)
    router.push('/'); // Redirection vers l'accueil ou le login
  } catch (error: any) {
    alert("Une erreur est survenue lors de la déconnexion.");
  } finally {
    isLoading.value = false;
  }
};

// 💡 4. Cycle de vie : Validation obligatoire de la session au montage
onMounted(async () => {
  // On demande au Store de vérifier auprès d'Express si le cookie est présent et valide
  await authStore.checkSession();
  
  // Si après vérification l'utilisateur est toujours null, c'est qu'il n'est pas connecté
  if (!authStore.isAuthenticated) {
    router.push('/'); // Renvoie vers l'accueil ou la modale de login
    return;
  }
  
  console.log("Utilisateur authentifié avec succès :", authStore.user);
  
  // Si le user est bien là, on charge ses données spécifiques
  await fetchDashboardData();
});
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 font-body">
    
    <div v-if="!authStore.isInitialized" class="flex flex-col items-center justify-center py-24 gap-3">
      <div class="w-10 h-10 border-4 border-foret border-t-transparent rounded-full animate-spin"></div>
      <p class="text-gris text-sm">Vérification de vos accès en cours...</p>
    </div>

    <div v-else>
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-creme2 flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
        <div class="flex items-center gap-4 text-center sm:text-left flex-col sm:flex-row">
          <div class="w-16 h-16 bg-foret text-white font-display text-2xl font-bold rounded-full flex items-center justify-center shadow-inner">
            {{ avatarInitiale }}
          </div>
          <div>
            <h1 class="font-display text-2xl font-bold text-noir">
              Ravi de vous revoir, {{ authStore.user?.value?.username || 'Client' }} 👋
            </h1>
            <p class="text-gris text-sm mt-0.5">{{ authStore.user?.value?.email }}</p>
          </div>
        </div>
        <button 
          @click="handleLogout" 
          :disabled="isLoading"
          class="cursor-pointer px-5 py-2.5 rounded-xl border border-gris-lt/30 text-gris hover:text-noir hover:bg-creme font-medium transition-all duration-200 text-sm disabled:opacity-50"
        >
          {{ isLoading ? 'Déconnexion...' : 'Déconnexion' }}
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div class="bg-white rounded-2xl p-6 shadow-sm border border-creme2 flex flex-col justify-between">
          <div>
            <div class="flex items-center gap-2 mb-4">
              <span class="text-xl">📍</span>
              <h3 class="font-display font-bold text-lg text-noir">Mon adresse de livraison</h3>
            </div>
            <div v-if="chargementInfos" class="animate-pulse space-y-2">
              <div class="h-4 bg-creme2 rounded w-1/3"></div>
              <div class="h-4 bg-creme2 rounded w-3/4"></div>
            </div>
            <div v-else>
              <p class="font-semibold text-foret mb-1">{{ clientInfos.quartier }}</p>
              <p class="text-gris text-sm leading-relaxed">{{ clientInfos.adresse }}</p>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-2xl p-6 shadow-sm border border-creme2 flex flex-col justify-between">
          <div>
            <div class="flex items-center gap-2 mb-4">
              <span class="text-xl">📦</span>
              <h3 class="font-display font-bold text-lg text-noir">Ma formule habituelle</h3>
            </div>
            <div v-if="chargementInfos" class="animate-pulse space-y-2 mb-4">
              <div class="h-5 bg-creme2 rounded w-2/3"></div>
            </div>
            <p v-else class="text-noir font-medium mb-5">{{ clientInfos.formuleHabituelle }}</p>
          </div>
          <a 
            :href="clientInfos.lienCommande" 
            class="inline-flex items-center justify-center w-full px-4 py-3 bg-foret text-white font-medium rounded-xl hover:bg-savane transition-colors duration-200 text-sm text-center"
          >
            Commander maintenant →
          </a>
        </div>

        <div class="bg-white rounded-2xl p-6 shadow-sm border-2 border-savane/20 flex flex-col justify-between relative overflow-hidden">
          <div class="absolute top-3 right-3 w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
          <div>
            <div class="flex items-center gap-2 mb-4">
              <span class="text-xl">💬</span>
              <h3 class="font-display font-bold text-lg text-noir">Commander rapidement</h3>
            </div>
            <p class="text-gris text-sm leading-relaxed mb-5">
              Envoyez un message WhatsApp — votre livreur connaît déjà votre adresse et vos préférences.
            </p>
          </div>
          <a 
            :href="clientInfos.lienWhatsApp" 
            target="_blank" 
            rel="noopener"
            class="inline-flex items-center justify-center gap-2 w-full px-4 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors duration-200 text-sm text-center shadow-sm"
          >
            <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M11.971 0C5.362 0 0 5.373 0 11.994c0 2.117.554 4.103 1.523 5.828L.057 23.882l6.218-1.632A11.946 11.946 0 0011.97 24c6.61 0 11.972-5.373 11.972-11.994C23.942 5.372 18.58 0 11.97 0zm.001 21.818a9.917 9.917 0 01-5.062-1.384l-.363-.216-3.761.987 1.004-3.665-.237-.376a9.918 9.918 0 01-1.523-5.295c0-5.475 4.453-9.934 9.942-9.934 5.488 0 9.941 4.46 9.941 9.934 0 5.476-4.453 9.935-9.941 9.935z" fill-rule="evenodd" clip-rule="evenodd"/>
            </svg>
            Renouveler sur WhatsApp
          </a>
        </div>
      </div>

      <div class="bg-white rounded-2xl p-6 shadow-sm border border-creme2">
        <h2 class="font-display font-bold text-xl text-noir mb-6">Historique de mes commandes</h2>
        
        <div v-if="chargementCommandes" class="flex flex-col items-center py-12 gap-3">
          <div class="w-8 h-8 border-4 border-foret border-t-transparent rounded-full animate-spin"></div>
          <p class="text-gris text-sm">Chargement de vos commandes...</p>
        </div>

        <div v-else-if="commandes.length === 0" class="text-center py-12 text-gris">
          Vous n'avez pas encore passé de commande.
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-creme2 text-gris text-xs uppercase tracking-wider">
                <th class="pb-3 font-semibold">N° Commande</th>
                <th class="pb-3 font-semibold">Date</th>
                <th class="pb-3 font-semibold">Total</th>
                <th class="pb-3 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-creme2 text-sm text-noir">
              <tr v-for="commande in commandes" :key="commande.id" class="hover:bg-creme/50 transition-colors">
                <td class="py-4 font-medium text-foret">{{ commande.id }}</td>
                <td class="py-4 text-gris">{{ commande.date }}</td>
                <td class="py-4 font-medium">{{ commande.total }}</td>
                <td class="py-4">
                  <span :class="`px-2.5 py-1 rounded-full text-xs font-medium ${commande.statutClass}`">
                    {{ commande.statut }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

  </div>
</template>