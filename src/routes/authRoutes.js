const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

// Traditional email/password authentication
router.post('/signup', authController.signup);
router.post('/login', authController.login);

// Wallet authentication
router.post('/wallet/challenge', authController.getWalletAuthChallenge);
router.post('/wallet/signup', authController.walletSignup);
router.post('/wallet/login', authController.walletLogin);

// Profile management
router.patch('/profile', auth, upload.single('profileImage'), authController.updateProfile);
router.get('/profile', auth, authController.getProfile);

// Balance endpoints
router.get('/balance', auth, authController.getAccountBalance);
router.get('/balance/:address', authController.getAddressBalance);

// Debug endpoint (remove in production)
router.get('/auth/stats', authController.getAuthStats);

module.exports = router; 