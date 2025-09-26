const Post = require('../models/post');
const Bid = require('../models/bid');
const Notification = require('../models/notification');

class AuctionExpirationService {
  constructor() {
    this.checkInterval = 60000; // Check every minute
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Auction expiration service started');
    
    this.checkExpiredAuctions();
    this.interval = setInterval(() => {
      this.checkExpiredAuctions();
    }, this.checkInterval);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.isRunning = false;
      console.log('Auction expiration service stopped');
    }
  }

  async checkExpiredAuctions() {
    try {
      const now = new Date();
      
      // Find all live auctions that have expired
      const expiredAuctions = await Post.find({
        status: 'live',
        auctionEndTime: { $lte: now }
      });

      for (const auction of expiredAuctions) {
        await this.endAuction(auction);
      }

      if (expiredAuctions.length > 0) {
        console.log(`Processed ${expiredAuctions.length} expired auctions`);
      }
    } catch (error) {
      console.error('Error checking expired auctions:', error);
    }
  }

  async endAuction(auction) {
    try {
      // Get the winning bid
      const winningBid = await Bid.findOne({ 
        post: auction._id, 
        isWinning: true 
      });

      if (!winningBid) {
        // No bids, mark as expired
        auction.status = 'expired';
        await auction.save();
        
        // Deactivate chat for this auction
        const Chat = require('../models/chat');
        await Chat.updateOne(
          { post: auction._id },
          { isActive: false }
        );
        
        // Optionally: Remove old messages (uncomment if you want to delete messages)
        // await Chat.updateOne(
        //   { post: auction._id },
        //   { $set: { messages: [] } }
        // );
        
        await Notification.create({
          user: auction.user,
          message: `Your auction "${auction.title}" has expired with no bids`,
          postTitle: auction.title
        });

        // Notify chat participants about auction expiration
        const socketService = require('./socketService');
        socketService.notifyAuctionEvent(auction._id.toString(), 'auction-ended', {
          status: 'expired',
          reason: 'no-bids'
        });

        console.log(`Auction ${auction._id} expired with no bids`);
        return;
      }

      // Update auction status to sold
      auction.status = 'sold';
      auction.soldTo = winningBid.bidder;
      auction.soldAt = new Date();
      auction.soldPrice = winningBid.amount;
      auction.soldVia = 'auction';
      await auction.save();

      // Deactivate chat for this auction
      const Chat = require('../models/chat');
      await Chat.updateOne(
        { post: auction._id },
        { isActive: false }
      );
      
      // Optionally: Remove old messages (uncomment if you want to delete messages)
      // await Chat.updateOne(
      //   { post: auction._id },
      //   { $set: { messages: [] } }
      // );

      // Get user details for notification
      const User = require('../models/user');
      const winner = await User.findById(winningBid.bidder).select('username');
      const seller = await User.findById(auction.user).select('username');

      // Notify winner
      await Notification.create({
        user: winningBid.bidder,
        message: `CONGRATULATIONS! You won the auction for "${auction.title}" at $${winningBid.amount}! The auction has ended. Seller: ${seller.username}`,
        postTitle: auction.title
      });

      // Notify seller
      await Notification.create({
        user: auction.user,
        message: `Your auction "${auction.title}" has ended and sold to ${winner.username} for $${winningBid.amount}`,
        postTitle: auction.title
      });

      // Notify chat participants about auction end
      const socketService = require('./socketService');
      socketService.notifyAuctionEvent(auction._id.toString(), 'auction-ended', {
        winner: winner.username,
        amount: winningBid.amount,
        status: 'sold'
      });

      console.log(`Auction ${auction._id} ended successfully, sold for $${winningBid.amount}`);
    } catch (error) {
      console.error(`Error ending auction ${auction._id}:`, error);
    }
  }
}

module.exports = new AuctionExpirationService(); 