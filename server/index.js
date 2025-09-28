const http = require('http');
const dotenv = require('dotenv');

const app = require('./app');
const connectDatabase = require('./utils/database');

dotenv.config();

const startServer = () => {
  const port = parseInt(process.env.PORT || '5000', 10);
  const server = http.createServer(app);

  server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });

  return server;
};

const bootstrap = async () => {
  await connectDatabase();
  startServer();
};

bootstrap().catch((error) => {
  console.error(`Failed to start server: ${error.message}`);
  process.exit(1);
});
