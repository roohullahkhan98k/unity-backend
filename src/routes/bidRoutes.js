const express = require('express');
const router = express.Router();
const bidController = require('../controllers/bidController');
const auth = require('../middleware/auth');

// Place a bid on a post
router.post('/:postId', auth, bidController.placeBid);

// Get all bids for a post (bidding history)
router.get('/post/:postId', bidController.getBidsForPost);

// Get user's bidding history
router.get('/user/history', auth, bidController.getUserBids);

// Seller sells to specific bidder (by post owner)
router.post('/sell/:postId', auth, bidController.sellToBidder);

// Seller sells to highest bidder automatically
router.post('/sell-highest/:postId', auth, bidController.sellToHighestBidder);

// Get all bidders for a post (for seller)
router.get('/bidders/:postId', auth, bidController.getBiddersForPost);

// Get current winning bid for a post
router.get('/winning/:postId', bidController.getWinningBid);

module.exports = router; 