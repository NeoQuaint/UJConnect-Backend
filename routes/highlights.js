const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Get highlights for a user
router.get('/user/:userId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT h.*, 
        (SELECT json_agg(json_build_object(
          'id', hi.id, 
          'media_url', hi.media_url, 
          'media_type', hi.media_type,
          'source_story_id', hi.source_story_id
        ) ORDER BY hi.created_at ASC)
         FROM highlight_items hi
         WHERE hi.highlight_id = h.id) as items
       FROM highlights h
       WHERE h.user_id = $1
       ORDER BY h.created_at DESC`,
      [req.params.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get highlights error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create highlight
router.post('/', async (req, res) => {
  try {
    const { user_id, title } = req.body;
    const result = await pool.query(
      `INSERT INTO highlights (user_id, title)
       VALUES ($1, $2)
       RETURNING *`,
      [user_id, title]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create highlight error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload media directly to highlight
router.post('/:id/items', async (req, res) => {
  try {
    const { media_url, media_type } = req.body;
    const result = await pool.query(
      `INSERT INTO highlight_items (highlight_id, media_url, media_type)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.params.id, media_url, media_type || 'image']
    );
    await pool.query(
      `UPDATE highlights SET cover_media = $1 WHERE id = $2 AND cover_media IS NULL`,
      [media_url, req.params.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Add highlight item error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add existing story to highlight
router.post('/:id/stories', async (req, res) => {
  try {
    const { story_id } = req.body;
    const story = await pool.query('SELECT media_url, media_type FROM stories WHERE id = $1', [story_id]);
    if (story.rows.length === 0) return res.status(404).json({ error: 'Story not found' });

    const result = await pool.query(
      `INSERT INTO highlight_items (highlight_id, media_url, media_type, source_story_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.params.id, story.rows[0].media_url, story.rows[0].media_type, story_id]
    );
    await pool.query(
      `UPDATE highlights SET cover_media = $1 WHERE id = $2 AND cover_media IS NULL`,
      [story.rows[0].media_url, req.params.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Add story to highlight error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete highlight
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM highlights WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete single item from highlight
router.delete('/:highlightId/items/:itemId', async (req, res) => {
  try {
    await pool.query('DELETE FROM highlight_items WHERE id = $1 AND highlight_id = $2', [req.params.itemId, req.params.highlightId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;