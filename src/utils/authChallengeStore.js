// Simple in-memory store for auth challenges
// In production, use Redis or database for persistence

class AuthChallengeStore {
  constructor() {
    this.challenges = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000); // Clean up every 5 minutes
  }

  // Store a challenge for a wallet address
  storeChallenge(walletAddress, challenge) {
    this.challenges.set(walletAddress.toLowerCase(), {
      ...challenge,
      createdAt: Date.now()
    });
  }

  // Get a challenge for a wallet address
  getChallenge(walletAddress) {
    const challenge = this.challenges.get(walletAddress.toLowerCase());
    if (!challenge) return null;

    // Check if challenge is expired (10 minutes)
    if (Date.now() - challenge.createdAt > 10 * 60 * 1000) {
      this.challenges.delete(walletAddress.toLowerCase());
      return null;
    }

    return challenge;
  }

  // Remove a challenge after successful authentication
  removeChallenge(walletAddress) {
    this.challenges.delete(walletAddress.toLowerCase());
  }

  // Clean up expired challenges
  cleanup() {
    const now = Date.now();
    for (const [address, challenge] of this.challenges.entries()) {
      if (now - challenge.createdAt > 10 * 60 * 1000) { // 10 minutes
        this.challenges.delete(address);
      }
    }
  }

  // Get store stats (for debugging)
  getStats() {
    return {
      totalChallenges: this.challenges.size,
      addresses: Array.from(this.challenges.keys())
    };
  }
}

module.exports = new AuthChallengeStore(); 