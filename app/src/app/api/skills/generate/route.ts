import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { resolveAlias } from '@/lib/services/alias-routing';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, category, model } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
    const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
    const llmModel = model || await resolveAlias('generate-content');

    logger.info('skills', 'Generando skill', { model: llmModel, name });

    const prompt = `Eres un experto en diseño de prompts e instrucciones para agentes de IA. Necesito que generes la configuración completa para un "Skill" — un paquete de instrucciones reutilizable que modifica el comportamiento de un agente de documentación.

DATOS DEL SKILL:
- Nombre: ${name}
- Descripción: ${description || 'No especificada'}
- Categoría: ${category || 'documentation'}

GENERA exactamente este JSON (sin texto adicional, solo el JSON):
{
  "instructions": "Instrucciones detalladas y específicas que se inyectarán en el prompt del agente. Deben ser claras, paso a paso, con reglas y restricciones. Mínimo 150 palabras.",
  "output_template": "Plantilla/esqueleto del formato de salida que este skill espera generar. Puede ser null si el skill no modifica la estructura.",
  "example_input": "Un ejemplo corto de qué tipo de documentación recibiría (2-3 líneas).",
  "example_output": "Un ejemplo corto de qué generaría con este skill aplicado (5-10 líneas).",
  "constraints": "Restricciones o reglas que el agente DEBE respetar cuando este skill está activo.",
  "tags": ["tag1", "tag2", "tag3"]
}

IMPORTANTE: Responde SOLO con el JSON válido, sin markdown, sin backticks, sin texto antes o después.`;

    const response = await fetch(`${litellmUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${litellmKey}`
      },
      body: JSON.stringify({
        model: llmModel,
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';

    let parsed;
    try {
      const cleaned = content.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({
        instructions: content,
        output_template: '',
        example_input: '',
        example_output: '',
        constraints: '',
        tags: [],
        raw: true
      });
    }

    logger.info('skills', 'Skill generado', { name });
    return NextResponse.json(parsed);
  } catch (error) {
    logger.error('skills', 'Error generando skill', { error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
