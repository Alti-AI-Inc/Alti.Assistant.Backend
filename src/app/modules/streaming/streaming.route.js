const express = require('express');
const router = express.Router();
const streamingController = require('./streaming.controller');

router.route('/get-token').get(streamingController.authStreamingController);


module.exports = router;