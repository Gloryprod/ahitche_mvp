<template>
  <div class="min-h-screen flex md:flex-row">
    <!-- Partie gauche : Visuel (Identique pour garder la charte) -->
    <PanneauMarque titre="Le marché, organisé pour vous" texte="Votre partenaire de confiance pour les courses de votre foyer." />

    <!-- Partie droite : Formulaire de nouveau mot de passe -->
    <div class="w-full md:w-1/2 p-8 md:p-10 flex flex-col justify-center bg-white">
      <div class="mb-4">
        <LienAccueil />
      </div>

      <div class="mb-6 text-center">
        <h1 class="text-2xl font-bold text-foret font-display">Nouveau mot de passe</h1>
        <p class="text-sm text-gris mt-1">Choisissez un mot de passe sécurisé pour votre compte.</p>
      </div>

      <form @submit.prevent="handleResetPassword" class="flex flex-col gap-4">
        <!-- Champ 1 : Mot de passe -->
        <div>
          <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Nouveau mot de passe</label>
          <input 
            type="password" 
            v-model="password"
            required
            minlength="5"
            autocomplete="new-password"
            placeholder="••••••••"
            class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-1 focus:ring-foret transition-all"
          />
        </div>

        <!-- Champ 2 : Confirmation -->
        <div>
          <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Confirmer le mot de passe</label>
          <input 
            type="password" 
            v-model="confirmPassword"
            required
            minlength="5"
            autocomplete="new-password"
            placeholder="••••••••"
            class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-1 focus:ring-foret transition-all"
          />
        </div>

        <button 
          type="submit" 
          :disabled="isLoading"
          class="cursor-pointer w-full bg-foret hover:bg-foret/90 text-white font-bold py-3.5 px-4 rounded-xl text-sm mt-2 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {{ isLoading ? 'Mise à jour...' : 'Modifier mon mot de passe' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import PanneauMarque from '@/components/ui/PanneauMarque.vue'
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useToast } from 'vue-toastification';
import LienAccueil from '@/components/ui/LienAccueil.vue';

const password = ref('');
const confirmPassword = ref('');
const token = ref('');
const isLoading = ref(false);

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

onMounted(() => {
  // Récupère la chaîne ?token=XXXX depuis l'URL
  const queryToken = route.query.token;
  if (!queryToken) {
    toast.error("Le jeton de réinitialisation est manquant ou invalide.");
    router.push('/login');
  } else {
    token.value = queryToken as string;
  }
});

const handleResetPassword = async () => {
  // 1. Validation locale
  if (password.value.length < 5) {
    toast.error("Le mot de passe doit contenir au moins 5 caractères.");
    return;
  }

  if (password.value !== confirmPassword.value) {
    toast.error("Les mots de passe ne correspondent pas.");
    return;
  }

  isLoading.value = true;
  try {
    // 2. Appel à l'action globale du Store
    const data = await authStore.resetPassword({
      token: token.value,
      password: password.value
    });

    toast.success(data.message || "Votre mot de passe a été modifié ! Connectez-vous.");
    router.push('/login');
  } catch (error: any) {
    toast.error(error.response?.data?.message || "Lien expiré ou invalide.");
  } finally {
    isLoading.value = false;
  }
};
</script>