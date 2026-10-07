<script setup lang="ts">
import { ref, watch } from 'vue'
import { Search, Plus, Edit2, Trash2, Eye, X, Video, FileText, Newspaper } from 'lucide-vue-next'
import api from '@/stores/api'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/vue-query'
import Swal from 'sweetalert2'
import { UploadCloud, Loader2 } from 'lucide-vue-next'

// --- INTERFACES ---
export interface Post {
  _id: string
  title: string
  slug: string
  type: 'article' | 'blog' | 'video'
  category: string
  summary?: string
  content?: string
  videoUrl?: string
  coverImage?: string
  isPublished: boolean
  publishedAt?: string
  createdAt: string
  updatedAt: string
}

// --- ÉTATS ---
const page = ref(1)
const search = ref('')
const debouncedSearch = ref('')
const isSubmitting = ref(false)
const notification = ref({ text: '', type: '' })
const queryClient = useQueryClient()

const showFormPanel = ref(false)
const isEditing = ref(false)
const showDetailPanel = ref(false)
const selectedPost = ref<Post | null>(null)

// Structure du formulaire
const form = ref({
  _id: '',
  title: '',
  slug: '',
  type: 'article' as 'article' | 'blog' | 'video',
  category: 'Actualité',
  summary: '',
  content: '',
  videoUrl: '',
  coverImage: '',
  isPublished: true
})

// Debounce pour la recherche
let timeoutId: ReturnType<typeof setTimeout>
watch(search, (newValue) => {
  clearTimeout(timeoutId)
  timeoutId = setTimeout(() => {
    debouncedSearch.value = newValue
    page.value = 1
  }, 400)
})

const isUploadingImage = ref(false)
const isUploadingVideo = ref(false)

// --- TANSTACK QUERY ---
const fetchPosts = async ({ queryKey }: { queryKey: any }) => {
  const [_, currentPage, currentSearch] = queryKey
  const response = await api.get('/api/admin/posts', {
    params: { page: currentPage, search: currentSearch, limit: 10 }
  })
  return response.data
}

const { data, isLoading, isError, error, isPlaceholderData } = useQuery({
  queryKey: ['adminPosts', page, debouncedSearch],
  queryFn: fetchPosts,
  placeholderData: keepPreviousData,
})

// --- ACTIONS ---
const openCreateMode = () => {
  isEditing.value = false
  showDetailPanel.value = false
  form.value = {
    _id: '',
    title: '',
    slug: '',
    type: 'article',
    category: 'Actualité',
    summary: '',
    content: '',
    videoUrl: '',
    coverImage: '',
    isPublished: true
  }
  showFormPanel.value = true
}

const openEditMode = (post: Post) => {
  isEditing.value = true
  showDetailPanel.value = false
  form.value = {
    _id: post._id,
    title: post.title,
    slug: post.slug,
    type: post.type,
    category: post.category,
    summary: post.summary || '',
    content: post.content || '',
    videoUrl: post.videoUrl || '',
    coverImage: post.coverImage || '',
    isPublished: post.isPublished
  }
  showFormPanel.value = true
}

const openDetailMode = (post: Post) => {
  selectedPost.value = post
  showFormPanel.value = false
  showDetailPanel.value = true
}

const closePanels = () => {
  showFormPanel.value = false
  showDetailPanel.value = false
  selectedPost.value = null
}

const generateSlug = () => {
  if (!form.value.slug && form.value.title) {
    form.value.slug = form.value.title
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
  }
}

// Fonction d'upload générique ou dédiée
const uploadFile = async (file: File, type: 'image' | 'video') => {
  const formData = new FormData()
  formData.append('image', file)

  const response = await api.post('/api/admin/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return response.data.url // L'URL renvoyée par le serveur
}

// Téléversement Image de Couverture
const handleCoverImageUpload = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    isUploadingImage.value = true
    const uploadedUrl = await uploadFile(file, 'image')
    form.value.coverImage = uploadedUrl
    showNotification("Image téléversée avec succès", "success")
  } catch (err) {
    showNotification("Échec du téléversement de l'image", "error")
  } finally {
    isUploadingImage.value = false
  }
}

// Téléversement Fichier Vidéo (si upload direct)
const handleVideoUpload = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    isUploadingVideo.value = true
    const uploadedUrl = await uploadFile(file, 'video')
    form.value.videoUrl = uploadedUrl
    showNotification("Vidéo téléversée avec succès", "success")
  } catch (err) {
    showNotification("Échec du téléversement de la vidéo", "error")
  } finally {
    isUploadingVideo.value = false
  }
}

const handleSubmit = async () => {
  isSubmitting.value = true
  generateSlug()
  try {
    if (isEditing.value) {
      await api.put(`/api/admin/posts/${form.value._id}`, form.value)
      showNotification("Contenu modifié avec succès !", "success")
    } else {
      // Exclure l'id vide pour la création
      const { _id, ...createPayload } = form.value
      await api.post('/api/admin/posts', createPayload)
      showNotification("Nouveau contenu créé !", "success")
    }
    queryClient.invalidateQueries({ queryKey: ['adminPosts'] })
    closePanels()
  } catch (err: any) {
    showNotification(err.response?.data?.message || "Une erreur est survenue", "error")
  } finally {
    isSubmitting.value = false
  }
}

const deletePost = async (id: string) => {
  const result = await Swal.fire({
    title: 'Supprimer ce contenu ?',
    text: "Cette action est irréversible et supprimera l'article/vidéo de la plateforme.",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#1e3a1f',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Oui, supprimer',
    cancelButtonText: 'Annuler',
    customClass: { popup: 'rounded-2xl font-body' }
  });

  if (result.isConfirmed) {
    try {
      await api.delete(`/api/admin/posts/${id}`)
      showNotification("Contenu supprimé", "success")
      queryClient.invalidateQueries({ queryKey: ['adminPosts'] })
      if (selectedPost.value?._id === id) closePanels()
    } catch (err) {
      showNotification("Impossible de supprimer le contenu", "error")
    }
  }
}

const showNotification = (text: string, type: string) => {
  notification.value = { text, type }
  setTimeout(() => notification.value = { text: '', type: '' }, 4000)
}
</script>

<template>
  <div class="space-y-6 animate-fadeIn text-xs font-medium text-gris">
    
    <!-- En-tête de la page -->
    <div class="bg-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
      <h1 class="font-display font-bold text-xl text-noir">Gestion des Contenus & Médias</h1>
      <div class="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
        <div class="relative w-full sm:w-60">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gris stroke-[2.5]" />
          <input v-model="search" type="text" placeholder="Rechercher un titre..." class="w-full pl-9 pr-4 py-2 bg-[#f9f9fb] border border-gray-200 rounded-xl text-xs font-medium text-noir focus:outline-none focus:border-foret focus:bg-white transition-all" />
        </div>
        <button @click="openCreateMode" class="cursor-pointer flex items-center gap-1.5 px-4 py-2 bg-foret text-white text-xs font-bold rounded-xl hover:bg-opacity-95 transition-all shadow-sm shrink-0">
          <Plus class="w-3.5 h-3.5 stroke-3" /> Ajouter
        </button>
      </div>
    </div>

    <!-- Toast Notification -->
    <div v-if="notification.text" :class="[notification.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200', 'p-4 rounded-xl border text-xs font-semibold shadow-2xs fixed top-4 right-4 z-50 max-w-sm']">
      {{ notification.text }}
    </div>

    <!-- Barre de statistiques / compteur -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 bg-white p-4 rounded-2xl shadow-2xs">
      <div class="flex items-center gap-2 text-xs font-semibold text-gris">
        <span>Contenus répertoriés</span>
        <span class="px-2.5 py-1 bg-foret/10 text-foret rounded-full font-bold text-[11px]">{{ data?.total || 0 }}</span>
      </div>
    </div>

    <!-- Layout Grille : Table + Panneau Latéral -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      
      <!-- Liste/Table des contenus -->
      <div :class="[showFormPanel || showDetailPanel ? 'lg:col-span-2' : 'lg:col-span-3', 'bg-white rounded-2xl border border-gray-100 shadow-3xs overflow-hidden transition-all']">
        <div v-if="isLoading" class="text-sm font-medium text-gris p-6 text-center">Chargement des contenus...</div>
        <div v-else-if="isError" class="p-4 bg-red-50 text-red-700 text-sm rounded-xl m-4 border">Erreur: {{ error?.message }}</div>

        <div v-defilable="'Contenus publiés'" v-else class="p-4 overflow-x-auto">
          <table class="w-full text-left border-collapse min-w-162.5">
            <thead>
              <tr class="bg-gray-50/70 border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gris">
                <th class="py-3 px-4">Titre</th>
                <th class="py-3 px-4">Type</th>
                <th class="py-3 px-4">Catégorie</th>
                <th class="py-3 px-4 text-center">Statut</th>
                <th class="py-3 px-4 text-right">Date</th>
                <th class="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 text-noir">
              <tr v-for="post in data?.posts" :key="post._id" class="hover:bg-gray-50/50 transition-colors">
                <td class="py-3 px-4 font-bold max-w-[220px] truncate" :title="post.title">{{ post.title }}</td>
                <td class="py-3 px-4">
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium uppercase" :class="post.type === 'video' ? 'bg-purple-50 text-purple-700' : post.type === 'blog' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'">
                    <Video v-if="post.type === 'video'" class="w-3 h-3" />
                    <FileText v-else-if="post.type === 'blog'" class="w-3 h-3" />
                    <Newspaper v-else class="w-3 h-3" />
                    {{ post.type }}
                  </span>
                </td>
                <td class="py-3 px-4 text-gris italic">{{ post.category }}</td>
                <td class="py-3 px-4 text-center">
                  <span :class="post.isPublished ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'" class="px-2 py-0.5 rounded-full text-[10px] font-bold">
                    {{ post.isPublished ? 'Publié' : 'Brouillon' }}
                  </span>
                </td>
                <td class="py-3 px-4 text-right font-mono text-gris">{{ new Date(post.createdAt).toLocaleDateString() }}</td>
                <td class="py-3 px-4">
                  <div class="flex items-center justify-center gap-2">
                    <button @click="openDetailMode(post)" class="cursor-pointer p-1.5 text-gris hover:text-noir hover:bg-gray-100 rounded-lg transition-colors" aria-label="Voir le détail"><Eye class="w-3.5 h-3.5" /></button>
                    <button @click="openEditMode(post)" class="cursor-pointer p-1.5 text-gris hover:text-savane hover:bg-amber-50 rounded-lg transition-colors" aria-label="Modifier"><Edit2 class="w-3.5 h-3.5" /></button>
                    <button @click="deletePost(post._id)" class="cursor-pointer p-1.5 text-gris hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" aria-label="Supprimer"><Trash2 class="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Controls de Pagination -->
          <div class="flex items-center justify-between pt-4 border-t border-gray-100 mt-4">
            <button :disabled="page === 1 || isPlaceholderData" @click="page--" class="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 transition-all">← Précédent</button>
            <span class="bg-gray-100 px-3 py-1.5 rounded-lg text-noir font-bold">Page {{ page }}</span>
            <button :disabled="!data?.hasMore || isPlaceholderData" @click="page++" class="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 transition-all">Suivant →</button>
          </div>
        </div>
      </div>

      <!-- Panneau Latéral (Formulaire / Fiche Détail) -->
      <div v-if="showFormPanel || showDetailPanel" class="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4 animate-fadeIn sticky top-6">
        
        <div class="flex items-center justify-between border-b pb-2.5">
          <h3 class="font-bold text-noir text-sm">
            <span v-if="showFormPanel">{{ isEditing ? 'Modifier le contenu' : 'Ajouter un contenu' }}</span>
            <span v-else>Fiche de Contenu</span>
          </h3>
          <button @click="closePanels" class="p-1 bg-gray-50 hover:bg-gray-100 rounded-lg text-gris cursor-pointer" aria-label="Fermer"><X class="w-3.5 h-3.5" /></button>
        </div>

        <!-- FORMULAIRE DE CRÉATION / ÉDITION -->
        <form v-if="showFormPanel" @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label class="block mb-1 font-bold text-noir text-[10px] uppercase">Titre</label>
            <input v-model="form.title" @blur="generateSlug" type="text" placeholder="Titre de l'article ou de la vidéo..." class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret" required />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block mb-1 font-bold text-noir text-[10px] uppercase">Type de média</label>
              <select v-model="form.type" class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret" required>
                <option value="article">Article</option>
                <option value="blog">Blog</option>
                <option value="video">Vidéo</option>
              </select>
            </div>
            <div>
              <label class="block mb-1 font-bold text-noir text-[10px] uppercase">Catégorie</label>
              <input v-model="form.category" type="text" placeholder="Recette, Offres, Actu..." class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret" required />
            </div>
          </div>

          <!-- CHAMP VIDÉO (Lien ou Upload) -->
          <div v-if="form.type === 'video'" class="space-y-2">
            <div>
              <label class="block mb-1 font-bold text-noir text-[10px] uppercase">
                Lien Vidéo (YouTube / Vimeo)
              </label>
              <input 
                v-model="form.videoUrl" 
                type="text" 
                placeholder="https://www.youtube.com/watch?v=..." 
                class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret" 
              />
            </div>

            <div class="text-center font-bold text-[10px] text-gris uppercase">OU</div>

            <div>
              <label class="block mb-1 font-bold text-noir text-[10px] uppercase">
                Téléverser un fichier vidéo
              </label>
              <div class="relative">
                <input 
                  type="file" 
                  accept="video/*" 
                  @change="handleVideoUpload" 
                  :disabled="isUploadingVideo"
                  class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg text-xs" 
                />
                <Loader2 v-if="isUploadingVideo" class="w-4 h-4 animate-spin absolute right-3 top-2.5 text-foret" />
              </div>
            </div>
          </div>

          <!-- CHAMP IMAGE DE COUVERTURE -->
          <div>
            <label class="block mb-1 font-bold text-noir text-[10px] uppercase">
              Image d'illustration
            </label>
            <div class="space-y-2">
              <div class="relative">
                <input 
                  type="file" 
                  accept="image/*" 
                  @change="handleCoverImageUpload" 
                  :disabled="isUploadingImage"
                  class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg text-xs" 
                />
                <Loader2 v-if="isUploadingImage" class="w-4 h-4 animate-spin absolute right-3 top-2.5 text-foret" />
              </div>

              <!-- Prévisualisation de l'image -->
              <div v-if="form.coverImage" class="relative h-20 w-full rounded-lg overflow-hidden border">
                <img :src="form.coverImage" alt="Aperçu" class="w-full h-full object-cover" />
                <button 
                  type="button" 
                  @click="form.coverImage = ''" 
                  class="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full hover:bg-red-700"
                 aria-label="Fermer">
                  <X class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          <div>
            <label class="block mb-1 font-bold text-noir text-[10px] uppercase">Chapeau / Résumé</label>
            <textarea v-model="form.summary" rows="2" placeholder="Accroche courte..." class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret"></textarea>
          </div>

          <div v-if="form.type !== 'video'">
            <label class="block mb-1 font-bold text-noir text-[10px] uppercase">Corps de l'article</label>
            <textarea v-model="form.content" rows="5" placeholder="Rédigez votre texte ici..." class="w-full px-3 py-2 bg-[#f9f9fb] border border-gray-200 rounded-lg focus:outline-none focus:border-foret font-sans"></textarea>
          </div>

          <div class="flex items-center gap-2 pt-1">
            <input v-model="form.isPublished" type="checkbox" id="isPublished" class="rounded accent-foret w-4 h-4" />
            <label for="isPublished" class="font-bold text-noir text-xs cursor-pointer">Publier immédiatement</label>
          </div>

          <button type="submit" :disabled="isSubmitting" class="cursor-pointer w-full py-2.5 bg-foret text-white text-xs font-bold rounded-xl shadow-sm disabled:opacity-50">
            {{ isSubmitting ? 'Enregistrement...' : (isEditing ? 'Enregistrer les modifications' : 'Publier le contenu') }}
          </button>
        </form>

        <!-- PANNEAU APERÇU / DÉTAILS -->
        <div v-if="showDetailPanel && selectedPost" class="space-y-4 text-xs">
          <div v-if="selectedPost.coverImage" class="rounded-xl overflow-hidden border h-36 bg-gray-100">
            <img :src="selectedPost.coverImage" :alt="selectedPost.title" class="w-full h-full object-cover" />
          </div>

          <div class="p-3 bg-gray-50 rounded-xl space-y-2 border">
            <span class="text-[9px] uppercase font-bold text-gris block tracking-wider">Metadonnées du contenu</span>
            <div class="flex justify-between"><strong>Titre :</strong> <span class="text-noir font-bold text-right">{{ selectedPost.title }}</span></div>
            <div class="flex justify-between"><strong>Format :</strong> <span class="capitalize font-bold">{{ selectedPost.type }}</span></div>
            <div class="flex justify-between"><strong>Catégorie :</strong> <span>{{ selectedPost.category }}</span></div>
            <div class="flex justify-between"><strong>Statut :</strong> <span :class="selectedPost.isPublished ? 'text-green-700 font-bold' : 'text-amber-800'">{{ selectedPost.isPublished ? 'Publié' : 'Brouillon' }}</span></div>
          </div>

          <div v-if="selectedPost.summary" class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-gris tracking-wider block">Résumé</span>
            <p class="p-2.5 bg-gray-50/50 rounded-xl border text-gris italic">{{ selectedPost.summary }}</p>
          </div>

          <div v-if="selectedPost.videoUrl" class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-gris tracking-wider block">Lien Vidéo</span>
            <a :href="selectedPost.videoUrl" target="_blank" class="text-blue-600 hover:underline truncate block font-mono text-[11px]">{{ selectedPost.videoUrl }}</a>
          </div>

          <div v-if="selectedPost.content" class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-gris tracking-wider block">Aperçu Texte</span>
            <p class="p-2.5 bg-white rounded-xl border text-gray-700 max-h-40 overflow-y-auto whitespace-pre-wrap font-sans">{{ selectedPost.content }}</p>
          </div>

          <button @click="openEditMode(selectedPost!)" class="cursor-pointer w-full py-2 bg-amber-50 text-savane font-bold rounded-xl border border-amber-200 transition-colors flex items-center justify-center gap-1">
            <Edit2 class="w-3 h-3" /> Modifier le contenu
          </button>
        </div>

      </div>

    </div>
  </div>
</template>