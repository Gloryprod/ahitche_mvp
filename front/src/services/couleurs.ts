// Contraste des couleurs libres des cartes de formules (WCAG 2.x) : luminance relative et rapport de contraste.
// Fonctions pures, utilisées par la carte (components/ui/FormuleCard.vue) et l'écran « Site public ».
export const COULEUR_HEX = /^#[0-9A-Fa-f]{6}$/
export const BLANC = '#FFFFFF'
export const NOIR = '#111111' // Noir de la charte (text-noir)

// Luminance relative d'une couleur « #RRGGBB », de 0 (noir) à 1 (blanc)
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Rapport de contraste entre deux couleurs, de 1 à 21 (4,5 : texte courant lisible ; 3 : grand texte)
export function contraste(a: string, b: string): number {
  const [clair, fonce] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (clair + 0.05) / (fonce + 0.05)
}

// Texte le plus lisible sur un fond : blanc ou noir de la charte
export const couleurTexte = (fond: string): 'blanc' | 'noir' => (contraste(fond, BLANC) >= contraste(fond, NOIR) ? 'blanc' : 'noir')

// Meilleur contraste du texte posé sur ce fond (sous 4,5 : texte courant difficile à lire)
export const contrasteTexte = (fond: string) => Math.max(contraste(fond, BLANC), contraste(fond, NOIR))
