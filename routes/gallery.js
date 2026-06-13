const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Get user gallery
router.get('/:userId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM gallery WHERE user_id = $1 ORDER BY created_at DESC',
      [req.params.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add to gallery
router.post('/', async (req, res) => {
  try {
    const { user_id, media_url, media_type } = req.body;
    // Check count
    const count = await pool.query('SELECT COUNT(*) FROM gallery WHERE user_id = $1', [user_id]);
    if (parseInt(count.rows[0].count) >= 5) {
      return res.status(400).json({ error: 'Maximum 5 items allowed' });
    }
    const result = await pool.query(
      'INSERT INTO gallery (user_id, media_url, media_type) VALUES ($1, $2, $3) RETURNING *',
      [user_id, media_url, media_type || 'image']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete from gallery
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM gallery WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;