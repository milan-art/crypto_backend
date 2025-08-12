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

      if (results.length > 0) {
        // Existing user
        const user = results[0];
        console.log("exitingUser:",user);
        return done(null, user);
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

        const insertSql = `INSERT INTO users (username, name, email, is_email_verified, is_phone_verified, isActive) VALUES (?, ?, ?,1,1,1)`;

        db.query(insertSql, [newUser.username, newUser.name, newUser.email], (err, result) => {
          console.log("newUser:",result);
          if (err) return done(err);
          newUser.id = result.insertId;
          return done(null, newUser);
        });
      }
    });
  } catch (error) {
    done(error);
  }
}));

module.exports = passport;
