import React, { useState, useEffect } from 'react'
import { IconChevronDown, IconVolume, IconVolumeOff, IconMessageCircle } from './Icons.jsx'
import { speak, stopSpeaking } from '../utils/tts.js'

const SEVERITY_CONFIG = {
  Normal: {
    badge: 'badge-normal',
    dot: 'bg-emerald-500',
    border: 'border-l-emerald-400',
    label: '● Normal',
  },
  Watch: {
    badge: 'badge-watch',
    dot: 'bg-amber-500',
    border: 'border-l-amber-400',
    label: '▲ Watch',
  },
  Urgent: {
    badge: 'badge-urgent',
    dot: 'bg-rose-500',
    border: 'border-l-rose-500',
    label: '! Urgent',
  },
}

export default function FindingCard({ finding, onAskChatbot, globalSpeaking, setGlobalSpeaking, highlighted, onMouseEnter, onMouseLeave }) {
  const severityClean = (finding.severity || '').trim().toLowerCase()
  const [expanded, setExpanded] = useState(severityClean !== 'normal')
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    if (highlighted) {
      setExpanded(true)
    }
  }, [highlighted])

  const severityKey = Object.keys(SEVERITY_CONFIG).find(
    k => k.toLowerCase() === severityClean
  ) || 'Normal'
  const sc = SEVERITY_CONFIG[severityKey]

  const handleSpeak = (e) => {
    e.stopPropagation()
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
      setGlobalSpeaking(false)
    } else {
      if (globalSpeaking) stopSpeaking()
      setGlobalSpeaking(true)
      setSpeaking(true)
      const text = `${finding.test}${finding.abbreviation ? ', ' + finding.abbreviation : ''}. 
        Your value is ${finding.value}. Reference range: ${finding.referenceRange}. 
        ${finding.plainExplanation} ${finding.whatItMeans || ''}`
      speak(text, {
        onEnd: () => { setSpeaking(false); setGlobalSpeaking(false) },
        onError: () => { setSpeaking(false); setGlobalSpeaking(false) },
      })
    }
  }

  return (
    <div
      id={`finding-card-${finding.id}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`card border-l-4 ${
        highlighted
          ? 'border-l-yellow-500 highlight-glow'
          : sc.border
      } overflow-hidden transition-all duration-300 hover:shadow-md`}
    >
      {/* Header row — always visible */}
      <button
        className="w-full text-left p-4 flex items-start gap-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2 mb-1">
            <span className="font-semibold text-slate-800 dark:text-slate-100">{finding.test}</span>
            {finding.abbreviation && (
              <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">({finding.abbreviation})</span>
            )}
            <span className={sc.badge}>{sc.label}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">{finding.value}</span>
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span className="text-slate-400 dark:text-slate-500">Range: {finding.referenceRange}</span>
          </div>
        </div>
        <IconChevronDown
          className={`w-4 h-4 text-slate-400 mt-1 flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expandable content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-50 dark:border-slate-800 pt-3 space-y-3">
          {/* Abbreviation meaning */}
          {finding.abbreviationMeaning && (
            <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">
              <span className="font-mono">{finding.abbreviation}</span> = {finding.abbreviationMeaning}
            </div>
          )}

          {/* Plain explanation */}
          {finding.plainExplanation && (
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {finding.plainExplanation}
            </p>
          )}

          {/* Visual Gauge for numeric findings */}
          {(() => {
            const parsed = parseNumericFinding(finding);
            return parsed ? <NumericGauge parsed={parsed} /> : null;
          })()}

          {/* What it means */}
          {finding.whatItMeans && (
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2.5">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">What this means for you</p>
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{finding.whatItMeans}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={handleSpeak}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-medium"
            >
              {speaking ? <IconVolumeOff className="w-3.5 h-3.5" /> : <IconVolume className="w-3.5 h-3.5" />}
              {speaking ? 'Stop' : 'Read aloud'}
            </button>

            {finding.suggestedQuestion && (
              <button
                onClick={() => onAskChatbot(finding.suggestedQuestion)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-clarity-50 dark:bg-clarity-950/40 text-clarity-700 dark:text-clarity-300 hover:bg-clarity-100 dark:hover:bg-clarity-900/40 transition-colors font-medium"
              >
                <IconMessageCircle className="w-3.5 h-3.5" />
                Ask chatbot
              </button>
            )}
          </div>

          {/* Suggested question */}
          {finding.suggestedQuestion && (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic">
              💬 Ask your doctor: "{finding.suggestedQuestion}"
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Helpers to parse & render numeric findings ──────────────────────────────

export function parseNumericFinding(finding) {
  if (!finding.value || !finding.referenceRange) return null;

  // Extract patient value and unit
  const valStr = finding.value.trim();
  const valueMatch = valStr.match(/^([<>=\s]*\d+(?:\.\d+)?)\s*(.*)$/);
  if (!valueMatch) return null;

  const numericVal = parseFloat(valueMatch[1].replace(/[<>=]/g, '').trim());
  const unit = valueMatch[2].trim();

  // Unit must have letters or %
  if (!unit || !/[a-zA-Z%]/.test(unit)) return null;

  // Extract range limits
  const rangeStr = finding.referenceRange.trim();
  let low = null;
  let high = null;

  const dashMatch = rangeStr.match(/(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/);
  if (dashMatch) {
    low = parseFloat(dashMatch[1]);
    high = parseFloat(dashMatch[2]);
  } else {
    const lessMatch = rangeStr.match(/<\s*(\d+(?:\.\d+)?)/);
    if (lessMatch) {
      low = 0;
      high = parseFloat(lessMatch[1]);
    } else {
      const greaterMatch = rangeStr.match(/>\s*(\d+(?:\.\d+)?)/);
      if (greaterMatch) {
        low = parseFloat(greaterMatch[1]);
        high = null;
      }
    }
  }

  if (low === null && high === null) return null;

  return { value: numericVal, unit, low, high };
}

function NumericGauge({ parsed }) {
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

  let markerColor = 'bg-emerald-500 ring-emerald-200 dark:ring-emerald-950/60';
  let statusText = 'Normal';
  let statusTextColor = 'text-emerald-600 dark:text-emerald-400';

  if (low !== null && value < low) {
    markerColor = 'bg-amber-500 ring-amber-200 dark:ring-amber-950/60';
    statusText = 'Low';
    statusTextColor = 'text-amber-600 dark:text-amber-400';
  } else if (high !== null && value > high) {
    markerColor = 'bg-rose-500 ring-rose-200 dark:ring-rose-950/60';
    statusText = 'High';
    statusTextColor = 'text-rose-600 dark:text-rose-400';
  }

  return (
    <div className="mt-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 rounded-xl p-3.5 select-none">
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="font-semibold text-slate-500 dark:text-slate-400">Visual Level Chart</span>
        <span className={`font-bold ${statusTextColor}`}>{statusText}</span>
      </div>

      <div className="relative my-6 px-1">
        <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 flex overflow-hidden">
          <div className="w-1/4 h-full bg-amber-100 dark:bg-amber-950/30 border-r border-white/50 dark:border-slate-900/50" />
          <div className="w-1/2 h-full bg-emerald-100 dark:bg-emerald-950/30 border-r border-white/50 dark:border-slate-900/50" />
          <div className="w-1/4 h-full bg-rose-100 dark:bg-rose-950/30" />
        </div>

        <div
          className="absolute -top-2.5 -translate-x-1/2 flex flex-col items-center group"
          style={{ left: `${pct}%`, transition: 'left 0.5s ease-out' }}
        >
          <div className="absolute -top-6 bg-slate-800 dark:bg-slate-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
            {value} {unit}
          </div>
          <div className={`w-3.5 h-3.5 rounded-full ring-4 ${markerColor} transition-transform duration-200 group-hover:scale-125`} />
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono px-1">
        <div>{low !== null ? `Low limit: ${low}` : ''}</div>
        <div className="text-center font-medium bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">
          Ref Range: {low !== null && high !== null ? `${low} - ${high}` : high !== null ? `< ${high}` : `> ${low}`} {unit}
        </div>
        <div>{high !== null ? `High limit: ${high}` : ''}</div>
      </div>
    </div>
  );
}
