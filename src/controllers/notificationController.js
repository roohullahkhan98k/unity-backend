const Notification = require('../models/notification');

// Get notifications for current user (only unread by default)
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { includeRead = 'false' } = req.query;
    
    let filter = { user: userId };
    
    // Only fetch unread notifications by default
    if (includeRead === 'false') {
      filter.read = false;
    }
    
    const notifications = await Notification.find(filter)
      .populate('user', 'username profileImage')
      .sort({ createdAt: -1 });
      
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Mark a notification as read
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: userId },
      { read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json(notification);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Mark all notifications as read for current user
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await Notification.updateMany(
      { user: userId, read: false },
      { read: true }
    );
    res.json({ 
      message: 'All notifications marked as read',
      updatedCount: result.modifiedCount 
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get unread notification count
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const count = await Notification.countDocuments({ 
      user: userId, 
      read: false 
    });
    res.json({ unreadCount: count });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}; 