import { NextRequest, NextResponse } from 'next/server';
import { DiffMatchPatch, DiffOp, type Diff } from 'diff-match-patch-ts';
import OpenAI from 'openai';

export interface CompareRequestBody {
  originalText: string;
  modifiedText: string;
}

export interface AiAnalysis {
  executive_summary: string;
  stakeholders_affected: string[];
  long_term_forecast: string;
}

export interface CompareResponseBody {
  diffs: Array<{ op: number; text: string }>;
  addedText: string;
  deletedText: string;
  aiAnalysis: AiAnalysis | null;
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<CompareResponseBody>> {
  let body: CompareRequestBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { diffs: [], addedText: '', deletedText: '', aiAnalysis: null, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { originalText, modifiedText } = body;

  if (typeof originalText !== 'string' || typeof modifiedText !== 'string') {
    return NextResponse.json(
      { diffs: [], addedText: '', deletedText: '', aiAnalysis: null, error: 'originalText and modifiedText are required strings' },
      { status: 400 },
    );
  }

  // ─── Phase 2: Diff computation ───────────────────────────────────────────────
  const dmp = new DiffMatchPatch();
  const diffs: Diff[] = dmp.diff_main(originalText, modifiedText);
  dmp.diff_cleanupSemantic(diffs);

  const addedText = diffs
    .filter(([op]) => op === DiffOp.Insert)
    .map(([, text]) => text)
    .join('\n');

  const deletedText = diffs
    .filter(([op]) => op === DiffOp.Delete)
    .map(([, text]) => text)
    .join('\n');

  const serialisedDiffs = diffs.map(([op, text]) => ({ op, text }));

  // ─── Phase 3: AI analysis ────────────────────────────────────────────────────
  let aiAnalysis: AiAnalysis | null = null;

  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey && addedText.length + deletedText.length > 0) {
    try {
      const openai = new OpenAI({ apiKey });

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Eres un analista experto en políticas públicas y derecho legislativo.
Se te proporcionan fragmentos de texto eliminados y añadidos resultantes de la comparación entre
un estatuto vigente y una propuesta de enmienda.
Tu tarea es analizar el impacto jurídico, político y económico de estos cambios.
Responde ÚNICAMENTE con un objeto JSON válido que siga este esquema exacto:
{
  "executive_summary": "Resumen conciso en lenguaje claro de los cambios",
  "stakeholders_affected": ["lista", "de", "partes", "afectadas"],
  "long_term_forecast": "Predicción de las consecuencias a largo plazo en política o economía"
}`,
          },
          {
            role: 'user',
            content: `TEXTO ELIMINADO (estatuto vigente):\n${deletedText || '(ninguno)'}\n\nTEXTO AÑADIDO (propuesta de enmienda):\n${addedText || '(ninguno)'}`,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? '{}';
      aiAnalysis = JSON.parse(raw) as AiAnalysis;
    } catch (err) {
      console.error('[compare/route] OpenAI error:', err);
      // Return diffs even if AI fails; surface error in response field
      return NextResponse.json({
        diffs: serialisedDiffs,
        addedText,
        deletedText,
        aiAnalysis: null,
        error: 'Análisis de IA no disponible. Verifique la variable OPENAI_API_KEY.',
      });
    }
  }

  return NextResponse.json({
    diffs: serialisedDiffs,
    addedText,
    deletedText,
    aiAnalysis,
  });
}
