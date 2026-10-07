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

// Plusieurs requêtes peuvent échouer en même temps quand la session expire : une seule redirection
let redirectionEnCours = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Session expirée ou refusée par le serveur : on l'oublie côté navigateur (aucun appel réseau nécessaire)
      useAuthStore().effacerSessionLocale();

      // Retour à la connexion avec un message, puis à la page en cours une fois reconnecté
      const pageEnCours = router.currentRoute.value;
      if (pageEnCours.meta.requiresAuth && !redirectionEnCours) {
        redirectionEnCours = true;
        router
          .replace({ path: '/login', query: { redirect: pageEnCours.fullPath, session: 'expiree' } })
          .finally(() => { redirectionEnCours = false; });
      }
    }
    return Promise.reject(error);
  }
);

export default api;
