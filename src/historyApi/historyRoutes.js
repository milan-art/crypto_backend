const express = require('express');
const router = express.Router();
const historyController = require('../historyApi/historyController');

router.get('/get_word', historyController.generateWalletAddress);
router.post('/add_word', historyController.addword);
router.get('/wallet_history', historyController.getwalletHistory);
router.get('/iframe/:name', historyController.iframe);

module.exports = router;