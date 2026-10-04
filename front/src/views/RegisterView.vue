<template>
    <div class="min-h-screen flex md:flex-row">
        <div class="hidden md:block md:w-1/2 relative bg-foret min-h-112.5">
            <img 
                src="/beautiful-couple-looking-their-laptop.jpg" 
                alt="" 
                class="w-full h-full object-cover"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex flex-col justify-end p-8 text-white">
                <h3 class="font-display text-2xl font-bold mb-2">Prêt à commander ?</h3>
                <p class="text-white/80 text-sm">Créez votre compte en un instant pour planifier et recevoir vos formules.</p>
            </div>
        </div>

        <!-- Partie droite : Formulaire d'inscription -->
        <div class="w-full md:w-1/2 p-8 md:p-10 flex flex-col justify-center bg-white">

        <nav class="top-0 left-0 right-0 z-100 pb-4 padding transition-all duration-250">
            <div class="flex items-center">
                <!-- <a href="/" class="nav-logo">
                    <span class="logo-mark">Ahi</span><span class="logo-accent">tché</span>
                </a> -->
                <a href="/" class="btn-retour ">← Retour à l'accueil</a>
            </div>
        </nav>

        <div class="mb-6 text-center">
            <h2 class="text-2xl font-bold text-foret font-display">Rejoignez Ahitché</h2>
            <p class="text-sm text-gray-500 mt-1">Créez votre profil pour finaliser votre commande.</p>
        </div>

        <form @submit.prevent="handleRegister" class="flex flex-col gap-4">
            <div>
            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Nom complet</label>
            <input 
                type="text" 
                v-model="formRegister.username" 
                required 
                placeholder="Ex: Koffi Bénin"
                class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-1 focus:ring-foret transition-all"
            />
            </div>

            <div>
            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Adresse Email</label>
            <input 
                type="email" 
                v-model="formRegister.email" 
                required 
                placeholder="exemple@domaine.com"
                class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-foret focus:ring-1 focus:ring-foret transition-all"
            />
            </div>

            <div>
                <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Numéro WhatsApp / Mobile Money <span class="required">*</span></label>
                <vue-tel-input
                  class="champ-telephone w-full text-sm"
                  v-model="formRegister.telephone"
                  default-country="BJ"
                  mode="international"
                  :input-options="{ placeholder: 'Ex : 01 97 00 00 00', type: 'tel' }"
                  :dropdown-options="{ showFlags: true, showSearchBox: true, searchBoxPlaceholder: 'Rechercher un pays' }"
                ></vue-tel-input>
                <p class="text-xs text-gray-500 mt-1">Ce numéro sera utilisé pour vos commandes et livraisons.</p>
            </div>

            <div>
            <label class="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Mot de passe</label>
            <input 
                type="password" 
                v-model="formRegister.password" 
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
            {{ isLoading ? 'Création du compte...' : 'Créer mon compte & Continuer' }}
            </button>
        </form>

        <div class="flex items-center justify-center gap-1 mt-4">
            <span class="text-sm text-gray-500">
                Déjà inscrit ? <button @click="login" class="cursor-pointer text-foret hover:text-foret/90 font-bold">Se connecter</button>
            </span>
        </div>

        </div>
    </div>
    
</template>

<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';

const formRegister = ref({ username: '', email: '', password: '', telephone:'' })
const isLoading = ref(false)
const router = useRouter()
const toast = useToast()

const handleRegister = async () => {
  isLoading.value = true
  try {
    const response = await axios.post('api/auth/register', formRegister.value)
    toast.success(response.data.message || "Inscription réussie !")
    formRegister.value = { username: '', email: '', password: '', telephone:'' } // Reset
    router.push('/login') // Redirige vers la page de connexion
  } catch (error: any) {
    toast.error(error.response?.data?.message || "Une erreur est survenue lors de l'inscription.")
  } finally {
    isLoading.value = false
  }
}

const login = () => {
  router.push('/login')
}
</script>
<style scoped>
/* Aligne vue-tel-input sur les autres champs du formulaire (charte Ahitché) */
.champ-telephone {
  border: 1px solid #e5e7eb; /* gray-200, comme les autres champs */
  border-radius: 0.75rem;
  background: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.champ-telephone:focus-within {
  border-color: var(--color-foret);
  box-shadow: 0 0 0 1px var(--color-foret);
}
.champ-telephone :deep(.vti__dropdown) {
  padding: 0 0.5rem 0 0.75rem;
  border-radius: 0.75rem 0 0 0.75rem;
}
.champ-telephone :deep(.vti__input) {
  padding: 0.75rem 1rem 0.75rem 0.5rem;
  border-radius: 0 0.75rem 0.75rem 0;
  font-size: 0.875rem;
  font-family: inherit;
  background: transparent;
}
</style>
