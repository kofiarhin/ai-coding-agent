const mongoose = require('mongoose');

const connectDatabase = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn('MONGO_URI not set. Skipping database connection.');
    return;
  }

  if (mongoose.connection.readyState === 1) {
    return;
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000
  });

  console.log('Connected to MongoDB');
};

module.exports = connectDatabase;
