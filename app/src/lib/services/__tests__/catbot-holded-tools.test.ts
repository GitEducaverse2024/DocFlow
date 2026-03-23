import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger to avoid fs writes during tests
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Save original env
const originalEnv = process.env;

describe('catbot-holded-tools', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, HOLDED_MCP_URL: 'http://localhost:8766/mcp' };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('getHoldedTools', () => {
    it('should return tools when HOLDED_MCP_URL is configured', async () => {
      const { getHoldedTools } = await import('../catbot-holded-tools');
      const tools = getHoldedTools();
      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0].type).toBe('function');
      expect(tools[0].function.name).toMatch(/^holded_/);
    });

    it('should return empty array when HOLDED_MCP_URL is not set', async () => {
      delete process.env.HOLDED_MCP_URL;
      const { getHoldedTools } = await import('../catbot-holded-tools');
      const tools = getHoldedTools();
      expect(tools).toEqual([]);
    });

    it('should include key daily tools', async () => {
      const { getHoldedTools } = await import('../catbot-holded-tools');
      const tools = getHoldedTools();
      const names = tools.map(t => t.function.name);
      expect(names).toContain('holded_search_contact');
      expect(names).toContain('holded_quick_invoice');
      expect(names).toContain('holded_list_leads');
      expect(names).toContain('holded_clock_in');
      expect(names).toContain('holded_clock_out');
    });

    it('should have valid tool definitions', async () => {
      const { getHoldedTools } = await import('../catbot-holded-tools');
      const tools = getHoldedTools();
      for (const tool of tools) {
        expect(tool.function.name).toBeTruthy();
        expect(tool.function.description).toBeTruthy();
        expect(tool.function.parameters).toBeDefined();
        expect(tool.function.parameters).toHaveProperty('type', 'object');
      }
    });
  });

  describe('isHoldedTool', () => {
    it('should return true for registered Holded tools', async () => {
      const { isHoldedTool } = await import('../catbot-holded-tools');
      expect(isHoldedTool('holded_search_contact')).toBe(true);
      expect(isHoldedTool('holded_clock_in')).toBe(true);
    });

    it('should return false for non-Holded tools', async () => {
      const { isHoldedTool } = await import('../catbot-holded-tools');
      expect(isHoldedTool('create_catbrain')).toBe(false);
      expect(isHoldedTool('mcp_bridge')).toBe(false);
    });

    it('should return false for unknown holded_ prefixed tools', async () => {
      const { isHoldedTool } = await import('../catbot-holded-tools');
      expect(isHoldedTool('holded_nonexistent_tool')).toBe(false);
    });
  });

  describe('executeHoldedTool', () => {
    it('should call Holded MCP and return result', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [{ type: 'text', text: JSON.stringify({ items: [{ id: '1', name: 'Test Contact' }] }) }],
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }) as unknown as typeof fetch;

      const { executeHoldedTool } = await import('../catbot-holded-tools');
      const result = await executeHoldedTool('holded_search_contact', { query: 'Test' });

      expect(result.name).toBe('holded_search_contact');
      expect(result.result).toEqual({ items: [{ id: '1', name: 'Test Contact' }] });
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8766/mcp',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('holded_search_contact'),
        })
      );
    });

    it('should handle MCP errors gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          jsonrpc: '2.0',
          error: { message: 'Rate limit exceeded' },
        }),
      }) as unknown as typeof fetch;

      const { executeHoldedTool } = await import('../catbot-holded-tools');
      const result = await executeHoldedTool('holded_search_contact', { query: 'Test' });

      expect(result.result).toHaveProperty('error');
      expect((result.result as Record<string, string>).error).toContain('Rate limit');
    });

    it('should handle network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

      const { executeHoldedTool } = await import('../catbot-holded-tools');
      const result = await executeHoldedTool('holded_search_contact', { query: 'Test' });

      expect(result.result).toHaveProperty('error');
      expect((result.result as Record<string, string>).error).toContain('ECONNREFUSED');
    });
  });
});
