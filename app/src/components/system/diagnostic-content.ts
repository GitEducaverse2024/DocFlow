export const diagnosticContent: Record<string, { name: string; codes: string[] }> = {
  openclaw: {
    name: 'OpenClaw',
    codes: [
      'systemctl --user status openclaw-gateway.service',
      'systemctl --user start openclaw-gateway.service',
      'ss -ltnp | grep 18789',
      'systemctl --user restart openclaw-gateway.service',
      'cat .env | grep OPENCLAW_URL'
    ]
  },
  n8n: {
    name: 'n8n',
    codes: [
      'docker ps | grep n8n',
      'cd ~/automatizacionn8n && docker compose up -d',
      'ss -ltnp | grep 5678',
      'http://localhost:5678',
      ''
    ]
  },
  qdrant: {
    name: 'Qdrant',
    codes: [
      'docker ps | grep qdrant',
      'cd ~/docflow && docker compose up -d qdrant',
      'ss -ltnp | grep 6333',
      'curl http://localhost:6333/collections'
    ]
  },
  litellm: {
    name: 'LiteLLM',
    codes: [
      'docker ps | grep antigravity-gateway',
      'cd ~/open-antigravity-workspace && docker compose up -d',
      "curl -s http://localhost:4000/v1/models -H 'Authorization: Bearer sk-antigravity-gateway'",
      'cat .env | grep LITELLM'
    ]
  },
  searxng: {
    name: 'SearXNG',
    codes: [
      'docker ps | grep docflow-searxng',
      'cd ~/docflow && docker compose up -d docflow-searxng',
      'ss -ltnp | grep 8080',
      'curl "http://localhost:8080/search?q=test&format=json"',
      'cat .env | grep SEARXNG_URL'
    ]
  }
};
