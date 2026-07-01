import { ref, computed } from 'vue';
import axios from 'axios';
import { useToast } from 'vue-toastification'; 

const toast = useToast();

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
  role: 'admin' | 'user';
  adresse: string;
  quartier: string;
  telephone: string;
  formuleHabituelle: string;
}

// Les variables restent en mémoire globale (très sécurisé)
const user = ref<User | null>(null);
const isInitialized = ref(false); // Permet de savoir si on a vérifié la session

export function useAuthStore() {
  const isAuthenticated = computed(() => !!user.value);
  const isAdmin = computed(() => !!user.value && user.value.role === 'admin');

  // 💡 Fonction pour récupérer l'utilisateur connecté au chargement du site
  async function checkSession() {
    try {
      const response = await axios.get('/api/auth/me');
      user.value = response.data.user;
    } catch {
      user.value = null;
    } finally {
      isInitialized.value = true;
    } 
  }

  async function login(credentials: { email?: string; password?: string }) {
    try {
      // Le serveur Express va injecter le cookie HttpOnly ici
      const response = await axios.post('/api/auth/login', credentials);
      user.value = response.data.user ; 
      return response.data;
    } catch (error: any ) {
      toast.error(error.response?.data?.message || "Une erreur est survenue.");
      throw error;
    }
  }

  async function logout() {
    try {
      await axios.post('/api/auth/logout');
    } finally {
      user.value = null;
      toast.success("À bientôt ! Déconnexion réussie.");
    }
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

  return { user, isInitialized, isAuthenticated, isAdmin, login, logout, checkSession, forgotPassword, resetPassword };
}