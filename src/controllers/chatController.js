const Chat = require('../models/chat');
const Post = require('../models/post');

// Get chat messages for a specific post
exports.getChatMessages = async (req, res) => {
  try {
    const { postId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if post is live
    if (post.status !== 'live') {
      return res.json({
        postId,
        messages: [],
        totalMessages: 0,
        isActive: false,
        postStatus: post.status,
        message: `Chat is disabled. Auction status: ${post.status}`
      });
    }

    // Find chat for this post
    let chat = await Chat.findOne({ post: postId })
      .populate('messages.user', 'username profileImage')
      .sort({ 'messages.timestamp': -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    if (!chat) {
      // Create new chat if it doesn't exist
      chat = new Chat({ post: postId, messages: [] });
      await chat.save();
    }

    // Check if chat is active
    if (!chat.isActive) {
      return res.json({
        postId,
        messages: [],
        totalMessages: 0,
        isActive: false,
        message: 'Chat has been disabled for this auction'
      });
    }

    // Reverse messages to show oldest first
    const messages = chat.messages.reverse();

    res.json({
      postId,
      messages,
      totalMessages: chat.messages.length,
      isActive: true,
      postStatus: post.status
    });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get chat participants for a post
exports.getChatParticipants = async (req, res) => {
  try {
    const { postId } = req.params;

    const chat = await Chat.findOne({ post: postId })
      .populate('messages.user', 'username profileImage');

    if (!chat) {
      return res.json({ participants: [] });
    }

    // Get unique participants
    const participants = chat.messages.reduce((acc, message) => {
      const userId = message.user._id.toString();
      if (!acc.find(p => p._id.toString() === userId)) {
        acc.push(message.user);
      }
      return acc;
    }, []);

    res.json({ participants });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get user's chat history across all posts
exports.getUserChatHistory = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 20 } = req.query;

    const chats = await Chat.find({
      'messages.user': userId
    })
    .populate('post', 'title image status')
    .populate('messages.user', 'username profileImage')
    .sort({ updatedAt: -1 })
    .limit(parseInt(limit));

    const chatHistory = chats.map(chat => {
      const userMessages = chat.messages.filter(msg => 
        msg.user._id.toString() === userId
      );
      
      return {
        postId: chat.post._id,
        postTitle: chat.post.title,
        postImage: chat.post.image,
        postStatus: chat.post.status,
        lastMessage: userMessages[userMessages.length - 1],
        totalMessages: chat.messages.length,
        lastActivity: chat.updatedAt
      };
    });

    res.json(chatHistory);

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Clear chat messages for a post (admin/owner only)
exports.clearChat = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { postId } = req.params;

    // Check if user is post owner
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.user.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to clear this chat' });
    }

    const chat = await Chat.findOne({ post: postId });
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Clear messages but keep chat structure
    chat.messages = [];
    await chat.save();

    res.json({ message: 'Chat cleared successfully' });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}; 