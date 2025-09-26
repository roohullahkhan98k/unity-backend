const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const auth = require('../middleware/auth');

// Get chat messages for a specific post
router.get('/messages/:postId', chatController.getChatMessages);

// Get chat participants for a post
router.get('/participants/:postId', chatController.getChatParticipants);

// Get user's chat history (requires auth)
router.get('/history', auth, chatController.getUserChatHistory);

// Clear chat messages (requires auth - post owner only)
router.delete('/clear/:postId', auth, chatController.clearChat);

module.exports = router; 