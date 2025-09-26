const User = require('../models/user');
const Post = require('../models/post');

// Add a post to user's favorites
exports.addFavorite = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { postId } = req.params;

    // Ensure post exists
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    // Add to favorites using $addToSet to avoid duplicates
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { favorites: postId } },
      { new: true }
    ).populate({
      path: 'favorites',
      populate: { path: 'user', select: 'username profileImage' }
    });

    res.json({ message: 'Post added to favorites', favorites: updatedUser.favorites });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Remove a post from user's favorites
exports.removeFavorite = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { postId } = req.params;

    // Remove from favorites
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $pull: { favorites: postId } },
      { new: true }
    ).populate({
      path: 'favorites',
      populate: { path: 'user', select: 'username profileImage' }
    });

    res.json({ message: 'Post removed from favorites', favorites: updatedUser.favorites });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Get current user's favorite posts
exports.getFavorites = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).populate({
      path: 'favorites',
      populate: { path: 'user', select: 'username profileImage' }
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user.favorites);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
}; 