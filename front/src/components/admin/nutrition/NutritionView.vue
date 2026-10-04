<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { Scale, Search, MessageCircle, X, Plus, Trash2, Edit2, ShieldCheck } from 'lucide-vue-next'
import Swal from 'sweetalert2'
import api from '@/stores/api'
import { useAuthStore } from '@/stores/auth'
import { peutEcrire } from '@/config/roles'

// Suivi alimentaire : clients ayant rempli le questionnaire (avec leur accord), journal, menus types.
// v1 sans données de santé (autorisation APDP préalable, voir docs/conception-menu-admin.md, point 4.2).

interface ClientSuivi { userId: string; nom: string; telephone: string; quartier: string; formule: string; personnes: number; prochainPoint: string | null; dernierSuivi: { date: string; type: string } | null }
interface Fiche {
  client: { username: string; telephone: string; quartier: string; adresse: string; formuleHabituelle: string }
  profil: { foyer: Record<string, number>; objectifs: string[]; platsAimes: string; alimentsNonAimes: string; prochainPoint: string | null; consentement: { date: string; version: string } }
  journal: { _id: string; type: string; contenu: string; visibleClient: boolean; createdAt: string; auteur?: { username: string } }[]
}
interface Menu { _id?: string; formuleSlug: string; titre: string; jours: { jour: string; dejeuner: string; diner: string }[]; conseil: string; actif: boolean }

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const FORMULES = [
  { slug: 'ahi-essentiel', nom: 'AHI Essentiel' }, { slug: 'ahi-equilibre', nom: 'AHI Équilibré' }, { slug: 'ahi-confort', nom: 'AHI Confort' },
  { slug: 'ahi-reserve', nom: 'AHI Réserve' }, { slug: 'ahi-fraicheur', nom: 'AHI Fraîcheur' },
]
const LIBELLES_TRANCHES: Record<string, string> = { '0-5': '0-5 ans', '6-12': '6-12 ans', '13-17': '13-17 ans', '18-59': '18-59 ans', '60+': '60 ans et +' }

const authStore = useAuthStore()
const ecriture = computed(() => peutEcrire(authStore.role.value, 'nutrition'))
const queryClient = useQueryClient()
const onglet = ref<'clients' | 'menus'>('clients')
const notification = ref({ text: '', type: '' })
const notifier = (text: string, type: string) => {
  notification.value = { text, type }
  setTimeout(() => notification.value = { text: '', type: '' }, 4000)
}
const dateFr = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

// --- Clients suivis ---
const recherche = ref('')
const rechercheDifferee = ref('')
let minuteur: ReturnType<typeof setTimeout>
watch(recherche, v => { clearTimeout(minuteur); minuteur = setTimeout(() => { rechercheDifferee.value = v }, 400) })

const { data: clients, isLoading } = useQuery({
  queryKey: ['nutrition', 'clients', rechercheDifferee],
  queryFn: async (): Promise<ClientSuivi[]> => (await api.get('/api/admin/nutrition/clients', { params: { search: rechercheDifferee.value || undefined } })).data,
})
// Point mensuel à faire dans les 5 prochains jours, ou en retard
const pointAFaire = (c: ClientSuivi) => !!c.prochainPoint && new Date(c.prochainPoint).getTime() <= Date.now() + 5 * 86400e3

const clientOuvert = ref<string | null>(null)
const ficheEl = ref<HTMLElement | null>(null)
const { data: fiche } = useQuery({
  queryKey: ['nutrition', 'fiche', clientOuvert],
  queryFn: async (): Promise<Fiche> => (await api.get(`/api/admin/nutrition/clients/${clientOuvert.value}`)).data,
  enabled: computed(() => !!clientOuvert.value),
})

// Au téléphone, la fiche s'affiche sous la liste : on l'amène à l'écran dès qu'elle est chargée
watch(fiche, async (f) => {
  if (!f) return
  await nextTick()
  if (window.innerWidth < 1024) ficheEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
})

const sousTitreFiche = computed(() => {
  if (!fiche.value) return ''
  const { client, profil } = fiche.value
  return [client.formuleHabituelle, client.telephone, `accord du ${dateFr(profil.consentement.date)}`].filter(Boolean).join(' · ')
})

const suivi = reactive({ type: 'Recommandation', contenu: '', visibleClient: true })
watch(() => suivi.type, t => { suivi.visibleClient = t !== 'Note interne' })
const envoi = ref(false)

async function ajouterSuivi() {
  envoi.value = true
  try {
    const { data } = await api.post(`/api/admin/nutrition/clients/${clientOuvert.value}/suivi`, suivi)
    notifier(data.message, 'success')
    suivi.contenu = ''
    queryClient.invalidateQueries({ queryKey: ['nutrition'] })
  } catch (err: any) {
    notifier(err.response?.data?.message || 'Enregistrement impossible', 'error')
  } finally {
    envoi.value = false
  }
}

// Envoi d'une recommandation au client sur WhatsApp (question 31)
const lienWhatsApp = (telephone: string, nom: string, texte: string) =>
  `https://wa.me/${telephone.replace(/\D/g, '')}?text=${encodeURIComponent(`Bonjour ${nom} 👋\nConseil de votre nutritionniste Ahitché :\n\n${texte}`)}`

// --- Menus types ---
const { data: menus } = useQuery({
  queryKey: ['nutrition', 'menus'],
  queryFn: async (): Promise<(Menu & { _id: string })[]> => (await api.get('/api/admin/nutrition/menus')).data,
  enabled: computed(() => onglet.value === 'menus'),
})
const menuVide = (): Menu => ({ formuleSlug: 'ahi-essentiel', titre: '', jours: JOURS.map(jour => ({ jour, dejeuner: '', diner: '' })), conseil: '', actif: true })
const menuEdite = ref<Menu | null>(null)

const editerMenu = (m?: Menu) => {
  menuEdite.value = m ? { ...m, jours: JOURS.map(jour => ({ jour, dejeuner: '', diner: '', ...m.jours.find(j => j.jour === jour) })) } : menuVide()
}
async function enregistrerMenu() {
  if (!menuEdite.value) return
  const { _id, ...corps } = menuEdite.value
  try {
    if (_id) await api.put(`/api/admin/nutrition/menus/${_id}`, corps)
    else await api.post('/api/admin/nutrition/menus', corps)
    notifier('Menu enregistré.', 'success')
    menuEdite.value = null
    queryClient.invalidateQueries({ queryKey: ['nutrition', 'menus'] })
  } catch (err: any) {
    notifier(err.response?.data?.message || 'Enregistrement impossible', 'error')
  }
}
async function supprimerMenu(m: Menu & { _id: string }) {
  const choix = await Swal.fire({ title: `Supprimer « ${m.titre} » ?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#1A5C38', confirmButtonText: 'Supprimer', cancelButtonText: 'Annuler' })
  if (!choix.isConfirmed) return
  await api.delete(`/api/admin/nutrition/menus/${m._id}`)
  notifier('Menu supprimé.', 'success')
  queryClient.invalidateQueries({ queryKey: ['nutrition', 'menus'] })
}
const nomFormule = (slug: string) => FORMULES.find(f => f.slug === slug)?.nom ?? slug
</script>

<template>
  <div class="space-y-4 animate-fadeIn text-sm text-noir">
    <div v-if="notification.text" role="status" :class="[notification.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-700 border-red-200', 'p-4 rounded-xl border text-xs font-semibold fixed top-4 right-4 left-4 sm:left-auto z-50 max-w-sm']">
      {{ notification.text }}
    </div>

    <div class="bg-white p-4 rounded-2xl space-y-2">
      <h1 class="font-display font-bold text-xl flex items-center gap-2"><Scale class="w-5 h-5 text-foret" /> Nutrition</h1>
      <p class="text-xs text-gris flex items-start gap-1.5"><ShieldCheck class="w-3.5 h-3.5 shrink-0 mt-0.5 text-savane" /> Seuls les clients qui ont rempli le questionnaire et donné leur accord apparaissent ici. Aucune donnée de santé n'est collectée tant que l'autorisation de l'APDP n'est pas obtenue.</p>
    </div>

    <div class="flex gap-2" role="tablist">
      <button v-for="o in [{ id: 'clients', label: `Clients suivis (${clients?.length ?? 0})` }, { id: 'menus', label: 'Menus types' }]" :key="o.id" role="tab" :aria-selected="onglet === o.id" @click="onglet = o.id as any"
        :class="['cursor-pointer px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap border', onglet === o.id ? 'bg-foret text-white border-foret' : 'bg-white text-gris border-creme2']">{{ o.label }}</button>
    </div>

    <!-- CLIENTS SUIVIS -->
    <div v-if="onglet === 'clients'" class="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
      <div class="lg:col-span-2 space-y-3">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gris-lt" />
          <input v-model="recherche" type="search" aria-label="Rechercher un client" placeholder="Nom ou téléphone" class="w-full pl-9 pr-4 py-2.5 bg-white border border-creme2 rounded-xl text-xs" />
        </div>
        <p v-if="isLoading" class="text-gris text-center py-6">Chargement...</p>
        <p v-else-if="!clients?.length" class="bg-white rounded-2xl p-6 text-center text-gris text-xs border border-dashed border-creme2">Aucun client n'a encore rempli le questionnaire (espace client > « Mon suivi alimentaire »).</p>
        <button v-for="c in clients" :key="c.userId" @click="clientOuvert = c.userId"
          :class="['cursor-pointer w-full text-left bg-white rounded-2xl border p-4 space-y-1', clientOuvert === c.userId ? 'border-foret ring-2 ring-foret/15' : 'border-creme2']">
          <span class="flex items-center justify-between gap-2">
            <span class="font-bold">{{ c.nom }}</span>
            <span v-if="pointAFaire(c)" class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-or/20">Point à faire</span>
          </span>
          <span class="block text-xs text-gris">{{ c.formule || 'Formule non choisie' }} · {{ c.personnes }} personne(s)<span v-if="c.quartier"> · {{ c.quartier }}</span></span>
          <span class="block text-[11px] text-gris">{{ c.dernierSuivi ? `Dernier suivi : ${c.dernierSuivi.type.toLowerCase()} du ${dateFr(c.dernierSuivi.date)}` : 'Aucun suivi pour le moment' }}</span>
        </button>
      </div>

      <!-- Fiche -->
      <div v-if="clientOuvert && fiche" ref="ficheEl" class="scroll-mt-20 lg:col-span-3 bg-white rounded-2xl border border-creme2 p-4 space-y-4">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="font-bold text-base">{{ fiche.client.username }}</h2>
            <p class="text-xs text-gris">{{ sousTitreFiche }}</p>
          </div>
          <button @click="clientOuvert = null" class="p-1.5 rounded-lg bg-creme" aria-label="Fermer la fiche"><X class="w-4 h-4" /></button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div class="rounded-xl bg-creme/60 p-3 space-y-1">
            <p class="font-bold uppercase text-[10px] text-gris">Foyer</p>
            <p v-for="(n, t) in fiche.profil.foyer" v-show="n" :key="t">{{ n }} × {{ LIBELLES_TRANCHES[t] }}</p>
          </div>
          <div class="rounded-xl bg-creme/60 p-3 space-y-1">
            <p class="font-bold uppercase text-[10px] text-gris">Souhaits</p>
            <p>{{ fiche.profil.objectifs.join(', ') || '-' }}</p>
            <p v-if="fiche.profil.platsAimes"><strong>Aime :</strong> {{ fiche.profil.platsAimes }}</p>
            <p v-if="fiche.profil.alimentsNonAimes"><strong>N'aime pas :</strong> {{ fiche.profil.alimentsNonAimes }}</p>
          </div>
        </div>
        <p v-if="fiche.profil.prochainPoint" class="text-xs">Prochain point mensuel : <strong>{{ dateFr(fiche.profil.prochainPoint) }}</strong></p>

        <form v-if="ecriture" @submit.prevent="ajouterSuivi" class="space-y-2 rounded-xl border border-creme2 p-3">
          <div class="flex flex-wrap gap-2 items-center">
            <label class="sr-only" for="type-suivi">Type</label>
            <select id="type-suivi" v-model="suivi.type" class="px-3 py-2 rounded-lg border border-creme2 bg-creme text-xs">
              <option>Recommandation</option><option>Point mensuel</option><option>Note interne</option>
            </select>
            <label class="flex items-center gap-1.5 text-xs"><input v-model="suivi.visibleClient" :disabled="suivi.type === 'Note interne'" type="checkbox" class="accent-foret w-4 h-4" /> Visible dans l'espace client</label>
          </div>
          <label class="sr-only" for="contenu-suivi">Contenu</label>
          <textarea id="contenu-suivi" v-model="suivi.contenu" required rows="3" maxlength="2000" placeholder="Ex : privilégier le riz local deux fois par semaine, ajouter des légumes au dîner…" class="w-full px-3 py-2 rounded-lg border border-creme2 bg-creme text-sm resize-none"></textarea>
          <button type="submit" :disabled="envoi" class="cursor-pointer w-full px-3 py-2 rounded-xl bg-foret text-white text-xs font-bold disabled:opacity-50">Ajouter au journal</button>
        </form>

        <div class="space-y-2">
          <h3 class="font-bold text-sm">Journal</h3>
          <p v-if="!fiche.journal.length" class="text-xs text-gris">Aucune entrée.</p>
          <article v-for="e in fiche.journal" :key="e._id" class="rounded-xl border border-creme2 p-3 text-xs space-y-1">
            <p class="text-gris">{{ e.type }} · {{ dateFr(e.createdAt) }} · {{ e.auteur?.username }} · {{ e.visibleClient ? 'visible par le client' : 'interne' }}</p>
            <p class="whitespace-pre-line text-noir">{{ e.contenu }}</p>
            <a v-if="e.visibleClient && fiche.client.telephone" :href="lienWhatsApp(fiche.client.telephone, fiche.client.username, e.contenu)" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-savane font-semibold"><MessageCircle class="w-3.5 h-3.5" /> Envoyer sur WhatsApp</a>
          </article>
        </div>
      </div>
    </div>

    <!-- MENUS TYPES -->
    <div v-if="onglet === 'menus'" class="space-y-3">
      <button v-if="ecriture && !menuEdite" @click="editerMenu()" class="cursor-pointer inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-foret text-white text-xs font-bold"><Plus class="w-3.5 h-3.5" /> Nouveau menu</button>

      <form v-if="menuEdite" @submit.prevent="enregistrerMenu" class="bg-white rounded-2xl border border-creme2 p-4 space-y-3 text-xs">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label class="font-bold uppercase text-[10px] text-gris">Formule
            <select v-model="menuEdite.formuleSlug" class="mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-creme text-sm font-normal normal-case text-noir">
              <option v-for="f in FORMULES" :key="f.slug" :value="f.slug">{{ f.nom }}</option>
            </select>
          </label>
          <label class="sm:col-span-2 font-bold uppercase text-[10px] text-gris">Titre
            <input v-model="menuEdite.titre" required maxlength="120" placeholder="Ex : Semaine équilibrée à petit budget" class="mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-creme text-sm font-normal normal-case text-noir" />
          </label>
        </div>
        <div class="space-y-2">
          <div v-for="j in menuEdite.jours" :key="j.jour" class="grid grid-cols-1 sm:grid-cols-[6rem_1fr_1fr] gap-2 items-center">
            <span class="font-bold">{{ j.jour }}</span>
            <input v-model="j.dejeuner" maxlength="200" :aria-label="`Déjeuner du ${j.jour.toLowerCase()}`" placeholder="Déjeuner" class="px-3 py-2 rounded-lg border border-creme2 bg-creme text-sm" />
            <input v-model="j.diner" maxlength="200" :aria-label="`Dîner du ${j.jour.toLowerCase()}`" placeholder="Dîner" class="px-3 py-2 rounded-lg border border-creme2 bg-creme text-sm" />
          </div>
        </div>
        <label class="block font-bold uppercase text-[10px] text-gris">Conseil (facultatif)
          <textarea v-model="menuEdite.conseil" rows="2" maxlength="500" class="mt-1 w-full px-3 py-2 rounded-lg border border-creme2 bg-creme text-sm font-normal normal-case text-noir resize-none"></textarea>
        </label>
        <label class="flex items-center gap-2 font-semibold"><input v-model="menuEdite.actif" type="checkbox" class="accent-foret w-4 h-4" /> Visible par les clients de cette formule</label>
        <div class="flex gap-2">
          <button type="submit" class="cursor-pointer flex-1 px-3 py-2.5 rounded-xl bg-foret text-white font-bold">Enregistrer le menu</button>
          <button type="button" @click="menuEdite = null" class="cursor-pointer px-3 py-2.5 rounded-xl border border-creme2 font-semibold">Annuler</button>
        </div>
      </form>

      <p v-if="menus && !menus.length && !menuEdite" class="bg-white rounded-2xl p-6 text-center text-gris text-xs border border-dashed border-creme2">Aucun menu type pour le moment.</p>
      <article v-for="m in menus" :key="m._id" :class="['bg-white rounded-2xl border border-creme2 p-4 text-xs space-y-1', !m.actif ? 'opacity-60' : '']">
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="font-bold text-sm">{{ m.titre }}</p>
            <p class="text-gris">{{ nomFormule(m.formuleSlug) }}{{ m.actif ? '' : ' · masqué' }}</p>
          </div>
          <div v-if="ecriture" class="flex gap-1">
            <button @click="editerMenu(m)" class="cursor-pointer p-1.5 text-gris hover:text-savane" :aria-label="`Modifier ${m.titre}`"><Edit2 class="w-3.5 h-3.5" /></button>
            <button @click="supprimerMenu(m)" class="cursor-pointer p-1.5 text-gris hover:text-red-600" :aria-label="`Supprimer ${m.titre}`"><Trash2 class="w-3.5 h-3.5" /></button>
          </div>
        </div>
        <p v-for="j in m.jours.filter(j => j.dejeuner || j.diner)" :key="j.jour"><strong>{{ j.jour }}</strong> : {{ j.dejeuner || '-' }} / {{ j.diner || '-' }}</p>
      </article>
    </div>
  </div>
</template>
