import axios from "axios";
import { useAuthStore } from '@/stores/auth';
import router from '@/router';

const API_URL = import.meta.env.PROD 
  ? 'https://api.ahitchebj.com' // En ligne : ton sous-domaine
  : '';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const authStore = useAuthStore();
      authStore.logout();        // Nettoie l'état Pinia/LocalStorage
      router.push('/login');     // Redirige sur-le-champ
    }
    return Promise.reject(error);
  }
);

export default api;
