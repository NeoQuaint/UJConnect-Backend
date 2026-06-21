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
        COALESCE(p.is_anonymous, false) as is_anonymous,
        COALESCE(p.anonymous_avatar, '/ORANGE.png') as anonymous_avatar,
        CASE 
          WHEN COALESCE(p.is_anonymous, false) = true THEN 'User'
          ELSE COALESCE(u.preferred_name, u.full_name, 'Student')
        END as display_name,
        CASE 
          WHEN COALESCE(p.is_anonymous, false) = true THEN COALESCE(p.anonymous_avatar, '/ORANGE.png')
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
    console.error('Get posts error:', err.message);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Create post
router.post('/', async (req, res) => {
  try {
    const { content, media_url, media_urls, media_type, user_id, post_type, post_scope, is_anonymous, anonymous_avatar } = req.body;
    
    const hasContent = content && content.trim() !== '';
    const hasMedia = (media_url && media_url.trim() !== '') || (media_urls && media_urls.trim() !== '');
    
    if (!hasContent && !hasMedia) {
      return res.status(400).json({ error: 'Post must have content or media' });
    }
    
    // Get user's anonymous status at the time of posting
    const userResult = await pool.query('SELECT is_anonymous, anonymous_avatar FROM users WHERE id = $1', [user_id]);
    const userData = userResult.rows[0] || {};
    
    // Use the anonymous state from the request (captured at posting time) or fall back to DB
    const postIsAnonymous = is_anonymous !== undefined ? is_anonymous : (userData.is_anonymous || false);
    const postAnonymousAvatar = anonymous_avatar || userData.anonymous_avatar || '/ORANGE.png';
    
    // Use media_urls if provided, otherwise fall back to single media_url
    const finalMediaUrls = media_urls || (media_url ? JSON.stringify([{ url: media_url, type: media_type || 'image' }]) : null);
    const finalMediaType = media_urls ? 'mixed' : (media_type || null);
    const finalMediaUrl = media_urls ? null : (media_url || null); // Keep legacy field for backward compatibility
    
    const result = await pool.query(
      `INSERT INTO posts (user_id, content, media_url, media_urls, media_type, post_type, post_scope, is_anonymous, anonymous_avatar)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [user_id, content || '', finalMediaUrl, finalMediaUrls, finalMediaType, post_type || 'post', post_scope || 'feed', 
       postIsAnonymous, postAnonymousAvatar]
    );
    
    const post = await pool.query(
      `SELECT 
        p.*, 
        u.full_name, 
        u.preferred_name, 
        u.department, 
        u.profile_pic,
        COALESCE(p.is_anonymous, false) as is_anonymous,
        COALESCE(p.anonymous_avatar, '/ORANGE.png') as anonymous_avatar,
        CASE 
          WHEN COALESCE(p.is_anonymous, false) = true THEN 'User'
          ELSE COALESCE(u.preferred_name, u.full_name, 'Student')
        END as display_name,
        CASE 
          WHEN COALESCE(p.is_anonymous, false) = true THEN COALESCE(p.anonymous_avatar, '/ORANGE.png')
          ELSE u.profile_pic
        END as display_avatar
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [result.rows[0].id]
    );
    
    res.status(201).json(post.rows[0]);
  } catch (err) {
    console.error('Create post error:', err.message);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Delete post
router.delete('/:id', async (req, res) => {
  try {
    const user = getUserFromToken(req);
    
    const post = await pool.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
    if (post.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const postData = post.rows[0];
    const isBroken = (!postData.content || postData.content.trim() === '' || postData.content === '0') && (!postData.media_url || postData.media_url.trim() === '');
    
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
    console.error('Delete post error:', err.message);
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
    console.error('Like error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Comments
router.get('/:id/comments', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.full_name, u.preferred_name, u.profile_pic,
              COALESCE(c.is_anonymous, false) as is_anonymous,
              CASE 
                WHEN COALESCE(c.is_anonymous, false) = true THEN 'User'
                ELSE COALESCE(u.preferred_name, u.full_name, 'Student')
              END as display_name,
              CASE 
                WHEN COALESCE(c.is_anonymous, false) = true THEN '/ORANGE.png'
                ELSE u.profile_pic
              END as display_avatar
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get comments error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/comments', async (req, res) => {
  try {
    const { user_id, content } = req.body;
    const result = await pool.query(
      'INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING *',
      [req.params.id, user_id, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create comment error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
