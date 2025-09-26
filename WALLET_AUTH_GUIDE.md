# MetaMask Wallet Authentication Guide

## Backend Setup Complete! ✅

Your backend now supports secure MetaMask wallet authentication with signature verification.

## Frontend Implementation

### 1. Install Dependencies

```bash
npm install ethers
```

### 2. Create Wallet Authentication Service

```javascript
// services/walletAuth.js
import { ethers } from 'ethers';

class WalletAuthService {
  constructor() {
    this.provider = null;
    this.signer = null;
  }

  // Check if MetaMask is installed
  async checkMetaMask() {
    if (typeof window.ethereum === 'undefined') {
      throw new Error('MetaMask is not installed. Please install MetaMask extension.');
    }
    return true;
  }

  // Connect to MetaMask
  async connectWallet() {
    try {
      await this.checkMetaMask();
      
      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });

      if (accounts.length === 0) {
        throw new Error('No accounts found. Please connect your wallet.');
      }

      const walletAddress = accounts[0];
      
      // Create provider and signer
      this.provider = new ethers.BrowserProvider(window.ethereum);
      this.signer = await this.provider.getSigner();

      return walletAddress;
    } catch (error) {
      console.error('Error connecting wallet:', error);
      throw error;
    }
  }

  // Get authentication challenge from backend
  async getAuthChallenge(walletAddress) {
    try {
      const response = await fetch('http://localhost:8012/api/auth/wallet/challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletAddress })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const data = await response.json();
      return data.challenge;
    } catch (error) {
      console.error('Error getting auth challenge:', error);
      throw error;
    }
  }

  // Sign message with MetaMask
  async signMessage(message) {
    try {
      if (!this.signer) {
        throw new Error('Wallet not connected. Please connect your wallet first.');
      }

      const signature = await this.signer.signMessage(message);
      return signature;
    } catch (error) {
      console.error('Error signing message:', error);
      throw error;
    }
  }

  // Wallet Signup
  async walletSignup(username) {
    try {
      // Connect wallet
      const walletAddress = await this.connectWallet();

      // Get auth challenge
      const challenge = await this.getAuthChallenge(walletAddress);

      // Sign the challenge message
      const signature = await this.signMessage(challenge.message);

      // Send signup request
      const response = await fetch('http://localhost:8012/api/auth/wallet/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress,
          signature,
          nonce: challenge.nonce,
          username
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const data = await response.json();
      
      // Store token
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      return data;
    } catch (error) {
      console.error('Error during wallet signup:', error);
      throw error;
    }
  }

  // Wallet Login
  async walletLogin() {
    try {
      // Connect wallet
      const walletAddress = await this.connectWallet();

      // Get auth challenge
      const challenge = await this.getAuthChallenge(walletAddress);

      // Sign the challenge message
      const signature = await this.signMessage(challenge.message);

      // Send login request
      const response = await fetch('http://localhost:8012/api/auth/wallet/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress,
          signature,
          nonce: challenge.nonce
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const data = await response.json();
      
      // Store token
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      return data;
    } catch (error) {
      console.error('Error during wallet login:', error);
      throw error;
    }
  }

  // Logout
  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.provider = null;
    this.signer = null;
  }

  // Get current user
  getCurrentUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }

  // Get token
  getToken() {
    return localStorage.getItem('token');
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.getToken();
  }
}

export default new WalletAuthService();
```

### 3. React Component Example

```jsx
// components/WalletAuth.jsx
import React, { useState } from 'react';
import walletAuthService from '../services/walletAuth';

const WalletAuth = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [username, setUsername] = useState('');
  const [isSignup, setIsSignup] = useState(false);

  const handleWalletAuth = async () => {
    setLoading(true);
    setError(null);

    try {
      if (isSignup) {
        if (!username.trim()) {
          throw new Error('Username is required for signup');
        }
        await walletAuthService.walletSignup(username);
      } else {
        await walletAuthService.walletLogin();
      }

      // Redirect or update UI
      window.location.reload();
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    walletAuthService.logout();
    window.location.reload();
  };

  const currentUser = walletAuthService.getCurrentUser();

  if (currentUser) {
    return (
      <div className="wallet-auth">
        <h3>Welcome, {currentUser.username}!</h3>
        <p>Wallet: {currentUser.walletAddress}</p>
        <button onClick={handleLogout} disabled={loading}>
          {loading ? 'Logging out...' : 'Logout'}
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-auth">
      <h3>Connect with MetaMask</h3>
      
      {isSignup && (
        <div>
          <input
            type="text"
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
          />
        </div>
      )}

      <button onClick={handleWalletAuth} disabled={loading}>
        {loading ? 'Connecting...' : (isSignup ? 'Sign Up with Wallet' : 'Login with Wallet')}
      </button>

      <button 
        onClick={() => setIsSignup(!isSignup)}
        disabled={loading}
        style={{ marginLeft: '10px' }}
      >
        {isSignup ? 'Already have account? Login' : 'New user? Sign Up'}
      </button>

      {error && (
        <div style={{ color: 'red', marginTop: '10px' }}>
          {error}
        </div>
      )}
    </div>
  );
};

export default WalletAuth;
```

### 4. API Endpoints

Your backend now provides these wallet authentication endpoints:

#### Get Authentication Challenge
```
POST /api/auth/wallet/challenge
Body: { "walletAddress": "0x..." }
Response: { "challenge": { "message": "...", "nonce": "..." } }
```

#### Wallet Signup
```
POST /api/auth/wallet/signup
Body: { 
  "walletAddress": "0x...", 
  "signature": "0x...", 
  "nonce": "...", 
  "username": "..." 
}
Response: { "token": "...", "user": {...} }
```

#### Wallet Login
```
POST /api/auth/wallet/login
Body: { 
  "walletAddress": "0x...", 
  "signature": "0x...", 
  "nonce": "..." 
}
Response: { "token": "...", "user": {...} }
```

### 5. Security Features

✅ **Signature Verification**: All wallet operations require cryptographic signature verification
✅ **Nonce Protection**: Each authentication attempt uses a unique nonce to prevent replay attacks
✅ **Address Validation**: Ethereum address format is validated and normalized
✅ **Challenge-Response**: Server generates unique challenges that must be signed
✅ **Token-based Auth**: JWT tokens for session management
✅ **Automatic Cleanup**: Expired challenges are automatically removed

### 6. Testing

1. Install MetaMask browser extension
2. Create or import a wallet
3. Use the frontend component to test signup/login
4. Check server logs for authentication flow

### 7. Production Considerations

- Use environment variables for JWT secrets
- Implement rate limiting on auth endpoints
- Use Redis or database for challenge storage instead of in-memory
- Add proper error handling and logging
- Implement wallet address whitelisting if needed
- Add support for multiple networks (mainnet, testnet, etc.)

## Flow Diagram

```
User → Connect MetaMask → Get Challenge → Sign Message → Verify Signature → Get JWT Token
```

The authentication flow ensures that only the actual wallet owner can authenticate by requiring them to cryptographically sign a unique challenge message. 