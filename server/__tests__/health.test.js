const request = require('supertest');

const app = require('../app');

describe('Health endpoint', () => {
  it('returns healthy status', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
  });
});
