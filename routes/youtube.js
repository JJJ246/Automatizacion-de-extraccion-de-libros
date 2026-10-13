const express = require('express');
const router  = express.Router();
const { downloadYoutube } = require('../controllers/youtubeController');

router.post('/download', downloadYoutube);

module.exports = router;
