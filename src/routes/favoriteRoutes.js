const express = require('express');
const router = express.Router();
const favoriteController = require('../controllers/favoriteController');
const auth = require('../middleware/auth');

// Add a post to favorites
router.post('/:postId', auth, favoriteController.addFavorite);

// Remove a post from favorites
router.delete('/:postId', auth, favoriteController.removeFavorite);

// Get user's favorite posts
router.get('/', auth, favoriteController.getFavorites);

module.exports = router; 