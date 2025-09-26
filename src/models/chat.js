const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  message: { 
    type: String, 
    required: true,
    maxlength: 500 
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  }
});

const chatSchema = new mongoose.Schema({
  post: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Post', 
    required: true 
  },
  messages: [messageSchema],
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, { timestamps: true });

// Index for faster queries
chatSchema.index({ post: 1, 'messages.timestamp': -1 });

module.exports = mongoose.model('Chat', chatSchema); 