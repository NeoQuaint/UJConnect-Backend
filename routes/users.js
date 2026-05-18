const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, full_name, preferred_name, student_number, email, department, course, bio, skills, profile_pic, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update profile
router.put('/:id', async (req, res) => {
  try {
    const { full_name, preferred_name, department, course, bio, skills } = req.body;
    const result = await pool.query(
      `UPDATE users 
       SET full_name = $1, preferred_name = $2, department = $3, course = $4, bio = $5, skills = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING id, full_name, preferred_name, student_number, email, department, course, bio, skills, profile_pic, created_at, updated_at`,
      [full_name, preferred_name, department, course, bio, skills || [], req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Search users
router.get('/', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }
    const result = await pool.query(
      `SELECT id, full_name, preferred_name, department, course, profile_pic 
       FROM users 
       WHERE full_name ILIKE $1 OR preferred_name ILIKE $1 OR department ILIKE $1
       LIMIT 20`,
      [`%${q}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;