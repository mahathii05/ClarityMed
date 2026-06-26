import React, { useState, useRef, useEffect } from 'react'
import SummaryCard from './SummaryCard.jsx'
import FindingCard, { parseNumericFinding } from './FindingCard.jsx'
import ChatPanel from './ChatPanel.jsx'
import DietPlanner from './DietPlanner.jsx'
import NextActions from './NextActions.jsx'
import DisclaimerBanner from './DisclaimerBanner.jsx'
import { generateReportPDF } from '../utils/pdfGenerate.js'
import { stopSpeaking } from '../utils/tts.js'

const TABS = [
  { id: 'results',  label: '🔬 Results' },
  { id: 'diet',     label: '🥗 Diet Plan' },
  { id: 'actions',  label: '📋 Next Steps' },
  { id: 'chat',     label: '💬 Ask AI' },
]

export default function ReportView({ reportData, originalText, uploadedFile }) {
  const [activeTab, setActiveTab] = useState('results')
  const [viewMode, setViewMode] = useState('split') // split | simplified | original
  const [originalLayout, setOriginalLayout] = useState('pdf') // pdf | text
  const [summarySpeaking, setSummarySpeaking] = useState(false)
  const [globalSpeaking, setGlobalSpeaking] = useState(false)
  const [highlightedFindingId, setHighlightedFindingId] = useState(null)

  const [pdfUrl] = useState(() => uploadedFile ? URL.createObjectURL(uploadedFile) : null)

  const handleSummarySelect = (findingId) => {
    setHighlightedFindingId(findingId);
    setActiveTab('results');
    if (viewMode === 'original') {
      setViewMode('split');
    }
    setOriginalLayout('text');
    setTimeout(() => {
      const cardEl = document.getElementById(`finding-card-${findingId}`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const segmentEl = document.getElementById(`original-segment-${findingId}`);
      if (segmentEl) {
        segmentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);
  };

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection().toString().trim().toLowerCase();
      if (!selection || selection.length < 3) return;

      const matchingFinding = reportData.findings.find(f => {
        const query = selection.toLowerCase();
        const testName = f.test?.toLowerCase() || '';
        const abbrev = f.abbreviation?.toLowerCase() || '';
        const meaning = f.abbreviationMeaning?.toLowerCase() || '';
        const val = f.value?.toLowerCase() || '';
        const explanation = f.plainExplanation?.toLowerCase() || '';
        const means = f.whatItMeans?.toLowerCase() || '';

        return testName.includes(query) || query.includes(testName) || 
               (abbrev && (abbrev.includes(query) || query.includes(abbrev))) ||
               meaning.includes(query) ||
               val.includes(query) ||
               explanation.includes(query) ||
               means.includes(query);
      });

      if (matchingFinding) {
        setHighlightedFindingId(matchingFinding.id);
        const cardEl = document.getElementById(`finding-card-${matchingFinding.id}`);
        if (cardEl) {
          cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [reportData]);

  const leftScrollRef = useRef(null)
  const rightScrollRef = useRef(null)

  const handleOriginalDoubleClick = () => {
    const selection = window.getSelection().toString().trim().toLowerCase();
    if (!selection) return;

    const matchingFinding = reportData.findings.find(f => {
      const testName = f.test.toLowerCase();
      const abbrev = f.abbreviation?.toLowerCase();
      return testName.includes(selection) || selection.includes(testName) || 
             (abbrev && (abbrev.includes(selection) || selection.includes(abbrev)));
    });

    if (matchingFinding) {
      setHighlightedFindingId(matchingFinding.id);
      setTimeout(() => {
        const cardEl = document.getElementById(`finding-card-${matchingFinding.id}`);
        if (cardEl) {
          cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    }
  };

  const highlightSegments = (text, findings, highlightedId, onHover, onClick) => {
    if (!text) return '';
    if (!findings || findings.length === 0) return text;

    const matches = [];
    findings.forEach(f => {
      const term = (f.originalSegment || f.test || '').trim();
      if (!term) return;

      let startIdx = 0;
      const lowerText = text.toLowerCase();
      const lowerTerm = term.toLowerCase();

      while (true) {
        const idx = lowerText.indexOf(lowerTerm, startIdx);
        if (idx === -1) break;
        matches.push({
          finding: f,
          term: term,
          start: idx,
          end: idx + term.length
        });
        startIdx = idx + term.length;
      }
    });

    matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const cleanMatches = [];
    let lastEnd = 0;
    matches.forEach(m => {
      if (m.start >= lastEnd) {
        cleanMatches.push(m);
        lastEnd = m.end;
      }
    });

    const elements = [];
    let currentIdx = 0;
    cleanMatches.forEach((m, idx) => {
      if (m.start > currentIdx) {
        elements.push(<span key={`text-${currentIdx}`}>{text.substring(currentIdx, m.start)}</span>);
      }

      const isHighlighted = highlightedId === m.finding.id;
      const segmentText = text.substring(m.start, m.end);

      elements.push(
        <span
          key={`segment-${m.finding.id}-${idx}`}
          id={`original-segment-${m.finding.id}`}
          onMouseEnter={() => onHover(m.finding.id)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onClick(m.finding.id)}
          className={`transition-all duration-200 cursor-pointer rounded-sm px-1 py-0.5 ${
            isHighlighted
              ? 'bg-yellow-250 dark:bg-yellow-800/80 text-slate-900 dark:text-slate-100 ring-2 ring-yellow-400 font-semibold shadow-sm'
              : 'hover:bg-yellow-100/60 dark:hover:bg-slate-800/60'
          }`}
        >
          {segmentText}
        </span>
      );
      currentIdx = m.end;
    });

    if (currentIdx < text.length) {
      elements.push(<span key={`text-${currentIdx}`}>{text.substring(currentIdx)}</span>);
    }

    return elements;
  };

  const handleSegmentHover = (findingId) => {
    setHighlightedFindingId(findingId);
    if (findingId) {
      const cardEl = document.getElementById(`finding-card-${findingId}`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  };

  const handleCardHover = (findingId) => {
    setHighlightedFindingId(findingId);
    if (findingId) {
      const segmentEl = document.getElementById(`original-segment-${findingId}`);
      if (segmentEl) {
        segmentEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  };

  const numericFindings = reportData.findings
    .map(finding => {
      const parsed = parseNumericFinding(finding);
      if (parsed) {
        parsed.test = finding.test;
      }
      return { finding, parsed };
    })
    .filter(item => item.parsed !== null);



  const handleDownloadPDF = () => generateReportPDF(reportData)

  const reportContext = `
Report Type: ${reportData.reportType || 'Medical Report'}
Patient: ${reportData.patientName || 'Unknown'}
Date: ${reportData.reportDate || 'Unknown'}
Summary: ${reportData.summary}

Findings:
${reportData.findings.map(f =>
  `- ${f.test}${f.abbreviation ? ` (${f.abbreviation})` : ''}: ${f.value} [Range: ${f.referenceRange}] — ${f.severity}
   ${f.plainExplanation}
   ${f.whatItMeans ? 'What it means: ' + f.whatItMeans : ''}`
).join('\n')}`.trim()

  return (
    <div className="max-w-6xl mx-auto px-4 pb-16">
      {/* Severity legend */}
      <div className="flex flex-wrap items-center gap-3 mb-4 no-print">
        <span className="text-xs text-slate-400 font-medium">Severity:</span>
        <span className="badge-normal">● Normal</span>
        <span className="badge-watch">▲ Watch</span>
        <span className="badge-urgent">! Urgent</span>
      </div>

      <DisclaimerBanner />

      {/* Summary card always on top */}
      <div className="mt-4 mb-5">
        <SummaryCard
          data={reportData}
          onDownloadPDF={handleDownloadPDF}
          speaking={summarySpeaking}
          setSpeaking={setSummarySpeaking}
        />
      </div>

      {/* Findings Summary Dashboard */}
      {reportData.findings && reportData.findings.length > 0 && (
        <div className="card p-6 mb-6 no-print">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3 text-sm flex items-center gap-2">
            <span>📊 Medical Findings Summary Dashboard</span>
            <span className="text-xs font-normal text-slate-400">({reportData.findings.length} findings summarized · Click any item to view details)</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
            {reportData.findings.map((finding) => {
              const parsed = parseNumericFinding(finding);
              if (parsed) {
                parsed.test = finding.test;
                return (
                  <CompactGauge
                    key={finding.id}
                    findingId={finding.id}
                    parsed={parsed}
                    severity={finding.severity}
                    onSelect={handleSummarySelect}
                  />
                );
              } else {
                return (
                  <CompactSeverityGauge
                    key={finding.id}
                    findingId={finding.id}
                    test={finding.test}
                    value={finding.value}
                    referenceRange={finding.referenceRange}
                    severity={finding.severity}
                    onSelect={handleSummarySelect}
                  />
                );
              }
            })}
          </div>
        </div>
      )}

      {/* Main tab navigation */}
      <div className="flex gap-1 bg-slate-100/70 dark:bg-slate-800/50 rounded-2xl p-1 mb-6 no-print">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 px-2 rounded-xl text-sm transition-all duration-200 ${
              activeTab === tab.id ? 'tab-active' : 'tab-inactive'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Results tab */}
      {activeTab === 'results' && (
        <div className="fade-in">
          {/* View toggle */}
          <div className="flex flex-wrap items-center gap-2 mb-4 no-print text-xs">
            <span className="text-slate-400 font-medium">Layout:</span>
            <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('split')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  viewMode === 'split' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Side-by-side
              </button>
              <button
                onClick={() => setViewMode('simplified')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  viewMode === 'simplified' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Simplified Only
              </button>
              <button
                onClick={() => setViewMode('original')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  viewMode === 'original' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Original Only
              </button>
            </div>
            <span className="text-slate-400 ml-auto">{reportData.findings.length} results</span>
          </div>

          {viewMode === 'split' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Original Column: Switchable PDF/Interactive Text */}
              <div className="card p-0 flex flex-col h-[650px] overflow-hidden border border-slate-100 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-950/40 shadow-sm">
                <div className="flex items-center justify-between px-5 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/80 no-print text-xs flex-shrink-0">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Original Document</span>
                  <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 border border-slate-200/50 dark:border-slate-700">
                    <button
                      onClick={() => setOriginalLayout('pdf')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        originalLayout === 'pdf'
                          ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      📄 PDF View
                    </button>
                    <button
                      onClick={() => setOriginalLayout('text')}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        originalLayout === 'text'
                          ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      ⚡ Interactive Text
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col">
                  {originalLayout === 'pdf' ? (
                    <iframe
                      src={pdfUrl}
                      className="w-full h-full border-0"
                      title="Original PDF Report"
                    />
                  ) : (
                    <div
                      ref={leftScrollRef}
                      className="flex-1 overflow-y-auto p-4 bg-slate-50/60 dark:bg-slate-950/20"
                    >
                      <div className="max-w-2xl mx-auto my-2 p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/50 shadow-sm rounded-2xl min-h-full font-mono text-sm leading-relaxed whitespace-pre-wrap select-text selection:bg-yellow-250/60 dark:selection:bg-yellow-900/60">
                        {highlightSegments(
                          originalText,
                          reportData.findings,
                          highlightedFindingId,
                          handleSegmentHover,
                          (findingId) => {
                            setHighlightedFindingId(findingId);
                            const cardEl = document.getElementById(`finding-card-${findingId}`);
                            if (cardEl) {
                              cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                          }
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Simplified Column */}
              <div
                ref={rightScrollRef}
                className="space-y-3 h-[650px] overflow-y-auto pr-1"
              >
                {[...reportData.findings]
                  .sort((a, b) => {
                    const order = { urgent: 0, watch: 1, normal: 2 };
                    const sevA = order[(a.severity || '').trim().toLowerCase()] ?? 2;
                    const sevB = order[(b.severity || '').trim().toLowerCase()] ?? 2;
                    return sevA - sevB;
                  })
                  .map(finding => (
                    <FindingCard
                      key={finding.id}
                      finding={finding}
                      onAskChatbot={(q) => { setActiveTab('chat') }}
                      globalSpeaking={globalSpeaking}
                      setGlobalSpeaking={(v) => { setGlobalSpeaking(v); if (!v) stopSpeaking() }}
                      highlighted={finding.id === highlightedFindingId}
                      onMouseEnter={() => handleCardHover(finding.id)}
                      onMouseLeave={() => handleCardHover(null)}
                    />
                  ))
                }
              </div>
            </div>
          )}

          {viewMode === 'simplified' && (
            <div className="space-y-3 fade-in">
              {[...reportData.findings]
                .sort((a, b) => {
                const order = { urgent: 0, watch: 1, normal: 2 };
                const sevA = order[(a.severity || '').trim().toLowerCase()] ?? 2;
                const sevB = order[(b.severity || '').trim().toLowerCase()] ?? 2;
                return sevA - sevB;
              })
                .map(finding => (
                  <FindingCard
                    key={finding.id}
                    finding={finding}
                    onAskChatbot={(q) => { setActiveTab('chat') }}
                    globalSpeaking={globalSpeaking}
                    setGlobalSpeaking={(v) => { setGlobalSpeaking(v); if (!v) stopSpeaking() }}
                    highlighted={finding.id === highlightedFindingId}
                    onMouseEnter={() => handleCardHover(finding.id)}
                    onMouseLeave={() => handleCardHover(null)}
                  />
                ))
              }
            </div>
          )}

          {viewMode === 'original' && (
            <div className="card p-0 flex flex-col h-[800px] max-w-4xl mx-auto overflow-hidden border border-slate-100 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-950/40 shadow-md fade-in">
              <div className="flex items-center justify-between px-5 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/80 no-print text-xs flex-shrink-0">
                <span className="font-semibold text-slate-500 dark:text-slate-400">Original Document</span>
                <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 border border-slate-200/50 dark:border-slate-700">
                  <button
                    onClick={() => setOriginalLayout('pdf')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      originalLayout === 'pdf'
                        ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    📄 PDF View
                  </button>
                  <button
                    onClick={() => setOriginalLayout('text')}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      originalLayout === 'text'
                        ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    ⚡ Interactive Text
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col">
                {originalLayout === 'pdf' ? (
                  <iframe
                    src={pdfUrl}
                    className="w-full h-full border-0"
                    title="Original PDF Report"
                  />
                ) : (
                  <div
                    ref={leftScrollRef}
                    className="flex-1 overflow-y-auto p-5 bg-slate-50/60 dark:bg-slate-900/40"
                  >
                    <div className="max-w-2xl mx-auto my-2 p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/50 shadow-sm rounded-2xl min-h-full font-mono text-sm leading-relaxed whitespace-pre-wrap select-text selection:bg-yellow-250/60 dark:selection:bg-yellow-900/60">
                      {highlightSegments(
                        originalText,
                        reportData.findings,
                        highlightedFindingId,
                        handleSegmentHover,
                        (findingId) => {
                          setHighlightedFindingId(findingId);
                          const cardEl = document.getElementById(`finding-card-${findingId}`);
                          if (cardEl) {
                            cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Diet tab */}
      {activeTab === 'diet' && (
        <div className="max-w-2xl mx-auto fade-in">
          <DietPlanner reportData={reportData} />
        </div>
      )}

      {/* Actions tab */}
      {activeTab === 'actions' && (
        <div className="max-w-2xl mx-auto fade-in">
          <NextActions reportData={reportData} />
        </div>
      )}

      {/* Chat tab */}
      {activeTab === 'chat' && (
        <div className="max-w-2xl mx-auto fade-in">
          <ChatPanel reportContext={reportContext} />
        </div>
      )}
    </div>
  )
}

function CompactGauge({ findingId, parsed, severity, onSelect }) {
  const { value, unit, low, high } = parsed;

  const getPercent = () => {
    if (low !== null && high !== null) {
      const range = high - low;
      if (range <= 0) return 50;
      if (value < low) {
        const ratio = low > 0 ? value / low : 0;
        return Math.max(5, ratio * 20 + 5);
      } else if (value > high) {
        const diff = value - high;
        const ratio = diff / range;
        return Math.min(95, 75 + ratio * 20);
      } else {
        return 25 + ((value - low) / range) * 50;
      }
    } else if (low !== null) {
      if (value < low) {
        const ratio = low > 0 ? value / low : 0;
        return Math.max(5, ratio * 30);
      } else {
        const ratio = (value - low) / low;
        return Math.min(95, 35 + ratio * 30);
      }
    } else if (high !== null) {
      if (value > high) {
        const ratio = (value - high) / high;
        return Math.min(95, 65 + ratio * 30);
      } else {
        const ratio = value / high;
        return Math.max(5, ratio * 60);
      }
    }
    return 50;
  };

  const pct = getPercent();

  const sev = (severity || '').trim().toLowerCase();
  let dotColor = 'bg-emerald-500 shadow-emerald-500/20';
  let barColor = 'bg-emerald-500';
  if (sev === 'watch') {
    dotColor = 'bg-amber-500 shadow-amber-500/20';
    barColor = 'bg-amber-500';
  } else if (sev === 'urgent') {
    dotColor = 'bg-rose-500 shadow-rose-500/20';
    barColor = 'bg-rose-500';
  }

  return (
    <div 
      onClick={() => onSelect(findingId)}
      className="flex items-center gap-4 py-2 px-2 -mx-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer rounded-xl border-b border-slate-100 dark:border-slate-800/60 last:border-0 text-xs transition-colors"
    >
      <div className="w-1/4 font-semibold text-slate-700 dark:text-slate-300 truncate" title={parsed.test}>
        {parsed.test}
      </div>

      <div className="flex-1 relative h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className="absolute left-[25%] right-[25%] h-full bg-slate-200 dark:bg-slate-700/50" />
        <div
          className={`absolute left-0 top-0 h-full rounded-full ${barColor}`}
          style={{ width: `${pct}%`, transition: 'width 0.5s ease-out' }}
        />
      </div>

      <div className="w-1/3 text-right font-mono text-slate-500 dark:text-slate-400">
        <span className="font-bold text-slate-700 dark:text-slate-200">{value}</span> {unit}{' '}
        <span className="text-[10px] text-slate-400">
          [Normal: {low !== null && high !== null ? `${low}-${high}` : high !== null ? `<${high}` : `>${low}`}]
        </span>
      </div>

      <div className={`w-2.5 h-2.5 rounded-full shadow-sm flex-shrink-0 ${dotColor}`} />
    </div>
  );
}

function CompactSeverityGauge({ findingId, test, value, referenceRange, severity, onSelect }) {
  const sev = (severity || '').trim().toLowerCase();
  let b1 = 'bg-slate-200 dark:bg-slate-800';
  let b2 = 'bg-slate-200 dark:bg-slate-800';
  let b3 = 'bg-slate-200 dark:bg-slate-800';
  
  if (sev === 'normal') {
    b1 = 'bg-emerald-500 shadow-sm shadow-emerald-500/20';
  } else if (sev === 'watch') {
    b2 = 'bg-amber-500 shadow-sm shadow-amber-500/20';
  } else if (sev === 'urgent') {
    b3 = 'bg-rose-500 shadow-sm shadow-rose-500/20';
  }

  let dotColor = 'bg-emerald-500 shadow-emerald-500/20';
  if (sev === 'watch') {
    dotColor = 'bg-amber-500 shadow-amber-500/20';
  } else if (sev === 'urgent') {
    dotColor = 'bg-rose-500 shadow-rose-500/20';
  }

  const cleanRef = referenceRange && referenceRange !== 'null' ? referenceRange : 'Normal';

  return (
    <div 
      onClick={() => onSelect(findingId)}
      className="flex items-center gap-4 py-2 px-2 -mx-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer rounded-xl border-b border-slate-100 dark:border-slate-800/60 last:border-0 text-xs transition-colors"
    >
      <div className="w-1/4 font-semibold text-slate-700 dark:text-slate-300 truncate" title={test}>
        {test}
      </div>

      <div className="flex-1 flex gap-1.5 justify-center items-center px-2">
        <div className={`h-2.5 flex-1 rounded-sm transition-all duration-300 ${b1}`} title="Normal" />
        <div className={`h-2.5 flex-1 rounded-sm transition-all duration-300 ${b2}`} title="Watch" />
        <div className={`h-2.5 flex-1 rounded-sm transition-all duration-300 ${b3}`} title="Urgent" />
      </div>

      <div className="w-1/3 text-right font-mono text-slate-500 dark:text-slate-400">
        <span className="font-bold text-slate-700 dark:text-slate-200">{value}</span>{' '}
        <span className="text-[10px] text-slate-400">
          [Ref: {cleanRef}]
        </span>
      </div>

      <div className={`w-2.5 h-2.5 rounded-full shadow-sm flex-shrink-0 ${dotColor}`} />
    </div>
  );
}

