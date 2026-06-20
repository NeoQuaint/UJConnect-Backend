const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware to get user from token
const getUserFromToken = (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const token = authHeader.split(' ')[1];
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

// Get posts (all or by user, with scope filtering)
router.get('/', async (req, res) => {
  try {
    const { user_id, type, scope } = req.query;
    let query = `
      SELECT 
        p.*, 
        u.full_name, 
        u.preferred_name, 
        u.department, 
        u.profile_pic,
        u.is_anonymous,
        u.anonymous_avatar,
        CASE 
          WHEN u.is_anonymous = true THEN 'User'
          ELSE COALESCE(u.preferred_name, u.full_name, 'Student')
        END as display_name,
        CASE 
          WHEN u.is_anonymous = true THEN u.anonymous_avatar
          ELSE u.profile_pic
        END as display_avatar
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (user_id) {
      params.push(user_id);
      query += ` AND p.user_id = $${params.length}`;
    }

    if (scope === 'profile') {
      query += ` AND (p.post_scope = 'profile' OR p.post_scope IS NULL)`;
    } else if (type === 'feed' || scope === 'feed') {
      query += ` AND p.post_scope = 'feed'`;
    }

    query += ' ORDER BY p.created_at DESC LIMIT 50';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get posts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create post - REJECT blank posts
router.post('/', async (req, res) => {
  try {
    const { content, media_url, media_type, user_id, post_type, post_scope } = req.body;
    
    // Reject posts with no content AND no media
    if ((!content || content.trim() === '') && (!media_url || media_url.trim() === '')) {
      return res.status(400).json({ error: 'Post must have content or media' });
    }
    
    const result = await pool.query(
      `INSERT INTO posts (user_id, content, media_url, media_type, post_type, post_scope)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [user_id, content || '', media_url || null, media_type || null, post_type || 'post', post_scope || 'feed']
    );
    
    // Fetch the created post with user's anonymous status
    const post = await pool.query(
      `SELECT 
        p.*, 
        u.full_name, 
        u.preferred_name, 
        u.department, 
        u.profile_pic,
        u.is_anonymous,
        u.anonymous_avatar,
        CASE 
          WHEN u.is_anonymous = true THEN 'User'
          ELSE COALESCE(u.preferred_name, u.full_name, 'Student')
        END as display_name,
        CASE 
          WHEN u.is_anonymous = true THEN u.anonymous_avatar
          ELSE u.profile_pic
        END as display_avatar
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [result.rows[0].id]
    );
    
    res.status(201).json(post.rows[0]);
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single post
router.get('/:id', async (req, res) => {
  try {
    const post = await pool.query(
      `SELECT 
        p.*, 
        u.full_name, 
        u.preferred_name, 
        u.department, 
        u.profile_pic,
        u.is_anonymous,
        u.anonymous_avatar,
        CASE 
          WHEN u.is_anonymous = true THEN 'User'
          ELSE COALESCE(u.preferred_name, u.full_name, 'Student')
        END as display_name,
        CASE 
          WHEN u.is_anonymous = true THEN u.anonymous_avatar
          ELSE u.profile_pic
        END as display_avatar
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [req.params.id]
    );
    
    if (post.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    res.json(post.rows[0]);
  } catch (err) {
    console.error('Get post error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete post - author OR broken post
router.delete('/:id', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    
    const post = await pool.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
    if (post.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const postData = post.rows[0];
    const isBroken = (!postData.content || postData.content.trim() === '' || postData.content === '0') && (!postData.media_url || postData.media_url.trim() === '');
    
    // Allow deletion if: user owns the post OR the post is broken
    if (user && postData.user_id === user.id) {
      await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
      return res.json({ success: true });
    }
    
    if (isBroken) {
      await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
      return res.json({ success: true, cleaned: true });
    }

    return res.status(403).json({ error: 'You can only delete your own posts' });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Like post
router.post('/:id/like', async (req, res) => {
  try {
    const { user_id } = req.body;
    const existing = await pool.query(
      'SELECT id FROM likes WHERE user_id = $1 AND post_id = $2',
      [user_id, req.params.id]
    );
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM likes WHERE user_id = $1 AND post_id = $2', [user_id, req.params.id]);
      await pool.query('UPDATE posts SET likes_count = likes_count - 1 WHERE id = $1', [req.params.id]);
      res.json({ liked: false });
    } else {
      await pool.query('INSERT INTO likes (user_id, post_id) VALUES ($1, $2)', [user_id, req.params.id]);
      await pool.query('UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1', [req.params.id]);
      res.json({ liked: true });
    }
  } catch (err) {
    console.error('Like error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get comments for a post
router.get('/:id/comments', async (req, res) => {
  try {
    const comments = await pool.query(
      `SELECT 
        c.*, 
        u.full_name, 
        u.preferred_name, 
        u.profile_pic,
        u.is_anonymous,
        u.anonymous_avatar,
        CASE 
          WHEN u.is_anonymous = true THEN 'User'
          ELSE COALESCE(u.preferred_name, u.full_name, 'Student')
        END as display_name,
        CASE 
          WHEN u.is_anonymous = true THEN u.anonymous_avatar
          ELSE u.profile_pic
        END as display_avatar
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    
    res.json(comments.rows);
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create comment
router.post('/:id/comments', async (req, res) => {
  try {
    const { user_id, content } = req.body;
    
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Comment cannot be empty' });
    }
    
    const result = await pool.query(
      `INSERT INTO comments (post_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.params.id, user_id, content.trim()]
    );
    
    // Update comment count
    await pool.query(
      'UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1',
      [req.params.id]
    );
    
    // Fetch the created comment with user's anonymous status
    const comment = await pool.query(
      `SELECT 
        c.*, 
        u.full_name, 
        u.preferred_name, 
        u.profile_pic,
        u.is_anonymous,
        u.anonymous_avatar,
        CASE 
          WHEN u.is_anonymous = true THEN 'User'
          ELSE COALESCE(u.preferred_name, u.full_name, 'Student')
        END as display_name,
        CASE 
          WHEN u.is_anonymous = true THEN u.anonymous_avatar
          ELSE u.profile_pic
        END as display_avatar
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.id = $1`,
      [result.rows[0].id]
    );
    
    res.status(201).json(comment.rows[0]);
  } catch (err) {
    console.error('Create comment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;