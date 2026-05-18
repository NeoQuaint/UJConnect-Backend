const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Get posts (all or by user)
router.get('/', async (req, res) => {
  try {
    const { user_id } = req.query;
    let query = `
      SELECT p.*, u.full_name, u.preferred_name, u.department, u.profile_pic
      FROM posts p
      JOIN users u ON p.user_id = u.id
    `;
    const params = [];
    if (user_id) {
      query += ' WHERE p.user_id = $1';
      params.push(user_id);
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
    const { content, media_url, media_type, user_id, post_type } = req.body;
    const result = await pool.query(
      `INSERT INTO posts (user_id, content, media_url, media_type, post_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, content, media_url, media_type, post_type || 'post']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete post
router.delete('/:id', async (req, res) => {
  try {
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
    // Check if already liked
    const existing = await pool.query(
      'SELECT id FROM likes WHERE user_id = $1 AND post_id = $2',
      [user_id, req.params.id]
    );
    if (existing.rows.length > 0) {
      // Unlike
      await pool.query('DELETE FROM likes WHERE user_id = $1 AND post_id = $2', [user_id, req.params.id]);
      await pool.query('UPDATE posts SET likes_count = likes_count - 1 WHERE id = $1', [req.params.id]);
      res.json({ liked: false });
    } else {
      // Like
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