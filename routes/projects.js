const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Get all projects
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.full_name, u.preferred_name, u.profile_pic, u.department
       FROM projects p
       JOIN users u ON p.user_id = u.id
       ORDER BY p.created_at DESC
       LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get projects by user
router.get('/user/:userId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.full_name, u.preferred_name, u.profile_pic, u.department
       FROM projects p
       JOIN users u ON p.user_id = u.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [req.params.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get user projects error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create project
router.post('/', async (req, res) => {
  try {
    const { user_id, name, description, tags, link } = req.body;
    const result = await pool.query(
      `INSERT INTO projects (user_id, name, description, tags, link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, name, description || '', tags || [], link || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete project
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;