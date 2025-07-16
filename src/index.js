import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
dotenv.config();
import userRoutes from './routes/user.route.js';
import productRoutes from './routes/product.route.js';
import authRoutes from './routes/auth.route.js';
import chatRoutes from './routes/chat.route.js';
import orderRoutes from './routes/order.route.js';
import { connectDB } from './lib/db.js';
import { createAdmin } from './controllers/user.controller.js';

const app = express();
app.use(cookieParser());


app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.json({ limit: '10mb' })); // or higher, e.g. '20mb'

// Simple CORS configuration with PATCH method support
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://192.168.18.118:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  optionsSuccessStatus: 200
}));

const PORT = process.env.PORT || 5001;


// API Routes
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/orders', orderRoutes); // Add this line

// Create HTTP server
const server = createServer(app);

// Create Socket.io server
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  }
});

// Socket.io authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

// Socket.io connection handling
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.id}`);
  
  // Add user to online users
  onlineUsers.set(socket.user.id, socket.id);
  socket.join(socket.user.id);

  // Handle new messages
  socket.on('send_message', ({ conversationId, recipientId, content }) => {
    if (onlineUsers.has(recipientId)) {
      io.to(recipientId).emit('new_message', {
        conversationId,
        senderId: socket.user.id,
        content,
        createdAt: new Date()
      });
    }
  });

  // Handle typing
  socket.on('typing', ({ conversationId, recipientId }) => {
    if (onlineUsers.has(recipientId)) {
      io.to(recipientId).emit('typing', {
        conversationId,
        userId: socket.user.id
      });
    }
  });

  socket.on('stop_typing', ({ conversationId, recipientId }) => {
    if (onlineUsers.has(recipientId)) {
      io.to(recipientId).emit('stop_typing', {
        conversationId,
        userId: socket.user.id
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.user.id}`);
    onlineUsers.delete(socket.user.id);
  });
});

// Database initialization with fallback
const initializeApp = async () => {
  try {
    await connectDB();
    await createAdmin();
    console.log('✅ Database and admin initialized');
  } catch (err) {
    console.error('❌ MongoDB Atlas connection failed:', err.message);
    console.log('🔄 Server will start anyway for development...');
    console.log('💡 Try these solutions:');
    console.log('   1. Use mobile hotspot');
    console.log('   2. Change DNS to 8.8.8.8');
    console.log('   3. Try again later when internet is stable');
  }
};

// Start server
initializeApp().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});