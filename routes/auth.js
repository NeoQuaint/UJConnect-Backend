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
  service: 'gmail',
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

    // Check if user exists and is verified
    const existing = await pool.query(
      'SELECT id, verified FROM users WHERE email = $1 OR student_number = $2',
      [email, student_number]
    );

    if (existing.rows.length > 0) {
      const existingUser = existing.rows[0];
      if (existingUser.verified) {
        return res.status(400).json({ error: 'Email or student number already registered' });
      } else {
        // User exists but not verified - delete and recreate
        await pool.query('DELETE FROM users WHERE id = $1', [existingUser.id]);
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const result = await pool.query(
      `INSERT INTO users (full_name, preferred_name, student_number, email, department, course, password, verification_token, verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
       RETURNING id, full_name, preferred_name, student_number, email, department, course, bio, profile_pic, verified`,
      [full_name, preferred_name, student_number, email, department, course, hashedPassword, verificationToken]
    );

    const user = result.rows[0];

    // Generate token immediately so they can log in
    const authToken = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '30d' }
    );

    // Send response FIRST, then send email in background
    res.status(201).json({
      message: 'Account created. Check your email to verify.',
      user: user,
      token: authToken
    });

    // Send verification email AFTER response
    const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify?token=${verificationToken}`;

    try {
      const info = await transporter.sendMail({
        from: `"UJ Connect" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Verify your UJ Connect account',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h1 style="color: #FF6B00; font-size: 28px; margin: 0;">UJ Connect</h1>
            </div>
            <h2 style="color: #1a1a1a;">Welcome, ${preferred_name || full_name}!</h2>
            <p style="font-size: 15px; color: #444;">Your account has been created. Click below to verify your email and unlock all features:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationLink}" style="display: inline-block; padding: 14px 36px; background: #FF6B00; color: white; text-decoration: none; border-radius: 50px; font-weight: 700; font-size: 16px;">Verify My Account</a>
            </div>
            <p style="font-size: 13px; color: #888;">You can still use the app, but some features will be limited until you verify.</p>
            <p style="font-size: 12px; color: #aaa; margin-top: 30px;">If you didn't create this account, ignore this email.</p>
          </div>
        `
      });
      console.log('Verification email delivered:', info.messageId);
    } catch (emailErr) {
      console.error('Email send error:', emailErr.message);
    }
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

    // Check if token exists
    const checkResult = await pool.query(
      'SELECT id, verified FROM users WHERE verification_token = $1',
      [token]
    );

    if (checkResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid verification link. Please request a new one.' });
    }

    const userCheck = checkResult.rows[0];

    if (userCheck.verified) {
      // Already verified - return the user with a fresh auth token
      const userResult = await pool.query(
        'SELECT id, full_name, preferred_name, student_number, email, department, course, bio, profile_pic, verified FROM users WHERE id = $1',
        [userCheck.id]
      );
      const user = userResult.rows[0];
      const authToken = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET || 'dev-secret',
        { expiresIn: '30d' }
      );
      return res.json({ message: 'Email already verified!', user, token: authToken });
    }

    // Verify the user - don't delete the token so it can be clicked multiple times
    const result = await pool.query(
      'UPDATE users SET verified = TRUE WHERE verification_token = $1 AND verified = FALSE RETURNING id, full_name, preferred_name, student_number, email, department, course, bio, profile_pic, verified',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Verification failed. Please try again.' });
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

// POST /api/auth/resend-verification
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    const result = await pool.query(
      'SELECT id, email, preferred_name, full_name, verified FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No account found with this email' });
    }

    const user = result.rows[0];

    if (user.verified) {
      return res.json({ message: 'Account is already verified. You can log in now.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await pool.query('UPDATE users SET verification_token = $1 WHERE id = $2', [verificationToken, user.id]);

    // Send response first
    res.json({ message: 'Verification email resent. Check your inbox.' });

    // Send email after response
    const verificationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify?token=${verificationToken}`;

    try {
      const info = await transporter.sendMail({
        from: `"UJ Connect" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Verify your UJ Connect account',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #1a1a1a;">Verify your email</h2>
            <p>Click below to verify your UJ Connect account:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationLink}" style="display: inline-block; padding: 14px 36px; background: #FF6B00; color: white; text-decoration: none; border-radius: 50px; font-weight: 700;">Verify My Account</a>
            </div>
          </div>
        `
      });
      console.log('Resend verification delivered:', info.messageId);
    } catch (emailErr) {
      console.error('Resend email error:', emailErr.message);
    }
  } catch (err) {
    console.error('Resend error:', err);
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