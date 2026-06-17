const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Get user gallery posts
router.get('/:userId', async (req, res) => {
  try {
    const posts = await pool.query(
      'SELECT * FROM gallery_posts WHERE user_id = $1 ORDER BY created_at DESC',
      [req.params.userId]
    );
    
    const result = [];
    for (const post of posts.rows) {
      const items = await pool.query(
        'SELECT * FROM gallery_items WHERE post_id = $1 ORDER BY created_at ASC',
        [post.id]
      );
      // Only include posts that have at least one item
      if (items.rows.length > 0) {
        result.push({ ...post, items: items.rows });
      }
    }
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create gallery post - only if it will have items
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
    const result = await pool.query(
      'INSERT INTO gallery_items (post_id, media_url, media_type) VALUES ($1, $2, $3) RETURNING *',
      [req.params.postId, media_url, media_type || 'image']
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

// Cleanup - delete empty gallery posts
router.delete('/cleanup/empty', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM gallery_posts WHERE id NOT IN (SELECT DISTINCT post_id FROM gallery_items) RETURNING id`
    );
    res.json({ deleted: result.rows.length });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;