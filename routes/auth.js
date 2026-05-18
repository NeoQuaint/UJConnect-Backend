const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

router.post('/register', async (req, res) => {
  try {
    const { full_name, preferred_name, student_number, email, department, course, password } = req.body;

    if (!email || !email.endsWith('@student.uj.ac.za')) {
      return res.status(400).json({ error: 'Must use your @student.uj.ac.za email' });
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR student_number = $2',
      [email, student_number]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email or student number already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (full_name, preferred_name, student_number, email, department, course, password)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, full_name, preferred_name, student_number, email, department, course, bio, profile_pic, created_at`,
      [full_name, preferred_name, student_number, email, department, course, hashedPassword]
    );

    const user = result.rows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '30d' }
    );

    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '30d' }
    );

    const { password: _, ...userWithoutPassword } = user;

    res.json({ user: userWithoutPassword, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;