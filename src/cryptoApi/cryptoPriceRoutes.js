const express = require('express');
const router = express.Router();
const cryptoPriceService = require('./cryptoPriceService');

// GET /api/crypto/prices - Get current prices from database (with automatic cache validation)
router.get('/prices', async (req, res) => {
    try {
        const { coin_ids } = req.query;
        
        let coinIds = null;
        if (coin_ids) {
            coinIds = coin_ids.split(',').map(id => parseInt(id.trim()));
        }

        const prices = await cryptoPriceService.getCurrentPrices(coinIds);
        
        res.json({
            success: true,
            message: 'Crypto prices retrieved successfully',
            data: prices,
            timestamp: new Date().toISOString(),
            cache_info: cryptoPriceService.getCacheStats()
        });

    } catch (error) {
        console.error('Error in get prices endpoint:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch crypto prices',
            error: error.message
        });
    }
});

// POST /api/crypto/prices/refresh - Force refresh all coin prices
router.post('/prices/refresh', async (req, res) => {
    try {
        const result = await cryptoPriceService.forceRefreshAllPrices();
        
        res.json({
            success: true,
            message: 'Price refresh initiated',
            data: result
        });

    } catch (error) {
        console.error('Error in force refresh endpoint:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to refresh prices',
            error: error.message
        });
    }
});

// GET /api/crypto/prices/:coinId - Get specific coin price (with cache validation)
router.get('/prices/:coinId', async (req, res) => {
    try {
        const coinId = parseInt(req.params.coinId);
        
        if (isNaN(coinId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coin ID'
            });
        }

        const prices = await cryptoPriceService.getCurrentPrices([coinId]);
        
        if (prices.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Coin not found'
            });
        }

        res.json({
            success: true,
            message: 'Coin price retrieved successfully',
            data: prices[0],
            timestamp: new Date().toISOString(),
            cache_info: cryptoPriceService.getCacheStats()
        });

    } catch (error) {
        console.error('Error in get specific coin price endpoint:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch coin price',
            error: error.message
        });
    }
});

// POST /api/crypto/rate-limit/settings - Update rate limiting settings
router.post('/rate-limit/settings', (req, res) => {
    try {
        const { delay_ms, max_retries } = req.body;
        
        if (delay_ms !== undefined && (typeof delay_ms !== 'number' || delay_ms < 0)) {
            return res.status(400).json({
                success: false,
                message: 'delay_ms must be a positive number'
            });
        }
        
        if (max_retries !== undefined && (typeof max_retries !== 'number' || max_retries < 0)) {
            return res.status(400).json({
                success: false,
                message: 'max_retries must be a positive number'
            });
        }

        const currentSettings = cryptoPriceService.getCacheStats();
        const newDelay = delay_ms !== undefined ? delay_ms : currentSettings.rateLimitDelay;
        const newRetries = max_retries !== undefined ? max_retries : currentSettings.maxRetries;

        cryptoPriceService.updateRateLimitSettings(newDelay, newRetries);
        
        res.json({
            success: true,
            message: 'Rate limiting settings updated successfully',
            data: {
                previous: {
                    rateLimitDelay: currentSettings.rateLimitDelay,
                    maxRetries: currentSettings.maxRetries
                },
                current: {
                    rateLimitDelay: newDelay,
                    maxRetries: newRetries
                }
            }
        });

    } catch (error) {
        console.error('Error in rate limit settings endpoint:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update rate limiting settings',
            error: error.message
        });
    }
});

// GET /api/crypto/cache/stats - Get cache statistics
router.get('/cache/stats', (req, res) => {
    try {
        const stats = cryptoPriceService.getCacheStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to get cache statistics',
            error: error.message
        });
    }
});

// GET /api/crypto/test - Test endpoint for debugging
router.get('/test', async (req, res) => {
    try {
        // Test basic functionality
        const stats = cryptoPriceService.getCacheStats();
        
        // Try to get current prices
        const prices = await cryptoPriceService.getCurrentPrices();
        
        res.json({
            success: true,
            message: 'Test endpoint working',
            cache_stats: stats,
            prices_count: prices.length,
            sample_price: prices.length > 0 ? prices[0] : null,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Test endpoint error:', error);
        res.status(500).json({
            success: false,
            message: 'Test endpoint failed',
            error: error.message,
            stack: error.stack
        });
    }
});

// GET /api/crypto/health - Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Crypto Price API is running',
        timestamp: new Date().toISOString(),
        cache_duration: '1 minute',
        rate_limiting: 'Enabled with configurable delays',
        features: [
            'Automatic price caching',
            'Database storage',
            'CoinGecko API integration',
            'Background price updates',
            'Rate limiting and retry logic',
            'Exponential backoff for 429 errors'
        ]
    });
});

module.exports = router; 