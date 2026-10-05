const { cloudinary } = require('../config/cloudinary');

// Justificatifs des dépenses en stockage privé : jamais d'adresse publique.
// Un lien signé, valable quelques minutes, est généré à la demande pour les rôles qui lisent les Finances.
const DUREE_LIEN_SECONDES = 5 * 60;
const FORMATS = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

// Fiche à enregistrer sur la dépense, à partir du fichier reçu par multer (stockage Cloudinary privé)
function ficheJustificatif(fichier, typePiece, utilisateurId) {
  return {
    publicId: fichier.filename,
    format: FORMATS[fichier.mimetype] || 'pdf',
    resourceType: 'image',
    nom: String(fichier.originalname || '').slice(0, 200),
    typePiece: String(typePiece || '').trim().slice(0, 120),
    taille: fichier.size || 0,
    televersePar: utilisateurId
  };
}

// Lien de téléchargement signé et temporaire (5 minutes)
function lienSigne(justificatif) {
  return cloudinary.utils.private_download_url(justificatif.publicId, justificatif.format, {
    resource_type: justificatif.resourceType || 'image',
    type: 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + DUREE_LIEN_SECONDES
  });
}

async function supprimerFichier(justificatif) {
  await cloudinary.uploader.destroy(justificatif.publicId, {
    resource_type: justificatif.resourceType || 'image',
    type: 'authenticated',
    invalidate: true
  });
}

module.exports = { DUREE_LIEN_SECONDES, ficheJustificatif, lienSigne, supprimerFichier };
