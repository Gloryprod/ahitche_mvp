<script setup lang="ts">
import { ref, reactive, computed, nextTick } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useToast } from 'vue-toastification'
import Swal from 'sweetalert2'
import { UserCog, Plus, Pencil, KeyRound, Mail, Power, RotateCcw, Copy, Check, X } from 'lucide-vue-next'
import api from '@/stores/api'
import { messageErreur } from '@/services/erreurs'
import { EQUIPE, LIBELLES_ROLES, type Role } from '@/config/roles'

// « Équipe et accès » (docs-internes/equipe/CONCEPT.md), section « equipe » : rôle admin. Comptes de l'équipe :
// création, modification (nom, e-mail, rôle, fiche livreur d'un gestionnaire), mot de passe provisoire, lien de
// réinitialisation, désactivation. Le serveur fait foi : le compte admin principal n'est touché que par lui-même, et
// personne ne se désactive ni ne retire son propre rôle d'admin. Les actions qu'il refuserait ne sont pas proposées.
// Mot de passe provisoire : affiché une seule fois, gardé seulement en mémoire le temps de la fenêtre (ni stockage, ni
// historique, ni console), effacé à sa fermeture.

interface Membre {
  _id: string
  username: string
  email: string
  role: Role
  adminPrincipal: boolean
  livreurId: string | null
  livreurNom: string
  actif: boolean
  derniereConnexion: string | null
  motDePasseModifieLe: string | null
  creeLe: string
  estMoi: boolean
}
interface FicheLivreur { _id: string; nom: string }

const MOT_DE_PASSE_MIN = 5 // Même règle que le site et le serveur
const NOM_MAX = 60

const toast = useToast()
const queryClient = useQueryClient()
const { data, isLoading, isError } = useQuery({
  queryKey: ['equipe'],
  queryFn: async () => (await api.get('/api/admin/equipe')).data as { membres: Membre[]; fichesLivreur: FicheLivreur[] },
})
const membres = computed(() => data.value?.membres ?? [])
const fichesLivreur = computed(() => data.value?.fichesLivreur ?? [])
const recharger = () => queryClient.invalidateQueries({ queryKey: ['equipe'] })

const dateHeure = (d: string | null) => d
  ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : ''
// Le compte admin principal n'est géré que par lui-même (refus 403 du serveur sinon)
const peutAgir = (m: Membre) => !m.adminPrincipal || m.estMoi
let declencheur: HTMLElement | null = null
const memoriserDeclencheur = () => { declencheur = document.activeElement instanceof HTMLElement ? document.activeElement : null }
const rendreFocus = () => { declencheur?.focus(); declencheur = null }

// --- Création et modification ---
const formulaire = reactive({ ouvert: false, id: '', username: '', email: '', role: 'gestionnaire' as Role, livreurId: '', motDePasse: '', roleFixe: false })
const enregistrement = ref(false)
const erreurFormulaire = ref('')
const champNom = ref<HTMLInputElement | null>(null)

async function ouvrirFormulaire(m?: Membre) {
  memoriserDeclencheur()
  Object.assign(formulaire, {
    ouvert: true, id: m?._id ?? '', username: m?.username ?? '', email: m?.email ?? '', role: m?.role ?? 'gestionnaire',
    livreurId: m?.livreurId ?? '', motDePasse: '',
    // Son propre rôle d'admin et celui de l'admin principal ne se retirent pas (refus du serveur)
    roleFixe: !!m && (m.adminPrincipal || (m.estMoi && m.role === 'admin')),
  })
  erreurFormulaire.value = ''
  await nextTick()
  champNom.value?.focus()
}
function fermerFormulaire() {
  if (enregistrement.value) return
  formulaire.ouvert = false
  rendreFocus()
}

async function enregistrerMembre() {
  erreurFormulaire.value = ''
  enregistrement.value = true
  const corps = {
    username: formulaire.username, email: formulaire.email, role: formulaire.role,
    livreurId: formulaire.role === 'gestionnaire' && formulaire.livreurId ? formulaire.livreurId : null,
  }
  try {
    if (formulaire.id) {
      const { data: r } = await api.put(`/api/admin/equipe/${formulaire.id}`, corps)
      toast.success(r.message)
      formulaire.ouvert = false
      rendreFocus()
    } else {
      const { data: r } = await api.post('/api/admin/equipe', { ...corps, ...(formulaire.motDePasse ? { motDePasse: formulaire.motDePasse } : {}) })
      formulaire.ouvert = false
      formulaire.motDePasse = ''
      await montrerProvisoire(r.membre.username, r.motDePasseProvisoire, r.message)
    }
    recharger()
  } catch (err) {
    erreurFormulaire.value = messageErreur(err, "L'enregistrement a échoué.")
  } finally {
    enregistrement.value = false
  }
}

// --- Mot de passe provisoire : saisi ou généré ---
const motDePasse = reactive({ ouvert: false, membre: null as Membre | null, saisi: '' })
const envoiMotDePasse = ref(false)
const erreurMotDePasse = ref('')
const champMotDePasse = ref<HTMLInputElement | null>(null)

async function ouvrirMotDePasse(m: Membre) {
  memoriserDeclencheur()
  Object.assign(motDePasse, { ouvert: true, membre: m, saisi: '' })
  erreurMotDePasse.value = ''
  await nextTick()
  champMotDePasse.value?.focus()
}
function fermerMotDePasse() {
  if (envoiMotDePasse.value) return
  motDePasse.ouvert = false
  motDePasse.saisi = ''
  rendreFocus()
}
async function definirMotDePasse() {
  if (!motDePasse.membre) return
  erreurMotDePasse.value = ''
  envoiMotDePasse.value = true
  try {
    const { data: r } = await api.post(`/api/admin/equipe/${motDePasse.membre._id}/mot-de-passe`, motDePasse.saisi ? { motDePasse: motDePasse.saisi } : {})
    motDePasse.ouvert = false
    motDePasse.saisi = ''
    await montrerProvisoire(r.membre.username, r.motDePasseProvisoire, r.message)
    recharger()
  } catch (err) {
    erreurMotDePasse.value = messageErreur(err, 'Le mot de passe n\'a pas pu être enregistré.')
  } finally {
    envoiMotDePasse.value = false
  }
}

// --- Affichage unique du mot de passe provisoire ---
const provisoire = reactive({ ouvert: false, nom: '', valeur: '', message: '', copie: false })
const blocProvisoire = ref<HTMLElement | null>(null)
const boutonCopier = ref<HTMLButtonElement | null>(null)
async function montrerProvisoire(nom: string, valeur: string, message: string) {
  Object.assign(provisoire, { ouvert: true, nom, valeur, message, copie: false })
  await nextTick()
  boutonCopier.value?.focus()
}
function fermerProvisoire() {
  Object.assign(provisoire, { ouvert: false, nom: '', valeur: '', message: '', copie: false }) // Plus aucune trace
  rendreFocus()
}
async function copierProvisoire() {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Presse-papiers indisponible')
    await navigator.clipboard.writeText(provisoire.valeur)
    provisoire.copie = true
  } catch {
    // Copie refusée : le mot de passe est sélectionné pour une copie à la main
    if (blocProvisoire.value) {
      const plage = document.createRange()
      plage.selectNodeContents(blocProvisoire.value)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(plage)
    }
    toast.info('Copie automatique impossible : le mot de passe est sélectionné, copiez-le (Ctrl+C ou appui long).')
  }
}

// --- Lien de réinitialisation et désactivation ---
const STYLE_SWAL = { confirmButtonColor: 'var(--color-foret)', cancelButtonColor: 'var(--color-gris)', customClass: { popup: 'rounded-2xl font-body' } }

async function envoyerLien(m: Membre) {
  const choix = await Swal.fire({
    ...STYLE_SWAL, title: `Envoyer un lien à ${m.username} ?`,
    text: `Un lien de réinitialisation du mot de passe part à ${m.email}. Il est valable 1 heure.`,
    showCancelButton: true, confirmButtonText: 'Envoyer le lien', cancelButtonText: 'Annuler',
  })
  if (!choix.isConfirmed) return
  try {
    toast.success((await api.post(`/api/admin/equipe/${m._id}/lien-reinitialisation`)).data.message)
  } catch (err) {
    toast.error(messageErreur(err, "Le lien n'a pas pu être envoyé."))
  }
}

async function changerStatut(m: Membre) {
  const desactiver = m.actif
  const choix = await Swal.fire({
    ...STYLE_SWAL, icon: desactiver ? 'warning' : 'question',
    title: desactiver ? `Désactiver le compte de ${m.username} ?` : `Réactiver le compte de ${m.username} ?`,
    text: desactiver
      ? 'Il est déconnecté tout de suite et ne peut plus se connecter. Rien n\'est supprimé : vous pourrez le réactiver.'
      : 'Il pourra de nouveau se connecter avec son mot de passe.',
    showCancelButton: true, confirmButtonText: desactiver ? 'Désactiver' : 'Réactiver', cancelButtonText: 'Annuler',
  })
  if (!choix.isConfirmed) return
  try {
    toast.success((await api.patch(`/api/admin/equipe/${m._id}/statut`, { actif: !desactiver })).data.message)
    recharger()
  } catch (err) {
    toast.error(messageErreur(err, 'Action impossible.'))
  }
}

const champ = 'mt-1 w-full min-h-11 px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal'
const bouton = 'cursor-pointer inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-xl text-xs font-bold transition-colors'
const fenetre = 'fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4 font-body'
</script>

<template>
  <div class="space-y-5 text-sm text-gris">
    <div class="bg-white p-4 rounded-2xl space-y-3">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 class="font-display font-bold text-xl text-noir flex items-center gap-2"><UserCog class="w-5 h-5 text-foret" aria-hidden="true" /> Équipe et accès</h1>
        <button type="button" :class="[bouton, 'bg-foret text-white hover:bg-savane px-4']" @click="ouvrirFormulaire()">
          <Plus class="w-4 h-4" aria-hidden="true" /> Créer un membre
        </button>
      </div>
      <p class="text-xs">Les mots de passe ne sont jamais lisibles : vous donnez un mot de passe provisoire, affiché une seule fois, que le membre peut garder.</p>
      <p class="text-xs p-3 rounded-xl bg-creme text-noir">Un membre qui veut aussi un compte client : changez ici l'e-mail de son compte d'équipe ; son adresse personnelle redevient libre pour s'inscrire comme client.</p>
    </div>

    <p v-if="isLoading" class="bg-white rounded-2xl p-6 text-center">Chargement de l'équipe…</p>
    <p v-else-if="isError" class="bg-red-50 text-red-700 rounded-2xl p-6 text-center">L'équipe n'a pas pu être chargée.</p>
    <ul v-else class="grid grid-cols-1 lg:grid-cols-2 gap-3" aria-label="Comptes de l'équipe">
      <li v-for="m in membres" :key="m._id" class="bg-white rounded-2xl p-4 space-y-3" :class="{ 'opacity-80': !m.actif }">
        <div class="flex flex-wrap items-center gap-1.5">
          <p class="font-bold text-noir text-base mr-1">{{ m.username }}</p>
          <span v-if="m.adminPrincipal" class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-or text-noir">Admin principal</span>
          <span v-if="m.estMoi" class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-foret/10 text-foret">Vous</span>
          <span :class="['px-2 py-0.5 rounded-full text-[11px] font-bold', m.actif ? 'bg-foret/10 text-foret' : 'bg-creme2 text-noir']">{{ m.actif ? 'Actif' : 'Désactivé' }}</span>
        </div>
        <dl class="grid grid-cols-1 min-[420px]:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div class="min-[420px]:col-span-2"><dt class="sr-only">E-mail</dt><dd class="text-noir break-all">{{ m.email }}</dd></div>
          <div><dt class="inline">Rôle : </dt><dd class="inline text-noir font-semibold">{{ LIBELLES_ROLES[m.role] ?? m.role }}</dd></div>
          <div v-if="m.role === 'gestionnaire'"><dt class="inline">Fiche livreur : </dt><dd class="inline text-noir">{{ m.livreurNom || 'aucune' }}</dd></div>
          <div><dt class="inline">Dernière connexion : </dt><dd class="inline text-noir">{{ dateHeure(m.derniereConnexion) || 'jamais' }}</dd></div>
          <div><dt class="inline">Mot de passe changé : </dt><dd class="inline text-noir">{{ dateHeure(m.motDePasseModifieLe) || 'jamais' }}</dd></div>
        </dl>
        <div v-if="peutAgir(m)" class="flex flex-wrap gap-2 pt-2 border-t border-creme2">
          <button type="button" :class="[bouton, 'bg-creme text-foret hover:bg-creme2']" :aria-label="`Modifier le compte de ${m.username}`" @click="ouvrirFormulaire(m)">
            <Pencil class="w-4 h-4" aria-hidden="true" /> Modifier
          </button>
          <button type="button" :class="[bouton, 'bg-creme text-foret hover:bg-creme2']" :aria-label="`Mot de passe provisoire de ${m.username}`" @click="ouvrirMotDePasse(m)">
            <KeyRound class="w-4 h-4" aria-hidden="true" /> Mot de passe
          </button>
          <button v-if="m.actif" type="button" :class="[bouton, 'bg-creme text-foret hover:bg-creme2']" :aria-label="`Envoyer un lien de réinitialisation à ${m.username}`" @click="envoyerLien(m)">
            <Mail class="w-4 h-4" aria-hidden="true" /> Lien
          </button>
          <button v-if="!m.estMoi" type="button" :class="[bouton, m.actif ? 'border border-red-200 text-red-700 hover:bg-red-50' : 'bg-foret/10 text-foret hover:bg-foret/20', 'sm:ml-auto']" @click="changerStatut(m)">
            <Power v-if="m.actif" class="w-4 h-4" aria-hidden="true" /><RotateCcw v-else class="w-4 h-4" aria-hidden="true" />
            {{ m.actif ? 'Désactiver' : 'Réactiver' }}
          </button>
        </div>
        <p v-else class="text-xs pt-2 border-t border-creme2">Seul l'admin principal gère son propre compte.</p>
      </li>
    </ul>

    <!-- Création ou modification -->
    <div v-if="formulaire.ouvert" :class="fenetre" @click.self="fermerFormulaire" @keydown.esc="fermerFormulaire">
      <form role="dialog" aria-modal="true" aria-labelledby="titre-membre" class="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl p-5 space-y-4 text-sm text-gris" @submit.prevent="enregistrerMembre">
        <div class="flex items-start justify-between gap-2">
          <h2 id="titre-membre" class="font-display font-bold text-lg text-noir">{{ formulaire.id ? 'Modifier le compte' : 'Créer un membre' }}</h2>
          <button type="button" class="cursor-pointer w-11 h-11 inline-flex items-center justify-center rounded-lg bg-creme" aria-label="Fermer" @click="fermerFormulaire"><X class="w-4 h-4" aria-hidden="true" /></button>
        </div>
        <label class="block text-xs font-bold text-noir">Nom *
          <input ref="champNom" v-model="formulaire.username" required :maxlength="NOM_MAX" autocomplete="off" :class="champ" />
        </label>
        <label class="block text-xs font-bold text-noir">Adresse e-mail *
          <input v-model="formulaire.email" required type="email" maxlength="120" autocomplete="off" :class="champ" aria-describedby="aide-email" />
        </label>
        <p id="aide-email" class="text-xs -mt-2">{{ formulaire.id ? 'Une nouvelle adresse déconnecte le membre : il se reconnecte avec elle.' : 'Adresse de connexion du membre à l\'admin.' }}</p>
        <label class="block text-xs font-bold text-noir">Rôle *
          <select v-model="formulaire.role" required :disabled="formulaire.roleFixe" :class="champ" :aria-describedby="formulaire.roleFixe ? 'aide-role' : undefined">
            <option v-for="r in EQUIPE" :key="r" :value="r">{{ LIBELLES_ROLES[r] }}</option>
          </select>
        </label>
        <p v-if="formulaire.roleFixe" id="aide-role" class="text-xs -mt-2">Votre propre rôle d'admin ne se retire pas.</p>
        <label v-if="formulaire.role === 'gestionnaire'" class="block text-xs font-bold text-noir">Fiche livreur
          <select v-model="formulaire.livreurId" :class="champ" aria-describedby="aide-livreur">
            <option value="">Aucune (gestionnaire non livreur)</option>
            <option v-for="f in fichesLivreur" :key="f._id" :value="f._id">{{ f.nom }}</option>
          </select>
        </label>
        <p v-if="formulaire.role === 'gestionnaire'" id="aide-livreur" class="text-xs -mt-2">Relié à une fiche livreur, il ne voit que ses livraisons et leurs clients.</p>
        <template v-if="!formulaire.id">
          <label class="block text-xs font-bold text-noir">Mot de passe provisoire
            <input v-model="formulaire.motDePasse" type="text" :minlength="MOT_DE_PASSE_MIN" maxlength="200" autocomplete="off" placeholder="Vide : généré" :class="champ" aria-describedby="aide-mdp-creation" />
          </label>
          <p id="aide-mdp-creation" class="text-xs -mt-2">Laissez vide pour en générer un ; sinon {{ MOT_DE_PASSE_MIN }} caractères au moins. Il sera affiché une seule fois.</p>
        </template>
        <p v-if="erreurFormulaire" role="alert" class="p-3 rounded-xl bg-red-50 text-red-800 text-xs font-semibold">{{ erreurFormulaire }}</p>
        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <button type="button" class="cursor-pointer min-h-11 px-4 rounded-xl border border-creme2 font-bold" @click="fermerFormulaire">Annuler</button>
          <button type="submit" :disabled="enregistrement" class="cursor-pointer min-h-11 px-5 rounded-xl bg-foret text-white font-bold hover:bg-savane disabled:opacity-60">
            {{ enregistrement ? 'Enregistrement…' : formulaire.id ? 'Enregistrer' : 'Créer le compte' }}
          </button>
        </div>
      </form>
    </div>

    <!-- Mot de passe provisoire : saisi ou généré -->
    <div v-if="motDePasse.ouvert" :class="fenetre" @click.self="fermerMotDePasse" @keydown.esc="fermerMotDePasse">
      <form role="dialog" aria-modal="true" aria-labelledby="titre-mdp" class="w-full max-w-md bg-white rounded-2xl p-5 space-y-4 text-sm text-gris" @submit.prevent="definirMotDePasse">
        <div class="flex items-start justify-between gap-2">
          <h2 id="titre-mdp" class="font-display font-bold text-lg text-noir">Mot de passe provisoire de {{ motDePasse.membre?.username }}</h2>
          <button type="button" class="cursor-pointer w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-lg bg-creme" aria-label="Fermer" @click="fermerMotDePasse"><X class="w-4 h-4" aria-hidden="true" /></button>
        </div>
        <p class="text-xs">L'ancien mot de passe ne marchera plus et le membre est déconnecté de ses sessions ouvertes.</p>
        <label class="block text-xs font-bold text-noir">Nouveau mot de passe
          <input ref="champMotDePasse" v-model="motDePasse.saisi" type="text" :minlength="MOT_DE_PASSE_MIN" maxlength="200" autocomplete="off" placeholder="Vide : généré" :class="champ" aria-describedby="aide-mdp" />
        </label>
        <p id="aide-mdp" class="text-xs -mt-2">Laissez vide pour en générer un ; sinon {{ MOT_DE_PASSE_MIN }} caractères au moins.</p>
        <p v-if="erreurMotDePasse" role="alert" class="p-3 rounded-xl bg-red-50 text-red-800 text-xs font-semibold">{{ erreurMotDePasse }}</p>
        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" class="cursor-pointer min-h-11 px-4 rounded-xl border border-creme2 font-bold" @click="fermerMotDePasse">Annuler</button>
          <button type="submit" :disabled="envoiMotDePasse" class="cursor-pointer min-h-11 px-5 rounded-xl bg-foret text-white font-bold hover:bg-savane disabled:opacity-60">
            {{ envoiMotDePasse ? 'Enregistrement…' : motDePasse.saisi ? 'Enregistrer ce mot de passe' : 'Générer un mot de passe' }}
          </button>
        </div>
      </form>
    </div>

    <!-- Mot de passe provisoire affiché une seule fois -->
    <div v-if="provisoire.ouvert" :class="fenetre" @keydown.esc="fermerProvisoire">
      <div role="dialog" aria-modal="true" aria-labelledby="titre-provisoire" aria-describedby="consigne-provisoire" class="w-full max-w-md bg-white rounded-2xl p-5 space-y-4 text-sm text-gris">
        <h2 id="titre-provisoire" class="font-display font-bold text-lg text-noir">Mot de passe de {{ provisoire.nom }}</h2>
        <p role="status" class="text-xs text-foret font-semibold">{{ provisoire.message }}</p>
        <div class="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-creme">
          <code ref="blocProvisoire" class="flex-1 min-w-0 font-mono text-lg font-bold text-noir break-all select-all">{{ provisoire.valeur }}</code>
          <button ref="boutonCopier" type="button" :class="[bouton, 'bg-white border border-creme2 text-foret']" @click="copierProvisoire">
            <Check v-if="provisoire.copie" class="w-4 h-4" aria-hidden="true" /><Copy v-else class="w-4 h-4" aria-hidden="true" />
            {{ provisoire.copie ? 'Copié' : 'Copier' }}
          </button>
        </div>
        <p id="consigne-provisoire" class="text-sm text-noir font-semibold">Notez-le maintenant : il ne sera plus affiché. Transmettez-le au membre, il pourra le garder.</p>
        <div class="flex justify-end">
          <button type="button" class="cursor-pointer min-h-11 px-5 rounded-xl bg-foret text-white font-bold hover:bg-savane" @click="fermerProvisoire">J'ai noté le mot de passe</button>
        </div>
      </div>
    </div>
  </div>
</template>
