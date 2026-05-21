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
        (SELECT json_agg(json_build_object('id', s.id, 'media_url', s.media_url, 'media_type', s.media_type))
         FROM highlight_stories hs 
         JOIN stories s ON hs.story_id = s.id 
         WHERE hs.highlight_id = h.id) as stories
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

// Add story to highlight
router.post('/:id/stories', async (req, res) => {
  try {
    const { story_id } = req.body;
    await pool.query(
      `UPDATE highlights SET cover_media = (
        SELECT media_url FROM stories WHERE id = $1
      ) WHERE id = $2 AND cover_media IS NULL`,
      [story_id, req.params.id]
    );
    const result = await pool.query(
      `INSERT INTO highlight_stories (highlight_id, story_id)
       VALUES ($1, $2)
       RETURNING *`,
      [req.params.id, story_id]
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

module.exports = router;