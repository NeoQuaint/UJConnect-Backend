const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Get posts (all or by user)
router.get('/', async (req, res) => {
  try {
    const { user_id } = req.query;
    let query = `
      SELECT p.*, u.full_name, u.preferred_name, u.department, u.profile_pic
      FROM posts p
      JOIN users u ON p.user_id = u.id
    `;
    const params = [];
    if (user_id) {
      query += ' WHERE p.user_id = $1';
      params.push(user_id);
    }
    query += ' ORDER BY p.created_at DESC LIMIT 50';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get posts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create post
router.post('/', async (req, res) => {
  try {
    const { content, media_url, media_type, user_id, post_type } = req.body;
    const result = await pool.query(
      `INSERT INTO posts (user_id, content, media_url, media_type, post_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, content, media_url, media_type, post_type || 'post']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;