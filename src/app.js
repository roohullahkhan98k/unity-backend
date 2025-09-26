// dotenv will be loaded from server.js

// Log environment variables status
console.log('🔧 Environment Variables:');
console.log('  MONGODB_URI:', process.env.MONGODB_URI ? '✅ Loaded' : '❌ Missing');
console.log('  JWT_SECRET:', process.env.JWT_SECRET ? '✅ Loaded' : '❌ Missing');
console.log('  PORT:', process.env.PORT || '8012 (default)');

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const authRoutes = require('./routes/authRoutes');
const postRoutes = require('./routes/postRoutes');
const favoriteRoutes = require('./routes/favoriteRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const bidRoutes = require('./routes/bidRoutes');
const chatRoutes = require('./routes/chatRoutes');
const saleChatRoutes = require('./routes/saleChatRoutes');

const app = express();

console.log('🔌 Connecting to MongoDB...');
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log('✅ MongoDB connected successfully!');
    console.log('📊 Database:', process.env.MONGODB_URI.split('/').pop().split('?')[0]);
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    console.error('🔍 Connection string:', process.env.MONGODB_URI ? 'Present' : 'Missing');
  });

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use('/api', authRoutes);
app.use('/api', postRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/sale-chat', saleChatRoutes);

module.exports = app;
