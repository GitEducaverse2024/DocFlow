import { describe, it, expect } from 'vitest';
import {
  detectRequiredServices,
  detectCredentials,
  makeSlug,
} from './bundle-generator';

describe('bundle-generator', () => {
  describe('detectRequiredServices', () => {
    it('always includes docflow and litellm', () => {
      const result = detectRequiredServices([], []);
      expect(result).toContain('docflow');
      expect(result).toContain('litellm');
      expect(result).toHaveLength(2);
    });

    it('includes qdrant when step uses RAG context_mode', () => {
      const steps = [{ context_mode: 'rag', use_project_rag: 0 }];
      const result = detectRequiredServices(steps, []);
      expect(result).toContain('qdrant');
    });

    it('includes qdrant when step uses project RAG', () => {
      const steps = [{ context_mode: 'previous', use_project_rag: 1 }];
      const result = detectRequiredServices(steps, []);
      expect(result).toContain('qdrant');
    });

    it('includes ollama when agent uses local model', () => {
      const agents = [{ model: 'ollama/llama3' }];
      const result = detectRequiredServices([], agents);
      expect(result).toContain('ollama');
    });

    it('includes ollama when agent uses local/ prefix', () => {
      const agents = [{ model: 'local/mistral' }];
      const result = detectRequiredServices([], agents);
      expect(result).toContain('ollama');
    });

    it('does not include qdrant when no RAG steps', () => {
      const steps = [{ context_mode: 'previous', use_project_rag: 0 }];
      const result = detectRequiredServices(steps, []);
      expect(result).not.toContain('qdrant');
    });

    it('does not include ollama when using cloud models', () => {
      const agents = [{ model: 'gpt-4' }, { model: 'claude-3' }];
      const result = detectRequiredServices([], agents);
      expect(result).not.toContain('ollama');
    });

    it('includes both qdrant and ollama when both needed', () => {
      const steps = [{ context_mode: 'rag', use_project_rag: 0 }];
      const agents = [{ model: 'ollama/llama3' }];
      const result = detectRequiredServices(steps, agents);
      expect(result).toContain('qdrant');
      expect(result).toContain('ollama');
      expect(result).toHaveLength(4);
    });
  });

  describe('detectCredentials', () => {
    it('always includes LITELLM_API_KEY', () => {
      const result = detectCredentials([], []);
      expect(result).toContain('LITELLM_API_KEY');
    });

    it('includes OPENAI_API_KEY for GPT models', () => {
      const agents = [{ model: 'gpt-4' }];
      const result = detectCredentials(agents, []);
      expect(result).toContain('OPENAI_API_KEY');
    });

    it('includes OPENAI_API_KEY for openai-prefixed models', () => {
      const agents = [{ model: 'openai/gpt-4-turbo' }];
      const result = detectCredentials(agents, []);
      expect(result).toContain('OPENAI_API_KEY');
    });

    it('includes ANTHROPIC_API_KEY for Claude models', () => {
      const agents = [{ model: 'claude-3-opus' }];
      const result = detectCredentials(agents, []);
      expect(result).toContain('ANTHROPIC_API_KEY');
    });

    it('includes ANTHROPIC_API_KEY for anthropic-prefixed models', () => {
      const agents = [{ model: 'anthropic/claude-3-sonnet' }];
      const result = detectCredentials(agents, []);
      expect(result).toContain('ANTHROPIC_API_KEY');
    });

    it('includes GOOGLE_API_KEY for Gemini models', () => {
      const agents = [{ model: 'gemini-pro' }];
      const result = detectCredentials(agents, []);
      expect(result).toContain('GOOGLE_API_KEY');
    });

    it('includes multiple credentials for mixed models', () => {
      const agents = [
        { model: 'gpt-4' },
        { model: 'claude-3-opus' },
        { model: 'gemini-pro' },
      ];
      const result = detectCredentials(agents, []);
      expect(result).toContain('LITELLM_API_KEY');
      expect(result).toContain('OPENAI_API_KEY');
      expect(result).toContain('ANTHROPIC_API_KEY');
      expect(result).toContain('GOOGLE_API_KEY');
    });

    it('does not duplicate credentials', () => {
      const agents = [{ model: 'gpt-4' }, { model: 'gpt-3.5-turbo' }];
      const result = detectCredentials(agents, []);
      const openaiCount = result.filter((c) => c === 'OPENAI_API_KEY').length;
      expect(openaiCount).toBe(1);
    });

    it('handles agents with null/undefined model', () => {
      const agents = [{ model: '' }, { model: 'gemini-main' }];
      const result = detectCredentials(agents, []);
      expect(result).toContain('LITELLM_API_KEY');
      expect(result).toContain('GOOGLE_API_KEY');
    });
  });

  describe('makeSlug', () => {
    it('lowercases and replaces non-alphanumeric chars', () => {
      expect(makeSlug('My Task Name')).toBe('my-task-name');
    });

    it('handles special characters', () => {
      expect(makeSlug('Task #1: Test & Verify!')).toBe('task-1-test-verify');
    });

    it('trims leading/trailing hyphens', () => {
      expect(makeSlug('  hello  ')).toBe('hello');
    });

    it('truncates to 50 characters', () => {
      const longName = 'a'.repeat(100);
      expect(makeSlug(longName).length).toBeLessThanOrEqual(50);
    });

    it('handles empty string', () => {
      expect(makeSlug('')).toBe('');
    });
  });
});
