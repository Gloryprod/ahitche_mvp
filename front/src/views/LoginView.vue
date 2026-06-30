<template>
    <div class="min-h-screen flex md:flex-row">
        <div class="hidden md:block md:w-1/2 relative bg-foret min-h-[450px]">
        <img 
          src="/beautiful-couple-looking-their-laptop.jpg" 
          alt="Plat Ahitché" 
          class="w-full h-full object-cover"
        />
        <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex flex-col justify-end p-8 text-white">
          <h3 class="font-display text-2xl font-bold mb-2">Ahitché</h3>
          <p class="text-white/80 text-sm">Votre partenaire de confiance dans la réalisation de vos courses</p>
        </div>
        </div>

      <!-- Partie droite : Formulaire d'inscription -->
      <div class="w-full md:w-1/2 p-8 md:p-10 flex flex-col justify-center bg-white">
        <div class="mb-6 text-center">
          <h2 class="text-2xl font-bold text-foret font-display">Connexion</h2>
          <p class="text-sm text-gray-500 mt-1">Connectez-vous à votre compte pour accéder à vos commandes et préférences.</p>
        </div>

        <form @submit.prevent="handleLogin" class="flex flex-col gap-4">
          

          <div>
            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Adresse Email</label>
            <input 
              type="email" 
              v-model="formLogin.email" 
              required 
              placeholder="exemple@domaine.com"
              class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-1 focus:ring-foret transition-all"
            />
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Mot de passe</label>
            <input 
              type="password" 
              v-model="formLogin.password" 
              required 
              placeholder="••••••••"
              class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-1 focus:ring-foret transition-all"
            />
          </div>

          <button 
            type="submit" 
            :disabled="isLoading"
            class="w-full bg-foret hover:bg-foret/90 text-white font-bold py-3.5 px-4 rounded-xl text-sm mt-2 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {{ isLoading ? 'Connexion...' : 'Se connecter' }}
         </button>
        </form>

        <div class="flex items-center justify-center gap-1 mt-4">
            <span class="text-sm text-gray-500">
                Pas de compte ? <button @click="register" class="cursor-pointer text-foret hover:text-foret/90 font-bold">S'inscrire</button>
            </span>
        </div>
      </div>
    </div>
    
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useToast } from 'vue-toastification';

const formLogin = ref({ email: '', password: '' })
const isLoading = ref(false)
const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

const handleLogin = async () => {
  isLoading.value = true
  try {
    const data = await authStore.login(formLogin.value) 
    const userRole = data.user.role;

    toast.success(data.message);

    if(userRole === "admin"){
      router.push('/dashboard/admin') // Redirige vers le tableau de bord utilisateur
    }
    else{
      router.push('/dashboard/user') // Redirige vers le tableau de bord utilisateur
    }

  } catch (error: any) {
    toast.error(error.response?.data?.message || "Une erreur est survenue lors de la connexion.")
  } finally {
    isLoading.value = false
  }
}

const register = () => {
  router.push('/register')
}

</script>