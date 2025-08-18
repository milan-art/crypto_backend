const axios = require('axios');
const db = require('../../config/db');

class CryptoPriceService {
    constructor() {
        this.baseUrl = 'https://api.coingecko.com/api/v3';
        this.cacheDuration = 2 * 60 * 1000; // 1 minute in milliseconds
        this.rateLimitDelay = 1200; // 1.2 seconds between API calls to respect rate limits
        this.maxRetries = 3; // Maximum retry attempts for failed requests
    }

    // Check if price data needs to be refreshed (older than 1 minute)
    async shouldRefreshPrice(coinId) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT fetch_date FROM cripto_list WHERE id = ? AND is_active = 1`;
            
            db.query(sql, [coinId], (err, results) => {
                if (err) {
                    console.error('❌ Error checking fetch date:', err);
                    return reject(err);
                }

                if (results.length === 0) {
                    return resolve(true); // No record found, should refresh
                }

                const lastFetch = new Date(results[0].fetch_date);
                const now = new Date();
                const timeDiff = now - lastFetch;
                
                // Should refresh if more than 1 minute has passed
                const shouldRefresh = timeDiff > this.cacheDuration;
                
                resolve(shouldRefresh);
            });
        });
    }

    // Sleep function for rate limiting
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Batch fetch and update prices for multiple coins in a single API call
    async updateMultipleCoinPricesBatch(coins) {
        try {
            if (coins.length === 0) {
                return [];
            }

            // Collect all unique IDs that need refresh
            const uniqueIds = coins.map(coin => coin.unique_id.toLowerCase());
            const uniqueIdsString = uniqueIds.join(',');
            
            // Log API call details
            console.log(`🔄 Calling CoinGecko API: ${this.baseUrl}/simple/price`);
            console.log(`📊 Coins: ${uniqueIdsString}`);
            console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
            
            // Make single API call for all coins
            const response = await axios.get(`${this.baseUrl}/simple/price`, {
                params: {
                    ids: uniqueIdsString,
                    vs_currencies: 'usd',
                    include_24hr_change: true
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 15000 // 15 second timeout for batch requests
            });

            console.log(`✅ CoinGecko API response received: ${response.status}`);
            console.log(`📈 Price data for ${Object.keys(response.data).length} coins`);

            const priceData = response.data;

            // Update database for all coins
            const results = [];
            for (const coin of coins) {
                try {
                    const coinId = coin.unique_id.toLowerCase();
                    const coinPriceData = priceData[coinId];
                    
                    if (!coinPriceData) {
                        results.push({
                            id: coin.id,
                            unique_id: coin.unique_id,
                            updated: false,
                            reason: 'No price data received',
                            timestamp: new Date().toISOString()
                        });
                        continue;
                    }

                    // Update database with new price data
                    const updateSql = `
                        UPDATE cripto_list 
                        SET current_value = ?, 
                            last_24_change = ?, 
                            fetch_date = CURRENT_TIMESTAMP 
                        WHERE id = ?
                    `;

                    const currentValue = Number(coinPriceData.usd) || 0;
                    const last24Change = Number(coinPriceData.usd_24h_change) || 0;

                    await new Promise((resolve, reject) => {
                        db.query(updateSql, [currentValue, last24Change, coin.id], (err, result) => {
                            if (err) {
                                console.error('❌ Error updating price in DB:', err);
                                reject(err);
                            } else {
                                resolve(true);
                            }
                        });
                    });

                    results.push({
                        id: coin.id,
                        unique_id: coin.unique_id,
                        updated: true,
                        timestamp: new Date().toISOString()
                    });

                } catch (error) {
                    results.push({
                        id: coin.id,
                        unique_id: coin.unique_id,
                        updated: false,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            return results;

        } catch (error) {
            // Handle rate limiting specifically
            if (error.response && error.response.status === 429) {
                console.log(`⏳ Rate limited (429) for batch request, waiting 5 seconds before retry...`);
                await this.sleep(5000);
                return this.updateMultipleCoinPricesBatch(coins);
            }
            
            console.error('❌ Error in batch price update:', error.message);
            return coins.map(coin => ({
                id: coin.id,
                unique_id: coin.unique_id,
                updated: false,
                error: error.message,
                timestamp: new Date().toISOString()
            }));
        }
    }

    // Get current prices from database (with cache validation)
    async getCurrentPrices(coinIds = null) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT id, name, unique_id, current_value, last_24_change, fetch_date, 
                       icon, market_cap, type, link, created_at, updated_at
                FROM cripto_list 
                WHERE is_active = 1
            `;
            
            const params = [];
            
            if (coinIds && coinIds.length > 0) {
                sql += ` AND id IN (${coinIds.map(() => '?').join(',')})`;
                params.push(...coinIds);
            }
            
            sql += ` ORDER BY name`;

            db.query(sql, params, (err, results) => {
                if (err) {
                    console.error('❌ Error fetching current prices:', err);
                    return reject(err);
                }

                // Convert numeric fields to numbers
                const processedResults = results.map(coin => ({
                    ...coin,
                    current_value: Number(coin.current_value) || 0,
                    last_24_change: Number(coin.last_24_change) || 0
                }));

                // Check which coins need price refresh
                const coinsNeedingRefresh = processedResults.filter(coin => {
                    const lastFetch = new Date(coin.fetch_date);
                    const now = new Date();
                    const timeDiff = now - lastFetch;
                    return timeDiff > this.cacheDuration;
                });

                if (coinsNeedingRefresh.length > 0) {
                    // Update prices in background with batch processing
                    this.updateMultipleCoinPricesBatch(coinsNeedingRefresh)
                        .then(updateResults => {
                            const successCount = updateResults.filter(r => r.updated).length;
                            const failureCount = updateResults.filter(r => !r.updated).length;
                            console.log(`📊 Background batch update completed: ${successCount} successful, ${failureCount} failed`);
                        })
                        .catch(error => {
                            console.error('❌ Background batch update failed:', error);
                        });
                }

                resolve(processedResults);
            });
        });
    }

    // Force refresh all coin prices with batch processing
    async forceRefreshAllPrices() {
        try {
            const coins = await this.getCurrentPrices();
            const results = await this.updateMultipleCoinPricesBatch(coins);
            
            const successCount = results.filter(r => r.updated).length;
            const totalCount = results.length;
            
            return {
                success: true,
                updated: successCount,
                total: totalCount,
                results: results
            };
            
        } catch (error) {
            console.error('❌ Force refresh failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get cache statistics
    getCacheStats() {
        return {
            cacheDuration: this.cacheDuration,
            cacheDurationMinutes: this.cacheDuration / (60 * 1000),
            rateLimitDelay: this.rateLimitDelay,
            maxRetries: this.maxRetries,
            description: '1 minute cache for CoinGecko API calls with batch processing and rate limiting'
        };
    }

    // Update rate limiting settings
    updateRateLimitSettings(delayMs, maxRetries) {
        this.rateLimitDelay = delayMs;
        this.maxRetries = maxRetries;
    }
}

module.exports = new CryptoPriceService(); 