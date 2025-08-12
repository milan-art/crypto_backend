const express = require('express');
const router = express.Router();
const walletController = require('../walletApi/walletController');
const upload = require('../../src/uploadimage/upload');

router.get('/get_wallets', walletController.getWallets);
router.get('/get_wallet_history/:user_id', walletController.getWalletHistory);
router.get('/get_coin_price', walletController.getCoinPrice);


router.post('/add_wallet',upload.single('icon'), walletController.addWallet);
router.post('/buy_coin/:id', walletController.bycoin);
router.post('/sell_coin/:id', walletController.sellcoin);
router.post('/swap', walletController.swapCrypto);

router.put('/update_wallets/:id', upload.single('icon'), walletController.updateWallet);

router.delete('/delete_wallets/:id', walletController.deleteWallet);

module.exports = router;