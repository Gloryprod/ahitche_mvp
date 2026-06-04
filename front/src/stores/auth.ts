import { ref, computed } from 'vue';
import axios from 'axios';

// On configure Axios pour qu'il envoie automatiquement les cookies aux requêtes Cross-Origin
axios.defaults.baseURL = import.meta.env.VITE_API_URL;
axios.defaults.withCredentials = true;

interface User {
  id: string;
  email: string;
  username: string;
  role: 'admin' | 'user';
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
      user.value = response.data.user; 
      alert("Connexion réussie !");
    } catch (error: any) {
      alert(error.response?.data?.message || "Une erreur est survenue.");
      throw error;
    }
  }

  async function logout() {
    try {
      await axios.post('/api/auth/logout');
    } finally {
      user.value = null;
      alert("Déconnexion réussie !");
    }
  }

  return { user, isInitialized, isAuthenticated, isAdmin, login, logout, checkSession };
}