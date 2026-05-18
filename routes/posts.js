const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Get all posts
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, u.full_name, u.preferred_name, u.department, u.profile_pic
      FROM posts p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT 50
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Get posts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create post
router.post('/', async (req, res) => {
  try {
    const { content, media_url, media_type, user_id } = req.body;
    const result = await pool.query(
      `INSERT INTO posts (user_id, content, media_url, media_type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [user_id, content, media_url, media_type]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;