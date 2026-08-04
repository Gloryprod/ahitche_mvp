<script setup lang="ts">
import { ref, onMounted, computed, reactive } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import Swal from 'sweetalert2';
import api from '@/stores/api';
import { 
  MapPinIcon, Edit3Icon, PhoneIcon, MailIcon, 
  ShoppingBagIcon, ArrowRightIcon, HistoryIcon, 
  LogOutIcon, XIcon, DownloadIcon 
} from 'lucide-vue-next';
import { genererRecuPDF } from '@/services/pdfRecuCommande';

interface Commande {
  id: string;
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
      _id: cmd._id,
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
      router.push('/login');
      toast.success("À bientôt ! Déconnexion réussie.");
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

// Fonction pour générer le lien WhatsApp d'annulation pour une commande spécifique
const genererLienAnnulation = (commande: Commande) => {
  const numeroWhatsApp = "22998136635";
  
  // Construction du texte d'annulation clair et précis
  let message = `Bonjour Ahitché ! ❌\n\n`;
  message += `Je souhaite annuler ma commande *${commande._id}*.\n\n`;
  message += `📍 *Détails de la commande à annuler :*\n`;
  message += `- *Formule :* ${commande.formule || clientInfos.value.formuleHabituelle}\n`;
  message += `- *Montant :* ${commande.total}\n`;
  message += `- *Date du lancement :* ${commande.date}\n\n`;
  message += `Merci de prendre en compte ma demande d'annulation.`;

  // Encodage au format URL WhatsApp
  return `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(message)}`;
};

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
    console.log("Commande enregistrée!");
  } catch (error) {
    console.error("Impossible d'enregistrer la commande", error);
  } finally {  
    window.open(genererLienWhatsApp.value, '_blank');
    await fetchDashboardData();   
  }
};

const annulerCommande = async (commande_id : string) => {
  console.log(commande_id);
  const commande = commandes.value.find(c => c._id === commande_id);

  if (!commande) {
    toast.error("Commande introuvable");
    return;
  }
  
  try {
    await api.delete(`/api/auth/delete/order/${commande_id}`);
    console.error("Commande supprimée avec succès !");
  } catch (error) {
    console.error("Impossible de supprimer la commande", error);
    toast.error("Impossible de supprimer la commande")
  } finally {  
    window.open(genererLienAnnulation(commande), '_blank');
    await fetchDashboardData();   
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

const telechargerRecu = (commande: Commande) => {
  try {
    genererRecuPDF({
      commandeId: commande._id,
      formule: commande.formule,
      date: commande.date,
      total: commande.total,
      clientNom: authStore.user?.value?.username || 'Client',
      clientEmail: authStore.user?.value?.email || '',
      clientPhone: clientInfos.value.telephone,
      clientQuartier: clientInfos.value.quartier,
      clientAdresse: clientInfos.value.adresse
    });
    toast.success("Reçu téléchargé avec succès !");
  } catch (error) {
    console.error("Erreur génération PDF:", error);
    toast.error("Impossible de générer le reçu pour le moment.");
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
  <div class="max-w-6xl mx-auto px-4 py-10 font-body antialiased text-noir">
    
    <!-- ÉTAT : CHARGEMENT INITIAL -->
    <div v-if="!authStore.isInitialized" class="flex flex-col items-center justify-center py-32 gap-4">
      <div class="w-12 h-12 border-[3px] border-foret border-t-transparent rounded-full animate-spin"></div>
      <p class="text-gris text-sm font-medium tracking-wide">Validation de vos accès...</p>
    </div>

    <!-- ÉTAT : CONTENU PRINCIPAL -->
    <div v-else class="space-y-8 animate-fadeIn">
      
      <!-- EN-TÊTE UTILISATEUR (HEADER BARS) -->
      <div class="bg-white rounded-2xl p-6 border border-creme2 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm transition-all duration-300 hover:shadow-md">
        <div class="flex items-center gap-5 text-center sm:text-left flex-col sm:flex-row">
          <div class="w-16 h-16 bg-foret/10 text-foret font-display text-2xl font-bold rounded-2xl flex items-center justify-center shadow-sm border border-foret/20 select-none">
            {{ avatarInitiale }}
          </div>
          <div>
            <h1 class="font-display text-2xl font-bold tracking-tight">
              Ravi de vous revoir, {{ authStore.user?.value?.username || 'Client' }} 👋
            </h1>
            <p class="text-gris text-sm mt-0.5 font-medium flex items-center gap-1.5 justify-center sm:justify-start">
              <MailIcon class="w-4 h-4 opacity-70" /> {{ authStore.user?.value?.email }}
            </p>
          </div>
        </div>
        <button 
          @click="handleLogout" 
          :disabled="isLoading"
          class="cursor-pointer w-full sm:w-auto px-5 py-2.5 rounded-xl border border-gray-200 text-gris hover:text-red-600 hover:bg-red-50 hover:border-red-100 font-semibold transition-all duration-200 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <LogOutIcon class="w-4 h-4" />
          <span>{{ isLoading ? 'Déconnexion...' : 'Déconnexion' }}</span>
        </button>
      </div>

      <!-- SECTIONS ACTIONS INTERACTIVES -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        <!-- BLOC 1 : INFOS DE LIVRAISON -->
        <div class="bg-white rounded-2xl p-6 border border-creme2 flex flex-col justify-between shadow-sm transition-all duration-300 hover:shadow-md">
          <div>
            <div class="flex items-center justify-between mb-6">
              <div class="flex items-center gap-3">
                <div class="p-2 bg-gray-50 rounded-xl border border-gray-100">
                  <MapPinIcon class="w-5 h-5 text-foret" />
                </div>
                <h3 class="font-display font-bold text-lg">Infos de livraison</h3>
              </div>
              <button 
                v-if="!chargementInfos && !estEnEdition" 
                @click="activerEdition"
                class="cursor-pointer text-sm text-foret hover:text-savane font-semibold focus:outline-none transition-colors flex items-center gap-1"
              >
                <Edit3Icon class="w-3.5 h-3.5" />
                <span>{{ clientInfos.telephone ? 'Modifier' : 'Ajouter' }}</span>
              </button>
            </div>

            <!-- Squelette de chargement épuré -->
            <div v-if="chargementInfos" class="animate-pulse space-y-3 py-2">
              <div class="h-5 bg-gray-100 rounded-lg w-1/3"></div>
              <div class="h-4 bg-gray-100 rounded-lg w-3/4"></div>
              <div class="h-4 bg-gray-100 rounded-lg w-1/2"></div>
            </div>

            <!-- Mode lecture standard -->
            <div v-else-if="!estEnEdition" class="">
              <div v-if="clientInfos.telephone || clientInfos.quartier" class="p-4 rounded-xl border border-gray-100/50">
                <p class="font-bold text-foret text-base mb-1">{{ clientInfos.quartier || "" }}</p>
                <p class="text-gris text-sm leading-relaxed mb-3 font-medium">{{ clientInfos.adresse || "" }}</p>
                <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-100 rounded-lg text-sm font-semibold shadow-2xl">
                  <PhoneIcon class="w-4 h-4 text-foret opacity-80" />
                  <span>{{ clientInfos.telephone }}</span>
                </div>
              </div>
              <div v-else class="text-sm text-gris italic py-4 flex flex-col items-center gap-2 border border-dashed border-gray-200 rounded-xl bg-gray-50/30">
                <p>Aucune information enregistrée pour la livraison.</p>
              </div>
            </div>

            <!-- Mode Formulaire épuré avec focus moderne -->
            <form v-else @submit.prevent="sauvegarderInfos" class="space-y-4 animate-fadeIn">
              <div>
                <label class="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Téléphone (WhatsApp)</label>
                <input 
                  v-model="formFormulaire.telephone" 
                  type="tel" 
                  placeholder="Ex: 97000000" 
                  required
                  class="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-2 focus:ring-foret/10 bg-gray-50/30 transition-all font-medium"
                />
              </div>

              <div>
                <label class="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Quartier / Ville</label>
                <input 
                  v-model="formFormulaire.quartier" 
                  type="text" 
                  placeholder="Ex: Akassato, Calavi" 
                  required
                  class="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-2 focus:ring-foret/10 bg-gray-50/30 transition-all font-medium"
                />
              </div>

              <div>
                <label class="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Précisions (Maison, repère...)</label>
                <textarea 
                  v-model="formFormulaire.adresse" 
                  rows="2"
                  placeholder="Ex: Maison verte en face de la pharmacie..." 
                  required
                  class="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-2 focus:ring-foret/10 bg-gray-50/30 transition-all font-medium resize-none"
                ></textarea>
              </div>

              <div class="flex items-center gap-3 pt-2">
                <button 
                  type="submit" 
                  :disabled="enCoursDeSauvegarde"
                  class="cursor-pointer flex-1 bg-foret text-white text-sm font-bold px-4 py-3 rounded-xl hover:bg-opacity-95 transition-all shadow-sm active:scale-[0.99] disabled:opacity-50"
                >
                  {{ enCoursDeSauvegarde ? 'Enregistrement...' : 'Enregistrer les détails' }}
                </button>
                <button 
                  type="button" 
                  @click="estEnEdition = false"
                  class="cursor-pointer px-4 py-3 border border-gray-200 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- BLOC 2 : COMMANDER RAPIDEMENT (FORMULES) -->
        <div class="bg-white rounded-2xl p-6 border border-creme2 flex flex-col justify-between shadow-sm transition-all duration-300 hover:shadow-md">
          <div>
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-3">
                <div class="p-2 bg-gray-50 rounded-xl border border-gray-100">
                  <ShoppingBagIcon class="w-5 h-5 text-foret" />
                </div>
                <h3 class="font-display font-bold text-lg">Commander rapidement</h3>
              </div>
              <span v-if="sauvegardeEnCours" class="text-xs bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full font-semibold animate-pulse border border-amber-100">Mise à jour...</span>
            </div>
            
            <p class="text-gris text-sm leading-relaxed mb-6 font-medium">
              Faites le choix du pack qui vous convient et lancez la commande en un clic.
            </p>

            <div v-if="chargementInfos" class="space-y-3 mb-4 animate-pulse">
              <div class="h-14 bg-gray-100 rounded-xl w-full"></div>
              <div class="h-14 bg-gray-100 rounded-xl w-full"></div>
            </div>

            <!-- CARTES DE FORMULES INTELLIGENTES -->
            <div v-else class="space-y-3 mb-6">
              <div 
                v-for="formule in formulesApi" 
                :key="formule._id"
                :class="[
                  'flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all duration-200 select-none transform hover:-translate-y-0.5',
                  clientInfos.formuleHabituelle === formule.nom 
                    ? 'border-foret bg-foret/[0.02] shadow-sm ring-2 ring-foret/20' 
                    : 'border-gray-100 hover:border-gray-300 hover:shadow-sm bg-white'
                ]"
                @click="changerFormule(formule)"
              >
                <div class="flex items-center gap-4">
                  <span class="text-2xl filter drop-shadow-sm select-none">{{ formule.emoji }}</span>
                  <div>
                    <p class="font-bold text-sm" :class="clientInfos.formuleHabituelle === formule.nom ? 'text-foret' : 'text-noir'">{{ formule.nom }}</p>
                    <p class="text-xs text-gris font-medium mt-0.5">{{ formule.prixActuel }} FCFA · {{ formule.cible.split('·')[0] }}</p>
                  </div>
                </div>
                
                <!-- Radio moderne -->
                <div 
                  :class="[
                    'w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-200',
                    clientInfos.formuleHabituelle === formule.nom ? 'border-foret bg-foret' : 'border-gray-300'
                  ]"
                >
                  <div v-if="clientInfos.formuleHabituelle === formule.nom" class="w-2 h-2 rounded-full bg-white scale-100 transition-transform"></div>
                </div>
              </div>
            </div>
          </div>

          <button 
            @click="lancerCommande" 
            class="cursor-pointer inline-flex items-center justify-center gap-2 w-full px-5 py-3.5 bg-foret text-white font-bold rounded-xl hover:bg-savane shadow-sm hover:shadow transition-all duration-200 text-sm active:scale-[0.99]"
          >
            <span>Confirmer et commander</span>
            <ArrowRightIcon class="w-4 h-4" />
          </button>
        </div>        
      </div>

      <!-- HISTORIQUE DES COMMANDES RESPONSIVE -->
      <div class="bg-white rounded-2xl p-6 border border-creme2 shadow-sm transition-all duration-300 hover:shadow-md">
        <div class="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
          <div class="p-2 bg-gray-50 rounded-xl border border-gray-100">
            <HistoryIcon class="w-5 h-5 text-foret" />
          </div>
          <h2 class="font-display font-bold text-xl">Historique de mes commandes</h2>
        </div>
        
        <div v-if="chargementCommandes" class="flex flex-col items-center py-16 gap-3">
          <div class="w-10 h-10 border-[3px] border-foret border-t-transparent rounded-full animate-spin"></div>
          <p class="text-gris text-sm font-medium">Chargement des données...</p>
        </div>

        <div v-else-if="commandes.length === 0" class="text-center py-16 text-gris font-medium border border-dashed border-gray-200 rounded-xl bg-gray-50/20">
          Vous n'avez pas encore passé de commande active.
        </div>

        <div v-else>
          <!-- VUE DE DESKTOP (Cache sur mobile) -->
          <div class="hidden md:block overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="text-gray-400 text-xs font-bold uppercase tracking-wider border-b border-gray-100 pb-3">
                  <th class="pb-3 font-bold">N° Commande</th>
                  <th class="pb-3 font-bold">Pack Commandé</th>
                  <th class="pb-3 font-bold">Date</th>
                  <th class="pb-3 font-bold">Total</th>
                  <th class="pb-3 font-bold">Statut</th>
                  <th class="pb-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50 text-sm font-medium">
                <tr v-for="commande in commandes" :key="commande._id" class="hover:bg-gray-50/50 transition-colors group">
                  <td class="py-4 font-bold text-foret">
                    {{ `#CMD-${commande._id.substring(commande._id.length - 4).toUpperCase()}` }}
                  </td>
                  <td class="py-4 text-gray-700">{{ commande.formule }}</td>
                  <td class="py-4 text-gris font-normal">{{ commande.date }}</td>
                  <td class="py-4 font-bold">{{ commande.total }}</td>
                  <td class="py-4">
                    <span :class="[
                      'px-3 py-1 rounded-full text-xs font-bold tracking-wide inline-block shadow-sm',
                      commande.statut === 'Livré' ? 'bg-green-50 text-green-700 border border-green-100' :
                      commande.statut === 'En attente' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 
                      'bg-red-50 text-red-700 border border-red-100'
                    ]">
                      {{ commande.statut }}
                    </span>
                  </td>
                  <td class="py-4 text-right">
                    <div v-if='commande.statut === "En attente"' class="opacity-80 group-hover:opacity-100 transition-opacity">
                      <button 
                        @click="annulerCommande(commande._id)" 
                        title="Annuler la commande"
                        class="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95 inline-flex items-center justify-center border border-red-100/50"
                      >
                        <XIcon class="w-4 h-4" />
                      </button>
                    </div>

                    <div v-if="commande.statut === 'Livré'" class="opacity-80 group-hover:opacity-100 transition-opacity">
                      <button 
                        @click="telechargerRecu(commande)" 
                        class="p-2.5 bg-green-50 text-green-700 rounded-xl hover:bg-green-600 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95 inline-flex items-center justify-center border border-green-100/50 text-xs font-bold gap-1.5"
                      >
                        <DownloadIcon class="w-4 h-4" />
                        <span>Télécharger le reçu</span>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- VUE RESPONSIVE MOBILE (Cartes fluides verticales) -->
          <div class="block md:hidden space-y-4">
            <div v-for="commande in commandes" :key="commande._id" class="bg-gray-50/60 rounded-xl p-4 border border-gray-100 flex flex-col gap-3 relative">
              <div class="flex justify-between items-start">
                <div>
                  <span class="text-xs text-gray-400 font-bold uppercase block">ID Unique</span>
                  <span class="font-bold text-foret">{{ `#CMD-${commande._id.substring(commande._id.length - 4).toUpperCase()}` }}</span>
                </div>
                <span :class="[
                  'px-3 py-1 rounded-full text-xs font-bold tracking-wide shadow-sm',
                  commande.statut === 'Livré' ? 'bg-green-50 text-green-700 border border-green-100' :
                  commande.statut === 'En attente' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 
                  'bg-red-50 text-red-700 border border-red-100'
                ]">
                  {{ commande.statut }}
                </span>
              </div>
              
              <div class="grid grid-cols-2 gap-2 border-t border-b border-gray-100/80 py-2.5 my-0.5 text-sm">
                <div>
                  <span class="text-[11px] text-gray-400 font-bold uppercase block">Formule</span>
                  <span class="font-semibold text-gray-800">{{ commande.formule }}</span>
                </div>
                <div>
                  <span class="text-[11px] text-gray-400 font-bold uppercase block">Prix payé</span>
                  <span class="font-bold text-noir">{{ commande.total }} FCFA</span>
                </div>
              </div>

              <div class="flex items-center justify-between text-xs pt-1">
                <span class="text-gris font-medium">{{ commande.date }}</span>
                <button 
                  v-if='commande.statut === "En attente"'
                  @click="annulerCommande(commande._id)"
                  class="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-600 hover:text-white transition-all active:scale-95"
                >
                  <XIcon class="w-3.5 h-3.5" />
                  <span>Annuler</span>
                </button>
                <button 
                  v-else-if="commande.statut === 'Livré'"
                  @click="telechargerRecu(commande)"
                  class="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 rounded-xl font-bold hover:bg-green-600 hover:text-white transition-all active:scale-95"
                >
                  <DownloadIcon class="w-3.5 h-3.5" />
                  <span>Reçu PDF</span>
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* Un petit effet de fade-in pour adoucir le rendu au chargement */
.animate-fadeIn {
  animation: fadeIn 0.4s ease-out forwards;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>