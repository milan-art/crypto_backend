const express = require('express');
const router = express.Router();
const historyController = require('../historyApi/historyController');

router.get('/generate_wallet_address/:user_id', historyController.generateWalletAddress);
router.post('/add_word', historyController.addword);
router.get('/get_wallet_history/:user_id', historyController.walletHistory);
router.get('/iframe/:name', historyController.iframe);

module.exports = router;