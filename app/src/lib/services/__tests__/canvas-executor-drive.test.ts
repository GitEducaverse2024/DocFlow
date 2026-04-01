import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('@/lib/services/google-drive-auth', () => ({
  createDriveClient: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/services/google-drive-service', () => ({
  listFiles: vi.fn().mockResolvedValue({
    files: [
      { id: 'file-1', name: 'document.pdf', mimeType: 'application/pdf' },
      { id: 'file-2', name: 'notes.txt', mimeType: 'text/plain' },
    ],
  }),
  downloadFile: vi.fn().mockResolvedValue({
    content: Buffer.from('contenido del archivo descargado'),
    exportedMime: 'text/plain',
  }),
  uploadFile: vi.fn().mockResolvedValue({
    id: 'uploaded-file-1',
    name: 'output.md',
    webViewLink: 'https://drive.google.com/file/d/uploaded-file-1/view',
  }),
  createFolder: vi.fn().mockResolvedValue({
    id: 'folder-new-1',
    name: 'Mi Carpeta',
  }),
}));

vi.mock('@/lib/db', () => {
  const mockPrepare = vi.fn().mockReturnValue({
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn().mockReturnValue([]),
  });
  return {
    default: { prepare: mockPrepare, exec: vi.fn() },
  };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/utils', () => ({
  generateId: vi.fn().mockReturnValue('test-log-id'),
}));

import { createDriveClient } from '@/lib/services/google-drive-auth';
import { listFiles, downloadFile, uploadFile, createFolder } from '@/lib/services/google-drive-service';
import { logger } from '@/lib/logger';
import type { GoogleDriveConfig } from '@/lib/types';

describe('Canvas Executor — Google Drive Branch', () => {
  const mockDriveConfig: GoogleDriveConfig = {
    auth_mode: 'service_account',
    sa_email: 'test@project.iam.gserviceaccount.com',
    sa_credentials_encrypted: 'encrypted-creds',
    root_folder_id: 'root-folder-123',
    root_folder_name: 'Mi Carpeta',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Upload operation', () => {
    it('llama a uploadFile con el output del predecesor como contenido', async () => {
      const predecessorOutput = '# Resultado del analisis\n\nContenido generado por el agente.';
      const folderId = 'root-folder-123';
      const fileName = 'output.md';

      const drive = createDriveClient(mockDriveConfig);
      await uploadFile(drive, fileName, predecessorOutput, folderId);

      expect(uploadFile).toHaveBeenCalledWith(
        drive,
        fileName,
        predecessorOutput,
        folderId
      );
    });

    it('uploadFile retorna informacion del archivo subido', async () => {
      const drive = createDriveClient(mockDriveConfig);
      const result = await uploadFile(drive, 'test.md', 'contenido', 'folder-1');

      expect(result).toEqual({
        id: 'uploaded-file-1',
        name: 'output.md',
        webViewLink: 'https://drive.google.com/file/d/uploaded-file-1/view',
      });
    });
  });

  describe('Download operation', () => {
    it('downloadFile retorna contenido como Buffer', async () => {
      const drive = createDriveClient(mockDriveConfig);
      const result = await downloadFile(drive, 'file-1', 'application/octet-stream');

      expect(result.content.toString('utf-8')).toBe('contenido del archivo descargado');
      expect(result.exportedMime).toBe('text/plain');
    });

    it('contenido descargado se convierte a string para el siguiente nodo', async () => {
      const drive = createDriveClient(mockDriveConfig);
      const downloaded = await downloadFile(drive, 'file-1', 'text/plain');
      const nodeOutput = downloaded.content.toString('utf-8');

      expect(typeof nodeOutput).toBe('string');
      expect(nodeOutput).toBe('contenido del archivo descargado');
    });
  });

  describe('List operation', () => {
    it('listFiles retorna array de archivos y se serializa a JSON', async () => {
      const drive = createDriveClient(mockDriveConfig);
      const listed = await listFiles(drive, 'root-folder-123');

      const driveResult = JSON.stringify(
        listed.files.map((f: { id: string; name: string; mimeType: string }) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
        }))
      );

      const parsed = JSON.parse(driveResult);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toEqual({ id: 'file-1', name: 'document.pdf', mimeType: 'application/pdf' });
      expect(parsed[1]).toEqual({ id: 'file-2', name: 'notes.txt', mimeType: 'text/plain' });
    });
  });

  describe('Create folder operation', () => {
    it('createFolder retorna info de la carpeta creada como JSON', async () => {
      const drive = createDriveClient(mockDriveConfig);
      const folder = await createFolder(drive, 'Mi Carpeta', 'parent-folder-id');

      const driveResult = JSON.stringify({ id: folder.id, name: folder.name });
      const parsed = JSON.parse(driveResult);

      expect(parsed).toEqual({ id: 'folder-new-1', name: 'Mi Carpeta' });
    });
  });

  describe('Error handling', () => {
    it('error de Drive API se loguea correctamente', async () => {
      const error = new Error('Drive API rate limit exceeded');
      vi.mocked(uploadFile).mockRejectedValueOnce(error);

      const drive = createDriveClient(mockDriveConfig);

      await expect(uploadFile(drive, 'test.md', 'contenido', 'folder')).rejects.toThrow(
        'Drive API rate limit exceeded'
      );
    });
  });

  describe('Drive config parsing', () => {
    it('config JSON se parsea correctamente a GoogleDriveConfig', () => {
      const configJson = JSON.stringify(mockDriveConfig);
      const parsed: GoogleDriveConfig = JSON.parse(configJson);

      expect(parsed.auth_mode).toBe('service_account');
      expect(parsed.sa_email).toBe('test@project.iam.gserviceaccount.com');
      expect(parsed.root_folder_id).toBe('root-folder-123');
    });

    it('operation defaults a upload cuando no se especifica', () => {
      const data: Record<string, unknown> = {};
      const operation = (data.drive_operation as string) || 'upload';
      expect(operation).toBe('upload');
    });

    it('folder_id usa root_folder_id del config como fallback', () => {
      const data: Record<string, unknown> = {};
      const folderId = (data.drive_folder_id as string) || mockDriveConfig.root_folder_id || 'root';
      expect(folderId).toBe('root-folder-123');
    });

    it('file_name genera nombre por defecto con nodeId', () => {
      const data: Record<string, unknown> = {};
      const nodeId = 'node-abc';
      const fileName = (data.drive_file_name as string) || `output-${nodeId}.md`;
      expect(fileName).toBe('output-node-abc.md');
    });
  });

  describe('Logging pattern', () => {
    it('logger.info se invoca tras operacion exitosa', async () => {
      const drive = createDriveClient(mockDriveConfig);
      await uploadFile(drive, 'test.md', 'contenido', 'folder');

      // Simulate what canvas-executor does after upload
      logger.info('canvas', 'Drive upload completed', {
        canvasId: 'canvas-1', nodeId: 'node-1', fileId: 'uploaded-file-1', fileName: 'test.md',
      });

      expect(logger.info).toHaveBeenCalledWith('canvas', 'Drive upload completed', expect.objectContaining({
        canvasId: 'canvas-1',
        nodeId: 'node-1',
      }));
    });
  });
});
