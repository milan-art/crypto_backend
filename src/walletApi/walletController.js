const db = require('../../config/db');
const e = require('express');
const axios = require('axios');
const { link } = require('./walletRoute');

exports.getWallets = async (req, res) => {
  const sql = `SELECT * FROM cripto_list WHERE is_active = 1`;

  db.query(sql, async (err, results) => {
    if (err) {
      console.error("❌ DB Error:", err);
      return res.status(500).json({ msg: 'Database error', status_code: false });
    }

    if (results.length === 0) {
      return res.status(404).json({ msg: 'No coins found', status_code: false });
    }

    // STEP 1: Collect all unique_ids for CoinGecko API
    let allUniqueIds = [];
    results.forEach(wallet => {
      const coinIdsArray = wallet.unique_id.split(',').map(c => c.trim().toLowerCase());
      allUniqueIds.push(...coinIdsArray);
    });

    // Remove duplicates
    allUniqueIds = [...new Set(allUniqueIds)];

    const coingeckoUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${allUniqueIds.join(',')}&vs_currencies=usd&include_24hr_change=true`;
    console.log("🔗 CoinGecko URL:", coingeckoUrl);

    try {
      // STEP 2: Fetch price data for all coins
      const { data: priceData } = await axios.get(coingeckoUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      // STEP 3: Map DB results with API data
      const enrichedWallets = results.map(wallet => {
        const coinIdsArray = wallet.unique_id.split(',').map(c => c.trim().toLowerCase());
        const coinNamesArray = wallet.name.split(',').map(c => c.trim());

        // Build nested unique_id object for this wallet
        const uniqueIdObj = {};
        coinIdsArray.forEach((coinId, i) => {
          const coinName = coinNamesArray[i] || coinId;
          uniqueIdObj[coinName] = priceData[coinId] || null;
        });

        return {
          id: wallet.id,
          name: wallet.name,
          is_active: wallet.is_active,
          unique_id: uniqueIdObj,
          icon: `${req.protocol}://${req.get('host')}${wallet.icon}`,
          market_cap: wallet.market_cap,
          type: wallet.type,
          link: wallet.link,
          created_at: wallet.created_at,
          updated_at: wallet.updated_at
        };
      });

      res.status(200).json({ data: enrichedWallets, status_code: true });

    } catch (apiErr) {
      console.error("❌ CoinGecko Error:", apiErr.message);
      res.status(502).json({ msg: 'Failed to fetch price from CoinGecko', status_code: false });
    }
  });
};


exports.addWallet = (req, res) => {
  const { name, unique_id, market_cap, type } = req.body;
  const iconFile = req.file;

  // Debug logs (optional)
  console.log("📥 Wallet Body:", req.body);
  console.log("🖼️ Uploaded Icon:", iconFile);

  // Validate required fields
  if (!name || !unique_id || !market_cap || !type) {
    return res.status(400).json({ msg: 'All fields are required', status_code: false });
  }

  if (!iconFile) {
    return res.status(400).json({ msg: 'Icon image is required', status_code: false });
  }

  // Store relative path for image
 const iconPath = `/icon/${iconFile.filename}`;  // Use this in frontend too

  // SQL INSERT query
  const sql = `
    INSERT INTO cripto_list 
    (name, unique_id, icon, is_active, market_cap, type, created_at, updated_at) 
    VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;

  // Execute DB query
  db.query(sql, [name, unique_id, iconPath, true, market_cap, type], (err, result) => {
    if (err) {
      console.error("❌ Database Error:", err);
      return res.status(500).json({ msg: 'Database error', status_code: false });
    }

    res.status(200).json({ msg: 'Wallet added successfully', status_code: true });
  });
};

exports.updateWallet = (req, res) => {
  const id = req.params.id;
  const { name, unique_id, market_cap, type } = req.body;
  const iconFile = req.file;

  // Prepare the update parts dynamically
  let fields = [];
  let params = [];

  if (name !== undefined) {
    fields.push("name = ?");
    params.push(name);
  }

  if (unique_id !== undefined) {
    fields.push("unique_id = ?");
    params.push(unique_id);
  }

  if (market_cap !== undefined) {
    fields.push("market_cap = ?");
    params.push(market_cap);
  }

  if (type !== undefined) {
    fields.push("type = ?");
    params.push(type);
  }

  if (iconFile) {
    const iconPath = `/icon/${iconFile.filename}`;
    fields.push("icon = ?");
    params.push(iconPath);
  }

  // If no fields are sent
  if (fields.length === 0) {
    return res.status(400).json({ msg: 'No fields to update', status_code: false });
  }

  // Always update the updated_at timestamp
  fields.push("updated_at = NOW()");

  const sql = `UPDATE cripto_list SET ${fields.join(", ")} WHERE id = ?`;
  params.push(id);

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("❌ Update Error:", err);
      return res.status(500).json({ msg: 'Database error', status_code: false });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ msg: 'Wallet not found', status_code: false });
    }

    res.status(200).json({ msg: 'Wallet updated successfully', status_code: true });
  });
};


exports.deleteWallet = (req, res) => {
  const id = req.params.id;

  const sql = `UPDATE cripto_list SET is_active = 0, updated_at = NOW() WHERE id = ?`;

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("❌ Delete Error:", err);
      return res.status(500).json({ msg: 'Database error', status_code: false });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ msg: 'Wallet not found', status_code: false });
    }

    res.status(200).json({ msg: 'Wallet deleted successfully', status_code: true });
  });
};


exports.bycoin = (req, res) => {
  const { user_id, price, quantity } = req.body;
  const coin_id = req.params.id;

  // Step 1: Check if the record already exists
  const checkSql = `SELECT * FROM user_wallet WHERE user_id = ? AND coin_id = ? AND is_active = 1`;

  db.query(checkSql, [user_id, coin_id], (err, result) => {
    if (err) {
      console.error("❌ Database Error (Check):", err);
      return res.status(500).json({ msg: 'Database error during check', status_code: false });
    }

    const addHistory = () => {
      const historySql = `INSERT INTO wallet_history (user_id, coin_id, price, quantity, action) VALUES (?, ?, ?, ?, 'buy')`;
      db.query(historySql, [user_id, coin_id, price, quantity]);
    };


    if (result.length > 0) {
      // Step 2a: Update existing record
      const updateSql = `UPDATE user_wallet SET price = price + ?, quantity = quantity + ?, updated_at = NOW() WHERE user_id = ? AND coin_id = ?`;

      db.query(updateSql, [price, quantity, user_id, coin_id], (err, updateResult) => {
        if (err) {
          console.error("❌ Database Error (Update):", err);
          return res.status(500).json({ msg: 'Database error during update', status_code: false });
        }
        addHistory();
        res.status(200).json({ msg: 'Wallet updated successfully', status_code: true });
      });

    } else {
      // Step 2b: Insert new record
      const insertSql = `INSERT INTO user_wallet (user_id, coin_id, price, quantity, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())`;

      db.query(insertSql, [user_id, coin_id, price, quantity], (err, insertResult) => {
        if (err) {
          console.error("❌ Database Error (Insert):", err);
          return res.status(500).json({ msg: 'Database error during insert', status_code: false });
        }
        addHistory();
        res.status(200).json({ msg: 'Wallet added successfully', status_code: true });
      });
    }
  });
};

exports.sellcoin = (req, res) => {
  const { user_id, price, quantity } = req.body;
  const coin_id = req.params.id;

  // Step 1: Check if the wallet record exists
  const checkSql = `SELECT * FROM  user_wallet WHERE user_id = ? AND coin_id = ? AND is_active = 1`;

  db.query(checkSql, [user_id, coin_id], (err, result) => {
    if (err) {
      console.error("❌ Database Error (Check):", err);
      return res.status(500).json({ msg: 'Database error during check', status_code: false });
    }

    if (result.length === 0) {
      return res.status(400).json({ msg: 'No such coin in wallet', status_code: false });
    }

    const wallet = result[0];

    // Step 2: Check if user has enough quantity to sell
    if (wallet.quantity < quantity) {
      return res.status(400).json({ msg: 'Not enough quantity to sell', status_code: false });
    }

    // Step 3: Calculate new quantity and price
    const newQuantity = wallet.quantity - quantity;
    const newPrice = wallet.price - price;

    // Step 4: If quantity becomes 0, deactivate the row
    const updateSql = `
      UPDATE user_wallet 
      SET price = ?, quantity = ?, is_active = ?, updated_at = NOW()
      WHERE user_id = ? AND coin_id = ?
    `;

    const isActive = newQuantity > 0 ? 1 : 0;

    db.query(updateSql, [newPrice, newQuantity, isActive, user_id, coin_id], (err, updateResult) => {
      if (err) {
        console.error("❌ Database Error (Update):", err);
        return res.status(500).json({ msg: 'Database error during update', status_code: false });
      }

       const historySql = `INSERT INTO wallet_history (user_id, coin_id, price, quantity, action) VALUES (?, ?, ?, ?, 'sell')`;
      db.query(historySql, [user_id, coin_id, price, quantity]);

      res.status(200).json({ msg: 'Coin sold successfully', status_code: true });
    });
  });
};


exports.getWalletHistory = (req, res) => {
  const user_id = req.params.user_id;

  // ✅ Simple Validation
  if (!user_id) {
    return res.status(400).json({ msg: 'User ID is required', status_code: false });
  }

  if (isNaN(user_id)) {
    return res.status(400).json({ msg: 'User ID must be a number', status_code: false });
  }

  const sql = `SELECT * FROM wallet_history WHERE user_id = ? ORDER BY id DESC`;

  db.query(sql, [user_id], (err, result) => {
    if (err) {
      console.error("❌ Database Error (wallet_history):", err);
      return res.status(500).json({
        msg: 'Database error while fetching wallet history',
        status_code: false
      });
    }

    if (result.length === 0) {
      return res.status(404).json({
        msg: 'No wallet history found for this user',
        status_code: false
      });
    }

    res.status(200).json({
      msg: 'Wallet history fetched successfully',
      status_code: true,
      data: result
    });
  });
};

exports.getCoinPrice = async (req, res) => {
  const user_id = req.params.user_id;
  if (!user_id) return res.status(400).json({ msg: 'User ID is required', status_code: false });

  // 1. Get user wallet coins
  const walletSql = 'SELECT coin_id, quantity FROM user_wallet WHERE user_id = ? AND is_active = 1';
  const walletRows = await db.promise().query(walletSql, [user_id]).then(r => r[0]);

  if (walletRows.length === 0) {
    return res.status(200).json({ msg: 'No holdings', status_code: true, data: [], total_value: 0 });
  }

  // 2. Map coin IDs to CoinGecko IDs (e.g. {1: 'ethereum', 2: 'solana'})
  const mapping = {};
  for (const row of walletRows) {
    mapping[row.coin_id] = row.coin_id;
  }

  const coinIds = walletRows.map(r => mapping[r.coin_id]).filter(Boolean).join(',');
  if (!coinIds) {
    return res.status(400).json({ msg: 'Coin IDs not recognized', status_code: false });
  }

  // 3. Fetch current prices
  const fetchUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd&include_24hr_change=true`;
  const cgResp = await fetch(fetchUrl);
  if (!cgResp.ok) {
    return res.status(502).json({ msg: 'Error fetching from CoinGecko', status_code: false });
  }
  const priceData = await cgResp.json();

  // 4. Calculate per-coin and total values
  const data = [];
  let totalValue = 0;

  for (const row of walletRows) {
    const cgId = mapping[row.coin_id];
    const priceInfo = priceData[cgId];
    if (!priceInfo) continue;

    const currentPrice = priceInfo.usd;
    const total_value_per_coin = currentPrice * row.quantity;
    totalValue += total_value_per_coin;

    data.push({
      coin_id: row.coin_id,
      quantity: row.quantity,
      current_price: currentPrice,
      total_value_per_coin,
      usd_24h_change: priceInfo.usd_24h_change
    });
  }

  res.status(200).json({
    msg: 'User coin values fetched successfully',
    status_code: true,
    data,
    total_value: totalValue
  });
};

exports.swapCrypto = async (req, res) => {
  try {
    const { fromCoin, toCoin, amount } = req.body;

    if (!fromCoin || !toCoin || !amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ msg: "Invalid input", status_code: false });
    }

    // STEP 1: Get prices for both coins from CoinGecko
    const ids = [fromCoin.toLowerCase(), toCoin.toLowerCase()].join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;

    const { data: priceData } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!priceData[fromCoin.toLowerCase()] || !priceData[toCoin.toLowerCase()]) {
      return res.status(404).json({ msg: "Coin price not found", status_code: false });
    }

    const fromPrice = priceData[fromCoin.toLowerCase()].usd;
    const toPrice = priceData[toCoin.toLowerCase()].usd;

    // STEP 2: Convert amount
    const usdValue = amount * fromPrice;
    const convertedAmount = usdValue / toPrice;

    // STEP 3: Respond with swap details
    return res.status(200).json({
      status_code: true,
      swap: {
        from: { coin: fromCoin, amount, price_usd: fromPrice },
        to: { coin: toCoin, amount: convertedAmount, price_usd: toPrice },
        rate: convertedAmount / amount,
      },
    });

  } catch (err) {
    console.error("❌ Swap Error:", err.message);
    return res.status(500).json({ msg: "Swap failed", status_code: false });
  }
};

