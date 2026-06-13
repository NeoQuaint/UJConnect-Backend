const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// REGISTER
router.post('/register', async (req, res) => {
  try {
    const { full_name, preferred_name, student_number, email, department, course, password } = req.body;

    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR student_number = $2',
      [email, student_number]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email or student number already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const result = await pool.query(
      `INSERT INTO users (full_name, preferred_name, student_number, email, department, course, password, verification_token, verified, dark_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, 'true')
       RETURNING id, full_name, preferred_name, student_number, email, department, course, verified, dark_mode, created_at`,
      [full_name, preferred_name || null, student_number, email, department, course || null, hashedPassword, verificationToken]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    const verificationUrl = `${FRONTEND_URL}/verify?token=${verificationToken}&email=${email}`;
    
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Verify your UJ Connect account',
        html: `<div style="max-width:500px;margin:0 auto;font-family:Arial,sans-serif"><h2 style="color:#FF6B00">Welcome to UJ Connect!</h2><p>Hi ${preferred_name || full_name},</p><p>Please verify your email:</p><a href="${verificationUrl}" style="display:inline-block;padding:14px 32px;background:#FF6B00;color:white;text-decoration:none;border-radius:25px;font-weight:bold">Verify Email</a></div>`
      });
    } catch (emailErr) {
      console.error('Email send error:', emailErr);
    }

    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// LOGIN
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
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    const { password: _, verification_token: __, ...userWithoutSensitive } = user;
    res.json({ user: userWithoutSensitive, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// VERIFY EMAIL
router.get('/verify', async (req, res) => {
  try {
    const { token, email } = req.query;
    const result = await pool.query(
      'UPDATE users SET verified = TRUE, verification_token = NULL WHERE email = $1 AND verification_token = $2 RETURNING id',
      [email, token]
    );
    if (result.rows.length === 0) {
      return res.redirect(`${FRONTEND_URL}/verify?status=invalid`);
    }
    res.redirect(`${FRONTEND_URL}/verify?status=success`);
  } catch (err) {
    res.redirect(`${FRONTEND_URL}/verify?status=error`);
  }
});

// RESEND VERIFICATION
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = result.rows[0];
    if (user.verified) return res.status(400).json({ error: 'Already verified' });

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await pool.query('UPDATE users SET verification_token = $1 WHERE email = $2', [verificationToken, email]);

    const verificationUrl = `${FRONTEND_URL}/verify?token=${verificationToken}&email=${email}`;
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Verify your UJ Connect account',
      html: `<div style="max-width:500px;margin:0 auto;font-family:Arial,sans-serif"><h2 style="color:#FF6B00">Verify your email</h2><p>Click below:</p><a href="${verificationUrl}" style="display:inline-block;padding:14px 32px;background:#FF6B00;color:white;text-decoration:none;border-radius:25px;font-weight:bold">Verify Email</a></div>`
    });

    res.json({ message: 'Verification email resent' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resend' });
  }
});

module.exports = router;