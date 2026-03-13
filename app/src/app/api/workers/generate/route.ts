import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, outputFormat, model } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
    const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
    const llmModel = model || 'gemini-main';

    logger.info('workers', 'Generando worker', { model: llmModel, name });

    const prompt = `Eres un experto en diseño de prompts y automatización documental. Necesito que generes la configuración completa para un "Docs Worker" — un agente especializado en transformar documentación.

DATOS DEL WORKER:
- Nombre: ${name}
- Descripción: ${description || 'No especificada'}
- Formato de salida: ${outputFormat || 'md'}

GENERA exactamente este JSON (sin texto adicional, solo el JSON):
{
  "system_prompt": "Instrucciones detalladas paso a paso para el worker. Debe incluir: rol del worker, reglas de procesamiento, estructura del output esperado, y cualquier restricción relevante. Mínimo 200 palabras.",
  "output_template": "Plantilla/esqueleto del formato de salida en ${outputFormat || 'md'}. Debe ser una estructura clara que el worker rellenará.",
  "example_input": "Un ejemplo corto de qué tipo de documentación recibiría este worker como input (2-3 líneas).",
  "example_output": "Un ejemplo corto de qué generaría este worker como output (5-10 líneas)."
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

    // Try to parse as JSON, handling possible markdown wrapping
    let parsed;
    try {
      // Remove possible markdown code block wrapping
      const cleaned = content.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({
        system_prompt: content,
        output_template: '',
        example_input: '',
        example_output: '',
        raw: true
      });
    }

    logger.info('workers', 'Worker generado', { name });
    return NextResponse.json(parsed);
  } catch (error) {
    logger.error('workers', 'Error generando worker', { error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
