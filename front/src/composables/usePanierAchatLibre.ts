import { ref, reactive, computed } from 'vue'
import { MAX_DEMANDES, DESIGNATION, type ProduitVip } from '@/config/vip'

// Panier d'un achat libre VIP, commun à l'espace client (AchatsLibresVip.vue) et à la saisie par l'équipe
// (FormulaireAchatLibreAdmin.vue) : quantités par produit (multiples du pas, du pas au maximum), demandes libres,
// totaux indicatifs. Le serveur refait tous les contrôles et fixe le prix.

// Demande libre en cours de saisie ; prix seulement quand l'admin le fixe dès la saisie (sinon « à chiffrer »)
export interface DemandeSaisie {
  id: number
  designation: string
  quantite: string
  prix: number | null
}

const nettoyer = (texte: string) => texte.replace(/\s+/g, ' ').trim()

export function usePanierAchatLibre() {
  const produits = ref<ProduitVip[]>([])
  const quantites = reactive<Record<string, number>>({})
  const demandes = ref<DemandeSaisie[]>([])
  let prochainId = 1

  const produitsBase = computed(() => produits.value.filter(p => p.famille === 'P'))
  const produitsVariables = computed(() => produits.value.filter(p => p.famille === 'V'))

  // Liste reçue du serveur : un produit qui n'est plus proposé quitte le panier
  function definirProduits(liste: ProduitVip[]) {
    produits.value = liste
    for (const id of Object.keys(quantites)) if (!liste.some(p => p.productId === id)) delete quantites[id]
  }

  const quantite = (p: ProduitVip) => quantites[p.productId] ?? 0
  // Valeur ramenée au pas (0,5 kg ou L ; 1 sinon), entre le pas et le maximum ; 0 ou illisible : produit retiré
  function fixer(p: ProduitVip, valeur: number) {
    const q = !Number.isFinite(valeur) || valeur <= 0 ? 0 : Math.min(p.maximum, Math.max(p.pas, Math.round(valeur / p.pas) * p.pas))
    if (q) quantites[p.productId] = q
    else delete quantites[p.productId]
  }

  // Ajoute une demande libre ; renvoie le message d'erreur à afficher, ou une chaîne vide
  function ajouterDemande(saisie: { designation: string; quantite: string; prix?: number | null }): string {
    const designation = nettoyer(saisie.designation)
    if (demandes.value.length >= MAX_DEMANDES) return `${MAX_DEMANDES} demandes au plus par commande.`
    if (designation.length < DESIGNATION.min) return 'Décrivez le produit souhaité.'
    demandes.value.push({ id: prochainId++, designation, quantite: nettoyer(saisie.quantite), prix: saisie.prix ?? null })
    return ''
  }
  const retirerDemande = (id: number) => { demandes.value = demandes.value.filter(d => d.id !== id) }

  const lignes = computed(() => produits.value.filter(p => quantite(p) > 0).map(p => ({ productId: p.productId, quantite: quantite(p) })))
  // Produits choisis, lisibles (message WhatsApp de secours)
  const choisis = computed(() => produits.value.filter(p => quantite(p) > 0).map(p => ({ nom: p.nom, quantite: quantite(p), unite: p.unite })))
  // Comme le serveur : lignes au prix VIP arrondies au franc, plus les demandes déjà chiffrées
  const totalProduits = computed(() => Math.round(produits.value.reduce((s, p) => s + p.prixVip * quantite(p), 0)))
  const totalDemandes = computed(() => demandes.value.reduce((s, d) => s + (d.prix ?? 0), 0))
  const aChiffrer = computed(() => demandes.value.filter(d => d.prix === null).length)
  const panierVide = computed(() => !lignes.value.length && !demandes.value.length)
  const resume = computed(() => [
    lignes.value.length ? `${lignes.value.length} produit${lignes.value.length > 1 ? 's' : ''}` : '',
    demandes.value.length ? `${demandes.value.length} demande${demandes.value.length > 1 ? 's' : ''} libre${demandes.value.length > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · '))

  function vider() {
    for (const id of Object.keys(quantites)) delete quantites[id]
    demandes.value = []
  }

  return {
    produits, produitsBase, produitsVariables, quantites, demandes,
    definirProduits, quantite, fixer, ajouterDemande, retirerDemande,
    lignes, choisis, totalProduits, totalDemandes, aChiffrer, panierVide, resume, vider,
  }
}
