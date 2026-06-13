const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware to get user from token
const getUserFromToken = (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const token = authHeader.split(' ')[1];
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

// Get posts (all or by user, with scope filtering)
router.get('/', async (req, res) => {
  try {
    const { user_id, type, scope } = req.query;
    let query = `
      SELECT p.*, u.full_name, u.preferred_name, u.department, u.profile_pic
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (user_id) {
      params.push(user_id);
      query += ` AND p.user_id = $${params.length}`;
    }

    if (scope === 'profile') {
      query += ` AND (p.post_scope = 'profile' OR p.post_scope IS NULL)`;
    } else if (type === 'feed' || scope === 'feed') {
      query += ` AND p.post_scope = 'feed'`;
    }

    query += ' ORDER BY p.created_at DESC LIMIT 50';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get posts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create post
router.post('/', async (req, res) => {
  try {
    const { content, media_url, media_type, user_id, post_type, post_scope } = req.body;
    const result = await pool.query(
      `INSERT INTO posts (user_id, content, media_url, media_type, post_type, post_scope)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [user_id, content, media_url, media_type, post_type || 'post', post_scope || 'feed']
    );
    
    const post = await pool.query(
      `SELECT p.*, u.full_name, u.preferred_name, u.department, u.profile_pic
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [result.rows[0].id]
    );
    
    res.status(201).json(post.rows[0]);
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete post - ONLY author can delete
router.delete('/:id', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get the post
    const post = await pool.query('SELECT user_id FROM posts WHERE id = $1', [req.params.id]);
    if (post.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if the user is the author
    if (post.rows[0].user_id !== user.id) {
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }

    await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Like post
router.post('/:id/like', async (req, res) => {
  try {
    const { user_id } = req.body;
    const existing = await pool.query(
      'SELECT id FROM likes WHERE user_id = $1 AND post_id = $2',
      [user_id, req.params.id]
    );
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM likes WHERE user_id = $1 AND post_id = $2', [user_id, req.params.id]);
      await pool.query('UPDATE posts SET likes_count = likes_count - 1 WHERE id = $1', [req.params.id]);
      res.json({ liked: false });
    } else {
      await pool.query('INSERT INTO likes (user_id, post_id) VALUES ($1, $2)', [user_id, req.params.id]);
      await pool.query('UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1', [req.params.id]);
      res.json({ liked: true });
    }
  } catch (err) {
    console.error('Like error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;