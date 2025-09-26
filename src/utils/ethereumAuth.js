const { ethers } = require('ethers');

// Initialize provider with a truly free RPC endpoint (no API key required)
const provider = new ethers.JsonRpcProvider('https://ethereum.publicnode.com');

// Message template for wallet authentication
const AUTH_MESSAGE = (nonce) => 
  `Welcome to Unity Auction!\n\nPlease sign this message to authenticate your wallet.\n\nNonce: ${nonce}\n\nThis signature will be used to verify your identity and will not be used for any other purpose.`;

// Generate a unique nonce for each authentication attempt
function generateNonce() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Get account balance
async function getAccountBalance(address) {
  try {
    if (!isValidEthereumAddress(address)) {
      throw new Error('Invalid Ethereum address');
    }
    
    const normalizedAddress = normalizeAddress(address);
    
    // Add timeout and retry logic
    const balance = await Promise.race([
      provider.getBalance(normalizedAddress),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      )
    ]);
    
    return {
      balance: ethers.formatEther(balance),
      balanceWei: balance.toString(),
      address: normalizedAddress
    };
  } catch (error) {
    console.error('Balance check error:', error);
    
    // Return a fallback response if RPC fails
    if (error.message.includes('timeout') || error.message.includes('rate limit') || error.message.includes('retry') || error.message.includes('Unauthorized') || error.message.includes('API key')) {
      return {
        balance: '0',
        balanceWei: '0',
        address: normalizeAddress(address),
        error: 'RPC service temporarily unavailable'
      };
    }
    
    throw error;
  }
}

// Verify Ethereum signature
function verifySignature(address, signature, nonce) {
  try {
    // Reconstruct the message that was signed
    const message = AUTH_MESSAGE(nonce);
    
    // Recover the address from the signature
    const recoveredAddress = ethers.verifyMessage(message, signature);
    
    // Check if the recovered address matches the claimed address
    return recoveredAddress.toLowerCase() === address.toLowerCase();
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// Create a challenge for wallet authentication
function createAuthChallenge() {
  const nonce = generateNonce();
  const message = AUTH_MESSAGE(nonce);
  
  return {
    nonce,
    message,
    timestamp: Date.now()
  };
}

// Validate Ethereum address format
function isValidEthereumAddress(address) {
  try {
    return ethers.isAddress(address);
  } catch (error) {
    return false;
  }
}

// Normalize Ethereum address (convert to checksum address)
function normalizeAddress(address) {
  try {
    return ethers.getAddress(address);
  } catch (error) {
    return null;
  }
}

module.exports = {
  verifySignature,
  createAuthChallenge,
  isValidEthereumAddress,
  normalizeAddress,
  getAccountBalance,
  AUTH_MESSAGE
}; 