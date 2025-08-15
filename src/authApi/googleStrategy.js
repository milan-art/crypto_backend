const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const db = require('../../config/db');

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "http://localhost:1000/api/auth/google/callback"
},
async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails[0].value;

    const sql = `SELECT * FROM users WHERE email = ?`;
    db.query(sql, [email], async (err, results) => {
      if (err) return done(err);

      let user;

      if (results.length > 0) {
        // Existing user
        user = results[0];
        console.log("existingUser:", user);
      } else {
        // New user, insert
        const newUser = {
          username: profile.displayName.replace(/\s/g, '').toLowerCase(),
          name: profile.displayName,
          email: email,
          is_email_verified: 1,
          is_phone_verified: 1,
          isActive: 1,
        };

        const insertSql = `
          INSERT INTO users (username, name, email, is_email_verified, is_phone_verified, isActive) 
          VALUES (?, ?, ?, 1, 1, 1)
        `;

        const insertResult = await new Promise((resolve, reject) => {
          db.query(insertSql, [newUser.username, newUser.name, newUser.email], (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });

        newUser.id = insertResult.insertId;
        user = newUser;
      }

      // Generate JWT token (same as passcode login)
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Pass token along with user object
      user.token = token;

      return done(null, user);
    });
  } catch (error) {
    done(error);
  }
}));

module.exports = passport;
