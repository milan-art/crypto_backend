require('dotenv').config();
const express = require('express');
const app = express();
const authRoutes = require('./src/authApi/authRoutes');
const walletRoutes = require('./src/walletApi/walletRoute');
const historyRoutes = require('./src/historyApi/historyRoutes');
const cryptoPriceRoutes = require('./src/cryptoApi/cryptoPriceRoutes');
const path = require('path');
const cors = require('cors');
const passport = require('./src/authApi/googleStrategy');
const session = require('express-session');

// ----------------- CORS Config
const allowedOrigins = [
  'http://localhost:3000',              // local dev
  'https://your-frontend.vercel.app'    // replace with your Vercel frontend domain
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// ----------------- Middlewares
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// ----------------- Routes
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/crypto', cryptoPriceRoutes);

// ----------------- Static file serving
app.use('/icon', express.static(path.join(__dirname, 'src', 'uploadimage', 'icon')));

// ----------------- Start server (listen on all interfaces)
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at:`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://<your-LAN-IP>:${PORT}`);
});
