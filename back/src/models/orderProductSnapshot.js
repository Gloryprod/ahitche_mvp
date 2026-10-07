const mongoose = require('mongoose');

const orderProductSnapshotSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true }, // Pour faciliter le requêtage inverse si besoin
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, required: true },
  unitPrice: { type: Number, default: null }, // Vide si le prix du produit est à renseigner
  totalPrice: { type: Number, default: null },
  isExtra: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('OrderProductSnapshot', orderProductSnapshotSchema);