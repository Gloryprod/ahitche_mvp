// models/ExchangeRate.js
const mongoose = require('mongoose');

const exchangeRateSchema = new mongoose.Schema({
  tauxUsdFcfa: {
    type: Number,
    required: true,
    default: 571.00
  },
  creePar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ExchangeRate', exchangeRateSchema);