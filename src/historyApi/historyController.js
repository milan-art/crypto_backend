const db = require('../../config/db');
const { Wallet } = require("ethers");
const axios = require('axios');
const jwt = require('jsonwebtoken');


// Save the 12 words into DB
exports.addword = async (req, res) => {
    const {type, one, two, three, four, five, six, seven, eight, nine, ten, eleven, twelve } = req.body;
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.slice(7) : "";

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const id = decoded.userId;
      console.log(id);

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
};

// Get 12 words from DB and generate wallet
exports.generateWalletAddress = async (req, res) => {
    const { user_id } = req.params;

    const sql = `
        SELECT one, two, three, four, five, six, seven, eight, nine, ten, eleven, twelve
        FROM wallet_history
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 1
    `;

    db.query(sql, [user_id], (err, results) => {
        if (err) {
            console.error("❌ Database Error (Fetch):", err);
            return res.status(500).json({ msg: 'Database error during fetch', status_code: false });
        }

        if (results.length === 0) {
            return res.status(404).json({ msg: 'No wallet found for user', status_code: false });
        }

        // Combine words into a mnemonic
        const row = results[0];
        const mnemonic = [
            row.one, row.two, row.three, row.four, row.five, row.six,
            row.seven, row.eight, row.nine, row.ten, row.eleven, row.twelve
        ].join(" ");
    });
};


exports.walletHistory = async (req, res) => {
    const { user_id } = req.params;
    const covalentApiKey = process.env.COVALENT_API_KEY;  // Store your API key in env variable

    if (!covalentApiKey) {
        return res.status(500).json({ msg: 'Missing Covalent API key', status_code: false });
    }

    const sql = `
        SELECT one, two, three, four, five, six,
               seven, eight, nine, ten, eleven, twelve
        FROM wallet_history
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 1
    `;

    db.query(sql, [user_id], async (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ msg: "Database error", status_code: false });
        }
        if (results.length === 0) {
            return res.status(404).json({ msg: "No wallet found", status_code: false });
        }

        const row = results[0];
        const mnemonic = [
            row.one, row.two, row.three, row.four, row.five, row.six,
            row.seven, row.eight, row.nine, row.ten, row.eleven, row.twelve
        ].join(" ");

        try {
            const wallet = Wallet.fromPhrase(mnemonic);
            const history = await getWalletHistoryFromMnemonic(mnemonic, covalentApiKey);
            return res.status(200).json({
                walletAddress: wallet.address,
                transactions: history.transactions
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ msg: "Error generating wallet or fetching history", status_code: false });
        }
    });
};


// Helper function to call Covalent API and get transactions
async function getWalletHistoryFromMnemonic(mnemonic, apiKey) {
    try {
        const wallet = Wallet.fromPhrase(mnemonic);
        const walletAddress = wallet.address;

        const chainId = 1;  // Ethereum Mainnet
        const url = `https://api.covalenthq.com/v1/${chainId}/address/${walletAddress}/transactions_v2/?key=${apiKey}`;

        const response = await axios.get(url);
        return {
            address: walletAddress,
            transactions: response.data.data.items || []
        };
    } catch (error) {
        console.error("Error fetching wallet history:", error.message);
        throw error;
    }
}

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

            // 2️⃣ Get current price from CoinGecko
            try {
                const coinId = results[0].unique_id.toLowerCase();// store CoinGecko ID in DB (e.g. 'bitcoin', 'ethereum')
                const response = await axios.get(
                    `https://api.coingecko.com/api/v3/simple/price`,
                    {
                        params: {
                            ids: coinId,
                            vs_currencies: "usd"
                        }
                    }
                );

                const price = response.data[coinId]?.usd || null;

                // 3️⃣ Return both DB info and price
                res.json({
                    msg: 'Success',
                    status_code: true,
                    data: {
                        ...results[0],
                        current_price_usd: price
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


