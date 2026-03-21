// ---------------------------------------------------------------------------
// Install script template generators
// ---------------------------------------------------------------------------

/**
 * Generate install.sh — Bash installer for Linux/macOS.
 * Checks Docker, runs setup wizard, pulls images, starts the stack.
 */
export function generateInstallSh(): string {
  return `#!/bin/bash
set -e

echo "=== DocFlow Installer ==="
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
  echo "ERROR: Docker is not installed."
  echo "Please install Docker from https://docs.docker.com/get-docker/"
  exit 1
fi

echo "Docker found: $(docker --version)"

# Check Docker Compose
if ! docker compose version &> /dev/null; then
  echo "ERROR: Docker Compose is not available."
  echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
  exit 1
fi

echo "Docker Compose found: $(docker compose version)"
echo ""

# Run setup wizard
echo "Running setup wizard..."
node install/setup-wizard.js

# Pull images
echo ""
echo "Pulling Docker images..."
cd docker
docker compose pull

# Start the stack
echo ""
echo "Starting DocFlow..."
docker compose up -d

echo ""
echo "=== DocFlow is running ==="
echo "Open http://localhost:3500 in your browser."
`;
}

/**
 * Generate install.ps1 — PowerShell installer for Windows.
 */
export function generateInstallPs1(): string {
  return `# DocFlow Installer for Windows
$ErrorActionPreference = "Stop"

Write-Host "=== DocFlow Installer ===" -ForegroundColor Cyan
Write-Host ""

# Check Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Docker is not installed." -ForegroundColor Red
    Write-Host "Please install Docker Desktop from https://docs.docker.com/get-docker/"
    exit 1
}

Write-Host "Docker found: $(docker --version)"

# Check Docker Compose
try {
    docker compose version | Out-Null
} catch {
    Write-Host "ERROR: Docker Compose is not available." -ForegroundColor Red
    Write-Host "Please install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
}

Write-Host "Docker Compose found: $(docker compose version)"
Write-Host ""

# Run setup wizard
Write-Host "Running setup wizard..."
node install/setup-wizard.js

# Pull images
Write-Host ""
Write-Host "Pulling Docker images..."
Set-Location docker
docker compose pull

# Start the stack
Write-Host ""
Write-Host "Starting DocFlow..."
docker compose up -d

Write-Host ""
Write-Host "=== DocFlow is running ===" -ForegroundColor Green
Write-Host "Open http://localhost:3500 in your browser."
`;
}

/**
 * Generate setup-wizard.js — Node.js script that prompts for each credential
 * and writes docker/.env file.
 */
export function generateSetupWizard(credentials: string[]): string {
  const credentialPrompts = credentials
    .map(
      (c) =>
        `  await askQuestion('${c}', '${c}');`
    )
    .join('\n');

  return `#!/usr/bin/env node
// DocFlow Setup Wizard
// Prompts for required credentials and writes docker/.env

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const envValues = {};

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function askQuestion(envName, label) {
  const value = await prompt(label + ': ');
  if (value) {
    envValues[envName] = value;
  }
}

async function main() {
  console.log('');
  console.log('=== DocFlow Setup Wizard ===');
  console.log('Enter the required credentials. Press Enter to skip optional ones.');
  console.log('');

${credentialPrompts}

  rl.close();

  // Write docker/.env
  const envDir = path.join(__dirname, '..', 'docker');
  if (!fs.existsSync(envDir)) {
    fs.mkdirSync(envDir, { recursive: true });
  }

  const envPath = path.join(envDir, '.env');
  const lines = Object.entries(envValues)
    .filter(([, v]) => v)
    .map(([k, v]) => k + '=' + v);

  fs.writeFileSync(envPath, lines.join('\\n') + '\\n', 'utf-8');
  console.log('');
  console.log('Configuration saved to docker/.env');
  console.log('Run the installer again or use: cd docker && docker compose up -d');
}

main().catch((err) => {
  console.error('Setup wizard failed:', err.message);
  process.exit(1);
});
`;
}
