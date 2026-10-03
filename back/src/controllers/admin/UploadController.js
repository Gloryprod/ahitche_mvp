/**
 * Gère la réponse après le téléversement d'une image
 */
async function uploadImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'Aucun fichier envoyé' 
      });
    }

    // req.file.path contient l'URL publique générée par Cloudinary
    return res.status(200).json({
      success: true,
      url: req.file.path
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
}

module.exports = {
  uploadImage
};