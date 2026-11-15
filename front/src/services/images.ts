// Photos : réduction dans le navigateur avant l'envoi (connexions mobiles lentes) et adresses Cloudinary optimisées
// pour l'affichage (format et qualité automatiques, taille exacte de la carte ou de l'emplacement).
import type { EmplacementPhoto } from '@/config/photos'
import { urlPhotoValide } from './valeursSite'

const TAILLE_MAX = 1200 // px, côté le plus long (produits) ; 1600 pour les photos de la frise de l'accueil

// Ramène une photo de téléphone (souvent 3 à 5 Mo) à environ 150 à 300 Ko, orientation respectée.
// En cas d'échec (format exotique, ancien navigateur), le fichier d'origine est envoyé tel quel.
export async function reduireImage(fichier: File, tailleMax = TAILLE_MAX): Promise<Blob> {
  try {
    const image = await createImageBitmap(fichier, { imageOrientation: 'from-image' })
    const echelle = Math.min(1, tailleMax / Math.max(image.width, image.height))
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

// Nom du fichier envoyé, d'après le format obtenu après réduction
export const nomFichierPhoto = (image: Blob, fichier: File) =>
  (image.type === 'image/webp' ? 'photo.webp' : image.type === 'image/jpeg' ? 'photo.jpg' : fichier.name)

// Adresse Cloudinary recadrée à la taille d'affichage (×2 pour les écrans haute densité)
export function photoOptimisee(url: string, largeur: number, hauteur: number): string {
  if (!url.includes('res.cloudinary.com/') || !url.includes('/upload/')) return url
  return url.replace('/upload/', `/upload/f_auto,q_auto,c_fill,g_auto,w_${largeur * 2},h_${hauteur * 2}/`)
}

// --- Photos des emplacements du site (frise de l'accueil, config/photos.ts) ---
export const LARGEURS_PHOTO = [400, 800, 1200] as const

// Rapport largeur / hauteur de l'emplacement : « 4 / 3 » -> [4, 3] (4:3 si illisible)
export function lireRatio(ratio: string): [number, number] {
  const [l, h] = ratio.split('/').map(n => Number(n.trim()))
  return l && h && l > 0 && h > 0 ? [l, h] : [4, 3]
}

// Photo publiée à une largeur donnée, recadrée au rapport de l'emplacement, format et qualité automatiques
export function adresseCloudinary(url: string, largeur: number, ratio: string): string {
  const [l, h] = lireRatio(ratio)
  return url.replace('/image/upload/', `/image/upload/f_auto,q_auto,c_fill,w_${largeur},h_${Math.round((largeur * h) / l)}/`)
}
export const srcsetCloudinary = (url: string, ratio: string) =>
  LARGEURS_PHOTO.map(l => `${adresseCloudinary(url, l, ratio)} ${l}w`).join(', ')

// Sources d'un emplacement : la photo publiée depuis l'admin (Cloudinary), sinon les fichiers WebP du code
// (public/photos/…-400/800/1200.webp) ; null : aucune photo (cadre « Photo à fournir »)
export function sourcesPhoto(photo: Pick<EmplacementPhoto, 'url' | 'fichier' | 'ratio'>): { src: string; srcset: string } | null {
  if (photo.url && urlPhotoValide(photo.url)) {
    return { src: adresseCloudinary(photo.url, 800, photo.ratio), srcset: srcsetCloudinary(photo.url, photo.ratio) }
  }
  if (!photo.fichier) return null
  const f = photo.fichier
  return { src: `${f}-800.webp`, srcset: `${f}-400.webp 400w, ${f}-800.webp 800w, ${f}-1200.webp 1200w` }
}
