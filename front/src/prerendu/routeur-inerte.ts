// Remplace '@/router' pendant le rendu de l'accueil au build (vite.prerendu.config.ts) : le routeur du navigateur
// lit l'historique de la fenêtre dès son chargement, ce qui n'existe pas côté build. Seul l'intercepteur 401 de
// stores/api.ts l'utilise, jamais pendant ce rendu.
export default {
  push: async () => undefined,
  currentRoute: { value: { fullPath: '/', path: '/' } },
}
