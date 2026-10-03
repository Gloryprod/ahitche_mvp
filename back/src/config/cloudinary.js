const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const isVideo = file.mimetype.startsWith('video/')

    return{
        folder: 'blog_posts', // Dossier dans le compte Cloudinary
        resource_type: isVideo ? 'video' : 'image', // Crucial pour Cloudinary !
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'avi', 'mkv', 'webm'],
        transformation: isVideo ? [] : [{ width: 1200, height: 630, crop: 'limit' }]    }    
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // Limite à 100 Mo
});

module.exports = upload;