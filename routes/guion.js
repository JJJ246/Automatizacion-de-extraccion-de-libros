const express = require('express');
const router  = express.Router();
const { processGuion } = require('../controllers/guionController');

router.post('/process', processGuion);

module.exports = router;
