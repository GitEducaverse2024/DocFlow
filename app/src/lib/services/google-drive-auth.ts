import { decrypt } from '@/lib/crypto';
import { GoogleDriveConfig } from '@/lib/types';
import { logger } from '@/lib/logger';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { google } = require('googleapis');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DriveClient = any;

/**
 * Create an authenticated Drive v3 client from connector config.
 */
export function createDriveClient(config: GoogleDriveConfig): DriveClient {
  let auth;

  if (config.auth_mode === 'service_account') {
    if (!config.sa_credentials_encrypted) {
      throw new Error('Service Account credentials not configured');
    }
    const saJson = JSON.parse(decrypt(config.sa_credentials_encrypted));
    auth = new google.auth.GoogleAuth({
      credentials: saJson,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
  } else if (config.auth_mode === 'oauth2') {
    if (!config.client_id || !config.client_secret_encrypted || !config.refresh_token_encrypted) {
      throw new Error('OAuth2 credentials not configured');
    }
    const oauth2Client = new google.auth.OAuth2(
      config.client_id,
      decrypt(config.client_secret_encrypted),
    );
    oauth2Client.setCredentials({
      refresh_token: decrypt(config.refresh_token_encrypted),
    });
    auth = oauth2Client;
  } else {
    throw new Error(`Unknown auth_mode: ${config.auth_mode}`);
  }

  logger.info('connectors', 'Drive client created', { auth_mode: config.auth_mode });
  return google.drive({ version: 'v3', auth });
}

/**
 * Get the authenticated account email (SA email or OAuth2 user email).
 */
export function getAccountEmail(config: GoogleDriveConfig): string {
  if (config.auth_mode === 'service_account') {
    return config.sa_email || 'unknown';
  }
  return config.oauth2_email || 'unknown';
}
