const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const { sendEmail } = require('../emailSend/Nodemailer');
const e = require('express');

exports.register = (req, res) => {
  const { username, name, email, password, phone, country_code } = req.body;

  if (!email) {
    return res.status(400).json({ msg: 'Email are required.' , status_code: false});
  }else if (!password) {
    return res.status(400).json({ msg: 'Password is required' , status_code: false});
  }else if (!name) {
    return res.status(400).json({ msg: 'Name is required' , status_code: false});
  }else if (!phone) {
    return res.status(400).json({ msg: 'Phone number is required' , status_code: false});
  }else if (!country_code) {
    return res.status(400).json({ msg: 'Country code is required' , status_code: false});
  }else if (!username) {
    return res.status(400).json({ msg: 'Username is required' , status_code: false});
  }
  

  const hashedPassword = bcrypt.hashSync(password, 10);

  const sql = `INSERT INTO users (username, name, email, password, phone, country_code) VALUES (?, ?, ?, ?, ?, ?)`;
  db.query(sql, [username, name, email, hashedPassword, phone, country_code], async (err, result) => {
    if (err) {
      console.error('Registration error:', err);
      return res.status(500).json({ msg: 'Registration failed', status_code: false });
    }

    
    const userId = result.insertId; // newly inserted user ID
    const token = jwt.sign(
      { id: userId, email: email, username: username, name: name, phone: phone, country_code: country_code },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    const verifylink = `http://localhost:1000/verifyEmail?token=${token}`

    await sendEmail({
      to: email,
      subject: 'Welcome to Our Platform!',
      html: `
       <h2>Verify Your Email</h2>
    <p>Click the button below to verify your email address.</p>
    <button href="${verifylink}">Verify Email</button>
    <div class="message" id="msg"></div>
         `
    });

    res.status(201).json({
      msg: 'User registered successfully',
      status: true,
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
  });
};

exports.verifyEmail = (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.slice(7) : "";

  if (!token) return res.status(400).json({ msg: 'Token is required' , status_code: false});

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const id = decoded.id;

    const sql2 = `SELECT * FROM users WHERE id = ?`;
    db.query(sql2, [id], (err, result) => {
      if (err) return res.status(500).json({ msg: 'Database error',status_code: false});
      if (result.length === 0) return res.status(404).json({ msg: 'User not found' , status_code: false});

      const user = result[0];
      // Move the update query inside this callback
      const sql = `UPDATE users SET is_email_verified = true,is_phone_verified = true WHERE id = ?`;
      db.query(sql, [id], (err, updateResult) => {
        if (err) return res.status(500).json({ msg: 'Database error', status_code: false});

        if (updateResult.affectedRows === 0) {
          return res.status(404).json({ msg: 'User not found or already verified', status_code: false});
        }

        const newToken = jwt.sign({
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
          phone: user.phone,
          country_code: user.country_code
        }, process.env.JWT_SECRET, { expiresIn: '24h' });

        return res.status(200).json({
          msg: 'Email verified successfully',
          status: true,
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
      });
    });
  } catch (err) {
    console.error('JWT Error:', err);
    return res.status(400).json({ msg: 'Invalid or expired token' ,status_code: false});
  }
};

exports.setNewPasscode = (req, res) => {
  const { passcode } = req.body;
  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.slice(7) : "";

  if (!token) {
    return res.status(400).json({ msg: 'Email and passcode are required', status_code: false});
  }else if (!passcode) {
    return res.status(400).json({ msg: 'Passcode is required', status_code: false});
  }
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const id = decoded.id;

  const sql2 = `SELECT * FROM users WHERE id = ?`;
  db.query(sql2, [id], (err, result) => {
    if (err) return res.status(500).json({ msg: 'Database error', status_code: false});
    if (result.length === 0) return res.status(404).json({ msg: 'User not found', status_code: false });


    // Optionally enforce 6 digit numeric passcodes
    if (!/^\d{6}$/.test(passcode)) {
      return res.status(400).json({ msg: 'Passcode must be 6 digits', status_code: false });
    }

    const hashedPasscode = bcrypt.hashSync(passcode, 10);

    const sql = `UPDATE users SET passcode = ? WHERE id = ? AND isActive = true`;

    db.query(sql, [hashedPasscode, id], (err, result) => {
      if (err) {
        console.error('Set passcode error:', err);
        return res.status(500).json({ msg: 'Failed to update passcode', status_code: false });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ msg: 'User not found or inactive', status_code: false });
      }

      res.json({ msg: 'Passcode set successfully', status_code: true });
    });
  });
};


exports.loginWithPasscode = (req, res) => {
  const { email, passcode } = req.body;

  if (!email) {
    return res.status(400).json({ msg: 'Email and passcode are required', status_code: false });
  }else if (!passcode) {
    return res.status(400).json({ msg: 'Passcode is required', status_code: false });
  }

  const sql = `SELECT * FROM users WHERE email = ? AND isActive = true`;  

  db.query(sql, [email], async (err, results) => {
    if (err) {
      console.error('Login error:', err);
      return res.status(500).json({ msg: 'Database error', status_code: false });
    }

    if (results.length === 0) {
      return res.status(404).json({ msg: 'User not found or inactive', status_code: false });
    }

    const user = results[0];

    const passcodeMatch = await bcrypt.compare(passcode, user.passcode);
    if (!passcodeMatch) {
      return res.status(401).json({ msg: 'Invalid passcode', status_code: false });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      msg: 'Login successful',
      status_code: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        phone: user.phone,
        is_email_verified: user.is_email_verified,
        is_phone_verifid: user.is_phone_verifid,
      },
    });
  });
};

exports.loginWithPassword = (req, res) => {
  const { email, password } = req.body;

  if (!email) {
    return res.status(400).json({ msg: 'Email and password are required', status_code: false });
  }else if (!password) {
    return res.status(400).json({ msg: 'Password is required', status_code: false });
  }

  const sql = `SELECT * FROM users WHERE email = ? AND isActive = true`;

  db.query(sql, [email], async (err, results) => {
    if (err) {
      console.error('Login error:', err);
      return res.status(500).json({ msg: 'Database error', status_code: false});
    }

    if (results.length === 0) {
      return res.status(404).json({ msg: 'User not found or inactive', status_code: false });
    }

    const user = results[0];

    const passwordMatch = await bcrypt.compare(password, user.password || '');
    if (!passwordMatch) {
      return res.status(401).json({ msg: 'Invalid password', status_code: false });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      msg: 'Login successful',
      status_code: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        phone: user.phone,
        is_email_verified: user.is_email_verified,
        is_phone_verifid: user.is_phone_verifid,
      },
    });
  });
};


exports.forgetPassword = (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ msg: 'Email is required', status_code: false });

  const sql = `SELECT * FROM users WHERE email = ? AND isActive = true`;

  db.query(sql, [email], async (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ msg: 'Internal error', status_code: false });
    }

    if (results.length === 0) {
      return res.status(404).json({ msg: 'No active user with this email', status_code: false });
    }

    const user = results[0];

    // Generate reset token (valid for 15 minutes)
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const resetLink = `http://localhost:3000/change-password?token=${token}`;

    console.log(resetLink);

    await sendEmail({
      to: email,
      subject: 'Reset Your Password',
      html: `<h3>Reset Your Password</h3>
              <p>Click the link below to reset your password:</p>
              <a href="${resetLink}">${resetLink}</a>
              <p>This link is valid for 15 minutes.</p>`
    });
  });
  res.json({ msg: 'Email sent successfully', status_code: true });
};

exports.setNewPassword = async (req, res) => {
  const { password } = req.body;
  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.slice(7) : "";

  if (!password) {
    return res.status(400).json({ msg: 'Password and token are required', status_code: false });
  }else if (!token) {
    return res.status(400).json({ msg: 'Token is required', status_code: false });
  }

  try {
    // 1. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    // 2. Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Update password in DB
    const sql = `UPDATE users SET password = ? WHERE id = ?`;

    db.query(sql, [hashedPassword, userId], (err, result) => {
      if (err) {
        console.error('DB error:', err);
        return res.status(500).json({ msg: 'Internal error', status_code: false });
      }

      res.json({ msg: 'Password reset successfully', status_code: true });
    });
  } catch (err) {
    console.error('Token error:', err);
    return res.status(401).json({ msg: 'Invalid or expired token', status_code: false });
  }
};

