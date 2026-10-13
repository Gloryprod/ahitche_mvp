// Référencement : adresse canonique et indexation propres à chaque page, données structurées (schema.org).
import type { RouteLocationNormalized } from 'vue-router'
import { WHATSAPP_NUMERO, RESEAUX_SOCIAUX, HORAIRES_GOOGLE, PAIEMENT_ANNONCE } from '@/config/contact'
import { FORMULES } from '@/config/formules'

export const SITE = 'https://ahitchebj.com'

// Pages à faire connaître aux moteurs de recherche ; les autres (compte, espaces, page introuvable) : noindex
const PAGES_INDEXABLES = ['home', 'blog', 'blog-article', 'mentions-legales']

function balise<T extends HTMLElement>(selecteur: string, creer: () => T): T {
  return (document.head.querySelector(selecteur) as T | null) ?? document.head.appendChild(creer())
}

// Appelé après chaque navigation (routeur)
export function mettreAJourReferencement(to: RouteLocationNormalized) {
  const indexable = PAGES_INDEXABLES.includes(String(to.name))
  const adresse = SITE + (to.path === '/' ? '/' : to.path.replace(/\/+$/, ''))

  const canonique = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (indexable) {
    balise('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' })).href = adresse
  } else {
    canonique?.remove()
  }

  const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
  if (indexable) robots?.remove()
  else balise('meta[name="robots"]', () => Object.assign(document.createElement('meta'), { name: 'robots' })).content = 'noindex'

  const ogUrl = document.head.querySelector<HTMLMetaElement>('meta[property="og:url"]')
  if (ogUrl) ogUrl.content = adresse
}

// Ajoute (ou remplace) un bloc de données structurées dans <head> ; renvoie de quoi le retirer
export function ajouterDonneesStructurees(id: string, donnees: object): () => void {
  document.getElementById(id)?.remove()
  const script = Object.assign(document.createElement('script'), { id, type: 'application/ld+json', textContent: JSON.stringify(donnees) })
  document.head.appendChild(script)
  return () => script.remove()
}

// Commerce local (Cotonou et Abomey-Calavi) et formules hebdomadaires avec leur prix. Aucune adresse postale :
// elle n'est pas publiée, rien n'est inventé.
export function donneesCommerce() {
  return {
    '@context': 'https://schema.org',
    '@type': 'GroceryStore',
    '@id': `${SITE}/#commerce`,
    name: 'Ahitché',
    url: `${SITE}/`,
    logo: `${SITE}/logo-ahitche-512.webp`,
    image: `${SITE}/og-image.jpeg`,
    description: 'Ravitaillement alimentaire régulier livré à domicile à Cotonou et Abomey-Calavi : formules hebdomadaires de produits de base, paiement à la livraison.',
    telephone: `+${WHATSAPP_NUMERO}`,
    areaServed: [
      { '@type': 'City', name: 'Cotonou' },
      { '@type': 'City', name: 'Abomey-Calavi' },
    ],
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: HORAIRES_GOOGLE.jours,
      opens: HORAIRES_GOOGLE.ouverture,
      closes: HORAIRES_GOOGLE.fermeture,
    }],
    currenciesAccepted: 'XOF',
    paymentAccepted: PAIEMENT_ANNONCE,
    sameAs: RESEAUX_SOCIAUX.map(r => r.url),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Formules hebdomadaires',
      itemListElement: FORMULES.map(f => ({
        '@type': 'Offer',
        name: f.nom,
        description: `${f.cible} : ${f.accroche}`,
        price: f.prix,
        priceCurrency: 'XOF',
        availability: 'https://schema.org/InStock',
        url: `${SITE}/#formules`,
      })),
    },
  }
}
