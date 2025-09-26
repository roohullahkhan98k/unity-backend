const express = require('express');
const router = express.Router();
const saleChatController = require('../controllers/saleChatController');
const auth = require('../middleware/auth');

// Get all sale chats for user
router.get('/', auth, saleChatController.getUserSaleChats);

// Get specific sale chat
router.get('/:chatId', auth, saleChatController.getSaleChat);

// Send message in sale chat
router.post('/:chatId/messages', auth, saleChatController.sendMessage);

// Get sale chat by post ID
router.get('/post/:postId', auth, saleChatController.getSaleChatByPost);

// Mark messages as read
router.patch('/:chatId/read', auth, saleChatController.markAsRead);

module.exports = router; 