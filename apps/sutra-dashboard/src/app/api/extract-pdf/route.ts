import { NextRequest, NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';

// Must run on Node.js runtime — pdf-parse uses Node.js fs/Buffer APIs
export const runtime = 'nodejs';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json({ error: 'No se pudo leer el formulario' }, { status: 400 });
    }

    const file = formData.get('file') as File | null;

    if (!file) {
        return NextResponse.json({ error: 'No se proporcionó ningún archivo' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
        return NextResponse.json({ error: 'El archivo debe ser un PDF (.pdf)' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: 'El archivo no puede superar 10 MB' }, { status: 400 });
    }

    // Read into memory — the buffer lives only for the duration of this request
    // No disk write, no database write, no cache. GC'd when function returns.
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let data: { text: string; numpages: number };
    try {
        data = await pdfParse(buffer);
    } catch (err: any) {
        const msg = err?.message || '';
        if (msg.includes('Password')) {
            return NextResponse.json({ error: 'El PDF está protegido con contraseña' }, { status: 422 });
        }
        if (msg.includes('No unicode map')) {
            return NextResponse.json(
                { error: 'El PDF parece ser una imagen escaneada y no contiene texto extraíble' },
                { status: 422 },
            );
        }
        return NextResponse.json({ error: 'No se pudo procesar el PDF' }, { status: 422 });
    }

    const text = data.text?.trim() ?? '';

    if (!text) {
        return NextResponse.json(
            { error: 'El PDF no contiene texto extraíble (puede ser un PDF de imágenes escaneadas)' },
            { status: 422 },
        );
    }

    return NextResponse.json({ text, pages: data.numpages });
}
