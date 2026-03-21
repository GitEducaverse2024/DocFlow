// ---------------------------------------------------------------------------
// Docker Compose template generator
// ---------------------------------------------------------------------------

/**
 * Generate a docker-compose.yml string with conditional services.
 * All images use pinned version tags (never `build:`).
 */
export function generateDockerCompose(
  services: string[],
  credentials: string[],
  appVersion: string
): string {
  const envVars = credentials.map((c) => `      - ${c}=\${${c}}`).join('\n');

  let yaml = `version: '3.8'

services:
  docflow:
    image: docflow/app:v${appVersion}
    ports:
      - "3500:3000"
    environment:
      - NODE_ENV=production
      - DATA_DIR=/app/data
${envVars}
    volumes:
      - docflow-data:/app/data
    restart: unless-stopped
`;

  if (services.includes('litellm')) {
    yaml += `
  litellm:
    image: ghcr.io/berriai/litellm:1.63.14
    ports:
      - "4000:4000"
    environment:
      - LITELLM_MASTER_KEY=\${LITELLM_API_KEY}
    restart: unless-stopped
`;
  }

  if (services.includes('qdrant')) {
    yaml += `
  qdrant:
    image: qdrant/qdrant:v1.12.6
    ports:
      - "6333:6333"
    volumes:
      - qdrant-data:/qdrant/storage
    restart: unless-stopped
`;
  }

  if (services.includes('ollama')) {
    yaml += `
  ollama:
    image: ollama/ollama:0.5.7
    ports:
      - "11434:11434"
    volumes:
      - ollama-data:/root/.ollama
    restart: unless-stopped
`;
  }

  yaml += `
volumes:
  docflow-data:
`;
  if (services.includes('qdrant')) yaml += `  qdrant-data:\n`;
  if (services.includes('ollama')) yaml += `  ollama-data:\n`;

  return yaml;
}
