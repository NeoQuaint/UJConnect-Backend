require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'https://uj-connect.com', 'https://www.uj-connect.com'],
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected pool error:', err.message);
});

pool.connect()
  .then(() => console.log('PostgreSQL connected'))
  .catch(err => console.error('DB connection error:', err.message));

const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        preferred_name VARCHAR(255),
        student_number VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        department VARCHAR(255),
        course VARCHAR(255),
        password VARCHAR(255) NOT NULL,
        bio TEXT,
        skills TEXT[],
        year VARCHAR(10),
        cover_photo TEXT,
        profile_pic TEXT,
        verification_token VARCHAR(255),
        verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content TEXT,
        media_url TEXT,
        media_type VARCHAR(50),
        post_type VARCHAR(50) DEFAULT 'post',
        likes_count INTEGER DEFAULT 0,
        comments_count INTEGER DEFAULT 0,
        reposts_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS likes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, post_id)
      );

      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS stories (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        media_url TEXT,
        media_type VARCHAR(50) DEFAULT 'image',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS highlights (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        cover_media TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS highlight_items (
        id SERIAL PRIMARY KEY,
        highlight_id INTEGER REFERENCES highlights(id) ON DELETE CASCADE,
        media_url TEXT,
        media_type VARCHAR(50) DEFAULT 'image',
        source_story_id INTEGER REFERENCES stories(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS badges (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        tags TEXT[],
        link TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS follows (
        id SERIAL PRIMARY KEY,
        follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(follower_id, following_id)
      );

      CREATE TABLE IF NOT EXISTS communities (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        icon VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS community_members (
        id SERIAL PRIMARY KEY,
        community_id INTEGER REFERENCES communities(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) DEFAULT 'member',
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(community_id, user_id)
      );
    `);
    console.log('Database tables initialized');
  } catch (err) {
    console.error('DB init error:', err.message);
  }
};

initDB();

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const authRoutes = require('./routes/auth');
const postsRoutes = require('./routes/posts');
const usersRoutes = require('./routes/users');
const uploadRoutes = require('./routes/upload');
const commentsRoutes = require('./routes/comments');
const storiesRoutes = require('./routes/stories');
const searchRoutes = require('./routes/search');
const highlightsRoutes = require('./routes/highlights');
const badgesRoutes = require('./routes/badges');
const projectsRoutes = require('./routes/projects');

app.use('/api/auth', authRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/stories', storiesRoutes);
app.use('/api/highlights', highlightsRoutes);
app.use('/api/badges', badgesRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/projects', projectsRoutes);

// Add messages REST endpoint for fetching chat history
app.get('/api/messages/:userId/:otherUserId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, u.full_name, u.preferred_name, u.profile_pic 
       FROM messages m 
       JOIN users u ON m.sender_id = u.id 
       WHERE (m.sender_id = $1 AND m.receiver_id = $2) 
          OR (m.sender_id = $2 AND m.receiver_id = $1) 
       ORDER BY m.created_at ASC 
       LIMIT 100`,
      [req.params.userId, req.params.otherUserId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Online users tracking
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('user_online', (userId) => {
    onlineUsers.set(String(userId), socket.id);
    socket.userId = String(userId);
    io.emit('online_users', Array.from(onlineUsers.keys()));
  });

  socket.on('send_message', async (data) => {
    const { sender_id, receiver_id, content } = data;
    try {
      const result = await pool.query(
        'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING *',
        [sender_id, receiver_id, content]
      );
      const message = result.rows[0];
      const receiverSocketId = onlineUsers.get(String(receiver_id));
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('new_message', message);
      }
      socket.emit('message_sent', message);
    } catch (err) {
      console.error('Message save error:', err);
    }
  });

  socket.on('typing', (data) => {
    const receiverSocketId = onlineUsers.get(String(data.receiver_id));
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('user_typing', { sender_id: data.sender_id });
    }
  });

  socket.on('stop_typing', (data) => {
    const receiverSocketId = onlineUsers.get(String(data.receiver_id));
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('user_stop_typing', { sender_id: data.sender_id });
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      onlineUsers.delete(socket.userId);
      io.emit('online_users', Array.from(onlineUsers.keys()));
    }
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});