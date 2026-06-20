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

// Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, preferred_name, student_number, email, department, course, bio, skills, year, 
       cover_photo, profile_pic, anonymous_avatar, is_anonymous,
       cover_position_x, cover_position_y, cover_zoom, 
       profile_position_x, profile_position_y, profile_zoom, 
       dark_mode, birthday, graduation_date, custom_date, custom_date_label,
       tiktok, instagram, facebook, youtube, linkedin, 
       verified, created_at 
       FROM users WHERE id = $1`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    // Check if the request is from the profile owner
    const requestingUser = getUserFromToken(req);
    const isOwner = requestingUser && requestingUser.id === parseInt(req.params.id);
    
    // If user is anonymous and request is NOT from the owner, return limited data
    if (user.is_anonymous && !isOwner) {
      return res.json({
        id: user.id,
        full_name: 'User',
        preferred_name: 'User',
        student_number: null,
        email: null,
        department: null,
        course: null,
        bio: null,
        skills: [],
        year: null,
        cover_photo: user.cover_photo,
        profile_pic: null,
        anonymous_avatar: user.anonymous_avatar,
        is_anonymous: true,
        cover_position_x: user.cover_position_x,
        cover_position_y: user.cover_position_y,
        cover_zoom: user.cover_zoom,
        profile_position_x: '50',
        profile_position_y: '50',
        profile_zoom: '1',
        dark_mode: user.dark_mode,
        birthday: null,
        graduation_date: null,
        custom_date: null,
        custom_date_label: null,
        tiktok: null,
        instagram: null,
        facebook: null,
        youtube: null,
        linkedin: null,
        verified: user.verified,
        created_at: user.created_at
      });
    }
    
    // Return full data for owner or non-anonymous users
    res.json(user);
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update profile
router.put('/:id', async (req, res) => {
  try {
    const { 
      full_name, preferred_name, department, course, bio, skills, year, 
      cover_photo, profile_pic, anonymous_avatar, is_anonymous,
      cover_position_x, cover_position_y, cover_zoom, 
      profile_position_x, profile_position_y, profile_zoom, 
      dark_mode, birthday, graduation_date, custom_date, custom_date_label,
      tiktok, instagram, facebook, youtube, linkedin 
    } = req.body;
    
    const result = await pool.query(
      `UPDATE users 
       SET full_name = $1, preferred_name = $2, department = $3, course = $4, 
           bio = $5, skills = $6, year = $7, 
           cover_photo = $8, profile_pic = $9, anonymous_avatar = $10,
           is_anonymous = $11,
           cover_position_x = $12, cover_position_y = $13, cover_zoom = $14, 
           profile_position_x = $15, profile_position_y = $16, profile_zoom = $17, 
           dark_mode = $18, 
           birthday = $19, graduation_date = $20, custom_date = $21, custom_date_label = $22,
           tiktok = $23, instagram = $24, facebook = $25, youtube = $26, linkedin = $27, 
           updated_at = NOW()
       WHERE id = $28
       RETURNING id, full_name, preferred_name, student_number, email, department, course, bio, skills, year, 
       cover_photo, profile_pic, anonymous_avatar, is_anonymous,
       cover_position_x, cover_position_y, cover_zoom, 
       profile_position_x, profile_position_y, profile_zoom, 
       dark_mode, birthday, graduation_date, custom_date, custom_date_label,
       tiktok, instagram, facebook, youtube, linkedin, verified, created_at, updated_at`,
      [full_name, preferred_name, department, course, bio, skills || [], year, 
       cover_photo, profile_pic, anonymous_avatar, is_anonymous || false,
       cover_position_x, cover_position_y, cover_zoom, 
       profile_position_x, profile_position_y, profile_zoom, 
       dark_mode, birthday, graduation_date, custom_date, custom_date_label,
       tiktok, instagram, facebook, youtube, linkedin, 
       req.params.id]
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

// Dark mode toggle
router.put('/:id/dark-mode', async (req, res) => {
  try {
    const { dark_mode } = req.body;
    await pool.query('UPDATE users SET dark_mode = $1 WHERE id = $2', [dark_mode, req.params.id]);
    res.json({ success: true });
  } catch (err) {
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
      `SELECT id, full_name, preferred_name, department, course, year, profile_pic, is_anonymous, anonymous_avatar
       FROM users 
       WHERE (full_name ILIKE $1 OR preferred_name ILIKE $1 OR department ILIKE $1)
       AND verified = true
       LIMIT 20`,
      [`%${q}%`]
    );
    
    // Hide anonymous users from search results (or show as "User")
    const users = result.rows.map(user => {
      if (user.is_anonymous) {
        return {
          id: user.id,
          full_name: 'User',
          preferred_name: 'User',
          department: null,
          course: null,
          year: null,
          profile_pic: null,
          is_anonymous: true,
          anonymous_avatar: user.anonymous_avatar
        };
      }
      return user;
    });
    
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get celebrations (birthdays, graduations, custom dates)
router.get('/celebrations/list', async (req, res) => {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    const result = await pool.query(
      `SELECT id, full_name, preferred_name, profile_pic, anonymous_avatar, is_anonymous,
              birthday, graduation_date, custom_date, custom_date_label,
              CASE 
                WHEN birthday::date = $1::date THEN 'birthday'
                WHEN graduation_date::date = $1::date THEN 'graduation'
                WHEN custom_date::date = $1::date THEN 'custom'
                ELSE NULL
              END as celebration_type
       FROM users 
       WHERE (birthday::date = $1::date OR graduation_date::date = $1::date OR custom_date::date = $1::date)
       AND verified = true`,
      [todayStr]
    );
    
    // Hide anonymous users from celebrations
    const users = result.rows.map(user => {
      if (user.is_anonymous) {
        return {
          ...user,
          full_name: 'User',
          preferred_name: 'User',
          profile_pic: null
        };
      }
      return user;
    });
    
    res.json(users);
  } catch (err) {
    console.error('Get celebrations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;