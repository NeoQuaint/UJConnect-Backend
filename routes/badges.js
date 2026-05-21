const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Get badges for a user
router.get('/user/:userId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM badges WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.params.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get badges error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create badge
router.post('/', async (req, res) => {
  try {
    const { user_id, title, description } = req.body;
    const result = await pool.query(
      `INSERT INTO badges (user_id, title, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [user_id, title, description || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create badge error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete badge
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM badges WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;