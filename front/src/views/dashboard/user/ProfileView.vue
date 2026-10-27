<script setup lang="ts">
import { messageErreur } from '@/services/erreurs'
import { ref, onMounted, computed, reactive, defineAsyncComponent } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import api from '@/stores/api';
import { 
  MapPinIcon, Edit3Icon, PhoneIcon, MailIcon, 
  ShoppingBagIcon, ArrowRightIcon, HistoryIcon, 
  LogOutIcon, XIcon, DownloadIcon, GlobeIcon
} from 'lucide-vue-next';
import { genererRecuPDF } from '@/services/pdfRecuCommande';
import { ANNULABLES_PAR_CLIENT, classeStatut, type StatutCommande } from '@/config/commandes';
import SuiviAlimentaire from '@/components/client/SuiviAlimentaire.vue';
import MonAvis from '@/components/client/MonAvis.vue';
import LignesAchatLibre from '@/components/client/LignesAchatLibre.vue';
import { useDeconnexion } from '@/composables/useDeconnexion';
import { lienWhatsApp } from '@/config/contact';
import { estAchatLibre, nombreAChiffrer, type DemandeLibre, type LigneAchatLibre } from '@/config/vip';
import { texteLivraison, type InfosLivraison } from '@/services/messagesCommande';

// Bandeau des fiches produits et bloc VIP : chargés à part, sans retarder le reste de l'espace client
const BandeauFiches = defineAsyncComponent(() => import('@/components/client/BandeauFiches.vue'));
const AchatsLibresVip = defineAsyncComponent(() => import('@/components/client/AchatsLibresVip.vue'));

interface Commande {
  id: string;
  _id: string;
  reference?: string;
  formule: string
  date: string;
  total: string;
  statut: StatutCommande;
  facture_url?: string;
  createdAt: Date
  // Achat libre VIP : lignes au prix VIP et demandes libres (chiffrées, à chiffrer ou retirées)
  typeCommande?: 'pack' | 'achat-libre';
  lignes?: LigneAchatLibre[];
  demandesLibres?: DemandeLibre[];
}

interface Formule {
  _id: string;
  slug: string;
  nom: string;
  emoji: string;
  prixActuel: number | null; // Vide : prix à définir
  prixCommercial?: number | null;
  bientotDisponible?: boolean;
  cible: string;
}

// Prix de vente affiché et facturé : prix commercial fixé par l'admin, sinon prix officiel
const prixDeVente = (formule: Formule) => formule.prixCommercial ?? formule.prixActuel ?? null;
const formaterFCFA = (montant: number) => `${montant.toLocaleString('fr-FR')} FCFA`;

// 1. Authentification et Routage
const authStore = useAuthStore();
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
  telephone:'',
  zone: null as string | null,
  lienLocalisation: ''
});

// Zones de livraison (arrondissements de Cotonou et d'Abomey-Calavi) pour le choix du quartier
interface ZoneLivraison {
  code: string;
  commune: string;
  nom: string;
  quartiers: string[];
  prioritaire: boolean;
}
const zones = ref<ZoneLivraison[]>([]);
const AUTRE_QUARTIER = '__autre__';

const nomZone = (code: string | null) => {
  const zone = zones.value.find(z => z.code === code);
  return zone ? `${zone.nom}, ${zone.commune}` : '';
};

// Infos de livraison reprises dans les messages WhatsApp (pack et achat libre VIP)
const infosLivraison = computed<InfosLivraison>(() => ({
  quartier: clientInfos.value.quartier,
  zone: nomZone(clientInfos.value.zone),
  adresse: clientInfos.value.adresse,
  lienLocalisation: clientInfos.value.lienLocalisation,
  telephone: clientInfos.value.telephone,
}));

// Historique : détail d'un achat libre ouvert (tableau sur ordinateur)
const detailOuvert = ref<string | null>(null);

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
    zone: authStore.user?.value?.zone || null,
    lienLocalisation: authStore.user?.value?.lienLocalisation || '',
  };
  chargementInfos.value = false;

  try {
    const [commandesRes, formulesRes, zonesRes] = await Promise.all([
      api.get('/api/auth/my-orders', { withCredentials: true }),  // Récupère l'historique de ses commandes
      api.get('/api/auth/formules'),                                    // Récupère la liste des formules actives
      api.get('/api/public/zones')                                      // Quartiers proposés pour l'adresse
    ]);
    zones.value = zonesRes.data;

    // 2. Assignation de l'historique des commandes
    commandes.value = commandesRes.data.map((cmd : Commande) => ({
      _id: cmd._id,
      reference: cmd.reference,
      formule: cmd.formule,
      date: new Date(cmd.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
      total: formaterFCFA(Number(cmd.total)),
      statut: cmd.statut,
      typeCommande: cmd.typeCommande,
      lignes: cmd.lignes,
      demandesLibres: cmd.demandesLibres,
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

// Déconnexion : confirmation, fermeture de la session puis retour à l'accueil du site
const { seDeconnecter, deconnexionEnCours } = useDeconnexion();

// Initialisation des Infos du formulaire
const formFormulaire = reactive({
  telephone: '',
  choixQuartier: '', // "code-zone|Quartier" ou AUTRE_QUARTIER
  quartierLibre: '',
  adresse: '',
  lienLocalisation: ''
});

// Activer le mode édition en pré-remplissant avec les infos existantes
const activerEdition = () => {
  formFormulaire.telephone = clientInfos.value.telephone || '';
  const { zone, quartier } = clientInfos.value;
  formFormulaire.choixQuartier = zone ? `${zone}|${quartier}` : (quartier ? AUTRE_QUARTIER : '');
  formFormulaire.quartierLibre = zone ? '' : quartier || '';
  formFormulaire.adresse = clientInfos.value.adresse || '';
  formFormulaire.lienLocalisation = clientInfos.value.lienLocalisation || '';
  estEnEdition.value = true;
};

// Fonction pour sauvegarder les infos (Appel API vers ton back Express)
const sauvegarderInfos = async () => {
  const autre = formFormulaire.choixQuartier === AUTRE_QUARTIER;
  const [zone, quartierListe] = autre ? [null, ''] : formFormulaire.choixQuartier.split('|');
  const payload = {
    telephone: formFormulaire.telephone,
    quartier: autre ? formFormulaire.quartierLibre : quartierListe,
    zone,
    adresse: formFormulaire.adresse,
    lienLocalisation: formFormulaire.lienLocalisation
  };

  enCoursDeSauvegarde.value = true;
  try {
    const response = await api.post('/api/auth/user/delivery-info', payload);

    // On met à jour l'affichage principal avec ce que le serveur a enregistré
    const enregistre = response.data.user;
    clientInfos.value.telephone = enregistre.telephone;
    clientInfos.value.quartier = enregistre.quartier;
    clientInfos.value.adresse = enregistre.adresse;
    clientInfos.value.zone = enregistre.zone;
    clientInfos.value.lienLocalisation = enregistre.lienLocalisation;

    estEnEdition.value = false; // On ferme le formulaire
    toast.success(response.data.message)
  } catch (error) {
    console.error("Erreur lors de l'enregistrement des infos", error);
    toast.error(messageErreur(error, "Impossible d'enregistrer vos informations de livraison."));
  } finally {
    enCoursDeSauvegarde.value = false;
  }
};

// Génère le lien WhatsApp de commande avec les infos de livraison.
// Le montant et la référence proviennent de la commande enregistrée par le serveur quand elle existe.
const genererLienWhatsApp = (commande?: { reference: string; total: number }) => {
  // On cherche les infos de la formule actuellement sélectionnée dans notre liste API
  const formuleChoisie = formulesApi.value.find(f => f.nom === clientInfos.value.formuleHabituelle);
  const montant = commande?.total ?? (formuleChoisie ? prixDeVente(formuleChoisie) : null);

  // Construction du texte personnalisé
  let message = `Bonjour Ahitché ! 👋\n\n`;
  message += `Je souhaite commander la formule *${clientInfos.value.formuleHabituelle}*`;
  message += montant ? ` (${formaterFCFA(montant)}).\n` : `.\n`;
  message += commande ? `Référence de commande : *${commande.reference}*\n\n` : `\n`;
  
  // Infos de livraison (ou rappel qu'elles manquent), communes aux messages des packs et des achats libres
  message += texteLivraison(infosLivraison.value);

  return lienWhatsApp(message);
};

// Fonction pour générer le lien WhatsApp d'annulation pour une commande spécifique
const genererLienAnnulation = (commande: Commande) => {
  // Construction du texte d'annulation clair et précis
  let message = `Bonjour Ahitché ! ❌\n\n`;
  message += `Je souhaite annuler ma commande *${commande.reference || commande._id}*.\n\n`;
  message += `📍 *Détails de la commande à annuler :*\n`;
  message += `- *Formule :* ${commande.formule || clientInfos.value.formuleHabituelle}\n`;
  message += `- *Montant :* ${commande.total}\n`;
  message += `- *Date du lancement :* ${commande.date}\n\n`;
  message += `Merci de prendre en compte ma demande d'annulation.`;

  return lienWhatsApp(message);
};

const commandeEnCours = ref(false);

const lancerCommande = async () => {
  if (commandeEnCours.value) return;

  // 1. Formule choisie : on envoie son slug, le serveur fixe lui-même le prix
  const formuleChoisie = formulesApi.value.find(f => f.nom === clientInfos.value.formuleHabituelle);
  const payload = { formule: formuleChoisie?.slug || clientInfos.value.formuleHabituelle };

  // 2. On ouvre l'onglet WhatsApp tout de suite, pendant le clic : ouvert après l'appel API,
  //    il serait bloqué par les navigateurs mobiles
  const fenetreWhatsApp = window.open('', '_blank');
  if (fenetreWhatsApp) fenetreWhatsApp.opener = null;

  commandeEnCours.value = true;
  let lien: string;
  try {
    // 3. Enregistrement de la commande en base
    const response = await api.post('/api/auth/save/orders', payload);
    const { reference, total } = response.data.commande;
    toast.success(`Commande ${reference} enregistrée. Finalisez-la sur WhatsApp.`);
    lien = genererLienWhatsApp({ reference, total });
  } catch (error) {
    // La commande reste possible sur WhatsApp, mais le client sait qu'elle n'est pas dans son historique
    toast.error(messageErreur(error, "Votre commande n'a pas pu être enregistrée. Vous pouvez la finaliser directement sur WhatsApp."));
    lien = genererLienWhatsApp();
  } finally {
    commandeEnCours.value = false;
  }

  if (fenetreWhatsApp) {
    fenetreWhatsApp.location.href = lien;
  } else {
    window.location.href = lien; // Popup refusée : on bascule dans l'onglet courant
  }
  await fetchDashboardData();
};

const annulerCommande = async (commande_id : string) => {
  const commande = commandes.value.find(c => c._id === commande_id);

  if (!commande) {
    toast.error("Commande introuvable");
    return;
  }
  
  try {
    const response = await api.delete(`/api/auth/delete/order/${commande_id}`);
    toast.success(response.data.message);
  } catch (error) {
    console.error("Impossible d'annuler la commande", error);
    toast.error(messageErreur(error, "Impossible d'annuler la commande"))
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
      reference: commande.reference,
      formule: commande.formule,
      date: commande.date,
      total: commande.total,
      clientNom: authStore.user?.value?.username || 'Client',
      clientEmail: authStore.user?.value?.email || '',
      clientPhone: clientInfos.value.telephone,
      clientQuartier: clientInfos.value.quartier,
      clientAdresse: clientInfos.value.adresse,
      // Achat libre VIP : le reçu détaille ses lignes et ses demandes libres
      ...(estAchatLibre(commande) ? { lignes: commande.lignes ?? [], demandesLibres: commande.demandesLibres ?? [] } : {})
    });
    toast.success("Reçu téléchargé avec succès !");
  } catch (error) {
    console.error("Erreur génération PDF:", error);
    toast.error("Impossible de générer le reçu pour le moment.");
  }
};

onMounted(async () => {
  await authStore.checkSession();
  
  if (!authStore.isAuthenticated.value) {
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
        <div class="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <!-- Consulter le site sans se déconnecter : « Mon espace », dans le menu du site, ramène ici -->
          <RouterLink
            to="/"
            class="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-foret/20 text-foret hover:bg-foret/5 font-semibold transition-all duration-200 text-sm flex items-center justify-center gap-2"
          >
            <GlobeIcon class="w-4 h-4" />
            <span>Voir le site</span>
          </RouterLink>
          <button 
            @click="seDeconnecter" 
            :disabled="deconnexionEnCours"
            class="cursor-pointer w-full sm:w-auto px-5 py-2.5 rounded-xl border border-gray-200 text-gris hover:text-red-600 hover:bg-red-50 hover:border-red-100 font-semibold transition-all duration-200 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <LogOutIcon class="w-4 h-4" />
            <span>{{ deconnexionEnCours ? 'Déconnexion...' : 'Déconnexion' }}</span>
          </button>
        </div>
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
                <p v-if="nomZone(clientInfos.zone)" class="text-xs text-gris mb-1">{{ nomZone(clientInfos.zone) }}</p>
                <p class="text-gris text-sm leading-relaxed mb-3 font-medium">{{ clientInfos.adresse || "" }}</p>
                <a v-if="clientInfos.lienLocalisation" :href="clientInfos.lienLocalisation" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs font-semibold text-savane underline mb-3">
                  <MapPinIcon class="w-3.5 h-3.5" /> Voir ma localisation
                </a>
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
                <label class="block text-xs font-bold uppercase tracking-wider text-gris mb-1.5">Téléphone (WhatsApp)</label>
                <input 
                  v-model="formFormulaire.telephone" 
                  type="tel" 
                  placeholder="Ex: 97000000" 
                  required
                  class="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-2 focus:ring-foret/10 bg-gray-50/30 transition-all font-medium"
                />
              </div>

              <div>
                <label for="livraison-quartier" class="block text-xs font-bold uppercase tracking-wider text-gris mb-1.5">Quartier</label>
                <select
                  id="livraison-quartier"
                  v-model="formFormulaire.choixQuartier"
                  required
                  class="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-2 focus:ring-foret/10 bg-gray-50/30 transition-all font-medium"
                >
                  <option value="" disabled>Choisissez votre quartier</option>
                  <optgroup v-for="zone in zones" :key="zone.code" :label="`${zone.nom} · ${zone.commune}`">
                    <option v-for="q in zone.quartiers" :key="q" :value="`${zone.code}|${q}`">{{ q }}</option>
                  </optgroup>
                  <option :value="AUTRE_QUARTIER">Autre quartier (je le saisis)</option>
                </select>
              </div>

              <div v-if="formFormulaire.choixQuartier === AUTRE_QUARTIER">
                <label for="livraison-quartier-libre" class="block text-xs font-bold uppercase tracking-wider text-gris mb-1.5">Nom du quartier</label>
                <input
                  id="livraison-quartier-libre"
                  v-model="formFormulaire.quartierLibre"
                  type="text"
                  placeholder="Ex : Calavi Kpota"
                  required
                  class="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-2 focus:ring-foret/10 bg-gray-50/30 transition-all font-medium"
                />
              </div>

              <div>
                <label class="block text-xs font-bold uppercase tracking-wider text-gris mb-1.5">Précisions (Maison, repère...)</label>
                <textarea 
                  v-model="formFormulaire.adresse" 
                  rows="2"
                  placeholder="Ex: Maison verte en face de la pharmacie..."
                  required
                  class="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-2 focus:ring-foret/10 bg-gray-50/30 transition-all font-medium resize-none"
                ></textarea>
              </div>

              <div>
                <label for="livraison-lien" class="block text-xs font-bold uppercase tracking-wider text-gris mb-1.5">Lien de localisation (facultatif)</label>
                <input
                  id="livraison-lien"
                  v-model="formFormulaire.lienLocalisation"
                  type="url"
                  inputmode="url"
                  placeholder="https://maps.app.goo.gl/…"
                  class="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-2 focus:ring-foret/10 bg-gray-50/30 transition-all font-medium"
                />
                <p class="text-[11px] text-gris mt-1">Lien Google Maps ou position partagée sur WhatsApp : votre livreur vous trouve plus vite.</p>
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
                  'flex items-center justify-between gap-3 p-4 rounded-xl border transition-all duration-200 select-none',
                  formule.bientotDisponible
                    ? 'border-dashed border-gray-200 bg-creme/50 opacity-70 cursor-not-allowed'
                    : clientInfos.formuleHabituelle === formule.nom
                      ? 'cursor-pointer transform hover:-translate-y-0.5 border-foret bg-foret/[0.02] shadow-sm ring-2 ring-foret/20'
                      : 'cursor-pointer transform hover:-translate-y-0.5 border-gray-100 hover:border-gray-300 hover:shadow-sm bg-white'
                ]"
                :aria-disabled="formule.bientotDisponible ? 'true' : undefined"
                @click="!formule.bientotDisponible && changerFormule(formule)"
              >
                <div class="flex items-center gap-4">
                  <span class="text-2xl filter drop-shadow-sm select-none" aria-hidden="true">{{ formule.emoji }}</span>
                  <div>
                    <p class="font-bold text-sm" :class="clientInfos.formuleHabituelle === formule.nom ? 'text-foret' : 'text-noir'">{{ formule.nom }}</p>
                    <p class="text-xs text-gris font-medium mt-0.5">{{ prixDeVente(formule) === null ? 'Prix à définir' : formaterFCFA(prixDeVente(formule)!) }} · {{ formule.cible.split('·')[0] }}</p>
                  </div>
                </div>

                <span v-if="formule.bientotDisponible" class="text-[11px] font-bold uppercase tracking-wider text-savane bg-savane/10 px-2.5 py-1 rounded-full whitespace-nowrap shrink-0">
                  Bientôt
                </span>

                <!-- Radio moderne -->
                <div v-else
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
            :disabled="commandeEnCours"
            class="cursor-pointer inline-flex items-center justify-center gap-2 w-full px-5 py-3.5 bg-foret text-white font-bold rounded-xl hover:bg-savane shadow-sm hover:shadow transition-all duration-200 text-sm active:scale-[0.99] disabled:opacity-50"
          >
            <span>{{ commandeEnCours ? 'Enregistrement...' : 'Confirmer et commander' }}</span>
            <ArrowRightIcon class="w-4 h-4" />
          </button>
        </div>        
      </div>

      <!-- FICHES PRODUITS (bandeau publicitaire ; caché s'il n'y a aucune fiche) -->
      <BandeauFiches />

      <!-- CODE VIP, PUIS ACHATS LIBRES AU PRIX VIP -->
      <AchatsLibresVip :livraison="infosLivraison" @commandee="fetchDashboardData" />

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
          <div v-defilable="'Historique de mes commandes'" class="hidden md:block overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="text-gris text-xs font-bold uppercase tracking-wider border-b border-gray-100 pb-3">
                  <th class="pb-3 font-bold">N° Commande</th>
                  <th class="pb-3 font-bold">Pack Commandé</th>
                  <th class="pb-3 font-bold">Date</th>
                  <th class="pb-3 font-bold">Total</th>
                  <th class="pb-3 font-bold">Statut</th>
                  <th class="pb-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50 text-sm font-medium">
                <template v-for="commande in commandes" :key="commande._id">
                <tr class="hover:bg-creme/50 transition-colors group">
                  <td class="py-4 font-bold text-foret">
                    {{ commande.reference || `#CMD-${commande._id.substring(commande._id.length - 4).toUpperCase()}` }}
                  </td>
                  <td class="py-4 text-noir">
                    {{ commande.formule }}
                    <!-- Achat libre VIP : produits et demandes libres dans une ligne dépliable -->
                    <template v-if="estAchatLibre(commande)">
                      <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-or text-noir align-middle">VIP</span>
                      <button
                        type="button"
                        class="cursor-pointer flex items-center min-h-11 text-xs font-semibold text-foret underline"
                        :aria-expanded="detailOuvert === commande._id"
                        :aria-controls="`detail-${commande._id}`"
                        @click="detailOuvert = detailOuvert === commande._id ? null : commande._id"
                      >
                        {{ detailOuvert === commande._id ? 'Masquer le détail' : 'Voir le détail' }}
                      </button>
                    </template>
                  </td>
                  <td class="py-4 text-gris font-normal">{{ commande.date }}</td>
                  <td class="py-4 font-bold">
                    {{ commande.total }}
                    <span v-if="nombreAChiffrer(commande.demandesLibres)" class="block text-[11px] font-normal text-gris">+ demandes libres (prix à confirmer)</span>
                  </td>
                  <td class="py-4">
                    <span :class="['px-3 py-1 rounded-full text-xs font-bold tracking-wide inline-block whitespace-nowrap', classeStatut(commande.statut)]">
                      {{ commande.statut }}
                    </span>
                  </td>
                  <td class="py-4 text-right">
                    <div v-if='ANNULABLES_PAR_CLIENT.includes(commande.statut)' class="opacity-80 group-hover:opacity-100 transition-opacity">
                      <button 
                        @click="annulerCommande(commande._id)" 
                        title="Annuler la commande"
                        class="p-2.5 bg-red-50 text-red-800 rounded-xl hover:bg-red-600 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95 inline-flex items-center justify-center border border-red-100/50"
                      >
                        <XIcon class="w-4 h-4" />
                      </button>
                    </div>

                    <div v-if="commande.statut === 'Livrée'" class="opacity-80 group-hover:opacity-100 transition-opacity">
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
                <tr v-if="estAchatLibre(commande) && detailOuvert === commande._id" :id="`detail-${commande._id}`">
                  <td colspan="6" class="pb-4 pt-1">
                    <div class="rounded-xl bg-creme/60 px-4 py-2">
                      <LignesAchatLibre :lignes="commande.lignes" :demandes="commande.demandesLibres" />
                    </div>
                  </td>
                </tr>
                </template>
              </tbody>
            </table>
          </div>

          <!-- VUE RESPONSIVE MOBILE (Cartes fluides verticales) -->
          <div class="block md:hidden space-y-4">
            <div v-for="commande in commandes" :key="commande._id" class="bg-gray-50/60 rounded-xl p-4 border border-gray-100 flex flex-col gap-3 relative">
              <div class="flex justify-between items-start">
                <div>
                  <span class="text-xs text-gris font-bold uppercase block">ID Unique</span>
                  <span class="font-bold text-foret">{{ commande.reference || `#CMD-${commande._id.substring(commande._id.length - 4).toUpperCase()}` }}</span>
                </div>
                <span :class="['px-3 py-1 rounded-full text-xs font-bold tracking-wide whitespace-nowrap', classeStatut(commande.statut)]">
                  {{ commande.statut }}
                </span>
              </div>
              
              <div class="grid grid-cols-2 gap-2 border-t border-b border-gray-100/80 py-2.5 my-0.5 text-sm">
                <div>
                  <span class="text-[11px] text-gris font-bold uppercase block">Formule</span>
                  <span class="font-semibold text-noir">{{ commande.formule }}</span>
                  <span v-if="estAchatLibre(commande)" class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-or text-noir align-middle">VIP</span>
                </div>
                <div>
                  <span class="text-[11px] text-gris font-bold uppercase block">Total</span>
                  <span class="font-bold text-noir">{{ commande.total }}</span>
                  <span v-if="nombreAChiffrer(commande.demandesLibres)" class="block text-[11px] text-gris">+ demandes libres (prix à confirmer)</span>
                </div>
              </div>

              <!-- Achat libre VIP : produits et demandes libres -->
              <details v-if="estAchatLibre(commande)" class="rounded-xl bg-white border border-creme2 px-3">
                <summary class="cursor-pointer min-h-11 flex items-center text-sm font-semibold text-foret">Voir le détail</summary>
                <div class="pb-2">
                  <LignesAchatLibre :lignes="commande.lignes" :demandes="commande.demandesLibres" />
                </div>
              </details>

              <div class="flex items-center justify-between text-xs pt-1">
                <span class="text-gris font-medium">{{ commande.date }}</span>
                <button 
                  v-if='ANNULABLES_PAR_CLIENT.includes(commande.statut)'
                  @click="annulerCommande(commande._id)"
                  class="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-800 rounded-xl font-bold hover:bg-red-600 hover:text-white transition-all active:scale-95"
                >
                  <XIcon class="w-3.5 h-3.5" />
                  <span>Annuler</span>
                </button>
                <button 
                  v-else-if="commande.statut === 'Livrée'"
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

      <!-- MON AVIS (publié sur l'accueil après validation de l'admin) -->
      <MonAvis />

      <!-- SUIVI ALIMENTAIRE (questionnaire, conseils, menus) -->
      <SuiviAlimentaire />
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