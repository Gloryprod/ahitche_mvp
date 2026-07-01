<template>
  <div class="min-h-screen flex md:flex-row">
    <!-- Partie gauche : Visuel (Identique pour garder la charte) -->
    <div class="hidden md:block md:w-1/2 relative bg-foret min-h-112.5">
      <img 
        src="/beautiful-couple-looking-their-laptop.jpg" 
        alt="Plat Ahitché" 
        class="w-full h-full object-cover"
      />
      <div class="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent flex flex-col justify-end p-8 text-white">
        <h3 class="font-display text-2xl font-bold mb-2">Ahitché</h3>
        <p class="text-white/80 text-sm">Votre partenaire de confiance dans la réalisation de vos courses</p>
      </div>
    </div>

    <!-- Partie droite : Formulaire de nouveau mot de passe -->
    <div class="w-full md:w-1/2 p-8 md:p-10 flex flex-col justify-center bg-white">
      <div class="mb-6 text-center">
        <h2 class="text-2xl font-bold text-foret font-display">Nouveau mot de passe</h2>
        <p class="text-sm text-gray-500 mt-1">Choisissez un mot de passe sécurisé pour votre compte.</p>
      </div>

      <form @submit.prevent="handleResetPassword" class="flex flex-col gap-4">
        <!-- Champ 1 : Mot de passe -->
        <div>
          <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Nouveau mot de passe</label>
          <input 
            type="password" 
            v-model="password" 
            required 
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
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useToast } from 'vue-toastification';

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
  if (password.value.length < 6) {
    toast.error("Le mot de passe doit contenir au moins 6 caractères.");
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