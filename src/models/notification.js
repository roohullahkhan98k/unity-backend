const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  postTitle: { type: String },
  // New fields for bid sale notifications
  type: { 
    type: String, 
    enum: ['bid', 'sale', 'outbid', 'chat'], 
    default: 'bid' 
  },
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'SaleChat' },
  amount: { type: Number }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema); 