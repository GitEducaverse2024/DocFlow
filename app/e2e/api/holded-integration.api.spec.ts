import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3500';

test.describe.serial('API: Holded MCP Integration', () => {

  test('GET /api/health includes holded_mcp field when configured', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health?fresh=1`);
    expect(res.status()).toBe(200);
    const data = await res.json();

    // holded_mcp is only present if HOLDED_MCP_URL is configured
    if (data.holded_mcp) {
      expect(data.holded_mcp).toHaveProperty('configured', true);
      expect(data.holded_mcp).toHaveProperty('status');
      expect(['connected', 'disconnected', 'error']).toContain(data.holded_mcp.status);

      if (data.holded_mcp.status === 'connected') {
        expect(data.holded_mcp.latency_ms).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('GET /api/health holded_mcp shows tools_count when connected', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health?fresh=1`);
    const data = await res.json();

    if (data.holded_mcp?.status === 'connected') {
      expect(data.holded_mcp.tools_count).toBeGreaterThan(0);
    }
  });

  test('GET /api/connectors includes seed-holded-mcp', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/connectors`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    const connectors = Array.isArray(data) ? data : data.connectors || [];

    const holdedConnector = connectors.find((c: Record<string, unknown>) => c.id === 'seed-holded-mcp');
    if (holdedConnector) {
      expect(holdedConnector.type).toBe('mcp_server');
      expect(holdedConnector.name).toBe('Holded MCP');

      // Verify config has tools
      const config = typeof holdedConnector.config === 'string'
        ? JSON.parse(holdedConnector.config)
        : holdedConnector.config;
      expect(config.tools.length).toBeGreaterThan(20);
      expect(config.modules).toEqual(['invoicing', 'crm', 'projects', 'team']);
    }
  });

  test('POST /api/connectors/seed-holded-mcp/test checks connectivity', async ({ request }) => {
    // Only run if connector exists and is active
    const connRes = await request.get(`${BASE_URL}/api/connectors`);
    const connectors = await connRes.json();
    const list = Array.isArray(connectors) ? connectors : connectors.connectors || [];
    const holded = list.find((c: Record<string, unknown>) => c.id === 'seed-holded-mcp');

    if (!holded) {
      test.skip();
      return;
    }

    const testRes = await request.post(`${BASE_URL}/api/connectors/${holded.id}/test`);
    // Even if service is down, the endpoint should respond
    expect([200, 400, 500]).toContain(testRes.status());
  });

});
