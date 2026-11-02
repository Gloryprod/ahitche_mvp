<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronDown, Globe, LogOut, Search, X } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useDeconnexion } from '@/composables/useDeconnexion'
import { useCompteursAdmin, texteCompteur } from '@/composables/useCompteursAdmin'
import { LIBELLES_ROLES } from '@/config/roles'
import { filtrerMenu, type CleCompteur, type EntreeMenu, type GroupeMenu } from '@/config/menuAdmin'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// --- Profil (une ligne) ---
const nomAffiche = computed(() => authStore.user.value?.username || 'Équipe Ahitché')
const initiale = computed(() => nomAffiche.value.charAt(0).toUpperCase())
const libelleRole = computed(() => authStore.role.value ? LIBELLES_ROLES[authStore.role.value] : '')

// Déconnexion : confirmation, fermeture de la session puis retour à l'accueil du site
const { seDeconnecter, deconnexionEnCours } = useDeconnexion()

// --- Recherche « Trouver un outil » ---
const recherche = ref('')
const champRecherche = useTemplateRef<HTMLInputElement>('champRecherche')
const enRecherche = computed(() => recherche.value.trim() !== '')

// Le menu ne montre que les sections accessibles avec le rôle connecté (le serveur reste la référence)
const groupes = computed(() => filtrerMenu(authStore.role.value, recherche.value))
const resultats = computed(() => groupes.value.flatMap(groupe => groupe.entrees))
const premierResultat = computed(() => (enRecherche.value ? resultats.value[0] : undefined))

// Annonce pour les lecteurs d'écran (zone role="status")
const annonce = computed(() => {
  if (!enRecherche.value) return ''
  const n = resultats.value.length
  if (n === 0) return 'Aucun outil trouvé'
  return n === 1 ? '1 outil trouvé' : `${n} outils trouvés`
})

// Entrée : ouvre le premier résultat, puis la recherche se vide pour retrouver le menu complet
function ouvrirPremierResultat() {
  const cible = premierResultat.value
  if (!cible) return
  recherche.value = ''
  router.push(cible.chemin)
}

function effacerRecherche(evenement: KeyboardEvent) {
  if (!recherche.value) return
  evenement.preventDefault() // Échap vide d'abord le champ (sans fermer autre chose)
  recherche.value = ''
}

// Ctrl+K (Cmd+K sur Mac) place le curseur dans la recherche, sur ordinateur (le menu y est toujours visible)
const surMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
const raccourci = surMac ? '⌘ K' : 'Ctrl K'
function surRaccourci(evenement: KeyboardEvent) {
  if (!(evenement.ctrlKey || evenement.metaKey) || evenement.key.toLowerCase() !== 'k') return
  if (!window.matchMedia('(min-width: 64rem)').matches) return
  evenement.preventDefault()
  champRecherche.value?.focus()
  champRecherche.value?.select()
}
onMounted(() => window.addEventListener('keydown', surRaccourci))
onBeforeUnmount(() => window.removeEventListener('keydown', surRaccourci))

// --- Groupes repliables ---
// Groupes repliés par l'utilisateur, retenus d'une visite à l'autre (stockage indisponible : rien n'est retenu)
const CLE_GROUPES_REPLIES = 'ahitche:menu-admin-replies'
function lireGroupesReplies(): string[] {
  try {
    const valeur: unknown = JSON.parse(localStorage.getItem(CLE_GROUPES_REPLIES) ?? '[]')
    return Array.isArray(valeur) ? valeur.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}
const groupesReplies = ref<string[]>(lireGroupesReplies())

const estActive = (entree: EntreeMenu) => route.path.replace(/\/$/, '') === entree.chemin
const contientPageOuverte = (groupe: GroupeMenu) => groupe.entrees.some(estActive)
// Le groupe de la page ouverte reste déplié ; pendant une recherche, chaque groupe affiché a un résultat
const verrouille = (groupe: GroupeMenu) => enRecherche.value || contientPageOuverte(groupe)
const estDeplie = (groupe: GroupeMenu) => verrouille(groupe) || !groupesReplies.value.includes(groupe.id)

function basculerGroupe(groupe: GroupeMenu) {
  if (verrouille(groupe)) return
  groupesReplies.value = groupesReplies.value.includes(groupe.id)
    ? groupesReplies.value.filter(id => id !== groupe.id)
    : [...groupesReplies.value, groupe.id]
  try {
    localStorage.setItem(CLE_GROUPES_REPLIES, JSON.stringify(groupesReplies.value))
  } catch { /* stockage indisponible : l'état vaut pour cette page seulement */ }
}

// --- Pastilles (commandes en attente, avis à valider) ---
const { compteur } = useCompteursAdmin()
const LIBELLES_COMPTEURS: Record<CleCompteur, string> = {
  commandesEnAttente: 'en attente',
  avisAValider: 'à valider',
}
</script>

<template>
  <aside class="bg-white rounded-3xl p-3 lg:p-4 md:border md:border-creme2 md:shadow-sm flex flex-col w-full lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto">
    <!-- Profil : initiale, nom, rôle, voir le site, déconnexion -->
    <div class="flex items-center gap-2 w-full pb-3 mb-3 border-b border-creme2">
      <span aria-hidden="true" class="w-9 h-9 shrink-0 bg-foret/10 text-foret font-display text-base font-bold rounded-full flex items-center justify-center">
        {{ initiale }}
      </span>
      <div class="min-w-0 flex-1 leading-tight">
        <p class="font-display font-bold text-sm text-noir truncate" :title="nomAffiche">{{ nomAffiche }}</p>
        <p class="text-[10px] font-semibold text-gris truncate">{{ libelleRole }}</p>
      </div>
      <!-- Consulter le site sans se déconnecter : « Mon espace », dans le menu du site, ramène ici -->
      <RouterLink
        to="/"
        title="Voir le site"
        class="shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-xl text-foret hover:bg-foret/5 transition-colors focus-visible:outline-2 focus-visible:outline-foret"
      >
        <Globe class="w-4 h-4 stroke-2" aria-hidden="true" />
        <span class="sr-only">Voir le site</span>
      </RouterLink>
      <button
        @click="seDeconnecter"
        :disabled="deconnexionEnCours"
        type="button"
        title="Déconnexion"
        aria-label="Se déconnecter"
        class="shrink-0 w-11 h-11 inline-flex items-center justify-center cursor-pointer text-gris hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-foret disabled:opacity-50"
      >
        <LogOut class="w-4 h-4 stroke-2" aria-hidden="true" />
      </button>
    </div>

    <!-- Recherche : par nom et par mots-clés -->
    <div role="search" class="relative mb-2">
      <label for="recherche-outil" class="sr-only">Trouver un outil</label>
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gris pointer-events-none" aria-hidden="true" />
      <input
        id="recherche-outil"
        ref="champRecherche"
        v-model="recherche"
        type="search"
        placeholder="Trouver un outil"
        autocomplete="off"
        spellcheck="false"
        enterkeyhint="go"
        aria-keyshortcuts="Control+K Meta+K"
        aria-describedby="recherche-outil-aide"
        @keydown.enter.prevent="ouvrirPremierResultat"
        @keydown.esc="effacerRecherche"
        class="w-full min-h-11 pl-9 pr-11 lg:pr-16 rounded-xl bg-creme border border-creme2 font-body text-base lg:text-sm text-noir placeholder:text-gris focus:outline-none focus:border-foret focus:ring-1 focus:ring-foret transition-colors [&::-webkit-search-cancel-button]:appearance-none"
      />
      <button
        v-if="recherche"
        type="button"
        aria-label="Effacer la recherche"
        @click="recherche = ''; champRecherche?.focus()"
        class="absolute right-0 top-0 w-11 h-11 inline-flex items-center justify-center rounded-xl text-gris hover:text-noir cursor-pointer focus-visible:outline-2 focus-visible:outline-foret"
      >
        <X class="w-4 h-4" aria-hidden="true" />
      </button>
      <kbd v-else aria-hidden="true" class="hidden lg:inline-flex absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md border border-creme2 bg-white font-body text-[10px] font-semibold text-gris">
        {{ raccourci }}
      </kbd>
      <p id="recherche-outil-aide" class="sr-only">Par nom ou par mot-clé, par exemple prix, livreur ou photo. Entrée ouvre le premier résultat.</p>
    </div>
    <p role="status" class="sr-only">{{ annonce }}</p>
    <p v-if="enRecherche && resultats.length === 0" class="px-3 py-4 text-xs text-gris text-center">
      Aucun outil trouvé
    </p>

    <!-- Groupes d'outils -->
    <nav aria-label="Outils du back-office" class="w-full space-y-1">
      <div v-for="groupe in groupes" :key="groupe.id">
        <h2>
          <button
            type="button"
            :id="`groupe-menu-${groupe.id}-titre`"
            :aria-expanded="estDeplie(groupe)"
            :aria-controls="`groupe-menu-${groupe.id}`"
            :aria-disabled="verrouille(groupe) || undefined"
            @click="basculerGroupe(groupe)"
            :class="[
              'w-full min-h-10 px-3 flex items-center justify-between gap-2 rounded-lg text-[10px] font-bold text-gris uppercase tracking-wider transition-colors focus-visible:outline-2 focus-visible:outline-foret',
              verrouille(groupe) ? 'cursor-default' : 'cursor-pointer hover:bg-creme hover:text-noir'
            ]"
          >
            <span>{{ groupe.titre }}</span>
            <ChevronDown
              aria-hidden="true"
              :class="['w-3.5 h-3.5 transition-transform duration-200 motion-reduce:transition-none', estDeplie(groupe) ? '' : '-rotate-90', verrouille(groupe) ? 'opacity-30' : '']"
            />
          </button>
        </h2>

        <ul
          v-show="estDeplie(groupe)"
          :id="`groupe-menu-${groupe.id}`"
          :aria-labelledby="`groupe-menu-${groupe.id}-titre`"
          class="flex flex-col gap-0.5 pb-2 text-xs font-semibold"
        >
          <li v-for="entree in groupe.entrees" :key="entree.id">
            <RouterLink
              :to="entree.chemin"
              :class="[
                'w-full min-h-11 lg:min-h-9 px-3 rounded-xl flex items-center gap-3 transition-colors select-none focus-visible:outline-2 focus-visible:outline-foret',
                estActive(entree) ? 'bg-foret/5 text-foret font-bold' : 'text-gris hover:bg-creme hover:text-noir',
                premierResultat?.id === entree.id ? 'ring-1 ring-savane' : ''
              ]"
            >
              <component :is="entree.icone" class="w-4 h-4 shrink-0 stroke-2" aria-hidden="true" />
              <span class="flex-1 min-w-0 truncate">{{ entree.nom }}</span>
              <span
                v-if="entree.compteur && compteur(entree.compteur) !== null"
                class="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-or text-noir text-[10px] font-bold inline-flex items-center justify-center tabular-nums"
              >
                {{ texteCompteur(compteur(entree.compteur) ?? 0) }}<span class="sr-only">&nbsp;{{ LIBELLES_COMPTEURS[entree.compteur] }}</span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </div>
    </nav>
  </aside>
</template>
