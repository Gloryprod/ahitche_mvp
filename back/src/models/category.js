const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  active: { type: Boolean, default: true },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Category', CategorySchema);