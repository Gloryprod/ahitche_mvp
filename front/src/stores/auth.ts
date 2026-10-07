import { ref, computed } from 'vue';
import axios from 'axios';
import { EQUIPE, type Role } from '@/config/roles';

// On configure Axios pour qu'il envoie automatiquement les cookies aux requêtes Cross-Origin
const API_URL = import.meta.env.PROD 
  ? 'https://api.ahitchebj.com' // En ligne : ton sous-domaine
  : '';

axios.defaults.baseURL = API_URL;
axios.defaults.withCredentials = true;

interface User {
  id: string;
  email: string;
  username: string;
  role: Role;
  adresse: string;
  quartier: string;
  telephone: string;
  formuleHabituelle: string;
  zone?: string | null; // Code de la zone de livraison (null : « Autre quartier »)
  lienLocalisation?: string;
}

// Les variables restent en mémoire globale (très sécurisé)
const user = ref<User | null>(null);
const isInitialized = ref(false); // Permet de savoir si on a vérifié la session
let verificationEnCours: Promise<void> | null = null; // Une seule requête si plusieurs vérifications se croisent
// Minutes sans activité avant la déconnexion automatique (équipe sauf admin principal) ; null : pas de limite
const inactivite = ref<number | null>(null);

export function useAuthStore() {
  const isAuthenticated = computed(() => !!user.value);
  const isAdmin = computed(() => !!user.value && user.value.role === 'admin');
  const role = computed<Role | undefined>(() => user.value?.role);
  const isEquipe = computed(() => !!user.value && EQUIPE.includes(user.value.role));

  // Récupère l'utilisateur connecté (au chargement du site, à l'entrée d'un espace protégé).
  // /api/auth/session répond toujours 200 (user: null pour un visiteur) : pas d'erreur dans la console.
  // Les appels simultanés (accueil + garde du routeur) partagent la même requête.
  function checkSession() {
    verificationEnCours ??= axios.get('/api/auth/session')
      .then(response => {
        user.value = response.data.user;
        inactivite.value = response.data.inactivite ?? null;
      })
      .catch(() => {
        user.value = null;
        inactivite.value = null;
      })
      .finally(() => {
        isInitialized.value = true;
        verificationEnCours = null;
      });
    return verificationEnCours;
  }

  async function login(credentials: { email?: string; password?: string }) {
    // Le serveur Express va injecter le cookie HttpOnly ici.
    // En cas d'erreur, c'est le composant appelant qui affiche le message (un seul toast).
    const response = await axios.post('/api/auth/login', credentials);
    inactivite.value = response.data.inactivite ?? null;
    const sessionUser = response.data.user ?? null;

    if (sessionUser) {
      user.value = {
        id: sessionUser.id,
        email: sessionUser.email,
        username: sessionUser.username,
        role: sessionUser.role || 'user',
        adresse: sessionUser.adresse || '',
        quartier: sessionUser.quartier || '',
        telephone: sessionUser.telephone || '',
        formuleHabituelle: sessionUser.formuleHabituelle || '',
      };
    } else {
      user.value = null;
    }

    return response.data;
  }

  // Oublie la session côté navigateur, sans appel au serveur (session déjà refusée par le serveur : 401)
  function effacerSessionLocale() {
    user.value = null;
    inactivite.value = null;
  }

  // Déconnexion volontaire : la session locale n'est effacée qu'une fois le cookie supprimé par le serveur.
  // Si le réseau ne répond pas (délai de 15 s), l'erreur remonte au composant : sur un téléphone partagé,
  // se croire déconnecté alors que le cookie est encore valide serait risqué.
  async function logout() {
    await axios.post('/api/auth/logout', null, { timeout: 15000 });
    effacerSessionLocale();
  }

  async function forgotPassword(payload: { email: string }) {
    try {
      const response = await axios.post('/api/auth/forgot-password', payload);
      return response.data;
    } catch (error: any) {
      // On propage l'erreur pour la gérer directement dans le composant avec le toast rouge
      throw error;
    }
  }

  async function resetPassword(payload: { token: string; password: string }) {
    try {
      const response = await axios.post('/api/auth/reset-password', payload);
      return response.data;
    } catch (error: any) {
      throw error;
    }
  }

  return { user, inactivite, isInitialized, isAuthenticated, isAdmin, role, isEquipe, login, logout, effacerSessionLocale, checkSession, forgotPassword, resetPassword };
}