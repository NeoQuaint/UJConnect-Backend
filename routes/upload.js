const express = require('express');
const router = express.Router();

// Placeholder for now - Cloudinary will be added when deploying
router.post('/', async (req, res) => {
  res.json({ message: 'Upload endpoint ready. Cloudinary pending.' });
});

module.exports = router;