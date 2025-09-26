const Chat = require('../models/chat');
const SaleChat = require('../models/saleChat');
const User = require('../models/user');
const Post = require('../models/post');
const jwt = require('jsonwebtoken');

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketId
    this.roomUsers = new Map(); // postId -> Set of userIds
    this.typingUsers = new Map(); // postId -> Map of userId -> typing timeout
    this.saleChatUsers = new Map(); // chatId -> Set of userIds
  }

  initialize(server) {
    this.io = require('socket.io')(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    
    console.log('Socket.IO service initialized');
  }

// Fixed Socket.IO middleware
setupMiddleware() {
  // Authentication middleware
  this.io.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth.token || 
                  socket.handshake.headers.authorization ||
                  socket.handshake.headers.Authorization;
      
      console.log('Received token:', token ? 'Present' : 'Missing');
      
      if (!token) {
        console.log('Socket connection attempt without token');
        return next(new Error('Authentication error: No token provided'));
      }

      // Remove 'Bearer ' prefix if present
      if (token.startsWith('Bearer ')) {
        token = token.substring(7);
      }

      // Use hardcoded JWT_SECRET to match authController
      const JWT_SECRET = 'your_jwt_secret';

      console.log('JWT_SECRET available:', !!JWT_SECRET);
      console.log('Token length:', token.length);
      console.log('Token (first 50 chars):', token.substring(0, 50) + '...');

      const decoded = jwt.verify(token, JWT_SECRET);
      console.log('Token decoded successfully for user:', decoded.userId);
      
      const user = await User.findById(decoded.userId).select('username profileImage');
      
      if (!user) {
        console.log(`User not found for userId: ${decoded.userId}`);
        return next(new Error('Authentication error: User not found'));
      }

      socket.userId = decoded.userId;
      socket.username = user.username;
      socket.profileImage = user.profileImage;
      
      console.log(`Socket authenticated for user: ${user.username} (${decoded.userId})`);
      next();
    } catch (error) {
      console.error('Socket auth error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      if (error.name === 'JsonWebTokenError') {
        next(new Error('Authentication error: Invalid token signature'));
      } else if (error.name === 'TokenExpiredError') {
        next(new Error('Authentication error: Token expired'));
      } else {
        next(new Error(`Authentication error: ${error.message}`));
      }
    }
  });
}

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`User connected: ${socket.username || 'Anonymous'} (${socket.userId || 'No ID'})`);
      
      // Handle connection errors
      socket.on('error', (error) => {
        console.error('Socket error:', error);
      });
      
      // Store connected user if authenticated
      if (socket.userId) {
        this.connectedUsers.set(socket.userId, socket.id);
      }

      // Join auction room
      socket.on('join-auction', async (data) => {
        const { postId } = data;
        
        if (!postId) {
          socket.emit('error', { message: 'Post ID is required' });
          return;
        }

        // Check if user is authenticated for chat
        if (!socket.userId) {
          socket.emit('error', { message: 'Authentication required to join chat' });
          return;
        }

        // Check if post exists and is live
        const post = await Post.findById(postId);
        if (!post) {
          socket.emit('error', { message: 'Post not found' });
          return;
        }

        if (post.status !== 'live') {
          socket.emit('error', { message: `Chat is disabled. Auction status: ${post.status}` });
          return;
        }

        // Check if chat is active
        const existingChat = await Chat.findOne({ post: postId });
        if (existingChat && !existingChat.isActive) {
          socket.emit('error', { message: 'Chat has been disabled for this auction' });
          return;
        }

        // Join the room
        socket.join(`auction-${postId}`);
        
        // Track users in room
        if (!this.roomUsers.has(postId)) {
          this.roomUsers.set(postId, new Set());
        }
        this.roomUsers.get(postId).add(socket.userId);

        // Notify others in room
        socket.to(`auction-${postId}`).emit('user-joined', {
          userId: socket.userId,
          username: socket.username,
          profileImage: socket.profileImage,
          timestamp: new Date()
        });

        // Send current participants to the joining user
        const participants = Array.from(this.roomUsers.get(postId));
        const typingUsers = this.getTypingUsers(postId);
        
        socket.emit('room-participants', { 
          participants,
          typingUsers 
        });

        console.log(`User ${socket.username} joined auction ${postId}`);
      });

      // Join sale chat room
      socket.on('join-sale-chat', async (data) => {
        const { chatId } = data;
        
        if (!chatId) {
          socket.emit('error', { message: 'Chat ID is required' });
          return;
        }

        // Check if user is authenticated
        if (!socket.userId) {
          socket.emit('error', { message: 'Authentication required to join sale chat' });
          return;
        }

        // Check if sale chat exists and user is part of it
        const saleChat = await SaleChat.findById(chatId);
        if (!saleChat) {
          socket.emit('error', { message: 'Sale chat not found' });
          return;
        }

        if (saleChat.buyer.toString() !== socket.userId && saleChat.seller.toString() !== socket.userId) {
          socket.emit('error', { message: 'Not authorized to join this sale chat' });
          return;
        }

        // Join the sale chat room
        socket.join(`sale-chat-${chatId}`);
        
        // Track users in sale chat
        if (!this.saleChatUsers.has(chatId)) {
          this.saleChatUsers.set(chatId, new Set());
        }
        this.saleChatUsers.get(chatId).add(socket.userId);

        // Notify others in sale chat
        socket.to(`sale-chat-${chatId}`).emit('user-joined-sale-chat', {
          userId: socket.userId,
          username: socket.username,
          profileImage: socket.profileImage,
          timestamp: new Date()
        });

        console.log(`User ${socket.username} joined sale chat ${chatId}`);
      });

      // Handle chat messages
      socket.on('send-message', async (data) => {
        const { postId, message } = data;
        
        // Check if user is authenticated
        if (!socket.userId) {
          socket.emit('error', { message: 'Authentication required to send messages' });
          return;
        }
        
        if (!postId || !message || message.trim().length === 0) {
          socket.emit('error', { message: 'Post ID and message are required' });
          return;
        }

        if (message.length > 500) {
          socket.emit('error', { message: 'Message too long (max 500 characters)' });
          return;
        }

        try {
          // Check if post is still live
          const post = await Post.findById(postId);
          if (!post) {
            socket.emit('error', { message: 'Post not found' });
            return;
          }
          
          if (post.status !== 'live') {
            socket.emit('error', { message: `Chat is disabled. Auction status: ${post.status}` });
            return;
          }

          // Check if chat is active
          let existingChat = await Chat.findOne({ post: postId });
          if (existingChat && !existingChat.isActive) {
            socket.emit('error', { message: 'Chat has been disabled for this auction' });
            return;
          }

          // Save message to database
          let chat = await Chat.findOne({ post: postId });
          
          if (!chat) {
            chat = new Chat({ post: postId, messages: [] });
          }

          const newMessage = {
            user: socket.userId,
            message: message.trim(),
            timestamp: new Date()
          };

          chat.messages.push(newMessage);
          await chat.save();

          // Populate user info for the message
          const populatedMessage = {
            _id: newMessage._id,
            user: {
              _id: socket.userId,
              username: socket.username,
              profileImage: socket.profileImage
            },
            message: newMessage.message,
            timestamp: newMessage.timestamp
          };

          // Stop typing indicator for this user since they sent a message
          this.stopTyping(socket.userId, postId, socket.username);

          // Broadcast message to all users in the auction room
          this.io.to(`auction-${postId}`).emit('new-message', {
            ...populatedMessage,
            postId
          });

          console.log(`Message sent in auction ${postId} by ${socket.username}: ${message}`);

        } catch (error) {
          console.error('Error saving message:', error);
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      // Handle sale chat messages
      socket.on('send-sale-message', async (data) => {
        const { chatId, message } = data;
        
        // Check if user is authenticated
        if (!socket.userId) {
          socket.emit('error', { message: 'Authentication required to send messages' });
          return;
        }
        
        if (!chatId || !message || message.trim().length === 0) {
          socket.emit('error', { message: 'Chat ID and message are required' });
          return;
        }

        if (message.length > 1000) {
          socket.emit('error', { message: 'Message too long (max 1000 characters)' });
          return;
        }

        try {
          // Check if sale chat exists and user is part of it
          const saleChat = await SaleChat.findById(chatId);
          if (!saleChat) {
            socket.emit('error', { message: 'Sale chat not found' });
            return;
          }

          if (saleChat.buyer.toString() !== socket.userId && saleChat.seller.toString() !== socket.userId) {
            socket.emit('error', { message: 'Not authorized to send messages in this sale chat' });
            return;
          }

          // Add message to sale chat
          saleChat.messages.push({
            sender: socket.userId,
            message: message.trim(),
            timestamp: new Date()
          });

          await saleChat.save();

          // Populate user info for the message
          const populatedMessage = {
            _id: saleChat.messages[saleChat.messages.length - 1]._id,
            sender: {
              _id: socket.userId,
              username: socket.username,
              profileImage: socket.profileImage
            },
            message: message.trim(),
            timestamp: new Date()
          };

          // Broadcast message to all users in the sale chat room
          this.io.to(`sale-chat-${chatId}`).emit('new-sale-message', {
            ...populatedMessage,
            chatId
          });

          console.log(`Message sent in sale chat ${chatId} by ${socket.username}: ${message}`);

        } catch (error) {
          console.error('Error saving sale chat message:', error);
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      // Handle typing indicators
      socket.on('typing-start', (data) => {
        const { postId } = data;
        
        if (!postId || !socket.userId) {
          return;
        }

        // Clear existing timeout for this user
        if (this.typingUsers.has(postId) && this.typingUsers.get(postId).has(socket.userId)) {
          clearTimeout(this.typingUsers.get(postId).get(socket.userId));
        }

        // Initialize typing users map for this post if it doesn't exist
        if (!this.typingUsers.has(postId)) {
          this.typingUsers.set(postId, new Map());
        }

        // Set a timeout to automatically stop typing after 3 seconds
        const typingTimeout = setTimeout(() => {
          this.stopTyping(socket.userId, postId, socket.username);
        }, 3000);

        // Store the timeout
        this.typingUsers.get(postId).set(socket.userId, typingTimeout);

        // Notify other users in the room
        socket.to(`auction-${postId}`).emit('user-typing', {
          userId: socket.userId,
          username: socket.username,
          profileImage: socket.profileImage,
          isTyping: true,
          timestamp: new Date()
        });

        console.log(`${socket.username} started typing in auction ${postId}`);
      });

      socket.on('typing-stop', (data) => {
        const { postId } = data;
        
        if (!postId || !socket.userId) {
          return;
        }

        this.stopTyping(socket.userId, postId, socket.username);
      });

      // Get currently typing users
      socket.on('get-typing-users', (data) => {
        const { postId } = data;
        
        if (!postId) {
          return;
        }

        const typingUsers = this.getTypingUsers(postId);
        socket.emit('typing-users-list', {
          postId,
          typingUsers
        });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.username} (${socket.userId})`);
        
        // Remove from connected users
        this.connectedUsers.delete(socket.userId);
        
        // Remove from all rooms and clean up typing indicators
        this.roomUsers.forEach((users, postId) => {
          if (users.has(socket.userId)) {
            users.delete(socket.userId);
            
            // Clean up typing indicator for this user
            this.stopTyping(socket.userId, postId, socket.username);
            
            // Notify others in the room
            this.io.to(`auction-${postId}`).emit('user-left', {
              userId: socket.userId,
              username: socket.username,
              timestamp: new Date()
            });
          }
        });

        // Remove from sale chat rooms
        this.saleChatUsers.forEach((users, chatId) => {
          if (users.has(socket.userId)) {
            users.delete(socket.userId);
            
            // Notify others in the sale chat
            this.io.to(`sale-chat-${chatId}`).emit('user-left-sale-chat', {
              userId: socket.userId,
              username: socket.username,
              timestamp: new Date()
            });
          }
        });
      });

      // Handle leaving auction room
      socket.on('leave-auction', (data) => {
        const { postId } = data;
        
        socket.leave(`auction-${postId}`);
        
        if (this.roomUsers.has(postId)) {
          this.roomUsers.get(postId).delete(socket.userId);
        }

        // Clean up typing indicator for this user
        this.stopTyping(socket.userId, postId, socket.username);

        socket.to(`auction-${postId}`).emit('user-left', {
          userId: socket.userId,
          username: socket.username,
          timestamp: new Date()
        });

        console.log(`User ${socket.username} left auction ${postId}`);
      });

      // Handle leaving sale chat room
      socket.on('leave-sale-chat', (data) => {
        const { chatId } = data;
        
        socket.leave(`sale-chat-${chatId}`);
        
        if (this.saleChatUsers.has(chatId)) {
          this.saleChatUsers.get(chatId).delete(socket.userId);
        }

        socket.to(`sale-chat-${chatId}`).emit('user-left-sale-chat', {
          userId: socket.userId,
          username: socket.username,
          timestamp: new Date()
        });

        console.log(`User ${socket.username} left sale chat ${chatId}`);
      });
    });
  }

  // Utility methods
  getConnectedUsers() {
    return Array.from(this.connectedUsers.keys());
  }

  getRoomUsers(postId) {
    return this.roomUsers.has(postId) ? Array.from(this.roomUsers.get(postId)) : [];
  }

  // Send system message to auction room
  sendSystemMessage(postId, message) {
    this.io.to(`auction-${postId}`).emit('system-message', {
      message,
      timestamp: new Date(),
      type: 'system'
    });
  }

  // Notify auction events and disable chat
  notifyAuctionEvent(postId, eventType, data) {
    this.io.to(`auction-${postId}`).emit('auction-event', {
      type: eventType,
      data,
      timestamp: new Date()
    });

    // Send system message about auction end
    if (eventType === 'auction-ended') {
      this.sendSystemMessage(postId, 'Auction has ended. Chat is now disabled.');
    }
  }

  // Disable chat for a specific post
  disableChat(postId) {
    this.io.to(`auction-${postId}`).emit('chat-disabled', {
      message: 'Chat has been disabled for this auction',
      timestamp: new Date()
    });
  }

  // Helper method to stop typing indicator
  stopTyping(userId, postId, username) {
    if (!this.typingUsers.has(postId) || !this.typingUsers.get(postId).has(userId)) {
      return;
    }

    // Clear the timeout
    clearTimeout(this.typingUsers.get(postId).get(userId));
    this.typingUsers.get(postId).delete(userId);

    // Notify other users that this user stopped typing
    this.io.to(`auction-${postId}`).emit('user-typing', {
      userId: userId,
      username: username,
      isTyping: false,
      timestamp: new Date()
    });

    console.log(`${username} stopped typing in auction ${postId}`);
  }

  // Get currently typing users for a post
  getTypingUsers(postId) {
    if (!this.typingUsers.has(postId)) {
      return [];
    }
    
    return Array.from(this.typingUsers.get(postId).keys());
  }

  // Emit sale chat message for real-time updates
  emitSaleChatMessage(chatId, messageData) {
    this.io.to(`sale-chat-${chatId}`).emit('new-sale-message', {
      ...messageData,
      chatId
    });
  }
}

module.exports = new SocketService(); 