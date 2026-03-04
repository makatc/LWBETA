'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle, Users, TrendingUp, FileText, RotateCcw, Upload } from 'lucide-react';
import type { CompareResponseBody, AiAnalysis } from '@/app/api/compare/route';

// Monaco DiffEditor must be loaded client-side only (no SSR)
const DiffEditor = dynamic(
  () => import('@monaco-editor/react').then((m) => m.DiffEditor),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-gray-400 text-sm">Cargando editor…</div> },
);

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'input' | 'loading' | 'result';

interface PreloadInfo {
  numero: string;
  titulo: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ComparatorPage() {
  const [originalText, setOriginalText] = useState('');
  const [modifiedText, setModifiedText] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResponseBody | null>(null);
  const [preload, setPreload] = useState<PreloadInfo | null>(null);
  const [loadingPdf, setLoadingPdf] = useState<'left' | 'right' | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const leftPdfRef = useRef<HTMLInputElement>(null);
  const rightPdfRef = useRef<HTMLInputElement>(null);

  // ── Read pre-loaded measure from sessionStorage (set by "Comparar" buttons) ──
  useEffect(() => {
    const raw = sessionStorage.getItem('comparatorPreload');
    if (!raw) return;
    try {
      const { numero, titulo, extracto } = JSON.parse(raw);
      const body = extracto?.trim()
        ? extracto
        : '(Sin extracto disponible. Carga el PDF completo usando el botón "Cargar PDF" de arriba.)';
      setOriginalText(`[${numero}] ${titulo}\n\n${body}`);
      setPreload({ numero, titulo });
    } catch {
      // malformed sessionStorage entry — ignore
    } finally {
      sessionStorage.removeItem('comparatorPreload');
    }
  }, []);

  // ── PDF extraction ───────────────────────────────────────────────────────────

  async function handlePdfUpload(file: File, side: 'left' | 'right') {
    setPdfError(null);
    setLoadingPdf(side);

    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await fetch('/api/extract-pdf', { method: 'POST', body: fd });
      const json = await res.json();

      if (!res.ok) {
        setPdfError(json.error || 'Error al procesar el PDF');
        return;
      }

      if (side === 'left') {
        setOriginalText(json.text);
        setPreload(null); // preload replaced by actual PDF content
      } else {
        setModifiedText(json.text);
      }
    } catch {
      setPdfError('No se pudo conectar con el servidor para procesar el PDF');
    } finally {
      setLoadingPdf(null);
      // Reset file inputs so the same file can be re-selected
      if (side === 'left' && leftPdfRef.current) leftPdfRef.current.value = '';
      if (side === 'right' && rightPdfRef.current) rightPdfRef.current.value = '';
    }
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    if (!originalText.trim() || !modifiedText.trim()) return;

    setPhase('loading');
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalText, modifiedText }),
      });

      if (!res.ok) {
        throw new Error(`Error del servidor: ${res.status} ${res.statusText}`);
      }

      const data: CompareResponseBody = await res.json();
      setResult(data);
      setPhase('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setPhase('input');
    }
  };

  const handleReset = () => {
    setPhase('input');
    setResult(null);
    setError(null);
    setPreload(null);
    setPdfError(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="px-8 pt-8 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Comparador de Leyes</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Ingresa o carga dos textos legislativos para analizar cambios e impacto jurídico con IA.
          </p>
        </div>
        {phase === 'result' && (
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Nueva Comparación
          </button>
        )}
      </header>

      {/* ── Error Banner ── */}
      {error && (
        <div className="mx-8 mb-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-900 text-sm">Error al procesar</p>
            <p className="text-red-700 text-sm mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ── PDF Error Banner ── */}
      {pdfError && (
        <div className="mx-8 mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-amber-800 text-sm">{pdfError}</p>
          <button onClick={() => setPdfError(null)} className="ml-auto text-amber-500 hover:text-amber-700 text-xs">✕</button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PHASE: INPUT
      ══════════════════════════════════════════════════════════════════════ */}
      {(phase === 'input' || phase === 'loading') && (
        <div className="flex-1 flex flex-col px-8 pb-8 gap-6">
          {/* Text Areas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">

            {/* ── Panel Izquierdo: Estatuto Vigente ── */}
            <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-800 text-sm">Estatuto Vigente</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Pega el texto o carga un PDF</p>
                </div>
                <label
                  className={`flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    loadingPdf === 'left'
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200'
                  }`}
                >
                  {loadingPdf === 'left' ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Extrayendo…</>
                  ) : (
                    <><Upload className="w-3 h-3" /> Cargar PDF</>
                  )}
                  <input
                    ref={leftPdfRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    disabled={loadingPdf !== null || phase === 'loading'}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handlePdfUpload(f, 'left');
                    }}
                  />
                </label>
              </div>

              {/* Preload info banner */}
              {preload && originalText && (
                <div className="px-5 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2 text-xs text-blue-700">
                  <span className="font-semibold">📋 {preload.numero}</span>
                  <span className="truncate text-blue-600">{preload.titulo}</span>
                  <span className="ml-auto text-blue-400 whitespace-nowrap">· Carga el PDF para texto completo</span>
                </div>
              )}

              <textarea
                className="flex-1 p-4 font-mono text-sm text-gray-800 resize-none focus:outline-none placeholder:text-gray-400 min-h-[360px]"
                placeholder="Artículo 1. — La presente Ley tiene por objeto…"
                value={originalText}
                onChange={(e) => {
                  setOriginalText(e.target.value);
                  if (!e.target.value) setPreload(null);
                }}
                disabled={phase === 'loading' || loadingPdf !== null}
              />
              <div className="px-5 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400 text-right">
                {originalText.length.toLocaleString()} caracteres
              </div>
            </div>

            {/* ── Panel Derecho: Propuesta de Enmienda ── */}
            <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-800 text-sm">Propuesta de Enmienda</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Pega el texto o carga un PDF</p>
                </div>
                <label
                  className={`flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    loadingPdf === 'right'
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                >
                  {loadingPdf === 'right' ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Extrayendo…</>
                  ) : (
                    <><Upload className="w-3 h-3" /> Cargar PDF</>
                  )}
                  <input
                    ref={rightPdfRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    disabled={loadingPdf !== null || phase === 'loading'}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handlePdfUpload(f, 'right');
                    }}
                  />
                </label>
              </div>

              <textarea
                className="flex-1 p-4 font-mono text-sm text-gray-800 resize-none focus:outline-none placeholder:text-gray-400 min-h-[360px]"
                placeholder="Artículo 1. — Se enmienda la Ley para disponer que…"
                value={modifiedText}
                onChange={(e) => setModifiedText(e.target.value)}
                disabled={phase === 'loading' || loadingPdf !== null}
              />
              <div className="px-5 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400 text-right">
                {modifiedText.length.toLocaleString()} caracteres
              </div>
            </div>
          </div>

          {/* CTA Button */}
          <div className="flex justify-center">
            <button
              onClick={handleAnalyze}
              disabled={phase === 'loading' || !originalText.trim() || !modifiedText.trim() || loadingPdf !== null}
              className={`inline-flex items-center gap-3 px-10 py-3.5 rounded-xl font-semibold text-base transition-all shadow-lg ${
                phase === 'loading' || !originalText.trim() || !modifiedText.trim() || loadingPdf !== null
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white hover:shadow-xl'
              }`}
            >
              {phase === 'loading' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Analizando impacto…
                </>
              ) : (
                <>
                  <FileText className="w-5 h-5" />
                  Analizar Impacto y Comparar
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PHASE: RESULT — Split-screen (Monaco 70% + AI Sidebar 30%)
      ══════════════════════════════════════════════════════════════════════ */}
      {phase === 'result' && result && (
        <div className="flex flex-1 min-h-0 px-8 pb-8 gap-6">
          {/* ── Monaco DiffEditor (70%) ── */}
          <div className="flex flex-col rounded-xl shadow-sm border border-gray-200 overflow-hidden bg-white" style={{ flex: '0 0 70%' }}>
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                Estatuto Vigente
              </span>
              <span className="text-gray-300">→</span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                Propuesta de Enmienda
              </span>
            </div>
            <div className="flex-1 min-h-[600px]">
              <DiffEditor
                original={originalText}
                modified={modifiedText}
                language="plaintext"
                options={{
                  readOnly: true,
                  wordWrap: 'on',
                  renderSideBySide: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  diffWordWrap: 'on',
                }}
                theme="light"
              />
            </div>
          </div>

          {/* ── AI Intelligence Panel (30%) ── */}
          <div className="flex flex-col gap-4 overflow-y-auto" style={{ flex: '0 0 30%' }}>
            {/* AI warning if no key */}
            {result.error && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-amber-800 text-xs">{result.error}</p>
              </div>
            )}

            {result.aiAnalysis ? (
              <AiPanel analysis={result.aiAnalysis} />
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center text-gray-400 text-sm">
                <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                Análisis de IA no disponible.<br />
                Configure <code className="bg-gray-100 px-1 rounded text-xs">GEMINI_API_KEY</code> para habilitarlo.
              </div>
            )}

            {/* Raw diff stats */}
            <DiffStats diffs={result.diffs} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AiPanel({ analysis }: { analysis: AiAnalysis }) {
  return (
    <>
      {/* Executive Summary */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-blue-900 text-sm">Resumen Ejecutivo</h3>
        </div>
        <p className="text-gray-700 text-sm leading-relaxed">{analysis.executive_summary}</p>
      </div>

      {/* Stakeholders */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-indigo-600" />
          <h3 className="font-semibold text-gray-800 text-sm">Partes Afectadas</h3>
        </div>
        {Array.isArray(analysis.stakeholders_affected) && analysis.stakeholders_affected.length > 0 ? (
          <ul className="space-y-2">
            {analysis.stakeholders_affected.map((stakeholder, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-1.5 w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
                <span className="text-gray-700 text-sm">{stakeholder}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-400 text-sm">No se identificaron partes afectadas.</p>
        )}
      </div>

      {/* Long-term Forecast */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <h3 className="font-semibold text-gray-800 text-sm">Pronóstico a Largo Plazo</h3>
        </div>
        <p className="text-gray-700 text-sm leading-relaxed">{analysis.long_term_forecast}</p>
      </div>
    </>
  );
}

function DiffStats({ diffs }: { diffs: Array<{ op: number; text: string }> }) {
  const inserted = diffs.filter((d) => d.op === 1).reduce((acc, d) => acc + d.text.length, 0);
  const deleted = diffs.filter((d) => d.op === -1).reduce((acc, d) => acc + d.text.length, 0);
  const unchanged = diffs.filter((d) => d.op === 0).reduce((acc, d) => acc + d.text.length, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <h3 className="font-semibold text-gray-800 text-sm mb-3">Estadísticas de Cambios</h3>
      <div className="space-y-2">
        <StatRow label="Texto añadido" value={`${inserted.toLocaleString()} car.`} color="text-green-600" dot="bg-green-500" />
        <StatRow label="Texto eliminado" value={`${deleted.toLocaleString()} car.`} color="text-red-600" dot="bg-red-500" />
        <StatRow label="Sin cambios" value={`${unchanged.toLocaleString()} car.`} color="text-gray-500" dot="bg-gray-300" />
        <div className="pt-2 border-t border-gray-100 mt-2">
          <StatRow
            label="Total de segmentos"
            value={`${diffs.length}`}
            color="text-blue-600"
            dot="bg-blue-400"
          />
        </div>
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  color,
  dot,
}: {
  label: string;
  value: string;
  color: string;
  dot: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-gray-600">
        <span className={`w-2 h-2 rounded-full ${dot} flex-shrink-0`} />
        {label}
      </span>
      <span className={`font-medium ${color}`}>{value}</span>
    </div>
  );
}
