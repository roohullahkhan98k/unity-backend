const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const auth = require('../middleware/auth');

// Get notifications for current user (only unread by default)
router.get('/', auth, notificationController.getNotifications);

// Get unread notification count
router.get('/unread-count', auth, notificationController.getUnreadCount);

// Mark notification as read
router.put('/:id/read', auth, notificationController.markAsRead);

// Mark all notifications as read
router.put('/mark-all-read', auth, notificationController.markAllAsRead);

module.exports = router; 