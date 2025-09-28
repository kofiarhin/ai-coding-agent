module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/server/**/__tests__/**/*.test.js'],
  collectCoverageFrom: ['server/**/*.js', '!server/index.js']
};
