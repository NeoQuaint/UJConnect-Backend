const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Get comments for a post
router.get('/:postId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.full_name, u.preferred_name, u.profile_pic
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [req.params.postId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create comment
router.post('/:postId', async (req, res) => {
  try {
    const { user_id, content } = req.body;
    const result = await pool.query(
      `INSERT INTO comments (user_id, post_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [user_id, req.params.postId, content]
    );
    // Update comments count on post
    await pool.query('UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1', [req.params.postId]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create comment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete comment
router.delete('/:id', async (req, res) => {
  try {
    const comment = await pool.query('SELECT post_id FROM comments WHERE id = $1', [req.params.id]);
    if (comment.rows.length > 0) {
      await pool.query('DELETE FROM comments WHERE id = $1', [req.params.id]);
      await pool.query('UPDATE posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = $1', [comment.rows[0].post_id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;