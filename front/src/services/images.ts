// Photos des produits : réduction dans le navigateur avant l'envoi (connexions mobiles lentes) et adresses
// Cloudinary optimisées pour l'affichage (format et qualité automatiques, taille exacte de la carte).

const TAILLE_MAX = 1200 // px, côté le plus long

// Ramène une photo de téléphone (souvent 3 à 5 Mo) à environ 150 à 300 Ko, orientation respectée.
// En cas d'échec (format exotique, ancien navigateur), le fichier d'origine est envoyé tel quel.
export async function reduireImage(fichier: File): Promise<Blob> {
  try {
    const image = await createImageBitmap(fichier, { imageOrientation: 'from-image' })
    const echelle = Math.min(1, TAILLE_MAX / Math.max(image.width, image.height))
    if (echelle === 1 && fichier.size < 400 * 1024) { image.close(); return fichier }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.width * echelle)
    canvas.height = Math.round(image.height * echelle)
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
    image.close()
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.82))
    // Navigateur sans WebP : toBlob renvoie du PNG, plus lourd ; on passe alors en JPEG
    if (blob && blob.type === 'image/webp') return blob
    return (await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))) ?? fichier
  } catch {
    return fichier
  }
}

// Adresse Cloudinary recadrée à la taille d'affichage (×2 pour les écrans haute densité)
export function photoOptimisee(url: string, largeur: number, hauteur: number): string {
  if (!url.includes('res.cloudinary.com/') || !url.includes('/upload/')) return url
  return url.replace('/upload/', `/upload/f_auto,q_auto,c_fill,g_auto,w_${largeur * 2},h_${hauteur * 2}/`)
}
