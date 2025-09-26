const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const Notification = require('../models/notification');
const { 
  verifySignature, 
  createAuthChallenge, 
  isValidEthereumAddress, 
  normalizeAddress,
  getAccountBalance
} = require('../utils/ethereumAuth');
const authChallengeStore = require('../utils/authChallengeStore');

const JWT_SECRET = 'your_jwt_secret'; // Change this in production
const JWT_EXPIRES_IN = '1d';

function generateToken(user) {
  return jwt.sign(
    { userId: user._id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

exports.signup = async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;
    if (!username || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(409).json({ message: 'Email already registered' });
    }
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(409).json({ message: 'Username already taken' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();
    // Create welcome notification
    await Notification.create({ user: newUser._id, message: 'Finish setting up your profile' });
    const token = generateToken(newUser);
    res.status(201).json({ token, userId: newUser._id, username: newUser.username, email: newUser.email });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = generateToken(user);
    res.json({ token, userId: user._id, username: user.username, email: user.email });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { username, email } = req.body;
    let updateData = {};
    if (username) updateData.username = username;
    if (email) updateData.email = email;
    if (req.file) {
      updateData.profileImage = `/uploads/user-profiles/${req.file.filename}`;
    }
    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });
    if (!updatedUser) return res.status(404).json({ message: 'User not found' });
    await Notification.create({ user: userId, message: 'Profile updated successfully' });
    res.json({
      userId: updatedUser._id,
      username: updatedUser.username,
      email: updatedUser.email,
      profileImage: updatedUser.profileImage || null
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      userId: user._id,
      username: user.username,
      email: user.email,
      walletAddress: user.walletAddress || null,
      profileImage: user.profileImage || null
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ===== WALLET AUTHENTICATION ENDPOINTS =====

// Get authentication challenge for wallet
exports.getWalletAuthChallenge = async (req, res) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({ message: 'Wallet address is required' });
    }

    if (!isValidEthereumAddress(walletAddress)) {
      return res.status(400).json({ message: 'Invalid Ethereum address format' });
    }

    const normalizedAddress = normalizeAddress(walletAddress);
    if (!normalizedAddress) {
      return res.status(400).json({ message: 'Invalid wallet address' });
    }

    // Create authentication challenge
    const challenge = createAuthChallenge();
    
    // Store challenge for verification
    authChallengeStore.storeChallenge(normalizedAddress, challenge);

    res.json({
      message: 'Authentication challenge created',
      challenge: {
        message: challenge.message,
        nonce: challenge.nonce
      }
    });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Wallet signup with signature verification
exports.walletSignup = async (req, res) => {
  try {
    const { walletAddress, signature, nonce, username } = req.body;
    
    if (!walletAddress || !signature || !nonce || !username) {
      return res.status(400).json({ 
        message: 'Wallet address, signature, nonce, and username are required' 
      });
    }

    if (!isValidEthereumAddress(walletAddress)) {
      return res.status(400).json({ message: 'Invalid Ethereum address format' });
    }

    const normalizedAddress = normalizeAddress(walletAddress);
    if (!normalizedAddress) {
      return res.status(400).json({ message: 'Invalid wallet address' });
    }

    // Verify signature
    if (!verifySignature(normalizedAddress, signature, nonce)) {
      return res.status(401).json({ message: 'Invalid signature' });
    }

    // Get stored challenge
    const storedChallenge = authChallengeStore.getChallenge(normalizedAddress);
    if (!storedChallenge || storedChallenge.nonce !== nonce) {
      return res.status(401).json({ message: 'Invalid or expired challenge' });
    }

    // Check if wallet is already registered
    const existingUser = await User.findOne({ walletAddress: normalizedAddress });
    if (existingUser) {
      return res.status(409).json({ message: 'Wallet address already registered' });
    }

    // Check if username is taken
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(409).json({ message: 'Username already taken' });
    }

    // Create new user
    const newUser = new User({
      username,
      walletAddress: normalizedAddress,
      email: null, // Wallet users don't need email
      password: null // Wallet users don't need password
    });

    await newUser.save();

    // Create welcome notification
    await Notification.create({ 
      user: newUser._id, 
      message: 'Welcome to Unity Auction! Your wallet has been successfully connected.' 
    });

    // Remove used challenge
    authChallengeStore.removeChallenge(normalizedAddress);

    // Generate JWT token
    const token = generateToken(newUser);

    res.status(201).json({
      message: 'Wallet registration successful',
      token,
      user: {
        userId: newUser._id,
        username: newUser.username,
        walletAddress: newUser.walletAddress,
        profileImage: newUser.profileImage || null
      }
    });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Wallet login with signature verification
exports.walletLogin = async (req, res) => {
  try {
    const { walletAddress, signature, nonce } = req.body;
    
    if (!walletAddress || !signature || !nonce) {
      return res.status(400).json({ 
        message: 'Wallet address, signature, and nonce are required' 
      });
    }

    if (!isValidEthereumAddress(walletAddress)) {
      return res.status(400).json({ message: 'Invalid Ethereum address format' });
    }

    const normalizedAddress = normalizeAddress(walletAddress);
    if (!normalizedAddress) {
      return res.status(400).json({ message: 'Invalid wallet address' });
    }

    // Verify signature
    if (!verifySignature(normalizedAddress, signature, nonce)) {
      return res.status(401).json({ message: 'Invalid signature' });
    }

    // Get stored challenge
    const storedChallenge = authChallengeStore.getChallenge(normalizedAddress);
    if (!storedChallenge || storedChallenge.nonce !== nonce) {
      return res.status(401).json({ message: 'Invalid or expired challenge' });
    }

    // Find user by wallet address
    const user = await User.findOne({ walletAddress: normalizedAddress });
    if (!user) {
      return res.status(404).json({ 
        message: 'Wallet not registered. Please sign up first.' 
      });
    }

    // Remove used challenge
    authChallengeStore.removeChallenge(normalizedAddress);

    // Generate JWT token
    const token = generateToken(user);

    res.json({
      message: 'Wallet login successful',
      token,
      user: {
        userId: user._id,
        username: user.username,
        walletAddress: user.walletAddress,
        profileImage: user.profileImage || null
      }
    });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get auth challenge store stats (for debugging)
exports.getAuthStats = async (req, res) => {
  try {
    const stats = authChallengeStore.getStats();
    res.json({
      message: 'Auth challenge store stats',
      stats
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}; 

// Get account balance for authenticated user
exports.getAccountBalance = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.walletAddress) {
      return res.status(400).json({ message: 'No wallet address connected to this account' });
    }

    const balanceData = await getAccountBalance(user.walletAddress);
    
    // Check if there was an RPC error
    if (balanceData.error) {
      return res.status(503).json({
        message: 'Blockchain service temporarily unavailable',
        balance: balanceData.balance,
        balanceWei: balanceData.balanceWei,
        address: balanceData.address,
        currency: 'ETH',
        error: balanceData.error
      });
    }
    
    res.json({
      message: 'Account balance retrieved successfully',
      balance: balanceData.balance,
      balanceWei: balanceData.balanceWei,
      address: balanceData.address,
      currency: 'ETH'
    });

  } catch (err) {
    console.error('Balance retrieval error:', err);
    res.status(500).json({ 
      message: 'Failed to retrieve account balance', 
      error: err.message 
    });
  }
};

// Get balance for any address (public endpoint)
exports.getAddressBalance = async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!address) {
      return res.status(400).json({ message: 'Address parameter is required' });
    }

    if (!isValidEthereumAddress(address)) {
      return res.status(400).json({ message: 'Invalid Ethereum address format' });
    }

    const balanceData = await getAccountBalance(address);
    
    // Check if there was an RPC error
    if (balanceData.error) {
      return res.status(503).json({
        message: 'Blockchain service temporarily unavailable',
        balance: balanceData.balance,
        balanceWei: balanceData.balanceWei,
        address: balanceData.address,
        currency: 'ETH',
        error: balanceData.error
      });
    }
    
    res.json({
      message: 'Address balance retrieved successfully',
      balance: balanceData.balance,
      balanceWei: balanceData.balanceWei,
      address: balanceData.address,
      currency: 'ETH'
    });

  } catch (err) {
    console.error('Balance retrieval error:', err);
    res.status(500).json({ 
      message: 'Failed to retrieve address balance', 
      error: err.message 
    });
  }
}; 