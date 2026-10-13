const express = require('express');
const router  = express.Router();
const { fusionAudios } = require('../controllers/fusionController');

router.post('/merge', fusionAudios);

module.exports = router;
