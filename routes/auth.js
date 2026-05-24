const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const transporter = nodemailer.createTransport({
  host: 'smtp-mail.outlook.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { full_name, preferred_name, student_number, email, department, course, password } = req.body;

    // Validate UJ email
    if (!email || !email.endsWith('@student.uj.ac.za')) {
      return res.status(400).json({ error: 'Must use your @student.uj.ac.za email' });
    }

    // Check if user exists
    const existing = await pool.query(
      'SELECT id, verified FROM users WHERE email = $1 OR student_number = $2',
      [email, student_number]
    );

    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      if (user.verified) {
        return res.status(400).json({ error: 'Email or student number already registered' });
      } else {
        // User exists but not verified - delete and recreate
        await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const result = await pool.query(
      `INSERT INTO users (full_name, preferred_name, student_number, email, department, course, password, verification_token, verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
       RETURNING id, full_name, preferred_name, student_number, email, department, course`,
      [full_name, preferred_name, student_number, email, department, course, hashedPassword, verificationToken]
    );

    const user = result.rows[0];

    // Send verification email
    const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify?token=${verificationToken}`;

    try {
      await transporter.sendMail({
        from: `"UJ Connect" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Verify your UJ Connect account',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #FF6B00;">Welcome to UJ Connect!</h2>
            <p>Hi ${preferred_name || full_name},</p>
            <p>Click the button below to verify your account and get started:</p>
            <a href="${verificationLink}" style="display: inline-block; padding: 14px 30px; background: #FF6B00; color: white; text-decoration: none; border-radius: 50px; font-weight: 600; margin: 20px 0;">Verify My Account</a>
            <p style="color: #888; font-size: 12px;">If you didn't create this account, ignore this email.</p>
          </div>
        `
      });
      console.log('Verification email sent to:', email);
    } catch (emailErr) {
      console.error('Email send error:', emailErr);
    }

    res.status(201).json({
      message: 'Account created. Please check your email to verify.',
      user: { id: user.id, email: user.email }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/verify?token=xxx
router.get('/verify', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'No verification token provided' });
    }

    const result = await pool.query(
      'UPDATE users SET verified = TRUE, verification_token = NULL WHERE verification_token = $1 AND verified = FALSE RETURNING id, full_name, preferred_name, student_number, email, department, course, bio, profile_pic',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired verification link' });
    }

    const user = result.rows[0];
    const authToken = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '30d' }
    );

    res.json({ message: 'Email verified!', user, token: authToken });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    if (!user.verified) {
      return res.status(401).json({ error: 'Please verify your email first. Check your inbox.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '30d' }
    );

    const { password: _, verification_token: __, ...userWithoutPassword } = user;

    res.json({ user: userWithoutPassword, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;