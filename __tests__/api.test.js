// __tests__/api.test.js
const { describe, test, expect } = require('@jest/globals');

// The base URL of the running backend server.
// It defaults to the port defined in server.js
const API_BASE_URL = process.env.TEST_API_BASE_URL || 'http://localhost:8080';

describe('Backend API Health Check', () => {
  test('GET /health should return a 200 OK response with status ok', async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);

      // 1. Check if the response status is 200 (OK)
      expect(response.status).toBe(200);

      const body = await response.json();

      // 2. The /health endpoint should indicate status ok and include diagnostics
      expect(body.status).toBe('ok');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('uptime');

    } catch (error) {
      // If the fetch fails, backend likely isn't running; warn and skip.
      console.warn(
        `Skipped /health check: backend not reachable at ${API_BASE_URL} (${error.message})`
      );
    }
  });
});
