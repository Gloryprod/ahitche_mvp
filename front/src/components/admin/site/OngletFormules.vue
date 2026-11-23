<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { ChevronDown, ChevronUp, Tags } from 'lucide-vue-next'
import FormuleCard from '@/components/ui/FormuleCard.vue'
import { FORMULES_DU_CODE, TAILLES_FOYER, formaterPrix, type FormuleVitrine } from '@/config/formules'
import {
  REGLES_EMOJI, REGLES_FORMULE, THEMES_FORMULE, estTheme, trierParOrdre, type CouleurFormule, type PrixSite, type TextesFormules,
  type ThemeFormule,
} from '@/services/valeursSite'
import { BLANC, contraste, contrasteTexte } from '@/services/couleurs'
import type { Pack } from '@/services/packs'
import { NOMS_THEMES, doublonsFoyer, formulesAEnvoyer, messageDoublonFoyer, nomCourt, nomSurLaCarte } from './champsSite'

// Onglet « Formules » de l'écran « Site public » : une carte par pack de la base, dans l'ordre de l'accueil
// (affichage, ordre, emoji, couleur, niveau, textes, foyer), prix de vente en lecture (il se modifie dans
// « Formules et prix »), aperçu avec la vraie carte du site et choix de la formule recommandée.
// Publication, confirmation et historique : SitePublic.vue.
const textes = defineModel<TextesFormules>('textes', { required: true })
const props = defineProps<{
  packs: readonly Pack[] // Packs de la base, une carte chacun (clés de `textes`)
  prix: PrixSite // Prix de vente de la base par slug ; null ou absent : celui du code, sinon inconnu ici
  erreur: { champ: string; message: string }
}>()

const idChamp = (id: string) => `champ-site-${id.replace(/\./g, '-')}`
const ordre = computed(() => trierParOrdre(textes.value))
const packDe = (slug: string): Pack => props.packs.find(p => p.slug === slug)
  ?? { type: '', slug, nom: slug, statut: 'actif', bientotDisponible: false, ordre: null }

// Erreur de la dernière publication ; pour la taille de foyer, aussi un doublon signalé dès la saisie (le serveur le refuse)
const doublons = computed(() => doublonsFoyer(textes.value, props.packs))
const erreurDe = (champ: string) => {
  if (props.erreur.champ === champ) return props.erreur.message
  const [slug, nom] = champ.split('.')
  const deja = nom === 'foyer' && slug ? doublons.value[slug] : undefined
  return deja ? messageDoublonFoyer(deja) : ''
}
const attributsErreur = (champ: string, aide?: string) => {
  const erreur = erreurDe(champ) ? `${idChamp(champ)}-erreur` : ''
  const decrit = [aide, erreur].filter(Boolean).join(' ')
  return { ...(erreur ? { 'aria-invalid': 'true' as const } : {}), ...(decrit ? { 'aria-describedby': decrit } : {}) }
}

// Une seule formule recommandée parmi les cartes affichées, ou aucune (valeur '')
const recommandee = computed({
  get: () => ordre.value.find(s => textes.value[s]!.afficher && textes.value[s]!.recommandee) ?? '',
  set: (choix: string) => { for (const s of ordre.value) textes.value[s]!.recommandee = s === choix },
})
const choixRecommandee = computed(() => [
  ...ordre.value.filter(s => textes.value[s]!.afficher).map(s => ({ valeur: s, libelle: nomSurLaCarte(packDe(s)) })),
  { valeur: '', libelle: 'Aucune' },
])

// Ordre : les flèches échangent la carte avec sa voisine ; le focus reste sur la flèche, la nouvelle place est annoncée
const annonceOrdre = ref('')
async function deplacer(slug: string, sens: -1 | 1) {
  const liste = ordre.value
  const i = liste.indexOf(slug)
  const voisine = liste[i + sens]
  if (!voisine) return
  const t = textes.value
  ;[t[slug]!.ordre, t[voisine]!.ordre] = [t[voisine]!.ordre, t[slug]!.ordre]
  annonceOrdre.value = `${packDe(slug).nom} : ${i + sens + 1}e sur ${liste.length}.`
  await nextTick()
  const fleche = (cote: string) => document.getElementById(`${idChamp(`${slug}.ordre`)}-${cote}`) as HTMLButtonElement | null
  const memeFleche = fleche(sens < 0 ? 'monter' : 'descendre')
  ;(memeFleche && !memeFleche.disabled ? memeFleche : fleche(sens < 0 ? 'descendre' : 'monter'))?.focus()
}

// Carte masquée : réglages repliés, à déplier pour la préparer ; dépliée d'office si une erreur la concerne
const depliees = reactive(new Set<string>())
const ouverte = (slug: string) => textes.value[slug]!.afficher || depliees.has(slug)
const basculer = (slug: string) => (depliees.has(slug) ? depliees.delete(slug) : depliees.add(slug))
watch(() => props.erreur.champ, champ => {
  const slug = champ.split('.')[0]
  if (slug && textes.value[slug]) depliees.add(slug)
})

// Couleur : trois thèmes prêts à l'emploi, ou une couleur libre (le texte de l'en-tête suit le meilleur contraste)
const PASTILLES: Record<ThemeFormule, string> = { savane: 'bg-savane/10 ring-1 ring-savane/40', foret: 'bg-foret', marine: 'bg-marine' }
const choisirCouleurLibre = (slug: string, e: Event) => {
  textes.value[slug]!.couleur = (e.target as HTMLInputElement).value.toUpperCase() as CouleurFormule
}
function alerteCouleur(c: CouleurFormule): string {
  if (estTheme(c)) return ''
  const rapport = contrasteTexte(c)
  if (rapport < 4.5) {
    return `Contraste faible (${rapport.toFixed(1).replace('.', ',')} : 1) : le texte de l'en-tête se lit mal. Choisissez une couleur plus claire ou plus foncée.`
  }
  return contraste(c, BLANC) < 4.5 ? 'Couleur claire : sur le blanc de la carte, les chiffres et le prix s\'affichent en noir.' : ''
}

// Aperçu : la carte du site avec les valeurs nettoyées comme à l'envoi et le prix que le site affichera.
// Sans prix connu ici (pack créé : il vient de « Formules et prix »), l'en-tête seulement.
const envoi = computed(() => formulesAEnvoyer(textes.value))
const prixDuCode = (slug: string) => FORMULES_DU_CODE.find(f => f.slug === slug)?.prix ?? null
const prixAffiche = (slug: string) => props.prix[slug] ?? prixDuCode(slug)
const apercu = (slug: string): FormuleVitrine => {
  const t = envoi.value[slug] ?? textes.value[slug]!
  return {
    slug, nom: nomSurLaCarte(packDe(slug)), emoji: t.emoji.trim() || '…', couleur: t.couleur, niveau: t.niveau, ordre: t.ordre,
    cible: t.cible || '…', accroche: t.accroche || '…', repas: t.repas || '…', heures: t.heures || '…',
    foyer: t.foyer, recommandee: t.recommandee && t.afficher, prix: prixAffiche(slug) ?? 0,
  }
}
const longueur = (t: string) => Array.from(t.trim()).length

const champ = 'mt-1 w-full min-h-11 px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal disabled:opacity-80 aria-invalid:border-red-400'
const etiquette = 'block text-xs font-bold text-noir'
const erreurChamp = 'mt-1 text-xs font-semibold text-red-700'
const fleche = 'cursor-pointer inline-flex items-center justify-center w-11 h-11 rounded-xl border border-creme2 text-foret hover:bg-creme2 disabled:opacity-40 disabled:cursor-not-allowed'
</script>

<template>
  <div class="space-y-5">
    <!-- Formule recommandée : badge « Le plus choisi » sur la carte -->
    <fieldset :id="idChamp('recommandee')" tabindex="-1" aria-describedby="aide-recommandee">
      <legend :class="etiquette">Formule recommandée</legend>
      <p id="aide-recommandee" class="mt-1 text-xs">Parmi les cartes affichées. Sa carte porte le badge « Le plus choisi » tant que le visiteur n'a pas indiqué la taille de son foyer.</p>
      <div class="mt-2 grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-2">
        <label
          v-for="choix in choixRecommandee"
          :key="choix.valeur || 'aucune'"
          class="flex items-center gap-2 min-h-11 px-3 rounded-xl border cursor-pointer text-sm text-noir font-semibold"
          :class="recommandee === choix.valeur ? 'border-foret bg-foret/5' : 'border-creme2'"
        >
          <input v-model="recommandee" type="radio" name="formule-recommandee" :value="choix.valeur" class="w-4 h-4 accent-foret" />
          {{ choix.libelle }}
        </label>
      </div>
      <p v-if="erreurDe('recommandee')" :id="`${idChamp('recommandee')}-erreur`" :class="erreurChamp">{{ erreurDe('recommandee') }}</p>
    </fieldset>

    <p class="sr-only" aria-live="polite">{{ annonceOrdre }}</p>

    <!-- Une carte par pack, dans l'ordre de l'accueil : affichage, ordre, réglages, prix en lecture, aperçu -->
    <section
      v-for="(slug, i) in ordre"
      :key="slug"
      :class="['rounded-2xl border p-3 sm:p-4 space-y-3', textes[slug]!.afficher ? 'border-creme2' : 'border-dashed border-gris-lt bg-creme/50']"
      :aria-labelledby="`titre-formule-${slug}`"
    >
      <div class="flex items-center gap-2">
        <h3 :id="`titre-formule-${slug}`" class="flex-1 min-w-0 font-bold text-noir text-base">
          <span aria-hidden="true">{{ textes[slug]!.emoji }}</span> {{ packDe(slug).nom }}
          <span v-if="packDe(slug).statut === 'inactif'" class="ml-1 align-middle inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-creme2 text-noir">Inactif</span>
          <span v-if="packDe(slug).bientotDisponible" class="ml-1 align-middle inline-block text-[11px] font-bold px-2 py-0.5 rounded-full bg-or/20 text-noir">Bientôt disponible</span>
        </h3>
        <div :id="idChamp(`${slug}.ordre`)" tabindex="-1" role="group" :aria-label="`Place de ${packDe(slug).nom} sur l'accueil`" class="flex gap-1 shrink-0">
          <button :id="`${idChamp(`${slug}.ordre`)}-monter`" type="button" :class="fleche" :disabled="i === 0" :aria-label="`Monter ${packDe(slug).nom} d'une place`" @click="deplacer(slug, -1)">
            <ChevronUp class="w-5 h-5" aria-hidden="true" />
          </button>
          <button :id="`${idChamp(`${slug}.ordre`)}-descendre`" type="button" :class="fleche" :disabled="i === ordre.length - 1" :aria-label="`Descendre ${packDe(slug).nom} d'une place`" @click="deplacer(slug, 1)">
            <ChevronDown class="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <p v-if="erreurDe(`${slug}.ordre`)" :id="`${idChamp(`${slug}.ordre`)}-erreur`" :class="erreurChamp">{{ erreurDe(`${slug}.ordre`) }}</p>

      <label :for="idChamp(`${slug}.afficher`)" class="flex items-center gap-3 min-h-11 p-3 rounded-xl border cursor-pointer text-sm font-semibold text-noir" :class="textes[slug]!.afficher ? 'border-foret bg-foret/5' : 'border-creme2 bg-white'">
        <input :id="idChamp(`${slug}.afficher`)" v-model="textes[slug]!.afficher" type="checkbox" class="w-5 h-5 accent-foret" v-bind="attributsErreur(`${slug}.afficher`, `aide-afficher-${slug}`)" />
        Afficher sur l'accueil
      </label>
      <p :id="`aide-afficher-${slug}`" class="text-xs -mt-1">
        <template v-if="packDe(slug).statut === 'inactif'">Pack inactif : sa carte reste masquée sur l'accueil, même cochée.</template>
        <template v-else-if="packDe(slug).bientotDisponible">Bientôt disponible : ce pack ne peut pas encore être commandé.</template>
        <template v-else-if="!textes[slug]!.afficher">
          Masquée : la carte n'apparaît pas sur l'accueil.<template v-if="!envoi[slug]"> Ses réglages ne sont enregistrés qu'avec ses quatre textes.</template>
        </template>
        <template v-else>Affichée : les flèches règlent sa place parmi les cartes.</template>
      </p>
      <p v-if="erreurDe(`${slug}.afficher`)" :id="`${idChamp(`${slug}.afficher`)}-erreur`" :class="erreurChamp">{{ erreurDe(`${slug}.afficher`) }}</p>

      <button
        v-if="!textes[slug]!.afficher"
        type="button"
        class="cursor-pointer inline-flex items-center min-h-11 text-xs font-bold text-savane hover:text-foret"
        :aria-expanded="ouverte(slug)"
        :aria-controls="`reglages-${slug}`"
        @click="basculer(slug)"
      >
        {{ ouverte(slug) ? 'Replier les réglages' : 'Préparer la carte' }}
      </button>

      <div v-if="ouverte(slug)" :id="`reglages-${slug}`" class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
        <div class="space-y-3 min-w-0">
          <!-- Prix de vente : lecture seule, il vient de la base -->
          <div class="p-3 rounded-xl bg-creme text-xs space-y-1">
            <p v-if="typeof prix[slug] === 'number'" class="text-noir">
              Prix de vente : <strong class="text-sm tabular-nums">{{ formaterPrix(prix[slug]!) }} FCFA</strong> par mois
            </p>
            <p v-else-if="prixDuCode(slug) !== null" class="text-noir">
              Pas de prix de vente en base (formule inactive, bientôt disponible ou sans prix) : le site affiche le prix du code,
              <strong class="tabular-nums whitespace-nowrap">{{ formaterPrix(prixDuCode(slug)!) }} FCFA</strong>.
            </p>
            <p v-else class="text-noir">Le prix vient de l'écran « Formules et prix » : la carte ne s'affiche qu'avec un prix de vente en base.</p>
            <p v-if="typeof prix[slug] === 'number' && prixDuCode(slug) !== null && prix[slug] !== prixDuCode(slug)">Prix de secours du code, affiché si le serveur ne répond pas : <span class="tabular-nums whitespace-nowrap">{{ formaterPrix(prixDuCode(slug)!) }} FCFA</span>.</p>
            <RouterLink :to="{ name: 'formulas-page' }" class="inline-flex items-center gap-1.5 min-h-11 text-savane font-bold hover:text-foret">
              <Tags class="w-4 h-4 shrink-0" aria-hidden="true" /> Modifier le prix dans Formules et prix
            </RouterLink>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="min-w-0">
              <label :for="idChamp(`${slug}.emoji`)" :class="etiquette">Emoji *</label>
              <input :id="idChamp(`${slug}.emoji`)" v-model="textes[slug]!.emoji" type="text" required maxlength="16" autocomplete="off" :class="[champ, 'text-xl text-center']" v-bind="attributsErreur(`${slug}.emoji`, `aide-emoji-${slug}`)" />
              <p :id="`aide-emoji-${slug}`" class="mt-1 text-xs flex justify-between gap-2"><span>Ex. 🎓</span><span class="shrink-0">{{ longueur(textes[slug]!.emoji) }}/{{ REGLES_EMOJI.max }}</span></p>
            </div>
            <div class="min-w-0">
              <label :for="idChamp(`${slug}.niveau`)" :class="etiquette">Niveau de confort *</label>
              <select :id="idChamp(`${slug}.niveau`)" v-model.number="textes[slug]!.niveau" :class="champ" v-bind="attributsErreur(`${slug}.niveau`, `aide-niveau-${slug}`)">
                <option v-for="n in 3" :key="n" :value="n">{{ n }} sur 3</option>
              </select>
              <p :id="`aide-niveau-${slug}`" class="mt-1 text-xs">Jauge de la carte.</p>
            </div>
          </div>
          <p v-if="erreurDe(`${slug}.emoji`)" :id="`${idChamp(`${slug}.emoji`)}-erreur`" :class="erreurChamp">{{ erreurDe(`${slug}.emoji`) }}</p>
          <p v-if="erreurDe(`${slug}.niveau`)" :id="`${idChamp(`${slug}.niveau`)}-erreur`" :class="erreurChamp">{{ erreurDe(`${slug}.niveau`) }}</p>

          <!-- Couleur : trois thèmes ou une couleur libre (hors charte, choix du porteur) -->
          <fieldset :id="idChamp(`${slug}.couleur`)" tabindex="-1" :aria-describedby="`aide-couleur-${slug}`" class="min-w-0">
            <legend :class="etiquette">Couleur de l'en-tête</legend>
            <div class="mt-1 flex flex-wrap gap-2">
              <label v-for="theme in THEMES_FORMULE" :key="theme" class="cursor-pointer">
                <input v-model="textes[slug]!.couleur" type="radio" :name="`couleur-${slug}`" :value="theme" class="peer sr-only" />
                <span class="inline-flex items-center gap-2 min-h-11 px-3 rounded-xl border-2 border-creme2 bg-white text-sm font-semibold text-noir peer-checked:border-foret peer-checked:bg-foret/5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-or">
                  <span :class="['w-5 h-5 rounded-full shrink-0', PASTILLES[theme]]" aria-hidden="true"></span>{{ NOMS_THEMES[theme] }}
                </span>
              </label>
              <label :for="idChamp(`${slug}.couleur-libre`)" :class="['inline-flex items-center gap-2 min-h-11 px-3 rounded-xl border-2 bg-white cursor-pointer text-sm font-semibold text-noir', estTheme(textes[slug]!.couleur) ? 'border-creme2' : 'border-foret bg-foret/5']">
                <input
                  :id="idChamp(`${slug}.couleur-libre`)"
                  type="color"
                  :value="estTheme(textes[slug]!.couleur) ? '#2e7d4f' : textes[slug]!.couleur.toLowerCase()"
                  class="w-7 h-7 shrink-0 cursor-pointer rounded-md border border-creme2 bg-white p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-or"
                  @input="choisirCouleurLibre(slug, $event)"
                />
                Couleur libre<span v-if="!estTheme(textes[slug]!.couleur)" class="font-normal tabular-nums">{{ textes[slug]!.couleur }}</span>
              </label>
            </div>
            <p :id="`aide-couleur-${slug}`" class="mt-1 text-xs">Trois thèmes réglés pour la lecture, ou une couleur libre : le titre passe alors en blanc ou en noir, le plus lisible.</p>
            <p class="mt-1 text-xs font-semibold text-noir" aria-live="polite">{{ alerteCouleur(textes[slug]!.couleur) }}</p>
            <p v-if="erreurDe(`${slug}.couleur`)" :id="`${idChamp(`${slug}.couleur`)}-erreur`" :class="erreurChamp">{{ erreurDe(`${slug}.couleur`) }}</p>
          </fieldset>

          <div>
            <label :for="idChamp(`${slug}.cible`)" :class="etiquette">Cible *</label>
            <input :id="idChamp(`${slug}.cible`)" v-model="textes[slug]!.cible" type="text" required :maxlength="REGLES_FORMULE.cible.max" autocomplete="off" placeholder="1 personne · par mois" :class="champ" v-bind="attributsErreur(`${slug}.cible`, `aide-cible-${slug}`)" />
            <p :id="`aide-cible-${slug}`" class="mt-1 text-xs flex justify-between gap-2"><span>Sous le nom de la formule.</span><span class="shrink-0">{{ textes[slug]!.cible.length }}/{{ REGLES_FORMULE.cible.max }}</span></p>
            <p v-if="erreurDe(`${slug}.cible`)" :id="`${idChamp(`${slug}.cible`)}-erreur`" :class="erreurChamp">{{ erreurDe(`${slug}.cible`) }}</p>
          </div>

          <div>
            <label :for="idChamp(`${slug}.accroche`)" :class="etiquette">Accroche *</label>
            <input :id="idChamp(`${slug}.accroche`)" v-model="textes[slug]!.accroche" type="text" required :maxlength="REGLES_FORMULE.accroche.max" autocomplete="off" :class="champ" v-bind="attributsErreur(`${slug}.accroche`, `aide-accroche-${slug}`)" />
            <p :id="`aide-accroche-${slug}`" class="mt-1 text-xs flex justify-between gap-2"><span>Entre guillemets sur la carte.</span><span class="shrink-0">{{ textes[slug]!.accroche.length }}/{{ REGLES_FORMULE.accroche.max }}</span></p>
            <p v-if="erreurDe(`${slug}.accroche`)" :id="`${idChamp(`${slug}.accroche`)}-erreur`" :class="erreurChamp">{{ erreurDe(`${slug}.accroche`) }}</p>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="min-w-0">
              <label :for="idChamp(`${slug}.repas`)" :class="etiquette">Repas *</label>
              <input :id="idChamp(`${slug}.repas`)" v-model="textes[slug]!.repas" type="text" required :maxlength="REGLES_FORMULE.repas.max" autocomplete="off" placeholder="20–30" :class="champ" v-bind="attributsErreur(`${slug}.repas`, `aide-repas-${slug}`)" />
              <p :id="`aide-repas-${slug}`" class="mt-1 text-xs">« repas possibles »</p>
            </div>
            <div class="min-w-0">
              <label :for="idChamp(`${slug}.heures`)" :class="etiquette">Heures *</label>
              <input :id="idChamp(`${slug}.heures`)" v-model="textes[slug]!.heures" type="text" required :maxlength="REGLES_FORMULE.heures.max" autocomplete="off" placeholder="2–4h" :class="champ" v-bind="attributsErreur(`${slug}.heures`, `aide-heures-${slug}`)" />
              <p :id="`aide-heures-${slug}`" class="mt-1 text-xs">« économisées »</p>
            </div>
          </div>
          <p class="text-xs -mt-1">Chiffres, espaces et tirets (20–30), plus « h » pour les heures (2–4h).</p>
          <p v-if="erreurDe(`${slug}.repas`)" :id="`${idChamp(`${slug}.repas`)}-erreur`" :class="erreurChamp">{{ erreurDe(`${slug}.repas`) }}</p>
          <p v-if="erreurDe(`${slug}.heures`)" :id="`${idChamp(`${slug}.heures`)}-erreur`" :class="erreurChamp">{{ erreurDe(`${slug}.heures`) }}</p>

          <div>
            <label :for="idChamp(`${slug}.foyer`)" :class="etiquette">Conseillée pour</label>
            <select :id="idChamp(`${slug}.foyer`)" v-model="textes[slug]!.foyer" :class="champ" v-bind="attributsErreur(`${slug}.foyer`, `aide-foyer-${slug}`)">
              <option v-for="taille in TAILLES_FOYER" :key="taille.valeur" :value="taille.valeur">{{ taille.libelle }}</option>
              <option value="">Aucune taille</option>
            </select>
            <p :id="`aide-foyer-${slug}`" class="mt-1 text-xs">Comparateur « Combien êtes-vous à la maison ? » : une carte affichée différente pour chaque taille, ou aucune.</p>
            <p v-if="erreurDe(`${slug}.foyer`)" :id="`${idChamp(`${slug}.foyer`)}-erreur`" role="alert" :class="erreurChamp">{{ erreurDe(`${slug}.foyer`) }}</p>
          </div>
        </div>

        <!-- Aperçu : la carte du site (sans valeur estimée barrée, calculée par le serveur) -->
        <div class="min-w-0 space-y-2">
          <p class="text-xs font-bold text-foret uppercase tracking-wider">Aperçu</p>
          <div class="pt-4 max-w-[340px] mx-auto lg:mx-0">
            <FormuleCard :formule="apercu(slug)" :entete-seule="prixAffiche(slug) === null" />
          </div>
          <p v-if="prixAffiche(slug) === null" class="text-xs">En-tête seulement : repas, heures et prix s'affichent avec le prix de vente du pack.</p>
          <p v-if="!textes[slug]!.afficher" class="text-xs">Carte masquée : {{ nomCourt(packDe(slug).nom) }} n'apparaît pas sur l'accueil.</p>
        </div>
      </div>
    </section>
  </div>
</template>
