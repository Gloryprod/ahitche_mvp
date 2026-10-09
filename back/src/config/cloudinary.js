const cloudinary = require('cloudinary').v2;
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Moteur de stockage multer vers Cloudinary (remplace multer-storage-cloudinary, qui n'est plus maintenu et
// bloquait la mise à jour de sécurité du SDK). Le fichier est envoyé en flux, sans passer par le disque.
// req.file reçoit : filename (identifiant Cloudinary), path (adresse sécurisée), size, format.
function stockageCloudinary(parametres) {
  return {
    _handleFile(req, file, cb) {
      Promise.resolve(parametres(req, file)).then(options => {
        const flux = cloudinary.uploader.upload_stream(options, (erreur, resultat) => {
          if (erreur) return cb(erreur);
          cb(null, { filename: resultat.public_id, path: resultat.secure_url, size: resultat.bytes, format: resultat.format, resourceType: resultat.resource_type });
        });
        file.stream.pipe(flux);
      }).catch(cb);
    },
    // Appelé par multer si la requête échoue après le téléversement
    _removeFile(req, file, cb) {
      cloudinary.uploader.destroy(file.filename, { resource_type: file.resourceType || 'image', invalidate: true }, () => cb(null));
    }
  };
}

const upload = multer({
  storage: stockageCloudinary(async (req, file) => {
    const isVideo = file.mimetype.startsWith('video/');
    return {
      folder: 'blog_posts', // Dossier dans le compte Cloudinary
      resource_type: isVideo ? 'video' : 'image', // Crucial pour Cloudinary !
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'avi', 'mkv', 'webm'],
      transformation: isVideo ? [] : [{ width: 1200, height: 630, crop: 'limit' }]
    };
  }),
  limits: { fileSize: 100 * 1024 * 1024 } // Limite à 100 Mo
});

// Justificatifs des dépenses (Finances) : PDF ou image, 10 Mo maximum, sans retouche.
// Stockage PRIVÉ (type « authenticated ») : aucune adresse publique ; consultation par un lien signé temporaire
// généré par l'API pour les rôles autorisés (services/justificatifService.js). Les pièces contiennent IFU,
// téléphones et références de paiement.
const FORMATS_JUSTIFICATIF = ['application/pdf', 'image/jpeg', 'image/png'];
const uploadJustificatif = multer({
  storage: stockageCloudinary(async () => ({
    folder: 'justificatifs',
    type: 'authenticated',
    resource_type: 'image', // Cloudinary traite les PDF comme des images (aperçu possible)
    allowed_formats: ['pdf', 'jpg', 'jpeg', 'png']
  })),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, FORMATS_JUSTIFICATIF.includes(file.mimetype))
});

// Photos des compléments (vitrine publique) : image seulement, 5 Mo maximum, ramenée à 1000 px au plus.
// Le navigateur réduit déjà la photo avant l'envoi (connexions lentes) ; l'affichage passe par f_auto,q_auto.
const FORMATS_PHOTO = ['image/jpeg', 'image/png', 'image/webp'];
const uploadPhotoProduit = multer({
  storage: stockageCloudinary(async () => ({
    folder: 'complements',
    resource_type: 'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
  })),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, FORMATS_PHOTO.includes(file.mimetype))
});

module.exports = upload;
module.exports.uploadJustificatif = uploadJustificatif;
module.exports.uploadPhotoProduit = uploadPhotoProduit;
module.exports.cloudinary = cloudinary;
