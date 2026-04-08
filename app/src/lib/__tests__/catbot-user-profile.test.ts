import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock catbot-db before importing the module under test
vi.mock('@/lib/catbot-db', () => ({
  upsertProfile: vi.fn(),
  getProfile: vi.fn(),
}));

import { upsertProfile, getProfile } from '@/lib/catbot-db';
import type { ProfileRow } from '@/lib/catbot-db';
import {
  deriveUserId,
  ensureProfile,
  extractPreferencesFromTools,
  generateInitialDirectives,
  updateProfileAfterConversation,
} from '../services/catbot-user-profile';

const mockedGetProfile = vi.mocked(getProfile);
const mockedUpsertProfile = vi.mocked(upsertProfile);

function makeProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: 'web:default',
    display_name: null,
    channel: 'web',
    personality_notes: null,
    communication_style: null,
    preferred_format: null,
    known_context: '{}',
    initial_directives: null,
    interaction_count: 0,
    last_seen: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('UserProfileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deriveUserId', () => {
    it('returns "web:default" for web channel', () => {
      expect(deriveUserId('web', undefined)).toBe('web:default');
    });

    it('returns "telegram:{chat_id}" for telegram channel with chat_id', () => {
      expect(deriveUserId('telegram', '12345')).toBe('telegram:12345');
    });

    it('returns "telegram:unknown" for telegram channel without chat_id', () => {
      expect(deriveUserId('telegram', undefined)).toBe('telegram:unknown');
    });

    it('returns "web:default" when both args are undefined', () => {
      expect(deriveUserId(undefined, undefined)).toBe('web:default');
    });
  });

  describe('ensureProfile', () => {
    it('creates new profile if none exists, returns ProfileRow', () => {
      const newProfile = makeProfile({ id: 'web:default' });
      mockedGetProfile
        .mockReturnValueOnce(undefined) // first call: not found
        .mockReturnValueOnce(newProfile); // second call: after create

      const result = ensureProfile('web:default');

      expect(mockedUpsertProfile).toHaveBeenCalledOnce();
      expect(mockedUpsertProfile).toHaveBeenCalledWith({ id: 'web:default', channel: 'web' });
      expect(result).toEqual(newProfile);
    });

    it('returns existing profile without re-creating if it exists', () => {
      const existing = makeProfile({ id: 'telegram:123', channel: 'telegram' });
      mockedGetProfile.mockReturnValueOnce(existing);

      const result = ensureProfile('telegram:123', 'telegram');

      expect(mockedUpsertProfile).not.toHaveBeenCalled();
      expect(result).toEqual(existing);
    });

    it('does NOT increment interaction_count (solo crea si no existe)', () => {
      const newProfile = makeProfile({ id: 'web:default', interaction_count: 0 });
      mockedGetProfile
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(newProfile);

      ensureProfile('web:default');

      // upsertProfile called only once (create), not for updating
      expect(mockedUpsertProfile).toHaveBeenCalledOnce();
    });
  });

  describe('extractPreferencesFromTools', () => {
    it('returns {communicationStyle: "technical"} for bash_execute', () => {
      const result = extractPreferencesFromTools([
        { name: 'bash_execute', args: {}, result: 'ok' },
      ]);
      expect(result).toEqual(expect.objectContaining({ communicationStyle: 'technical' }));
    });

    it('includes uses_canvas_frequently for 2+ canvas tools', () => {
      const result = extractPreferencesFromTools([
        { name: 'canvas_create', args: {}, result: 'ok' },
        { name: 'canvas_update', args: {}, result: 'ok' },
      ]);
      expect(result?.knownContext).toEqual(expect.objectContaining({ uses_canvas_frequently: true }));
    });

    it('includes preferred_email_connector from send_email', () => {
      const result = extractPreferencesFromTools([
        { name: 'send_email', args: { connector_id: 'gmail' }, result: 'ok' },
      ]);
      expect(result?.knownContext).toEqual(expect.objectContaining({ preferred_email_connector: 'gmail' }));
    });

    it('returns null for empty array', () => {
      expect(extractPreferencesFromTools([])).toBeNull();
    });
  });

  describe('generateInitialDirectives', () => {
    it('includes nombre and web for profile with display_name + web channel', () => {
      const profile = makeProfile({ display_name: 'Ana', channel: 'web' });
      const result = generateInitialDirectives(profile);
      expect(result).toContain('Ana');
      expect(result).toContain('web');
    });

    it('mentions Telegram + respuestas concisas for telegram channel', () => {
      const profile = makeProfile({ channel: 'telegram' });
      const result = generateInitialDirectives(profile);
      expect(result).toContain('Telegram');
      expect(result).toContain('concisas');
    });

    it('mentions estilo when communication_style is set', () => {
      const profile = makeProfile({ communication_style: 'technical' });
      const result = generateInitialDirectives(profile);
      expect(result).toContain('technical');
    });
  });

  describe('updateProfileAfterConversation', () => {
    it('calls upsertProfile only if preferences detected, regenerates directives', () => {
      const existing = makeProfile({ id: 'web:default' });
      mockedGetProfile.mockReturnValue(existing);

      updateProfileAfterConversation('web:default', [
        { name: 'bash_execute', args: {}, result: 'ok' },
      ]);

      expect(mockedUpsertProfile).toHaveBeenCalledOnce();
      // Should include communicationStyle and regenerated initialDirectives
      expect(mockedUpsertProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'web:default',
          communicationStyle: 'technical',
          initialDirectives: expect.any(String),
        })
      );
    });

    it('does not call upsertProfile if no preferences detected', () => {
      updateProfileAfterConversation('web:default', []);
      expect(mockedUpsertProfile).not.toHaveBeenCalled();
    });
  });
});
