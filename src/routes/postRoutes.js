const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const { combinedUpload, imageUploadSingle } = require('../middleware/postUpload');
const auth = require('../middleware/auth');

// Add a new auction post (supports multiple images and video)
router.post('/add/post', auth, combinedUpload, postController.addPost);

// Get all posts (optionally filter by user)
router.get('/get/post', postController.getPosts);

// Get live auctions
router.get('/live-auctions', postController.getLiveAuctions);

// Get auction details with time remaining
router.get('/auction/:postId', postController.getAuctionDetails);

// Buy now functionality
router.post('/buy-now/:postId', auth, postController.buyNow);

// End auction when time expires
router.post('/end-auction/:postId', postController.endAuction);

// Update a post (only by creator) - supports multiple images and video
router.put('/update/post/:id', auth, combinedUpload, postController.updatePost);

// Delete a post (only by creator)
router.delete('/delete/post/:id', auth, postController.deletePost);

// Cancel a post (only by creator)
router.patch('/cancel/post/:id', auth, postController.cancelPost);

// Reactivate a cancelled post (only by creator)
router.patch('/reactivate/post/:id', auth, postController.reactivatePost);

module.exports = router; 