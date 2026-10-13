const express = require('express');
const router  = express.Router();
const { processFanfic } = require('../controllers/fanficController');

router.post('/process', processFanfic);

module.exports = router;
