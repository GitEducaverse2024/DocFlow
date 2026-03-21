import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { importBundle } from '@/lib/services/bundle-importer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let tmpDir: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file || !file.name.endsWith('.zip')) {
      return NextResponse.json(
        { error: 'ZIP file required. Upload a .zip bundle file.' },
        { status: 400 }
      );
    }

    // Save uploaded ZIP to temp dir
    tmpDir = path.join(os.tmpdir(), `docflow-import-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const zipPath = path.join(tmpDir, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(zipPath, buffer);

    // Extract ZIP using unzip (available in Docker image)
    try {
      execSync(`unzip -o "${zipPath}" -d "${tmpDir}"`, {
        timeout: 30000,
        stdio: 'pipe',
      });
    } catch (unzipErr: unknown) {
      const msg = unzipErr instanceof Error ? unzipErr.message : 'Unknown error';
      return NextResponse.json(
        { error: `Failed to extract ZIP: ${msg}` },
        { status: 400 }
      );
    }

    // Find the bundle directory (first directory in extracted, or tmpDir if flat)
    const entries = fs
      .readdirSync(tmpDir)
      .filter((e) => {
        const entryPath = path.join(tmpDir as string, e);
        return fs.statSync(entryPath).isDirectory();
      });

    // Look for the directory that contains manifest.json
    let bundleDir = tmpDir;
    for (const entry of entries) {
      const candidate = path.join(tmpDir, entry);
      if (fs.existsSync(path.join(candidate, 'manifest.json'))) {
        bundleDir = candidate;
        break;
      }
    }

    const result = await importBundle(bundleDir);

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('Import error:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to import bundle';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    // Cleanup temp dir
    if (tmpDir && fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    }
  }
}
