const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Get active stories (last 24 hours)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.full_name, u.preferred_name, u.profile_pic
       FROM stories s
       JOIN users u ON s.user_id = u.id
       WHERE s.created_at > NOW() - INTERVAL '24 hours'
       ORDER BY s.created_at DESC
       LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get stories error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create story
router.post('/', async (req, res) => {
  try {
    const { user_id, media_url, media_type } = req.body;
    const result = await pool.query(
      `INSERT INTO stories (user_id, media_url, media_type)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [user_id, media_url, media_type || 'image']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create story error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete story
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM stories WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;