const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const { sendEmail } = require('../emailSend/Nodemailer');
const e = require('express');

exports.register = async (req, res) => {
  try {
    const { username, name, email, password, phone, country_code } = req.body;

    // ✅ Basic validation
    if (!email) return res.status(201).json({ msg: 'Email is required.', status_code: false });
    if (!password) return res.status(201).json({ msg: 'Password is required', status_code: false });
    if (!name) return res.status(201).json({ msg: 'Name is required', status_code: false });
    if (!phone) return res.status(201).json({ msg: 'Phone number is required', status_code: false });
    if (!country_code) return res.status(201).json({ msg: 'Country code is required', status_code: false });
    if (!username) return res.status(201).json({ msg: 'Username is required', status_code: false });

    // 🔑 Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 🔍 Check for duplicates
    const checkSql = `
      SELECT id, username, email, phone, country_code 
      FROM users 
      WHERE username = ? OR email = ? OR (phone = ? AND country_code = ?)
    `;
    const [rows] = await db.query(checkSql, [username, email, phone, country_code]);

    if (rows.length > 0) {
      let duplicateField = '';
      if (rows.some(r => r.username === username)) duplicateField = 'username';
      else if (rows.some(r => r.email === email)) duplicateField = 'email';
      else if (rows.some(r => r.phone === phone && r.country_code === country_code)) {
        duplicateField = 'phone number with this country code';
      }

      return res.status(409).json({ // use 409 Conflict
        msg: `${duplicateField} already exists`,
        status_code: false
      });
    }

    // 🚀 Insert new user
    const insertSql = `
      INSERT INTO users (username, name, email, password, phone, country_code)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const [result] = await db.query(insertSql, [
      username,
      name,
      email,
      hashedPassword,
      phone,
      country_code
    ]);

    const userId = result.insertId;

    // 🔑 Generate JWT
    const token = jwt.sign(
      { id: userId, email, username, name, phone, country_code },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 📧 Send verification email
    const verifylink = `http://localhost:1000/verifyEmail?token=${token}`;
    await sendEmail({
      to: email,
      subject: 'Welcome to Our Platform!',
      html: `
        <h2>Verify Your Email</h2>
        <p>Click the button below to verify your email address.</p>
        <a href="${verifylink}" style="padding:10px 20px; background:#007bff; color:white; text-decoration:none; border-radius:5px;">Verify Email</a>
      `
    });

    // ✅ Success response
    res.status(201).json({
      msg: 'User registered successfully',
      status_code: true,
      token,
      user: {
        id: userId,
        username,
        name,
        email,
        phone,
        country_code,
      },
    });

  } catch (err) {
    console.error("❌ Registration Error:", err);
    res.status(500).json({ msg: 'Registration failed', status_code: false });
  }
};



exports.getuser = async (req, res) => {
  try{

    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.slice(7) : "";
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const id = decoded.userId;
    
    const sql = `SELECT * FROM users WHERE id = ?`;
    const [rows] = await db.query(sql, [id]);

    if (rows.length === 0) {
      return res.status(201).json({ msg: 'User not found', status_code: false });
    }

  res.status(200).json({ user, status_code: true });
  } catch (err) {
    console.error("❌ getuser Error:", err.message);
    res.status(500).json({ msg: 'Database error', status_code: false });
  }
}

exports.verifyEmail = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.slice(7) : "";

    if (!token) {
      return res.status(401).json({ msg: 'Token is required', status_code: false });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.error("❌ JWT Error:", err.message);
      return res.status(401).json({ msg: 'Invalid or expired token', status_code: false });
    }

    const id = decoded.id;

    // Step 1: Check if user exists
    const [rows] = await db.query(`SELECT * FROM users WHERE id = ?`, [id]);
    if (rows.length === 0) {
      return res.status(201).json({ msg: 'User not found', status_code: false });
    }

    const user = rows[0];

    // Step 2: Update verification flags
    const [updateResult] = await db.query(
      `UPDATE users SET is_email_verified = true, is_phone_verified = true, updated_at = NOW() WHERE id = ?`,
      [id]
    );

    if (updateResult.affectedRows === 0) {
      return res.status(201).json({ msg: 'User not found or already verified', status_code: false });
    }

    // Step 3: Generate a fresh token with user data
    const newToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        phone: user.phone,
        country_code: user.country_code
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      msg: 'Email verified successfully',
      status_code: true,
      token: newToken,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        phone: user.phone,
        country_code: user.country_code
      }
    });

  } catch (err) {
    console.error("❌ verifyEmail Error:", err.message);
    return res.status(500).json({ msg: 'Internal server error', status_code: false });
  }
};


exports.setNewPasscode = async (req, res) => {
  try {
    const { passcode } = req.body;
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.slice(7) : "";

    // Validate token and input
    if (!token) {
      return res.status(401).json({ msg: 'Token is required', status_code: false });
    }
    if (!passcode) {
      return res.status(201).json({ msg: 'Passcode is required', status_code: false });
    }
    if (!/^\d{6}$/.test(passcode)) {
      return res.status(201).json({ msg: 'Passcode must be 6 digits', status_code: false });
    }

    // Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ msg: 'Invalid or expired token', status_code: false });
    }

    const id = decoded.id;

    // Step 1: Check if user exists
    const [rows] = await db.query(`SELECT * FROM users WHERE id = ?`, [id]);
    if (rows.length === 0) {
      return res.status(201).json({ msg: 'User not found', status_code: false });
    }

    // Step 2: Hash the passcode
    const hashedPasscode = await bcrypt.hash(passcode, 10);

    // Step 3: Update passcode (only for active users)
    const [updateResult] = await db.query(
      `UPDATE users SET passcode = ?, updated_at = NOW() WHERE id = ? AND isActive = true`,
      [hashedPasscode, id]
    );

    if (updateResult.affectedRows === 0) {
      return res.status(201).json({ msg: 'User not found or inactive', status_code: false });
    }

    res.status(200).json({ msg: 'Passcode set successfully', status_code: true });

  } catch (err) {
    console.error("❌ setNewPasscode Error:", err.message);
    res.status(500).json({ msg: 'Internal server error', status_code: false });
  }
};



exports.loginWithPasscode = async (req, res) => {
  try {
    const { email, passcode } = req.body;

    // Validate input
    if (!email || !passcode) {
      return res.status(201).json({ msg: 'Email and passcode are required', status_code: false });
    }

    // Step 1: Find active user by email
    const [rows] = await db.query(`SELECT * FROM users WHERE email = ? AND isActive = true`, [email]);

    if (rows.length === 0) {
      return res.status(201).json({ msg: 'User not found or inactive', status_code: false });
    }

    const user = rows[0];

    // Step 2: Compare passcode
    const passcodeMatch = await bcrypt.compare(passcode, user.passcode);
    if (!passcodeMatch) {
      return res.status(401).json({ msg: 'Invalid passcode', status_code: false });
    }

    // Step 3: Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Step 4: Return response
    res.status(200).json({
      msg: 'Login successful',
      status_code: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        phone: user.phone,
        country_code: user.country_code,
        is_email_verified: user.is_email_verified,
        is_phone_verified: user.is_phone_verified
      },
    });

  } catch (err) {
    console.error("❌ loginWithPasscode Error:", err.message);
    res.status(500).json({ msg: 'Internal server error', status_code: false });
  }
};


exports.loginWithPassword = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(201).json({ msg: 'Email and password are required', status_code: false });
    }

    // Step 1: Find active user by email
    const [rows] = await db.query(`SELECT * FROM users WHERE email = ? AND isActive = true`, [email]);

    if (rows.length === 0) {
      return res.status(201).json({ msg: 'User not found or inactive', status_code: false });
    }

    const user = rows[0];

    // Step 2: Compare password
    const passwordMatch = await bcrypt.compare(password, user.password || '');
    if (!passwordMatch) {
      return res.status(401).json({ msg: 'Invalid password', status_code: false });
    }

    // Step 3: Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Step 4: Return user info
    res.status(200).json({
      msg: 'Login successful',
      status_code: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        phone: user.phone,
        country_code: user.country_code,
        is_email_verified: user.is_email_verified,
        is_phone_verified: user.is_phone_verified
      },
    });

  } catch (err) {
    console.error("❌ loginWithPassword Error:", err.message);
    res.status(500).json({ msg: 'Internal server error', status_code: false });
  }
};



exports.forgetPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(201).json({ msg: 'Email is required', status_code: false });
    }

    // Step 1: Check if user exists and is active
    const [rows] = await db.query(
      `SELECT * FROM users WHERE email = ? AND isActive = true`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(201).json({ msg: 'No active user with this email', status_code: false });
    }

    const user = rows[0];

    // Step 2: Generate reset token (valid for 15 minutes)
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Step 3: Create reset link
    const resetLink = `${process.env.FRONTEND_URL}/change-password?token=${token}`;

    console.log("🔗 Reset Link:", resetLink);

    // Step 4: Send reset email
    await sendEmail({
      to: email,
      subject: 'Reset Your Password',
      html: `
        <h3>Reset Your Password</h3>
        <p>Click the link below to reset your password:</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>This link is valid for 15 minutes.</p>
      `
    });

    return res.status(200).json({ msg: 'Email sent successfully', status_code: true });

  } catch (err) {
    console.error("❌ ForgetPassword Error:", err.message);
    return res.status(500).json({ msg: 'Internal server error', status_code: false });
  }
};


exports.setNewPassword = async (req, res) => {
  const { password } = req.body;
  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.slice(7) : "";

  if (!password) {
    return res.status(201).json({ msg: 'Password is required', status_code: false });
  } else if (!token) {
    return res.status(201).json({ msg: 'Token is required', status_code: false });
  }

  try {
    // 1. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id; // ✅ Use "id" instead of "userId"

    // 2. Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Ensure user exists & update password
    const sql = `UPDATE users SET password = ? WHERE id = ? AND isActive = true`;

    db.query(sql, [hashedPassword, userId], (err, result) => {
      if (err) {
        console.error('❌ DB error:', err);
        return res.status(500).json({ msg: 'Internal error', status_code: false });
      }

      if (result.affectedRows === 0) {
        return res.status(201).json({ msg: 'User not found or inactive', status_code: false });
      }

      return res.json({ msg: 'Password reset successfully', status_code: true });
    });
  } catch (err) {
    console.error('❌ Token error:', err);
    return res.status(401).json({ msg: 'Invalid or expired token', status_code: false });
  }
};


