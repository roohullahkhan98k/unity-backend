const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  images: [{ type: String }], // Multiple images
  video: { type: String }, // Optional video
  title: { type: String, required: true },
  description: { type: String, required: true },
      // Auction fields
  startingPrice: { type: Number, required: true, min: 0 },
  currentPrice: { type: Number, min: 0 },
  buyNowPrice: { type: Number, min: 0 },
  auctionDuration: { type: Number, required: true }, // in hours
  auctionEndTime: { type: Date, required: true },
  status: { type: String, enum: ['live', 'sold', 'expired', 'cancelled'], default: 'live' },
  soldTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  soldAt: { type: Date },
  soldPrice: { type: Number },
  soldVia: { type: String, enum: ['auction', 'buyNow'] }
}, { timestamps: true });

module.exports = mongoose.model('Post', postSchema); 