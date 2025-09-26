const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  bidder: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true, min: 0 },
  isWinning: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Bid', bidSchema); 