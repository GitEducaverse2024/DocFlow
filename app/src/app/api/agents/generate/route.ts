import { NextResponse } from 'next/server';
import { llm } from '@/lib/services/llm';
import { logUsage } from '@/lib/services/usage-tracker';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      projectName, projectDescription, projectPurpose, projectTechStack,
      agentName, agentDescription, model, provider,
      // "refine" mode: improve existing minimal content
      mode, soul: existingSoul, agents: existingAgents,
    } = body;

    const chatModel = model || 'gemini-main';
    const chatProvider = provider || 'litellm';

    const techStackStr = Array.isArray(projectTechStack)
      ? projectTechStack.join(', ')
      : projectTechStack || 'No especificado';

    let prompt: string;

    if (mode === 'refine') {
      // Refine mode: improve existing minimal templates
      prompt = `Eres un experto en diseño de agentes de IA. Tu tarea es MEJORAR la configuración existente de un agente, haciéndola más específica y profesional, pero manteniendo la estructura y el idioma español.

DATOS DEL AGENTE:
- Nombre: ${agentName || 'Agente'}
- Descripción: ${agentDescription || 'No especificada'}
${projectName ? `- Proyecto: ${projectName}` : ''}
${projectPurpose ? `- Finalidad: ${projectPurpose}` : ''}
${techStackStr !== 'No especificado' ? `- Stack: ${techStackStr}` : ''}

SOUL.md ACTUAL:
${existingSoul || '(vacío)'}

AGENTS.md ACTUAL:
${existingAgents || '(vacío)'}

Mejora ambos archivos manteniendo la estructura de secciones (## headers). Hazlos más específicos al dominio del agente. Añade detalles concretos sobre su especialidad.

Responde EXCLUSIVAMENTE con un JSON válido (sin markdown fences):
{
  "soul": "contenido mejorado del SOUL.md completo con saltos de línea como \\n",
  "agents": "contenido mejorado del AGENTS.md completo con saltos de línea como \\n"
}

REGLAS:
- TODO en español
- Mantén la estructura de ## secciones
- Hazlo específico al dominio (no genérico)
- SOUL.md en primera persona ("Soy...", "Mi especialidad...")
- AGENTS.md con instrucciones operativas claras
- NO uses markdown fences en la respuesta, solo JSON puro`;
    } else if (mode === 'from-skill') {
      // From skill mode: build agent from a skill's instructions
      const { skillName, skillInstructions, skillDescription } = body;
      prompt = `Eres un experto en diseño de agentes de IA. Tu tarea es crear la configuración de un agente especializado basándote en un Skill (conjunto de instrucciones) existente.

DATOS DEL AGENTE:
- Nombre: ${agentName || 'Agente'}
- Descripción: ${agentDescription || skillDescription || 'No especificada'}

SKILL BASE:
- Nombre del skill: ${skillName || 'Sin nombre'}
- Descripción: ${skillDescription || 'Sin descripción'}
- Instrucciones del skill:
${skillInstructions || '(vacío)'}

Genera la configuración completa respondiendo EXCLUSIVAMENTE con un JSON válido (sin markdown fences):
{
  "name": "nombre profesional del agente (máximo 40 chars)",
  "emoji": "un único emoji representativo",
  "description": "descripción corta de 1-2 líneas",
  "soul": "contenido completo del SOUL.md: personalidad en primera persona, especialidad basada en el skill. Mínimo 15 líneas con secciones ## en Markdown. Usar \\n para saltos.",
  "agents": "contenido completo del AGENTS.md: instrucciones operativas basadas en las instrucciones del skill. Mínimo 15 líneas con secciones ## en Markdown. Usar \\n para saltos.",
  "identity": "contenido del IDENTITY.md: nombre, criatura/rol, vibe, emoji, descripción. Formato Markdown con bullets. Usar \\n para saltos."
}

REGLAS:
- TODO en español
- El SOUL.md debe reflejar la especialidad del skill
- El AGENTS.md debe incorporar las instrucciones del skill como flujo de trabajo
- NO uses markdown fences en la respuesta, solo JSON puro`;
    } else {
      // Full generation mode (default)
      prompt = `Eres un experto en diseño de agentes de IA. Tu tarea es generar la configuración completa de un agente especializado para un proyecto específico.

DATOS DEL PROYECTO:
- Nombre: ${projectName || 'No especificado'}
- Descripción: ${projectDescription || 'No especificada'}
- Finalidad: ${projectPurpose || 'No especificada'}
- Stack tecnológico: ${techStackStr}

DATOS INICIALES DEL AGENTE:
- Nombre sugerido: ${agentName || `Experto en ${projectName}`}
- Descripción sugerida: ${agentDescription || projectPurpose || 'Agente especializado en el proyecto'}

Genera la configuración del agente respondiendo EXCLUSIVAMENTE con un JSON válido (sin markdown fences, sin texto antes o después) con esta estructura exacta:

{
  "name": "nombre mejorado y profesional del agente (máximo 40 chars)",
  "emoji": "un único emoji que represente la especialidad del agente",
  "description": "descripción corta de 1-2 líneas sobre qué hace el agente",
  "soul": "contenido completo del archivo SOUL.md: personalidad del agente en primera persona, qué hace, qué no hace, método de trabajo. Debe ser específico al proyecto y su dominio. Mínimo 15 líneas con secciones en Markdown.",
  "agents": "contenido completo del archivo AGENTS.md: instrucciones operativas, flujo de trabajo paso a paso, formato de salida esperado, reglas de calidad. Mínimo 15 líneas con secciones en Markdown.",
  "identity": "contenido completo del archivo IDENTITY.md: nombre, criatura/rol, vibe, emoji, descripción expandida del agente. Formato Markdown con bullets."
}

REGLAS:
- El agente debe ser genuinamente experto en el dominio del proyecto. Si el stack incluye Three.js, debe conocer WebGL, shaders, React Three Fiber. Si es un negocio, debe saber de ventas, marketing, métricas.
- SOUL.md debe estar escrito en primera persona ("Soy...", "Mi especialidad es...")
- AGENTS.md debe tener instrucciones operativas claras con pasos numerados
- TODO el contenido DEBE estar en ESPAÑOL
- NO uses markdown fences en la respuesta, solo JSON puro
- Los valores de "soul", "agents" e "identity" deben usar \\n para saltos de línea dentro del JSON string`;
    }

    let content: string;
    const generateStart = Date.now();
    logger.info('agents', 'Generando agente', { model: chatModel, mode: mode || 'full' });
    try {
      content = await llm.chatCompletion({
        model: chatModel,
        provider: chatProvider,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 4000,
      });

      // Log usage (USAGE-04)
      logUsage({
        event_type: 'agent_generate',
        model: chatModel,
        provider: chatProvider,
        duration_ms: Date.now() - generateStart,
        status: 'success',
        metadata: { mode: mode || 'full' }
      });
    } catch (e) {
      logUsage({
        event_type: 'agent_generate',
        model: chatModel,
        provider: chatProvider,
        duration_ms: Date.now() - generateStart,
        status: 'failed',
        metadata: { error: (e as Error).message }
      });
      logger.error('agents', 'LLM call error', { error: (e as Error).message, model: chatModel });
      return NextResponse.json({ error: `Error al llamar a ${chatProvider}: ${(e as Error).message}` }, { status: 502 });
    }

    // Parse JSON from response
    let parsed;
    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      logger.error('agents', 'Failed to parse LLM response', { preview: content.substring(0, 200) });
      return NextResponse.json({ error: 'La IA no generó un JSON válido. Intenta de nuevo.' }, { status: 422 });
    }

    logger.info('agents', 'Agente generado', { mode: mode || 'full', name: parsed.name });

    if (mode === 'refine') {
      return NextResponse.json({
        soul: parsed.soul || existingSoul || '',
        agents: parsed.agents || existingAgents || '',
      });
    }

    return NextResponse.json({
      name: parsed.name || agentName || `Experto en ${projectName}`,
      emoji: parsed.emoji || '🤖',
      description: parsed.description || agentDescription || '',
      soul: parsed.soul || '',
      agents: parsed.agents || '',
      identity: parsed.identity || '',
    });
  } catch (error) {
    logger.error('agents', 'Error generating agent config', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
