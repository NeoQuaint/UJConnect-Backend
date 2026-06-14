const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Get user gallery posts (each post is an album)
router.get('/:userId', async (req, res) => {
  try {
    // Get all gallery posts for user
    const posts = await pool.query(
      'SELECT * FROM gallery_posts WHERE user_id = $1 ORDER BY created_at DESC',
      [req.params.userId]
    );
    
    // Get items for each post
    const result = [];
    for (const post of posts.rows) {
      const items = await pool.query(
        'SELECT * FROM gallery_items WHERE post_id = $1 ORDER BY created_at ASC',
        [post.id]
      );
      result.push({ ...post, items: items.rows });
    }
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create gallery post (album)
router.post('/', async (req, res) => {
  try {
    const { user_id, caption } = req.body;
    const result = await pool.query(
      'INSERT INTO gallery_posts (user_id, caption) VALUES ($1, $2) RETURNING *',
      [user_id, caption || '']
    );
    res.status(201).json({ ...result.rows[0], items: [] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add item to gallery post
router.post('/:postId/items', async (req, res) => {
  try {
    const { media_url, media_type } = req.body;
    const postId = req.params.postId;
    
    // Check item count (max 10)
    const count = await pool.query('SELECT COUNT(*) FROM gallery_items WHERE post_id = $1', [postId]);
    if (parseInt(count.rows[0].count) >= 10) {
      return res.status(400).json({ error: 'Maximum 10 items per post' });
    }
    
    const result = await pool.query(
      'INSERT INTO gallery_items (post_id, media_url, media_type) VALUES ($1, $2, $3) RETURNING *',
      [postId, media_url, media_type || 'image']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete gallery post
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM gallery_posts WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete single item from post
router.delete('/items/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM gallery_items WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;