const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

router.get('/', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) {
      return res.json({ users: [], posts: [] });
    }

    const searchTerm = `%${q.trim()}%`;

    const usersResult = await pool.query(
      `SELECT id, full_name, preferred_name, department, course, profile_pic, year 
       FROM users 
       WHERE full_name ILIKE $1 OR preferred_name ILIKE $1 OR department ILIKE $1 
       LIMIT 10`,
      [searchTerm]
    );

    const postsResult = await pool.query(
      `SELECT p.*, u.full_name, u.preferred_name, u.profile_pic, u.department 
       FROM posts p 
       JOIN users u ON p.user_id = u.id 
       WHERE p.content ILIKE $1 
       ORDER BY p.created_at DESC 
       LIMIT 10`,
      [searchTerm]
    );

    res.json({ users: usersResult.rows, posts: postsResult.rows });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;