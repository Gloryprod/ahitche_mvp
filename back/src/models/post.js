const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  type: {
    type: String,
    enum: ['article', 'blog', 'video'],
    default: 'article',
    required: true
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String, // Contenu HTML ou Markdown pour les articles/blogs
    required: function() { return this.type !== 'video'; }
  },
  summary: {
    type: String,
    trim: true
  },
  coverImage: {
    type: String, // URL de l'image à la une
    default: null
  },
  videoUrl: {
    type: String, // URL d'intégration YouTube/Vimeo ou MP4
    default: null,
    required: function() { return this.type === 'video'; }
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  publishedAt: {
    type: Date,
    default: null
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deletedAt: { type: Date, default: null }
}, {
  timestamps: true
});

module.exports = mongoose.model('post', postSchema);