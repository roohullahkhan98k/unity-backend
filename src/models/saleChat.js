const mongoose = require('mongoose');

const saleMessageSchema = new mongoose.Schema({
  sender: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  message: { 
    type: String, 
    required: true,
    maxlength: 1000 
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  }
});

const saleChatSchema = new mongoose.Schema({
  post: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Post', 
    required: true 
  },
  buyer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  seller: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  messages: [saleMessageSchema],
  isActive: { 
    type: Boolean, 
    default: true 
  },
  saleAmount: { 
    type: Number, 
    required: true 
  },
  saleDate: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

// Index for faster queries
saleChatSchema.index({ buyer: 1, seller: 1, post: 1 });
saleChatSchema.index({ 'messages.timestamp': -1 });

module.exports = mongoose.model('SaleChat', saleChatSchema); 