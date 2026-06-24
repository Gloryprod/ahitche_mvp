<script setup lang="ts">
import { ref, onMounted, computed, reactive } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import Swal from 'sweetalert2';
import api from '@/stores/api';

interface Commande {
  _id: string;
  formule: string
  date: string;
  total: string;
  statut: "En attente" | "Livré" ;
  facture_url?: string;
  createdAt: Date
}

interface Formule {
  _id: string;
  nom: string;
  emoji: string;
  prixActuel: string;
  cible: string;
}

// 1. Authentification et Routage
const authStore = useAuthStore();
const isLoading = ref(false);
const router = useRouter();
const toast = useToast();
const estEnEdition = ref(false);
const enCoursDeSauvegarde = ref(false);
const commandes = ref<Commande[]>([]);
const formulesApi = ref<Formule[]>([]);
const chargementInfos = ref(true);
const sauvegardeEnCours = ref(false);
const chargementCommandes = ref(true);

// 2. États réactifs pour les données spécifiques du dashboard client
const clientInfos = ref({
  quartier: '',
  adresse: '',
  formuleHabituelle: '',
  telephone:''
});

// Extraction de l'initiale du nom pour l'avatar
const avatarInitiale = computed(() => {
  return authStore.user?.value?.username ? authStore.user.value.username.charAt(0).toUpperCase() : 'C';
});

// 3. Récupération des données métiers
const fetchDashboardData = async () => {
  // On passe les loaders à true au début de la fonction
  chargementInfos.value = true;
  chargementCommandes.value = true;

  // 1. Assignation des informations du client  
  clientInfos.value = {
    quartier: authStore.user?.value?.quartier || '',
    adresse: authStore.user?.value?.adresse || '',
    telephone: authStore.user?.value?.telephone || '',
    formuleHabituelle: authStore.user?.value?.formuleHabituelle || 'AHI ÉQUILIBRÉ',
  };
  chargementInfos.value = false;

  try {
    const [commandesRes,formulesRes] = await Promise.all([
      api.get('/api/auth/my-orders', { withCredentials: true }),  // Récupère l'historique de ses commandes
      api.get('/api/auth/formules')                                     // Récupère la liste des formules actives
    ]);

    // 2. Assignation de l'historique des commandes
    commandes.value = commandesRes.data.map((cmd : Commande) => ({
      _id: `#CMD-${cmd._id.substring(cmd._id.length - 4).toUpperCase()}`, // Génère un ID court lisible (Ex: #CMD-1042)
      formule: cmd.formule,
      date: new Date(cmd.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
      total: `${cmd.total.toLocaleString()} FCFA`,
      statut: cmd.statut,
    }));
    chargementCommandes.value = false;

    // 3. Assignation des formules pour le sélecteur
    formulesApi.value = formulesRes.data;

  } catch (error) {
    console.error("Erreur lors du chargement des données du dashboard", error);
    
    chargementInfos.value = false;
    chargementCommandes.value = false;
  }
};

// Action de Déconnexion
const handleLogout = async () => {
  // 💡 Boîte de dialogue SweetAlert2 moderne et stylée
  const result = await Swal.fire({
    title: 'Êtes-vous sûr ?',
    text: "Vous allez être déconnecté de votre espace.",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#1e3a1f', // Adapte avec ta couleur "foret"
    cancelButtonColor: '#d33',
    confirmButtonText: 'Oui, me déconnecter',
    cancelButtonText: 'Annuler',
    background: '#ffffff',
    customClass: {
      popup: 'rounded-2xl font-body'
    }
  });

  if (result.isConfirmed) {
    isLoading.value = true;
    try {
      await authStore.logout();      
      router.push('/');
    } catch (error) {
      // 💡 Alerte SweetAlert2 en cas d'erreur serveur
      Swal.fire({
        title: 'Erreur',
        text: 'Impossible de vous déconnecter pour le moment.',
        icon: 'error',
        confirmButtonColor: '#1e3a1f'
      });
    } finally {
      isLoading.value = false;
    }
  }
};

// Initialisation des Infos du formulaire
const formFormulaire = reactive({
  telephone: '',
  quartier: '',
  adresse: ''
});

// Activer le mode édition en pré-remplissant avec les infos existantes
const activerEdition = () => {
  formFormulaire.telephone = clientInfos.value.telephone || '';
  formFormulaire.quartier = clientInfos.value.quartier || '';
  formFormulaire.adresse = clientInfos.value.adresse || '';
  estEnEdition.value = true;
};

// Fonction pour sauvegarder les infos (Appel API vers ton back Express)
const sauvegarderInfos = async () => {
  enCoursDeSauvegarde.value = true;
  try {
    // Remplacer par ton appel axios réel, ex:
    const response = await api.post('/api/auth/user/delivery-info', formFormulaire);
    
    // Simulation de réussite : on met à jour l'affichage principal
    clientInfos.value.telephone = formFormulaire.telephone;
    clientInfos.value.quartier = formFormulaire.quartier;
    clientInfos.value.adresse = formFormulaire.adresse;
    
    estEnEdition.value = false; // On ferme le formulaire
    toast.success(response.data.message)
  } catch (error) {
    console.error("Erreur lors de l'enregistrement des infos", error);
    toast.error(error);
  } finally {
    enCoursDeSauvegarde.value = false;
  }
};

// Fonction pour générer le lien Whatsapp de commande avec le message dynamique contenant les infos de livraison
const genererLienWhatsApp = computed(() => {
  const numeroWhatsApp = "22998136635";
  
  // On cherche les infos de la formule actuellement sélectionnée dans notre liste API
  const formuleChoisie = formulesApi.value.find(f => f.nom === clientInfos.value.formuleHabituelle) || { prixActuel: '22 500' };

  // Construction du texte personnalisé
  let message = `Bonjour Ahitché ! 👋\n\n`;
  message += `Je souhaite commander la formule *${clientInfos.value.formuleHabituelle}* (${formuleChoisie.prixActuel} FCFA).\n\n`;
  
  // Si les infos de livraison sont remplies, on les greffe proprement au message
  if (clientInfos.value.quartier || clientInfos.value.telephone) {
    message += `📍 *Infos de livraison :*\n`;
    message += `- *Quartier :* ${clientInfos.value.quartier || 'Non spécifié'}\n`;
    message += `- *Repères/Maison :* ${clientInfos.value.adresse || 'Non spécifié'}\n`;
    message += `- *Contact de livraison :* ${clientInfos.value.telephone || 'Non spécifié'}`;
  } else {
    message += `⚠️ _Je n'ai pas encore renseigné mes détails de livraison, nous ferons le point ici._`;
  }

  // Encodage strict au format URL
  return `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(message)}`;
});

const lancerCommande = async () => {
  // 1. Trouver les détails de la formule choisie dans formulesApi
  const formuleChoisie = formulesApi.value.find(f => f.nom === clientInfos.value.formuleHabituelle);
  
  const payload = {
    formule: clientInfos.value.formuleHabituelle,
    total: formuleChoisie ? formuleChoisie.prixActuel : 22500
  };

  try {
    // 2. Enregistrement silencieux dans ta base de données locale
    await api.post('/api/auth/save/orders', payload);
    console.log("Commande enregistrée en BDD !");
  } catch (error) {
    console.error("Impossible d'enregistrer la commande en BDD", error);
  } finally {  
    window.open(genererLienWhatsApp.value, '_blank');    
  }
};

// Fonction pour changer la formule et l'enregistrer dans la DB
const changerFormule = async (formule : Formule) => {
  clientInfos.value.formuleHabituelle = formule.nom;
  
  sauvegardeEnCours.value = true;
  try {
    // Optionnel : Enregistre le choix de la formule sur le compte de l'utilisateur
    const response = await api.put('/api/auth/user/preference-formule', { formule: formule.nom });
    toast.success(response.data.message)
  } catch (error) {
    toast.error(error);
  } finally {
    sauvegardeEnCours.value = false;
  }
};

onMounted(async () => {
  await authStore.checkSession();
  
  if (!authStore.isAuthenticated) {
    // 💡 Toast d'avertissement si l'utilisateur tente de forcer l'accès
    toast.error("Accès refusé. Veuillez vous connecter.");
    router.push('/');
    return;
  }
  
  // Si tout est bon, on affiche un toast de bienvenue chaleureux
  // toast.info(`Ravi de vous revoir, ${authStore.user?.value?.username} ! ✨`);
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

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div class="bg-white rounded-2xl p-6 shadow-sm border border-creme2 flex flex-col justify-between">
          <div>
            <!-- En-tête avec bouton Modifier -->
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-2">
                <span class="text-xl">📍</span>
                <h3 class="font-display font-bold text-lg text-noir">Infos de livraison</h3>
              </div>
              <button 
                v-if="!chargementInfos && !estEnEdition" 
                @click="activerEdition"
                class="cursor-pointer text-sm text-foret hover:underline font-medium focus:outline-none"
              >
                {{ clientInfos.telephone ? 'Modifier' : 'Ajouter' }}
              </button>
            </div>

            <!-- Mode Chargement -->
            <div v-if="chargementInfos" class="animate-pulse space-y-2">
              <div class="h-4 bg-creme2 rounded w-1/3"></div>
              <div class="h-4 bg-creme2 rounded w-3/4"></div>
              <div class="h-4 bg-creme2 rounded w-1/2"></div>
            </div>

            <!-- Mode Affichage des infos -->
            <div v-else-if="!estEnEdition">
              <div v-if="clientInfos.telephone || clientInfos.quartier">
                <p class="font-semibold text-foret mb-1">{{ clientInfos.quartier }}</p>
                <p class="text-gris text-sm leading-relaxed mb-2">{{ clientInfos.adresse }}</p>
                <p class="text-noir text-sm font-medium flex items-center gap-1">
                  <span>📞</span> {{ clientInfos.telephone }}
                </p>
              </div>
              <div v-else class="text-sm text-gris italic py-2">
                Aucune information enregistrée pour la livraison.
              </div>
            </div>

            <!-- Mode Formulaire d'Édition -->
            <form v-else @submit.prevent="sauvegarderInfos" class="space-y-10 mt-2">
              <!-- Téléphone -->
              <div>
                <label class="block text-xs font-semibold text-noir mb-1">Téléphone (WhatsApp de préférence)</label>
                <input 
                  v-model="formFormulaire.telephone" 
                  type="tel" 
                  placeholder="Ex: 97000000" 
                  required
                  class="w-full px-3 py-2 border border-creme2 rounded-xl text-sm focus:outline-none focus:border-foret text-noir"
                />
              </div>

              <!-- Quartier / Ville -->
              <div>
                <label class="block text-xs font-semibold text-noir mb-1">Quartier / Ville</label>
                <input 
                  v-model="formFormulaire.quartier" 
                  type="text" 
                  placeholder="Ex: Akassato, Calavi" 
                  required
                  class="w-full px-3 py-2 border border-creme2 rounded-xl text-sm focus:outline-none focus:border-foret text-noir"
                />
              </div>

              <!-- Précisions adresse -->
              <div>
                <label class="block text-xs font-semibold text-noir mb-1">Précisions (Maison, repère...)</label>
                <textarea 
                  v-model="formFormulaire.adresse" 
                  rows="2"
                  placeholder="Ex: Maison verte en face de la pharmacie..." 
                  required
                  class="w-full px-3 py-2 border border-creme2 rounded-xl text-sm focus:outline-none focus:border-foret text-noir resize-none"
                ></textarea>
              </div>

              <!-- Boutons d'action -->
              <div class="flex items-center gap-2 pt-2">
                <button 
                  type="submit" 
                  :disabled="enCoursDeSauvegarde"
                  class="flex-1 bg-foret text-white text-xs font-bold px-4 py-3 rounded-xl hover:bg-opacity-90 transitiondisabled:opacity-50"
                >
                  {{ enCoursDeSauvegarde ? 'Enregistrement...' : 'Enregistrer' }}
                </button>
                <button 
                  type="button" 
                  @click="estEnEdition = false"
                  class="px-4 py-3 border border-creme2 rounded-xl text-xs hover:bg-gray-50 text-noir"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>

        <div class="md:cols-2 bg-white rounded-2xl p-6 shadow-sm border border-creme2 flex flex-col justify-between h-full">
          <div>
            <div class="flex items-center justify-between mb-4">
              <div>
                <div class="flex items-center gap-2 mb-4">
                  <span class="text-xl">💬</span>
                  <h3 class="font-display font-bold text-lg text-noir">Commander rapidement</h3>
                </div>
                <p class="text-gris text-sm leading-relaxed mb-5">
                  Faites le choix du pack qui vous convient et lancez la commande — votre livreur connaît déjà votre adresse et vos préférences.
                </p>
              </div>
              <!-- Petit indicateur de sauvegarde si nécessaire -->
              <span v-if="sauvegardeEnCours" class="text-xs text-savane animate-pulse">Mise à jour...</span>
            </div>

            <!-- Mode Chargement -->
            <div v-if="chargementInfos" class="animate-pulse space-y-3 mb-4">
              <div class="h-10 bg-creme2 rounded-xl w-full"></div>
              <div class="h-10 bg-creme2 rounded-xl w-full"></div>
              <div class="h-10 bg-creme2 rounded-xl w-full"></div>
            </div>

            <!-- Choix des formules -->
            <div v-else class="space-y-3 mb-6">
              <label 
                v-for="formule in formulesApi" 
                :key="formule._id"
                :class="[
                  'flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all duration-200 select-none',
                  clientInfos.formuleHabituelle === formule.nom 
                    ? 'border-foret bg-foret/5 ring-1 ring-foret' 
                    : 'border-creme2 hover:border-gray-300 bg-white'
                ]"
                @click="changerFormule(formule)"
              >
                <div class="flex items-center gap-3">
                  <span class="text-xl">{{ formule.emoji }}</span>
                  <div>
                    <p class="font-semibold text-sm text-noir">{{ formule.nom }}</p>
                    <p class="text-xs text-gris">{{ formule.prixActuel }} FCFA · {{ formule.cible.split('·')[0] }}</p>
                  </div>
                </div>
                <!-- Bouton Radio personnalisé -->
                <div 
                  :class="[
                    'w-4 h-4 rounded-full border flex items-center justify-center transition-colors',
                    clientInfos.formuleHabituelle === formule.nom ? 'border-foret bg-foret' : 'border-gray-300'
                  ]"
                >
                  <div v-if="clientInfos.formuleHabituelle === formule.nom" class="w-1.5 h-1.5 rounded-full bg-white"></div>
                </div>
              </label>
            </div>
          </div>

          <!-- Bouton d'action dynamique -->
          <button 
            @click="lancerCommande" 
            class="inline-flex items-center justify-center w-full px-4 py-3 bg-foret text-white font-medium rounded-xl hover:bg-savane transition-colors duration-200 text-sm text-center"
          >
            Commander maintenant →
          </button>
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
                <th class="pb-3 font-semibold">Pack Commandé</th>
                <th class="pb-3 font-semibold">Date</th>
                <th class="pb-3 font-semibold">Total</th>
                <th class="pb-3 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-creme2 text-sm text-noir">
              <tr v-for="commande in commandes" :key="commande._id" class="hover:bg-creme/50 transition-colors">
                <td class="py-4 font-medium text-foret">{{ commande._id }}</td>
                <td class="py-4 font-medium text-foret">{{ commande.formule }}</td>
                <td class="py-4 text-gris">{{ commande.date }}</td>
                <td class="py-4 font-medium">{{ commande.total }}</td>
                <td class="py-4">
                  <span :class="`px-2.5 py-1 rounded-full text-xs font-medium ${commande.statut === 'Livré' ? 'bg-green-100 text-green-800' : commande.statut === 'En attente' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`">
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