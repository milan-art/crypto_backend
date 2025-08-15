const db = require('../../config/db');
const { ethers } = require("ethers");
const axios = require('axios');
bip39 = require('bip39');
const jwt = require('jsonwebtoken');

// Save the 12 words into DB
exports.addword = async (req, res) => {
    const {type, one, two, three, four, five, six, seven, eight, nine, ten, eleven, twelve } = req.body;
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.slice(7) : "";

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const id = decoded.userId;
    console.log(id);

    // Check if userId and type already exist
    const sql = `
        SELECT * FROM wallet
        WHERE user_id = ? AND type = ?
    `;

    db.query(sql, [id, type], (err, result) => {
        if (err) {
            console.error("❌ Database Error (Check):", err);
            return res.status(500).json({ msg: 'Database error during check', status_code: false });
        }

        if (result.length > 0) {
            return res.status(400).json({ msg: 'Wallet with same type already exists for this user', status_code: false });
        }

        // If no existing record is found, proceed with inserting new record
        const sql = `
            INSERT INTO wallet 
            (user_id, type, one, two, three, four, five, six, seven, eight, nine, ten, eleven, twelve) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(sql, [
            id, type, one, two, three, four, five, six, seven, eight, nine, ten, eleven, twelve
        ], (err, result) => {
            if (err) {
                console.error("❌ Database Error (Insert):", err);
                return res.status(500).json({ msg: 'Database error during insert', status_code: false });
            }
            res.status(200).json({ msg: 'Wallet words saved successfully', status_code: true });
        });
    });
};

// Get 12 words from DB and generate wallet
exports.generateWalletAddress = async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.slice(7) : "";

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user_id = decoded.userId;

    const sql = `
        SELECT id, user_id, type, one, two, three, four, five, six, seven, eight, nine, ten, eleven, twelve, created_at, updated_at
        FROM wallet
        WHERE user_id = ?
        ORDER BY id 
    `;

    db.query(sql, [user_id], (err, results) => {
        if (err) {
            console.error("❌ Database Error (Fetch):", err);
            return res.status(500).json({ msg: 'Database error during fetch', status_code: false });
        }

        if (results.length === 0) {
            return res.status(404).json({ msg: 'No wallet found for user', status_code: false });
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

        res.json({ status_code: true, wallets });
    });
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

    const [rows] = await db.promise().query(sql, [user_id]);
    console.log("rows", rows);

    if (!rows.length) {
      return res.status(404).json({ status_code: false, msg: 'No wallet found' });
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
      return res.status(400).json({ status_code: false, msg: 'No valid mnemonics found' });
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
    const { name } = req.params;

    try {
        // 1️⃣ Fetch coin from DB
        const sql = `SELECT * FROM cripto_list WHERE name = ? AND is_active = 1`;
        db.query(sql, [name], async (err, results) => {
            if (err) {
                console.error("❌ DB Error:", err);
                return res.status(500).json({ msg: 'Database error', status_code: false });
            }

            if (results.length === 0) {
                return res.status(404).json({ msg: 'Coin not found', status_code: false });
            }

            try {
                // 2️⃣ Get current price from CoinGecko
                const coinId = results[0].unique_id.toLowerCase(); // e.g. 'bitcoin', 'ethereum'
                const response = await axios.get(
                    `https://api.coingecko.com/api/v3/simple/price`,
                    {
                        params: {
                            ids: coinId,
                            vs_currencies: "usd",
                            include_24hr_change: true
                        }
                    }
                );

                const priceData = response.data[coinId] || {};
                const price = priceData.usd || null;
                const change24h = priceData.usd_24h_change || null;

                // 3️⃣ Return both DB info and price
                res.json({
                    msg: 'Success',
                    status_code: true,
                    data: {
                        ...results[0],
                        current_price_usd: price,
                        usd_24h_change: change24h
                    }
                });

            } catch (priceErr) {
                console.error("❌ CoinGecko Error:", priceErr);
                return res.status(500).json({ msg: 'Failed to fetch price', status_code: false });
            }
        });

    } catch (e) {
        console.error("❌ Server Error:", e);
        res.status(500).json({ msg: 'Internal server error', status_code: false });
    }
};



