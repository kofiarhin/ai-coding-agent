const express = require('express');
const cors = require('cors');

const healthRoutes = require('./routes/health.routes');

const createApp = () => {
  const app = express();
  app.use(cors({ origin: '*' }));
  app.use(express.json());

  app.use('/api/health', healthRoutes);

  app.get('/', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    res.status(status).json({ message: error.message || 'Internal server error' });
  });

  return app;
};

module.exports = createApp();
