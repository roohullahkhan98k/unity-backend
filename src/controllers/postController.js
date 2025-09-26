const Post = require('../models/post');
const fs = require('fs');
const path = require('path');
const Notification = require('../models/notification');

// Add a new post
exports.addPost = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { 
      title, 
      description, 
      startingPrice, 
      auctionDuration, 
      buyNowPrice 
    } = req.body;

    // Check if at least one image is provided
    if (!req.files || !req.files.images || req.files.images.length === 0) {
      return res.status(400).json({ 
        message: 'At least one image is required' 
      });
    }

    if (!title || !description || !startingPrice || !auctionDuration) {
      return res.status(400).json({ 
        message: 'Title, description, starting price, and auction duration are required' 
      });
    }

    // Validate starting price
    if (startingPrice <= 0) {
      return res.status(400).json({ message: 'Starting price must be greater than 0' });
    }

    // Validate auction duration (convert to hours)
    const durationInHours = parseFloat(auctionDuration);
    if (durationInHours <= 0) {
      return res.status(400).json({ message: 'Auction duration must be greater than 0' });
    }

    // Calculate auction end time
    const auctionEndTime = new Date();
    auctionEndTime.setHours(auctionEndTime.getHours() + durationInHours);

    // Validate buy now price if provided
    if (buyNowPrice && buyNowPrice <= startingPrice) {
      return res.status(400).json({ 
        message: 'Buy now price must be higher than starting price' 
      });
    }

    // Process images
    const imagePaths = req.files.images.map(file => `/uploads/post-images/${file.filename}`);
    
    // Process video if provided
    let videoPath = null;
    if (req.files.video && req.files.video.length > 0) {
      videoPath = `/uploads/post-videos/${req.files.video[0].filename}`;
    } else if (req.body.video) {
      // Handle video from body if it's a path
      videoPath = req.body.video;
    }

    const post = new Post({
      user: userId,
      images: imagePaths,
      video: videoPath,
      title,
      description,
      startingPrice: parseFloat(startingPrice),
      currentPrice: parseFloat(startingPrice),
      buyNowPrice: buyNowPrice ? parseFloat(buyNowPrice) : null,
      auctionDuration: durationInHours,
      auctionEndTime,
      status: 'live'
    });

    await post.save();
    await Notification.create({ 
      user: userId, 
      message: `Auction post '${title}' created with starting price $${startingPrice}`,
      postTitle: title 
    });

    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Fetch all posts (optionally filter by user)
exports.getPosts = async (req, res) => {
  try {
    const { userId, excludeUserId, status, liveOnly } = req.query;
    let filter = {};

    if (userId) {
      filter.user = userId;
    }

    if (excludeUserId) {
      filter.user = { $ne: excludeUserId };
    }

    if (status) {
      filter.status = status;
    }

    if (liveOnly === 'true') {
      filter.status = 'live';
      filter.auctionEndTime = { $gt: new Date() };
    }

    const posts = await Post.find(filter)
      .populate('user', 'username profileImage')
      .populate('soldTo', 'username profileImage')
      .sort({ createdAt: -1 });

    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};


// Update a post (only by creator)
exports.updatePost = async (req, res) => {
  try {
    const userId = req.user.userId;
    const postId = req.params.id;
    const { title, description, buyNowPrice } = req.body;
    const post = await Post.findById(postId);
    
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.user.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to update this post' });
    }
    if (post.status !== 'live') {
      return res.status(400).json({ message: 'Cannot update post that is not live' });
    }

    if (title) post.title = title;
    if (description) post.description = description;
    if (buyNowPrice !== undefined) {
      if (buyNowPrice && buyNowPrice <= post.startingPrice) {
        return res.status(400).json({ 
          message: 'Buy now price must be higher than starting price' 
        });
      }
      post.buyNowPrice = buyNowPrice ? parseFloat(buyNowPrice) : null;
    }
    if (req.files && req.files.images && req.files.images.length > 0) {
      const imagePaths = req.files.images.map(file => `/uploads/post-images/${file.filename}`);
      post.images = imagePaths;
    }
    
    if (req.files && req.files.video && req.files.video.length > 0) {
      post.video = `/uploads/post-videos/${req.files.video[0].filename}`;
    }
    
    await post.save();
    await Notification.create({ 
      user: userId, 
      message: `Auction post '${post.title}' updated`,
      postTitle: post.title 
    });
    res.json(post);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}; 


// Delete a post (only by creator)
exports.deletePost = async (req, res) => {
  try {
    const userId = req.user.userId;
    const postId = req.params.id;
    const post = await Post.findById(postId);
    
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.user.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to delete this post' });
    }
    if (post.status !== 'live') {
      return res.status(400).json({ message: 'Cannot delete post that is not live' });
    }

    // Remove image files if exist
    if (post.images && post.images.length > 0) {
      post.images.forEach(imagePath => {
        const fullImagePath = path.join(__dirname, '../../', imagePath);
        fs.unlink(fullImagePath, (err) => {
          if (err) console.error('Error deleting image file:', err.message);
        });
      });
    }
    
    // Remove video file if exists
    if (post.video) {
      const videoPath = path.join(__dirname, '../../', post.video);
      fs.unlink(videoPath, (err) => {
        if (err) console.error('Error deleting video file:', err.message);
      });
    }
    
    // Completely delete the post from database
    await post.deleteOne();
    
    await Notification.create({ 
      user: userId, 
      message: `Auction post '${post.title}' deleted`,
      postTitle: post.title 
    });
    res.json({ message: 'Post deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Cancel a post (only by creator)
exports.cancelPost = async (req, res) => {
  try {
    const userId = req.user.userId;
    const postId = req.params.id;
    const post = await Post.findById(postId);
    
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.user.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to cancel this post' });
    }
    if (post.status !== 'live') {
      return res.status(400).json({ message: 'Cannot cancel post that is not live' });
    }

    // Change status to cancelled but keep the post
    post.status = 'cancelled';
    await post.save();
    
    await Notification.create({ 
      user: userId, 
      message: `Auction post '${post.title}' cancelled`,
      postTitle: post.title 
    });
    res.json({ message: 'Post cancelled successfully', post });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Reactivate a cancelled post (only by creator)
exports.reactivatePost = async (req, res) => {
  try {
    const userId = req.user.userId;
    const postId = req.params.id;
    const { auctionDuration } = req.body; // New duration in hours
    
    const post = await Post.findById(postId);
    
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.user.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to reactivate this post' });
    }
    if (post.status !== 'cancelled') {
      return res.status(400).json({ message: 'Can only reactivate cancelled posts' });
    }

    // Validate new auction duration
    const durationInHours = parseFloat(auctionDuration);
    if (durationInHours <= 0) {
      return res.status(400).json({ message: 'Auction duration must be greater than 0' });
    }

    // Calculate new auction end time
    const newAuctionEndTime = new Date();
    newAuctionEndTime.setHours(newAuctionEndTime.getHours() + durationInHours);

    // Reactivate the post with new time
    post.status = 'live';
    post.auctionDuration = durationInHours;
    post.auctionEndTime = newAuctionEndTime;
    post.currentPrice = post.startingPrice; // Reset to starting price
    await post.save();
    
    await Notification.create({ 
      user: userId, 
      message: `Auction post '${post.title}' reactivated with ${durationInHours} hours duration`,
      postTitle: post.title 
    });
    res.json({ message: 'Post reactivated successfully', post });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get live auctions
exports.getLiveAuctions = async (req, res) => {
  try {
    const posts = await Post.find({
      status: 'live',
      auctionEndTime: { $gt: new Date() }
    })
    .populate('user', 'username profileImage')
    .sort({ auctionEndTime: 1 });

    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get auction details with time remaining
exports.getAuctionDetails = async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await Post.findById(postId)
      .populate('user', 'username profileImage')
      .populate('soldTo', 'username profileImage');

    if (!post) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    // Calculate time remaining
    const now = new Date();
    const timeRemaining = post.auctionEndTime - now;
    const isLive = post.status === 'live' && timeRemaining > 0;

    // Check if auction has expired and update status if needed
    if (post.status === 'live' && timeRemaining <= 0) {
      post.status = 'expired';
      await post.save();
    }

    const auctionDetails = {
      ...post.toObject(),
      timeRemaining: isLive ? timeRemaining : 0,
      isLive: post.status === 'live' && timeRemaining > 0,
      isExpired: post.status === 'live' && timeRemaining <= 0
    };

    res.json(auctionDetails);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Buy now functionality
exports.buyNow = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { postId } = req.params;
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    if (post.status !== 'live') {
      return res.status(400).json({ message: 'Auction is not live' });
    }

    if (!post.buyNowPrice) {
      return res.status(400).json({ message: 'Buy now option not available for this auction' });
    }

    if (post.user.toString() === userId) {
      return res.status(400).json({ message: 'You cannot buy your own auction' });
    }

    // Check if auction has expired
    if (new Date() > post.auctionEndTime) {
      return res.status(400).json({ message: 'Auction has expired' });
    }

    // Update post status to sold
    post.status = 'sold';
    post.soldTo = userId;
    post.soldAt = new Date();
    post.soldPrice = post.buyNowPrice;
    post.soldVia = 'buyNow';
    await post.save();

    // Get user details for notification
    const User = require('../models/user');
    const buyer = await User.findById(userId).select('username');
    const seller = await User.findById(post.user).select('username');

    // Notify seller
    await Notification.create({
      user: post.user,
      message: `Your auction "${post.title}" was sold via Buy Now to ${buyer.username} for $${post.buyNowPrice}`,
      postTitle: post.title
    });

    // Notify buyer
    await Notification.create({
      user: userId,
      message: `You successfully purchased "${post.title}" via Buy Now from ${seller.username} for $${post.buyNowPrice}`,
      postTitle: post.title
    });

    // Disable chat for this auction
    const socketService = require('../services/socketService');
    socketService.disableChat(postId);

    res.json({
      message: 'Purchase successful',
      soldPrice: post.buyNowPrice,
      post
    });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// End auction automatically when time expires
exports.endAuction = async (req, res) => {
  try {
    const { postId } = req.params;
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Auction not found' });
    }

    if (post.status !== 'live') {
      return res.status(400).json({ message: 'Auction is not live' });
    }

    // Check if auction has actually expired
    if (new Date() <= post.auctionEndTime) {
      return res.status(400).json({ message: 'Auction has not expired yet' });
    }

    // Get the winning bid
    const Bid = require('../models/bid');
    const winningBid = await Bid.findOne({ 
      post: postId, 
      isWinning: true 
    });

    if (!winningBid) {
      // No bids, mark as expired
      post.status = 'expired';
      await post.save();
      
      await Notification.create({
        user: post.user,
        message: `Your auction "${post.title}" has expired with no bids`,
        postTitle: post.title
      });

      return res.json({
        message: 'Auction expired with no bids',
        status: 'expired',
        post
      });
    }

    // Update post status to sold
    post.status = 'sold';
    post.soldTo = winningBid.bidder;
    post.soldAt = new Date();
    post.soldPrice = winningBid.amount;
    post.soldVia = 'auction';
    await post.save();

    // Get user details for notification
    const User = require('../models/user');
    const winner = await User.findById(winningBid.bidder).select('username');
    const seller = await User.findById(post.user).select('username');

    // Notify winner
    await Notification.create({
      user: winningBid.bidder,
      message: `CONGRATULATIONS! You won the auction for "${post.title}" at $${winningBid.amount}! The auction has ended. Seller: ${seller.username}`,
      postTitle: post.title
    });

    // Notify seller
    await Notification.create({
      user: post.user,
      message: `Your auction "${post.title}" has ended and sold to ${winner.username} for $${winningBid.amount}`,
      postTitle: post.title
    });

    // Populate winner info
    await post.populate('soldTo', 'username profileImage');

    // Disable chat for this auction
    const socketService = require('../services/socketService');
    socketService.disableChat(postId);

    res.json({
      message: 'Auction ended successfully',
      soldPrice: winningBid.amount,
      winner: post.soldTo,
      post
    });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};