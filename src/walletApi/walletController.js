const db = require('../../config/db');
const e = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { link } = require('./walletRoute');
const cryptoPriceService = require('../cryptoApi/cryptoPriceService');

exports.getWallets = async (req, res) => {
  try {
    // Use the crypto price service to get current prices with automatic cache validation
    const walletsWithPrices = await cryptoPriceService.getCurrentPrices();
    
    if (walletsWithPrices.length === 0) {
      // Fallback to direct database query if crypto price service fails
      const fallbackSql = `SELECT * FROM cripto_list WHERE is_active = 1 ORDER BY name`;
      
      db.query(fallbackSql, async (err, results) => {
        if (err) {
          console.error("❌ getWallets: Fallback DB Error:", err);
          return res.status(500).json({ msg: 'Database error', status_code: false });
        }

        if (results.length === 0) {
          return res.status(404).json({ msg: 'No coins found', status_code: false });
        }

        // Format the response with basic data (no price info)
        const enrichedWallets = results.map(wallet => {
          let uniqueIdObj = {};
          if (typeof wallet.unique_id === 'string' && wallet.unique_id.includes(',')) {
            const coinIdsArray = wallet.unique_id.split(',').map(c => c.trim().toLowerCase());
            coinIdsArray.forEach((coinId) => {
              uniqueIdObj[coinId] = {
                usd: 0,
                usd_24h_change: 0
              };
            });
          } else {
            uniqueIdObj[wallet.unique_id.toLowerCase()] = {
              usd: 0,
              usd_24h_change: 0
            };
          }

          return {
            id: wallet.id,
            name: wallet.name,
            is_active: wallet.is_active,
            unique_id: uniqueIdObj,
            icon: `${req.protocol}://${req.get('host')}${wallet.icon}`,
            market_cap: wallet.market_cap,
            type: wallet.type,
            link: wallet.link,
            current_value: 0,
            last_24_change: 0,
            fetch_date: null,
            created_at: wallet.created_at,
            updated_at: wallet.updated_at
          };
        });

        res.status(200).json({ 
          data: enrichedWallets, 
          status_code: true,
          message: 'Wallets retrieved using fallback method (no price data)',
          cache_info: null
        });
      });
      
      return;
    }

    // Format the response to include the new price data
    const enrichedWallets = walletsWithPrices.map(wallet => {
      // Parse unique_id if it's a comma-separated string
      let uniqueIdObj = {};
      if (typeof wallet.unique_id === 'string' && wallet.unique_id.includes(',')) {
        const coinIdsArray = wallet.unique_id.split(',').map(c => c.trim().toLowerCase());
        coinIdsArray.forEach((coinId) => {
          uniqueIdObj[coinId] = {
            usd: Number(wallet.current_value) || 0,
            usd_24h_change: Number(wallet.last_24_change) || 0
          };
        });
      } else {
        // Single coin ID
        uniqueIdObj[wallet.unique_id.toLowerCase()] = {
          usd: Number(wallet.current_value) || 0,
          usd_24h_change: Number(wallet.last_24_change) || 0
        };
      }

      return {
        id: wallet.id,
        name: wallet.name,
        is_active: wallet.is_active,
        unique_id: uniqueIdObj,
        icon: `${req.protocol}://${req.get('host')}${wallet.icon}`,
        market_cap: wallet.market_cap,
        type: wallet.type,
        link: wallet.link,
        current_value: Number(wallet.current_value) || 0,
        last_24_change: Number(wallet.last_24_change) || 0,
        fetch_date: wallet.fetch_date,
        created_at: wallet.created_at,
        updated_at: wallet.updated_at
      };
    });
    
    res.status(200).json({ 
      data: enrichedWallets, 
      status_code: true,
      message: 'Wallets retrieved successfully with price data',
      cache_info: cryptoPriceService.getCacheStats()
    });

  } catch (error) {
    console.error("❌ Error in getWallets:", error);
    
    // Try fallback method on error
    const fallbackSql = `SELECT * FROM cripto_list WHERE is_active = 1 ORDER BY name`;
    
    db.query(fallbackSql, (err, results) => {
      if (err) {
        console.error("❌ getWallets: Fallback DB Error:", err);
        return res.status(500).json({ 
          msg: 'Failed to fetch wallets', 
          status_code: false,
          error: error.message
        });
      }

      if (results.length === 0) {
        return res.status(404).json({ msg: 'No coins found', status_code: false });
      }

      // Format the response with basic data (no price info)
      const enrichedWallets = results.map(wallet => {
        let uniqueIdObj = {};
        if (typeof wallet.unique_id === 'string' && wallet.unique_id.includes(',')) {
          const coinIdsArray = wallet.unique_id.split(',').map(c => c.trim().toLowerCase());
          coinIdsArray.forEach((coinId) => {
            uniqueIdObj[coinId] = {
              usd: 0,
              usd_24h_change: 0
            };
          });
        } else {
          uniqueIdObj[wallet.unique_id.toLowerCase()] = {
            usd: 0,
            usd_24h_change: 0
          };
        }

        return {
          id: wallet.id,
          name: wallet.name,
          is_active: wallet.is_active,
          unique_id: uniqueIdObj,
          icon: `${req.protocol}://${req.get('host')}${wallet.icon}`,
          market_cap: wallet.market_cap,
          type: wallet.type,
          link: wallet.link,
          current_value: 0,
          last_24_change: 0,
          fetch_date: null,
          created_at: wallet.created_at,
          updated_at: wallet.updated_at
        };
      });

      res.status(200).json({ 
        data: enrichedWallets, 
        status_code: true,
        message: 'Wallets retrieved using fallback method due to error',
        error: error.message,
        cache_info: null
      });
    });
  }
};


exports.addWallet = (req, res) => {
  const { name, unique_id, market_cap, type } = req.body;
  const iconFile = req.file;

  // Validate required fields
  if (!name || !unique_id || !market_cap || !type) {
    return res.status(400).json({ msg: 'All fields are required', status_code: false });
  }

  if (!iconFile) {
    return res.status(400).json({ msg: 'Icon image is required', status_code: false });
  }

  // Store relative path for image
  const iconPath = `/icon/${iconFile.filename}`;

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
  try {
    // 1. Extract & verify token
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.slice(7) : "";
    if (!token) {
      return res.status(401).json({ msg: "Authorization token required", status_code: false });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user_id = decoded.userId;
    if (!user_id) {
      return res.status(400).json({ msg: "User ID is required", status_code: false });
    }

    // 2. Get user wallet with coin details from cripto_list
    const walletSql = `
      SELECT uw.coin_id, uw.quantity, uw.price, cl.unique_id, cl.name, cl.current_value, cl.last_24_change
      FROM user_wallet uw
      JOIN cripto_list cl ON cl.id = uw.coin_id
      WHERE uw.user_id = ? AND uw.is_active = 1 AND cl.is_active = 1
    `;
    const walletRows = await db.promise().query(walletSql, [user_id]).then(r => r[0]);

    if (walletRows.length === 0) {
      return res.status(200).json({ msg: "No holdings", status_code: true, data: [], total_value: 0 });
    }

    // 3. Get current prices from cached database (this will trigger background updates if needed)
    const coinIds = walletRows.map(row => row.coin_id);
    const currentPrices = await cryptoPriceService.getCurrentPrices(coinIds);
    
    // Create a map of coin_id to current price data
    const priceMap = {};
    currentPrices.forEach(coin => {
      priceMap[coin.id] = {
        current_value: Number(coin.current_value) || 0,
        last_24_change: Number(coin.last_24_change) || 0,
        fetch_date: coin.fetch_date
      };
    });

    // 4. Calculate per-coin and total using cached prices
    const data = [];
    let totalValue = 0;

    for (const row of walletRows) {
      const priceInfo = priceMap[row.coin_id];
      if (!priceInfo || priceInfo.current_value === 0) {
        console.warn(`⚠️ No price data for coin ID ${row.coin_id}`);
        continue;
      }

      const currentPrice = priceInfo.current_value;
      const total_value_per_coin = currentPrice * Number(row.quantity);
      totalValue += total_value_per_coin;

      data.push({
        coin_id: row.coin_id,
        unique_id: row.unique_id,
        name: row.name,
        quantity: Number(row.quantity),
        purchase_price: Number(row.price),
        current_price: currentPrice,
        total_value_per_coin: parseFloat(total_value_per_coin.toFixed(2)),
        usd_24h_change: priceInfo.last_24_change,
        price_updated_at: priceInfo.fetch_date
      });
    }

    if (data.length === 0) {
      return res.status(200).json({ 
        msg: "No valid price data available for holdings", 
        status_code: true, 
        data: [], 
        total_value: 0 
      });
    }

    // 5. Send response
    res.status(200).json({
      msg: "User coin values fetched successfully",
      status_code: true,
      data,
      total_value: parseFloat(totalValue.toFixed(2)),
      cache_info: cryptoPriceService.getCacheStats()
    });

  } catch (error) {
    console.error("Error in getCoinPrice:", error);
    res.status(500).json({ msg: "Internal server error", status_code: false });
  }
};


exports.swapCrypto = async (req, res) => {
  try {
    const { fromCoin, toCoin, amount } = req.body;

    if (!fromCoin || !toCoin || !amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ msg: "Invalid input", status_code: false });
    }

    // Get current prices from cached database
    const coinLookupSql = `
      SELECT id, unique_id, current_value 
      FROM cripto_list 
      WHERE unique_id IN (?, ?) AND is_active = 1
    `;
    
    const coinRows = await db.promise().query(coinLookupSql, [fromCoin.toLowerCase(), toCoin.toLowerCase()]).then(r => r[0]);
    
    if (coinRows.length < 2) {
      return res.status(404).json({ msg: "One or both coins not found in database", status_code: false });
    }

    // Create a map of unique_id to price data
    const priceMap = {};
    coinRows.forEach(coin => {
      priceMap[coin.unique_id] = {
        id: coin.id,
        current_value: Number(coin.current_value) || 0
      };
    });

    const fromPrice = priceMap[fromCoin.toLowerCase()]?.current_value;
    const toPrice = priceMap[toCoin.toLowerCase()]?.current_value;

    if (!fromPrice || !toPrice) {
      return res.status(404).json({ msg: "Price data not available for one or both coins", status_code: false });
    }

    // Convert amount
    const usdValue = Number(amount) * fromPrice;
    const convertedAmount = usdValue / toPrice;

    // Respond with swap details
    return res.status(200).json({
      status_code: true,
      swap: {
        from: { coin: fromCoin, amount: Number(amount), price_usd: fromPrice },
        to: { coin: toCoin, amount: parseFloat(convertedAmount.toFixed(8)), price_usd: toPrice },
        rate: parseFloat((convertedAmount / Number(amount)).toFixed(8)),
        usd_value: parseFloat(usdValue.toFixed(2))
      },
      cache_info: cryptoPriceService.getCacheStats()
    });

  } catch (err) {
    console.error("❌ Swap Error:", err.message);
    return res.status(500).json({ msg: "Swap failed", status_code: false });
  }
};

