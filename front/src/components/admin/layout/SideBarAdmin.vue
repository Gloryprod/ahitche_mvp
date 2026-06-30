<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth';
import { 
  Users, 
  ShoppingBag, 
  Layers, 
  ChevronRight, 
  Settings,
  LayoutDashboard,
  Package,
  Wallet2,
  Sliders,
  FolderTree,
  Scale,
  LogOut
} from 'lucide-vue-next'
import { onMounted, ref, computed } from 'vue';
import { useToast } from 'vue-toastification';
import Swal from 'sweetalert2';


defineProps<{
  commandesEnAttenteCount?: number
}>()

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()
const isLoading = ref(false);

// Extraction de l'initiale du nom pour l'avatar
const avatarInitiale = computed(() => {
  return authStore.user?.value?.username ? authStore.user.value.username.charAt(0).toUpperCase() : 'C';
});


const menuGroups = [
  {
    title: 'Principal',
    items: [
      { id: 'dashboard', name: 'Tableau de bord', icon: LayoutDashboard, hasBadge: false, path: '/dashboard/admin' },
      { id: 'commandes', name: 'Commandes', icon: ShoppingBag, hasBadge: true, path: '/dashboard/admin/commandes' },
      { id: 'clients', name: 'Liste des clients', icon: Users, hasChevron: true, path: '/dashboard/admin/clients' },
    ]
  },
  {
    title: 'Catalogue',
    items: [
      { id: 'stock', name: 'Gestion de stock', icon: Package, hasChevron: true, path: '/dashboard/admin/stock' },
    ]
  },
  {
    title: 'Gestion',
    items: [
      { id: 'finances', name: 'Finances', icon: Wallet2, hasChevron: true, path: '/dashboard/admin/finances' },
      { id: 'simulateur', name: 'Simulateurs', icon: Sliders, hasChevron: true, path: '/dashboard/admin/simulateurs' },
      { id: 'prestataires', name: 'Prestataires', icon: Users, hasChevron: true, path: '/dashboard/admin/prestataires' },
      { id: 'logistique', name: 'Logistique', icon: FolderTree, hasChevron: true, path: '/dashboard/admin/logistique' },
      { id: 'nutrition', name: 'Nutrition', icon: Scale, hasChevron: true, path: '/dashboard/admin/nutrition' },
    ]
  },
  {
    title: 'Données de base',
    items: [
      { id: 'categorie', name: 'Catégories', icon: Settings, hasChevron: true, path: '/dashboard/admin/categories' },
      { id: 'regles', name: 'Règles de composition', icon: Settings, hasChevron: true, path: '/dashboard/admin/regles' },
      { id: 'produits', name: 'Produits', icon: Settings, hasChevron: true, path: '/dashboard/admin/products' },
      { id: 'formules', name: 'Formules', icon: Settings, hasChevron: true, path: '/dashboard/admin/formulas' },
    ]
  }
]

// Action de Déconnexion
const handleLogout = async () => {
  const result = await Swal.fire({
    title: 'Êtes-vous sûr ?',
    text: "Vous allez être déconnecté de votre espace.",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#1e3a1f',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Oui, me déconnecter',
    cancelButtonText: 'Annuler',
    background: '#ffffff',
    customClass: {
      popup: 'rounded-2xl font-body'
    }
  });

  if (result.isConfirmed) {
    isLoading.value = true;
    try {
      await authStore.logout();      
      router.push('/');
    } catch (error) {
      Swal.fire({
        title: 'Erreur',
        text: 'Impossible de vous déconnecter pour le moment.',
        icon: 'error',
        confirmButtonColor: '#1e3a1f'
      });
    } finally {
      isLoading.value = false;
    }
  }
};

onMounted(async () => {
  await authStore.checkSession();
  
  if (!authStore.isAuthenticated) {
    // 💡 Toast d'avertissement si l'utilisateur tente de forcer l'accès
    toast.error("Accès refusé. Veuillez vous connecter.");
    router.push('/');
    return;
  }
  
  // Si tout est bon, on affiche un toast de bienvenue chaleureux
  // toast.info(`Ravi de vous revoir, ${authStore.user?.value?.username} ! ✨`);
});
</script>

<template>
  <aside class="bg-white rounded-3xl p-6 border border-creme2 shadow-sm flex flex-col items-center w-full sticky top-6">
    
    <div class="flex flex-col items-center border-b border-gray-100 w-full pb-6 mb-4 text-center">
      <div class="w-20 h-20 bg-foret/10 text-foret font-display text-2xl font-bold rounded-full flex items-center justify-center border-2 border-white shadow-md relative group">
        <span>{{ avatarInitiale }}</span>
        <div class="absolute bottom-1 right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
      </div>
      <h2 class="font-display font-bold text-lg text-noir mt-3">{{ authStore.user?.value?.username || 'Admin' }}</h2>
      <div class=" flex items-center justify-between">
        <p class="text-xs font-semibold bg-foret/5 text-foret px-2.5 py-0.5 rounded-full m-1">Ahitché Back Office</p>
        <button 
          @click="handleLogout"
          type="button"
          title="Déconnexion"
          class="cursor-pointer p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all duration-200 focus:outline-none group-hover:scale-105"
        >
          <LogOut class="w-4 h-4 stroke-2" />
        </button>
      </div>
    </div>

    <div class="w-full space-y-6">
      <div v-for="group in menuGroups" :key="group.title" class="space-y-2">
        <h3 class="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3">
          {{ group.title }}
        </h3>
        
        <nav class="w-full flex flex-col divide-y divide-gray-50 text-xs font-semibold text-gray-600">
          <RouterLink 
            v-for="item in group.items" 
            :key="item.id" 
            :to="item.path"
            :class="[
              'w-full text-left py-3 px-3 rounded-xl transition-all flex items-center justify-between group cursor-pointer select-none',
              route.path === item.path ? 'text-savane font-bold bg-amber-50/40' : 'hover:bg-gray-50 hover:text-noir'
            ]"
          >
            <div class="flex items-center gap-3">
              <component 
                :is="item.icon" 
                class="w-4 h-4 stroke-2" 
                :class="route.path === item.path ? 'text-savane' : 'text-gray-400 group-hover:text-noir'" 
              />
              <span>{{ item.name }}</span>
            </div>

            <span 
              v-if="item.hasBadge && commandesEnAttenteCount && commandesEnAttenteCount > 0" 
              class="bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full animate-pulse"
            >
              {{ commandesEnAttenteCount }}
            </span>

            <ChevronRight 
              v-slot:default
              v-if="item.hasChevron && route.path === item.path" 
              class="w-3.5 h-3.5 opacity-60 text-savane stroke-[2.5]" 
            />
          </RouterLink>
        </nav>
      </div>
    </div>
  </aside>
</template>