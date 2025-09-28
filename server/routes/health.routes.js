const { Router } = require('express');

const { getHealth } = require('../controllers/health.controller');

const createRouter = () => {
  const router = Router();
  router.get('/', getHealth);
  return router;
};

module.exports = createRouter();
