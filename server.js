// Set environment variables directly
process.env.MONGODB_URI = 'mongodb+srv://roohullah:Iammoutopx12%40@cluster0.4ggbhfq.mongodb.net/unity-db?retryWrites=true&w=majority&appName=Cluster0';
process.env.JWT_SECRET = 'your_jwt_secret';
process.env.PORT = '8012';
process.env.ETHEREUM_RPC_URL = 'https://ethereum.publicnode.com';
process.env.JWT_EXPIRES_IN = '1d';

const app = require('./src/app');
const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const auctionExpirationService = require('./src/services/auctionExpirationService');
const socketService = require('./src/services/socketService');

const PORT = process.env.PORT;

const uploadDir = path.join(__dirname, 'uploads/user-profiles');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Create HTTP server
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  // Start auction expiration service
  auctionExpirationService.start();
});

// Initialize Socket.IO
socketService.initialize(server);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create video upload directory if it doesn't exist
const videoUploadDir = path.join(__dirname, 'uploads/post-videos');
if (!fs.existsSync(videoUploadDir)) {
  fs.mkdirSync(videoUploadDir, { recursive: true });
}
