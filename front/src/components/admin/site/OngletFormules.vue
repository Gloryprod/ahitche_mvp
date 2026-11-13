<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Tags } from 'lucide-vue-next'
import FormuleCard from '@/components/ui/FormuleCard.vue'
import { FORMULES_DU_CODE, SLUGS_VITRINE, TAILLES_FOYER, formaterPrix, type FormuleVitrine } from '@/config/formules'
import { REGLES_FORMULE, type PrixSite, type TextesFormules } from '@/services/valeursSite'
import { doublonsFoyer, formulesAEnvoyer, messageDoublonFoyer } from './champsSite'

// Onglet « Formules » de l'écran « Site public » (docs-internes/admin/CONTRAT-site-public-B.md) : textes de chaque
// carte, prix de vente en lecture (il se modifie dans « Formules et prix »), aperçu avec la vraie carte du site et
// choix de la formule recommandée. Publication, confirmation et historique : SitePublic.vue.
const textes = defineModel<TextesFormules>('textes', { required: true })
const props = defineProps<{
  prix: PrixSite // Prix de vente de la base par slug ; null : le site garde celui du code
  erreur: { champ: string; message: string }
}>()

const idChamp = (id: string) => `champ-site-${id.replace(/\./g, '-')}`
// Erreur de la dernière publication ; pour la taille de foyer, aussi un doublon signalé dès la saisie (le serveur le refuse)
const doublons = computed(() => doublonsFoyer(textes.value))
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

// Une seule formule recommandée, ou aucune (valeur '')
const recommandee = computed({
  get: () => SLUGS_VITRINE.find(s => textes.value[s]?.recommandee) ?? '',
  set: (choix: string) => { for (const s of SLUGS_VITRINE) textes.value[s]!.recommandee = s === choix },
})

// Aperçu : la carte du site avec les textes nettoyés comme à l'envoi et le prix que le site affichera
const envoi = computed(() => formulesAEnvoyer(textes.value))
const prixAffiche = (f: Readonly<FormuleVitrine>) => props.prix[f.slug] ?? f.prix
const apercu = (f: Readonly<FormuleVitrine>): FormuleVitrine => {
  const t = envoi.value[f.slug]!
  return { ...f, ...t, cible: t.cible || '…', accroche: t.accroche || '…', repas: t.repas || '…', heures: t.heures || '…', prix: prixAffiche(f) }
}
// Champs de chaque carte : la formule du code (nom, emoji…) et ses textes du formulaire
const cartes = computed(() => FORMULES_DU_CODE.map(f => ({ f, t: textes.value[f.slug]! })))

const champ = 'mt-1 w-full min-h-11 px-3 py-2 rounded-xl border border-creme2 bg-creme text-sm text-noir font-normal disabled:opacity-80 aria-invalid:border-red-400'
const etiquette = 'block text-xs font-bold text-noir'
const erreurChamp = 'mt-1 text-xs font-semibold text-red-700'
</script>

<template>
  <div class="space-y-5">
    <!-- Formule recommandée : badge « Le plus choisi » sur la carte -->
    <fieldset :id="idChamp('recommandee')" tabindex="-1" aria-describedby="aide-recommandee">
      <legend :class="etiquette">Formule recommandée</legend>
      <p id="aide-recommandee" class="mt-1 text-xs">Sa carte porte le badge « Le plus choisi » tant que le visiteur n'a pas indiqué la taille de son foyer.</p>
      <div class="mt-2 grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-2">
        <label
          v-for="choix in [...FORMULES_DU_CODE.map(f => ({ valeur: f.slug, libelle: f.nom })), { valeur: '', libelle: 'Aucune' }]"
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

    <!-- Une carte par formule : champs, prix en lecture, aperçu -->
    <section
      v-for="{ f, t } in cartes"
      :key="f.slug"
      class="rounded-2xl border border-creme2 p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start"
      :aria-labelledby="`titre-formule-${f.slug}`"
    >
      <div class="space-y-3 min-w-0">
        <h3 :id="`titre-formule-${f.slug}`" class="font-bold text-noir text-base"><span aria-hidden="true">{{ f.emoji }}</span> {{ f.nom }}</h3>

        <!-- Prix de vente : lecture seule, il vient de la base -->
        <div class="p-3 rounded-xl bg-creme text-xs space-y-1">
          <p v-if="prix[f.slug] !== null" class="text-noir">
            Prix de vente : <strong class="text-sm tabular-nums">{{ formaterPrix(prix[f.slug]!) }} FCFA</strong> par mois
          </p>
          <p v-else class="text-noir">
            Pas de prix de vente en base (formule inactive, bientôt disponible ou sans prix) : le site affiche le prix du code,
            <strong class="tabular-nums whitespace-nowrap">{{ formaterPrix(f.prix) }} FCFA</strong>.
          </p>
          <p v-if="prix[f.slug] !== null && prix[f.slug] !== f.prix">Prix de secours du code, affiché si le serveur ne répond pas : <span class="tabular-nums whitespace-nowrap">{{ formaterPrix(f.prix) }} FCFA</span>.</p>
          <RouterLink :to="{ name: 'formulas-page' }" class="inline-flex items-center gap-1.5 min-h-11 text-savane font-bold hover:text-foret">
            <Tags class="w-4 h-4 shrink-0" aria-hidden="true" /> Modifier le prix dans Formules et prix
          </RouterLink>
        </div>

        <div>
          <label :for="idChamp(`${f.slug}.cible`)" :class="etiquette">Cible *</label>
          <input :id="idChamp(`${f.slug}.cible`)" v-model="t.cible" type="text" required :maxlength="REGLES_FORMULE.cible.max" autocomplete="off" :class="champ" v-bind="attributsErreur(`${f.slug}.cible`, `aide-cible-${f.slug}`)" />
          <p :id="`aide-cible-${f.slug}`" class="mt-1 text-xs flex justify-between gap-2"><span>Sous le nom de la formule.</span><span class="shrink-0">{{ t.cible.length }}/{{ REGLES_FORMULE.cible.max }}</span></p>
          <p v-if="erreurDe(`${f.slug}.cible`)" :id="`${idChamp(`${f.slug}.cible`)}-erreur`" :class="erreurChamp">{{ erreurDe(`${f.slug}.cible`) }}</p>
        </div>

        <div>
          <label :for="idChamp(`${f.slug}.accroche`)" :class="etiquette">Accroche *</label>
          <input :id="idChamp(`${f.slug}.accroche`)" v-model="t.accroche" type="text" required :maxlength="REGLES_FORMULE.accroche.max" autocomplete="off" :class="champ" v-bind="attributsErreur(`${f.slug}.accroche`, `aide-accroche-${f.slug}`)" />
          <p :id="`aide-accroche-${f.slug}`" class="mt-1 text-xs flex justify-between gap-2"><span>Entre guillemets sur la carte.</span><span class="shrink-0">{{ t.accroche.length }}/{{ REGLES_FORMULE.accroche.max }}</span></p>
          <p v-if="erreurDe(`${f.slug}.accroche`)" :id="`${idChamp(`${f.slug}.accroche`)}-erreur`" :class="erreurChamp">{{ erreurDe(`${f.slug}.accroche`) }}</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="min-w-0">
            <label :for="idChamp(`${f.slug}.repas`)" :class="etiquette">Repas *</label>
            <input :id="idChamp(`${f.slug}.repas`)" v-model="t.repas" type="text" required :maxlength="REGLES_FORMULE.repas.max" autocomplete="off" placeholder="20–30" :class="champ" v-bind="attributsErreur(`${f.slug}.repas`, `aide-repas-${f.slug}`)" />
            <p :id="`aide-repas-${f.slug}`" class="mt-1 text-xs">« repas possibles »</p>
          </div>
          <div class="min-w-0">
            <label :for="idChamp(`${f.slug}.heures`)" :class="etiquette">Heures *</label>
            <input :id="idChamp(`${f.slug}.heures`)" v-model="t.heures" type="text" required :maxlength="REGLES_FORMULE.heures.max" autocomplete="off" placeholder="2–4h" :class="champ" v-bind="attributsErreur(`${f.slug}.heures`, `aide-heures-${f.slug}`)" />
            <p :id="`aide-heures-${f.slug}`" class="mt-1 text-xs">« économisées »</p>
          </div>
        </div>
        <p class="text-xs -mt-1">Chiffres, espaces et tirets (20–30), plus « h » pour les heures (2–4h).</p>
        <p v-if="erreurDe(`${f.slug}.repas`)" :id="`${idChamp(`${f.slug}.repas`)}-erreur`" :class="erreurChamp">{{ erreurDe(`${f.slug}.repas`) }}</p>
        <p v-if="erreurDe(`${f.slug}.heures`)" :id="`${idChamp(`${f.slug}.heures`)}-erreur`" :class="erreurChamp">{{ erreurDe(`${f.slug}.heures`) }}</p>

        <div>
          <label :for="idChamp(`${f.slug}.foyer`)" :class="etiquette">Conseillée pour *</label>
          <select :id="idChamp(`${f.slug}.foyer`)" v-model="t.foyer" :class="champ" v-bind="attributsErreur(`${f.slug}.foyer`, `aide-foyer-${f.slug}`)">
            <option v-for="taille in TAILLES_FOYER" :key="taille.valeur" :value="taille.valeur">{{ taille.libelle }}</option>
          </select>
          <p :id="`aide-foyer-${f.slug}`" class="mt-1 text-xs">Comparateur « Combien êtes-vous à la maison ? » : une formule différente pour chaque taille.</p>
          <p v-if="erreurDe(`${f.slug}.foyer`)" :id="`${idChamp(`${f.slug}.foyer`)}-erreur`" role="alert" :class="erreurChamp">{{ erreurDe(`${f.slug}.foyer`) }}</p>
        </div>
      </div>

      <!-- Aperçu : la carte du site (sans valeur estimée barrée, calculée par le serveur) -->
      <div class="min-w-0 space-y-2">
        <p class="text-xs font-bold text-foret uppercase tracking-wider">Aperçu</p>
        <div class="pt-4 max-w-[340px] mx-auto lg:mx-0">
          <FormuleCard :formule="apercu(f)" />
        </div>
      </div>
    </section>
  </div>
</template>
