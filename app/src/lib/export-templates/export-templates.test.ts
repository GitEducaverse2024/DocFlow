import { describe, it, expect } from 'vitest';
import { generateDockerCompose } from './docker-compose.yml';
import {
  generateInstallSh,
  generateInstallPs1,
  generateSetupWizard,
} from './install-scripts';
import { generateRunnerHtml } from './runner-html';

describe('export templates', () => {
  // -------------------------------------------------------------------------
  // Docker Compose
  // -------------------------------------------------------------------------

  it('docker-compose includes only required services with pinned versions', () => {
    const yaml = generateDockerCompose(
      ['docflow', 'litellm', 'qdrant'],
      ['LITELLM_API_KEY'],
      '15.0'
    );
    expect(yaml).toContain('qdrant/qdrant:v1.12.6');
    expect(yaml).not.toContain('ollama');
    expect(yaml).toContain('image:');
    expect(yaml).not.toContain('build:');
    expect(yaml).toContain('docflow/app:v15.0');
  });

  it('docker-compose includes ollama when requested', () => {
    const yaml = generateDockerCompose(
      ['docflow', 'litellm', 'ollama'],
      ['LITELLM_API_KEY'],
      '1.0'
    );
    expect(yaml).toContain('ollama/ollama:0.5.7');
    expect(yaml).not.toContain('qdrant');
    expect(yaml).toContain('ollama-data:');
  });

  it('docker-compose maps credential env vars', () => {
    const yaml = generateDockerCompose(
      ['docflow'],
      ['OPENAI_API_KEY', 'LITELLM_API_KEY'],
      '1.0'
    );
    expect(yaml).toContain('OPENAI_API_KEY');
    expect(yaml).toContain('LITELLM_API_KEY');
  });

  // -------------------------------------------------------------------------
  // Install scripts
  // -------------------------------------------------------------------------

  it('install.sh checks for Docker and starts the stack', () => {
    const sh = generateInstallSh();
    expect(sh).toContain('#!/bin/bash');
    expect(sh).toContain('docker');
    expect(sh).toContain('docker compose pull');
    expect(sh).toContain('docker compose up -d');
    expect(sh).toContain('setup-wizard.js');
  });

  it('install.ps1 checks for Docker with PowerShell', () => {
    const ps1 = generateInstallPs1();
    expect(ps1).toContain('Get-Command docker');
    expect(ps1).toContain('docker compose pull');
    expect(ps1).toContain('docker compose up -d');
    expect(ps1).toContain('Write-Host');
  });

  it('setup wizard prompts for all credentials', () => {
    const js = generateSetupWizard(['OPENAI_API_KEY', 'LITELLM_API_KEY']);
    expect(js).toContain('OPENAI_API_KEY');
    expect(js).toContain('LITELLM_API_KEY');
    expect(js).toContain('docker/.env');
  });

  it('setup wizard handles empty credentials list', () => {
    const js = generateSetupWizard([]);
    expect(js).toContain('Setup Wizard');
    expect(js).toContain('.env');
  });

  // -------------------------------------------------------------------------
  // Runner HTML
  // -------------------------------------------------------------------------

  it('runner HTML contains task ID and polls at 2s interval', () => {
    const html = generateRunnerHtml('abc-123', 'Mi Tarea');
    expect(html).toContain('abc-123');
    expect(html).toContain('pollStatus');
    expect(html).toContain('2000');
  });

  it('runner HTML has dark theme and violet accent', () => {
    const html = generateRunnerHtml('t1', 'Test');
    expect(html).toContain('#0a0a0a');
    expect(html).toContain('#7c3aed');
  });

  it('runner HTML has execute button and download button', () => {
    const html = generateRunnerHtml('t1', 'Test');
    expect(html).toContain('Ejecutar tarea');
    expect(html).toContain('Descargar resultado');
  });

  it('runner HTML escapes special characters in task name', () => {
    const html = generateRunnerHtml('t1', 'Task <script>alert("xss")</script>');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});
