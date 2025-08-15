const express = require('express');
const router = express.Router();
const authController = require('../../src/authApi/authController');
const passport = require('../../src/authApi/googleStrategy'); // Add this
const jwt = require('jsonwebtoken');

router.post('/register', authController.register);
router.post('/verify_email', authController.verifyEmail);
router.post('/set_new_passcode', authController.setNewPasscode);
router.post('/login_with_passcode', authController.loginWithPasscode);
router.post('/login_with_password', authController.loginWithPassword );
router.post('/forget_password', authController.forgetPassword);
router.post('/set_new_password', authController.setNewPassword);
router.get('/get_users', authController.getuser);

// ------google auth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Google OAuth - Callback after Google login
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  (req, res) => {
    const user = req.user;

    const token = jwt.sign({
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
    }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.redirect(`http://localhost:3000/home?token=${token}`);
  }
);

module.exports = router;
