const SaleChat = require('../models/saleChat');
const User = require('../models/user');
const Post = require('../models/post');
const Notification = require('../models/notification');

// Get all sale chats for a user (both as buyer and seller)
exports.getUserSaleChats = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const saleChats = await SaleChat.find({
      $or: [{ buyer: userId }, { seller: userId }]
    })
    .populate('post', 'title image')
    .populate('buyer', 'username profileImage')
    .populate('seller', 'username profileImage')
    .populate('messages.sender', 'username profileImage')
    .sort({ updatedAt: -1 });

    res.json(saleChats);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get a specific sale chat
exports.getSaleChat = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { chatId } = req.params;

    const saleChat = await SaleChat.findById(chatId)
      .populate('post', 'title image')
      .populate('buyer', 'username profileImage')
      .populate('seller', 'username profileImage')
      .populate('messages.sender', 'username profileImage');

    if (!saleChat) {
      return res.status(404).json({ message: 'Sale chat not found' });
    }

    // Check if user is part of this chat
    if (saleChat.buyer.toString() !== userId && saleChat.seller.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to access this chat' });
    }

    res.json(saleChat);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Send a message in sale chat
exports.sendMessage = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { chatId } = req.params;
    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ message: 'Message cannot be empty' });
    }

    const saleChat = await SaleChat.findById(chatId);
    if (!saleChat) {
      return res.status(404).json({ message: 'Sale chat not found' });
    }

    // Check if user is part of this chat
    if (saleChat.buyer.toString() !== userId && saleChat.seller.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to send messages in this chat' });
    }

    // Add message to chat
    saleChat.messages.push({
      sender: userId,
      message: message.trim(),
      timestamp: new Date()
    });

    await saleChat.save();

    // Populate the new message
    await saleChat.populate('messages.sender', 'username profileImage');

    // Get the other user in the chat for notification
    const otherUserId = saleChat.buyer.toString() === userId ? saleChat.seller : saleChat.buyer;
    
    // Send notification to the other user
    await Notification.create({
      user: otherUserId,
      message: `New message in sale chat for "${saleChat.post.title}"`,
      postTitle: saleChat.post.title,
      type: 'chat',
      postId: saleChat.post,
      buyerId: saleChat.buyer,
      sellerId: saleChat.seller,
      chatId: saleChat._id
    });

    // Emit socket event for real-time messaging
    const socketService = require('../services/socketService');
    socketService.emitSaleChatMessage(chatId, {
      sender: userId,
      message: message.trim(),
      timestamp: new Date()
    });

    res.json({
      message: 'Message sent successfully',
      newMessage: saleChat.messages[saleChat.messages.length - 1]
    });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get sale chat by post ID (for notifications)
exports.getSaleChatByPost = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { postId } = req.params;

    const saleChat = await SaleChat.findOne({ post: postId })
      .populate('post', 'title image')
      .populate('buyer', 'username profileImage')
      .populate('seller', 'username profileImage')
      .populate('messages.sender', 'username profileImage');

    if (!saleChat) {
      return res.status(404).json({ message: 'Sale chat not found for this post' });
    }

    // Check if user is part of this chat
    if (saleChat.buyer.toString() !== userId && saleChat.seller.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to access this chat' });
    }

    res.json(saleChat);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Mark sale chat messages as read
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { chatId } = req.params;

    const saleChat = await SaleChat.findById(chatId);
    if (!saleChat) {
      return res.status(404).json({ message: 'Sale chat not found' });
    }

    // Check if user is part of this chat
    if (saleChat.buyer.toString() !== userId && saleChat.seller.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to access this chat' });
    }

    // Mark all messages from other user as read
    saleChat.messages.forEach(msg => {
      if (msg.sender.toString() !== userId && !msg.read) {
        msg.read = true;
      }
    });

    await saleChat.save();

    res.json({ message: 'Messages marked as read' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}; 