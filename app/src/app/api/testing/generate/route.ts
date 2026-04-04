import { NextRequest, NextResponse } from 'next/server';
import { chatCompletion } from '@/lib/services/llm';
import { resolveAlias } from '@/lib/services/alias-routing';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const SECTION_SPEC_MAP: Record<string, string> = {
  navigation: 'e2e/specs/navigation.spec.ts',
  projects: 'e2e/specs/projects.spec.ts',
  sources: 'e2e/specs/sources.spec.ts',
  processing: 'e2e/specs/processing.spec.ts',
  rag: 'e2e/specs/rag.spec.ts',
  chat: 'e2e/specs/chat.spec.ts',
  agents: 'e2e/specs/agents.spec.ts',
  workers: 'e2e/specs/workers.spec.ts',
  skills: 'e2e/specs/skills.spec.ts',
  tasks: 'e2e/specs/tasks.spec.ts',
  canvas: 'e2e/specs/canvas.spec.ts',
  connectors: 'e2e/specs/connectors.spec.ts',
  catbot: 'e2e/specs/catbot.spec.ts',
  dashboard: 'e2e/specs/dashboard.spec.ts',
  settings: 'e2e/specs/settings.spec.ts',
};

const SECTION_ROUTE_MAP: Record<string, string> = {
  projects: 'src/app/api/catbrains/[id]/route.ts',
  agents: 'src/app/api/agents/route.ts',
  workers: 'src/app/api/workers/route.ts',
  skills: 'src/app/api/skills/route.ts',
  tasks: 'src/app/api/tasks/route.ts',
  connectors: 'src/app/api/connectors/route.ts',
  settings: 'src/app/api/settings/api-keys/route.ts',
};

function safeReadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { section } = body;

    if (!section || typeof section !== 'string') {
      return NextResponse.json(
        { error: 'Se requiere el campo "section"' },
        { status: 400 }
      );
    }

    const cwd = process.cwd();

    // Read existing spec file if available
    const specPath = SECTION_SPEC_MAP[section];
    const specContent = specPath
      ? safeReadFile(path.join(cwd, specPath))
      : null;

    // Read route handler source if available
    const routePath = SECTION_ROUTE_MAP[section];
    const routeContent = routePath
      ? safeReadFile(path.join(cwd, routePath))
      : null;

    const contextParts: string[] = [];
    if (specContent) {
      contextParts.push(
        `## Spec existente (${specPath}):\n\`\`\`typescript\n${specContent}\n\`\`\``
      );
    }
    if (routeContent) {
      contextParts.push(
        `## Route handler (${routePath}):\n\`\`\`typescript\n${routeContent}\n\`\`\``
      );
    }

    const systemPrompt = `Eres un generador de tests E2E con Playwright para una aplicacion Next.js en espanol.

REGLAS:
- Genera specs usando el patron Page Object Model (POM)
- Usa el idioma espanol para nombres de tests y descripciones
- Importa fixtures desde '../fixtures/test-fixtures'
- Usa selectores accesibles (getByRole, getByText, getByTestId)
- Incluye tests para happy path, edge cases y errores
- Cada test debe ser independiente
- Usa el prefijo [TEST] para datos de prueba

CONTEXTO:
Seccion: ${section}
${contextParts.join('\n\n')}

Genera un spec completo de Playwright para la seccion "${section}".`;

    const code = await chatCompletion({
      model: await resolveAlias('generate-content'),
      provider: 'litellm',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Genera un spec E2E completo de Playwright para la seccion "${section}" siguiendo el patron POM.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 8000,
    });

    return NextResponse.json({ code });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
