export const diagnosticContent = {
  openclaw: {
    name: 'OpenClaw',
    purpose: 'Procesa tus documentos con agentes IA especializados. Sin él no puedes usar la pestaña Procesar.',
    steps: [
      {
        text: 'Verifica que el servicio está activo:',
        code: 'systemctl --user status openclaw-gateway.service'
      },
      {
        text: 'Si está inactivo, arranca el servicio:',
        code: 'systemctl --user start openclaw-gateway.service'
      },
      {
        text: 'Verifica el puerto:',
        code: 'ss -ltnp | grep 18789'
      },
      {
        text: 'Reinicia si es necesario:',
        code: 'systemctl --user restart openclaw-gateway.service'
      },
      {
        text: 'Verifica la URL en tu .env:',
        code: 'cat .env | grep OPENCLAW_URL'
      }
    ]
  },
  n8n: {
    name: 'n8n',
    purpose: 'Orquesta el envío de documentos al agente y recibe los resultados. Sin él el procesamiento no se puede ejecutar.',
    steps: [
      {
        text: 'Verifica que el contenedor está corriendo:',
        code: 'docker ps | grep n8n'
      },
      {
        text: 'Si no está corriendo:',
        code: 'cd ~/automatizacionn8n && docker compose up -d'
      },
      {
        text: 'Verifica el puerto:',
        code: 'ss -ltnp | grep 5678'
      },
      {
        text: 'Accede a la UI de n8n:',
        code: 'http://192.168.1.49:5678'
      },
      {
        text: 'Asegúrate de que el webhook de DocFlow existe y está activo en n8n.',
        code: ''
      }
    ]
  },
  qdrant: {
    name: 'Qdrant',
    purpose: 'Almacena los embeddings vectoriales de tus documentos. Sin él no puedes usar la funcionalidad RAG.',
    steps: [
      {
        text: 'Verifica que el contenedor está corriendo:',
        code: 'docker ps | grep qdrant'
      },
      {
        text: 'Si no está corriendo:',
        code: 'cd ~/docflow && docker compose up -d qdrant'
      },
      {
        text: 'Verifica el puerto:',
        code: 'ss -ltnp | grep 6333'
      },
      {
        text: 'Test de conectividad:',
        code: 'curl http://192.168.1.49:6333/collections'
      }
    ]
  },
  litellm: {
    name: 'LiteLLM',
    purpose: 'Actúa como proxy de modelos LLM y genera embeddings para RAG. Sin él los agentes no pueden razonar ni se pueden crear colecciones RAG.',
    steps: [
      {
        text: 'Verifica que el contenedor está corriendo:',
        code: 'docker ps | grep antigravity-gateway'
      },
      {
        text: 'Si no está corriendo:',
        code: 'cd ~/open-antigravity-workspace && docker compose up -d'
      },
      {
        text: 'Verifica los modelos disponibles:',
        code: "curl -s http://192.168.1.49:4000/v1/models -H 'Authorization: Bearer sk-antigravity-gateway'"
      },
      {
        text: 'Verifica la URL y la API key en tu .env',
        code: 'cat .env | grep LITELLM'
      }
    ]
  }
};
