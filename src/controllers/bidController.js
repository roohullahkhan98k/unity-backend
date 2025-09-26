const Bid = require('../models/bid');
const Post = require('../models/post');
const User = require('../models/user');
const Notification = require('../models/notification');
const SaleChat = require('../models/saleChat');

// Place a bid on a post
exports.placeBid = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { postId } = req.params;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid bid amount is required' });
    }

    // Check if post exists and is live
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.status !== 'live') {
      return res.status(400).json({ message: 'This post is not available for bidding' });
    }

    // Check if bid time has expired
    if (new Date() > post.auctionEndTime) {
      return res.status(400).json({ message: 'Bidding time has expired' });
    }

    // Check if user is not the post owner
    if (post.user.toString() === userId) {
      return res.status(400).json({ message: 'You cannot bid on your own post' });
    }

    // Check if bid is higher than current price
    if (amount <= post.currentPrice) {
      return res.status(400).json({ 
        message: `Bid must be higher than current price: $${post.currentPrice}` 
      });
    }

    // Check if bid is higher than starting price
    if (amount < post.startingPrice) {
      return res.status(400).json({ 
        message: `Bid must be at least $${post.startingPrice}` 
      });
    }

    // Create new bid
    const newBid = new Bid({
      post: postId,
      bidder: userId,
      amount: amount
    });

    await newBid.save();

    // Update previous winning bid to false
    await Bid.updateMany(
      { post: postId, isWinning: true },
      { isWinning: false }
    );

    // Set new bid as winning
    newBid.isWinning = true;
    await newBid.save();

    // Update post with new current price
    post.currentPrice = amount;
    await post.save();

    // Notify previous highest bidder if exists
    const previousWinningBid = await Bid.findOne({ 
      post: postId, 
      isWinning: false,
      bidder: { $ne: userId }
    }).sort({ createdAt: -1 });

    if (previousWinningBid) {
      await Notification.create({
        user: previousWinningBid.bidder,
        message: `You've been outbid on "${post.title}" by $${amount}`,
        postTitle: post.title
      });
    }

    // Notify post owner
    await Notification.create({
      user: post.user,
      message: `New bid of $${amount} placed on "${post.title}"`,
      postTitle: post.title
    });

    // Notify chat participants about new bid
    const socketService = require('../services/socketService');
    socketService.notifyAuctionEvent(postId, 'new-bid', {
      bidder: newBid.bidder,
      amount: amount,
      currentPrice: amount
    });

    // Populate bidder info for response
    await newBid.populate('bidder', 'username profileImage');

    res.status(201).json({
      message: 'Bid placed successfully',
      bid: newBid,
      currentPrice: amount
    });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get all bids for a post (bidding history)
exports.getBidsForPost = async (req, res) => {
  try {
    const { postId } = req.params;
    
    const bids = await Bid.find({ post: postId })
      .populate('bidder', 'username profileImage')
      .sort({ amount: -1, createdAt: -1 });

    res.json(bids);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get user's bidding history
exports.getUserBids = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const bids = await Bid.find({ bidder: userId })
      .populate('post', 'title image status currentPrice auctionEndTime')
      .populate('post.user', 'username profileImage')
      .sort({ createdAt: -1 });

    res.json(bids);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Seller sells to specific bidder (by post owner)
exports.sellToBidder = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { postId } = req.params;
    const { bidderId, amount } = req.body;

    if (!bidderId || !amount) {
      return res.status(400).json({ message: 'Bidder ID and amount are required' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.user.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to sell this post' });
    }

    if (post.status !== 'live') {
      return res.status(400).json({ message: 'Post is not available for sale' });
    }

    // Check if auction has expired
    if (new Date() > post.auctionEndTime) {
      return res.status(400).json({ message: 'Auction has expired' });
    }

    // Validate the bidder exists and has bid on this post
    const bidderBid = await Bid.findOne({ 
      post: postId, 
      bidder: bidderId 
    }).sort({ amount: -1 });

    if (!bidderBid) {
      return res.status(400).json({ message: 'This user has not bid on this post' });
    }

    // Update post status to sold
    post.status = 'sold';
    post.soldTo = bidderId;
    post.soldAt = new Date();
    post.soldPrice = parseFloat(amount);
    post.soldVia = 'auction';
    await post.save();

    // Create sale chat for buyer-seller communication
    const saleChat = new SaleChat({
      post: postId,
      buyer: bidderId,
      seller: userId,
      saleAmount: parseFloat(amount),
      saleDate: new Date()
    });
    await saleChat.save();

    // Get bidder details for notification
    const User = require('../models/user');
    const bidder = await User.findById(bidderId).select('username');
    const seller = await User.findById(userId).select('username');

    // Notify buyer with enhanced message and chat link
    await Notification.create({
      user: bidderId,
      message: `Congratulations! You won the auction for "${post.title}" at $${amount}. Click here to chat with the seller about delivery details.`,
      postTitle: post.title,
      type: 'sale',
      postId: postId,
      buyerId: bidderId,
      sellerId: userId,
      chatId: saleChat._id,
      amount: parseFloat(amount)
    });

    // Notify seller with enhanced message and chat link
    await Notification.create({
      user: userId,
      message: `You sold "${post.title}" to ${bidder.username} for $${amount}. Click here to chat with the buyer about delivery details.`,
      postTitle: post.title,
      type: 'sale',
      postId: postId,
      buyerId: bidderId,
      sellerId: userId,
      chatId: saleChat._id,
      amount: parseFloat(amount)
    });

    // Disable auction chat for this post
    const socketService = require('../services/socketService');
    socketService.disableChat(postId);

    res.json({
      message: 'Post sold successfully',
      soldPrice: amount,
      buyer: bidderId,
      chatId: saleChat._id,
      post
    });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get current winning bid for a post
exports.getWinningBid = async (req, res) => {
  try {
    const { postId } = req.params;
    
    const winningBid = await Bid.findOne({ 
      post: postId, 
      isWinning: true 
    })
    .populate('bidder', 'username profileImage');

    res.json(winningBid);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get all bidders for a post (for seller to see who to sell to)
exports.getBiddersForPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;
    
    // Check if user is the post owner
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    if (post.user.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to view bidders' });
    }

    // Get all unique bidders with their highest bid
    const bidders = await Bid.aggregate([
      { $match: { post: post._id } },
      { $sort: { amount: -1 } },
      {
        $group: {
          _id: '$bidder',
          highestBid: { $first: '$amount' },
          totalBids: { $sum: 1 },
          lastBidTime: { $first: '$createdAt' }
        }
      },
      { $sort: { highestBid: -1 } }
    ]);

    // Populate bidder details
    const populatedBidders = await Bid.populate(bidders, {
      path: '_id',
      select: 'username profileImage email'
    });

    res.json(populatedBidders);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Seller sells to highest bidder automatically
exports.sellToHighestBidder = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (post.user.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to sell this post' });
    }

    if (post.status !== 'live') {
      return res.status(400).json({ message: 'Post is not available for sale' });
    }

    // Check if auction has expired
    if (new Date() > post.auctionEndTime) {
      return res.status(400).json({ message: 'Auction has expired' });
    }

    // Get the winning bid
    const winningBid = await Bid.findOne({ 
      post: postId, 
      isWinning: true 
    });

    if (!winningBid) {
      return res.status(400).json({ message: 'No bids found for this post' });
    }

    // Update post status to sold
    post.status = 'sold';
    post.soldTo = winningBid.bidder;
    post.soldAt = new Date();
    post.soldPrice = winningBid.amount;
    post.soldVia = 'auction';
    await post.save();

    // Create sale chat for buyer-seller communication
    const saleChat = new SaleChat({
      post: postId,
      buyer: winningBid.bidder,
      seller: userId,
      saleAmount: winningBid.amount,
      saleDate: new Date()
    });
    await saleChat.save();

    // Get user details for notification
    const User = require('../models/user');
    const winner = await User.findById(winningBid.bidder).select('username');
    const seller = await User.findById(userId).select('username');

    // Notify winner with enhanced message and chat link
    await Notification.create({
      user: winningBid.bidder,
      message: `CONGRATULATIONS! You won the auction for "${post.title}" at $${winningBid.amount}! Click here to chat with the seller about delivery details.`,
      postTitle: post.title,
      type: 'sale',
      postId: postId,
      buyerId: winningBid.bidder,
      sellerId: userId,
      chatId: saleChat._id,
      amount: winningBid.amount
    });

    // Notify seller with enhanced message and chat link
    await Notification.create({
      user: userId,
      message: `You successfully sold "${post.title}" to ${winner.username} for $${winningBid.amount}. Click here to chat with the buyer about delivery details.`,
      postTitle: post.title,
      type: 'sale',
      postId: postId,
      buyerId: winningBid.bidder,
      sellerId: userId,
      chatId: saleChat._id,
      amount: winningBid.amount
    });

    // Populate winner info
    await post.populate('soldTo', 'username profileImage');

    // Disable auction chat for this post
    const socketService = require('../services/socketService');
    socketService.disableChat(postId);

    res.json({
      message: 'Post sold to highest bidder successfully',
      soldPrice: winningBid.amount,
      winner: post.soldTo,
      chatId: saleChat._id,
      post
    });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}; 