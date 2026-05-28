import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Square, Download, Trash2, ChevronDown, ChevronUp,
  MapPin, Layers, FileText, FileJson, RefreshCw, AlertCircle, CheckCircle2,
} from 'lucide-react';
import type { Lead, ScrapeStatus, ScrapeSession } from './types';
import { StatusBadge } from './components/StatusBadge';
import { LeadCard } from './components/LeadCard';
import { downloadCSV, downloadJSON } from './lib/export';

// ── Chrome API shim for development outside extension context ─────────────────
declare const chrome: {
  runtime: {
    sendMessage: (msg: unknown) => Promise<unknown>;
    onMessage: {
      addListener: (cb: (msg: unknown) => void) => void;
      removeListener: (cb: (msg: unknown) => void) => void;
    };
  };
  tabs: {
    query: (opts: unknown) => Promise<{ id?: number; url?: string }[]>;
  };
};

const isChromeExtension = typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage !== undefined;

function sendMsg<T = unknown>(msg: unknown): Promise<T> {
  if (!isChromeExtension) return Promise.resolve({} as T);
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'scraper' | 'leads' | 'sessions';

interface ScrapeMsg {
  type: string;
  payload?: {
    status?: string;
    leadsFound?: number;
    message?: string;
    totalLeads?: number;
    sessionId?: string;
  };
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('scraper');
  const [keyword, setKeyword] = useState('');
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [leadsFound, setLeadsFound] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sessions, setSessions] = useState<ScrapeSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [mapsTabId, setMapsTabId] = useState<number | null>(null);
  const liveLeadsRef = useRef<Lead[]>([]);

  // Show toast helper
  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Listen for messages from background script
  useEffect(() => {
    if (!isChromeExtension) return;

    const handler = (raw: unknown) => {
      const msg = raw as ScrapeMsg;
      if (msg.type === 'SCRAPE_STATUS') {
        if (msg.payload?.status) setScrapeStatus(msg.payload.status as ScrapeStatus);
        if (msg.payload?.leadsFound !== undefined) setLeadsFound(msg.payload.leadsFound);
        if (msg.payload?.message) setStatusMsg(msg.payload.message);
      } else if (msg.type === 'LEAD_FOUND') {
        const lead = (msg as { type: string; payload: Lead }).payload;
        liveLeadsRef.current = [lead, ...liveLeadsRef.current];
        setLeads([...liveLeadsRef.current]);
        setLeadsFound((n) => n + 1);
      } else if (msg.type === 'SCRAPE_COMPLETE') {
        setScrapeStatus('completed');
        setStatusMsg(`Done! ${msg.payload?.totalLeads ?? leadsFound} leads collected.`);
        showToast(`Scraping complete — ${msg.payload?.totalLeads ?? leadsFound} leads saved.`);
      } else if (msg.type === 'SCRAPE_ERROR') {
        setScrapeStatus('error');
        setStatusMsg((msg.payload as { message?: string })?.message || 'Unknown error');
        showToast((msg.payload as { message?: string })?.message || 'Scraping failed.', 'error');
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [leadsFound, showToast]);

  // Detect Google Maps tab
  useEffect(() => {
    if (!isChromeExtension) return;
    chrome.tabs
      .query({ active: true, currentWindow: true } as unknown)
      .then((tabs) => {
        const tab = tabs[0];
        if (tab?.url?.includes('google.com/maps') || tab?.url?.includes('maps.google.com')) {
          setMapsTabId(tab.id ?? null);
        }
      })
      .catch(() => {});
  }, []);

  // Load sessions
  const loadSessions = useCallback(async () => {
    const res = await sendMsg<{ sessions: ScrapeSession[] }>({ type: 'GET_SESSIONS' });
    if (res && (res as { sessions?: ScrapeSession[] }).sessions) {
      setSessions((res as { sessions: ScrapeSession[] }).sessions);
    }
  }, []);

  // Load leads for a session
  const loadLeads = useCallback(async (sid?: string) => {
    setLoading(true);
    const res = await sendMsg<{ leads: Lead[] }>({
      type: 'GET_LEADS',
      payload: { sessionId: sid ?? selectedSessionId },
    });
    if (res && (res as { leads?: Lead[] }).leads) {
      setLeads((res as { leads: Lead[] }).leads);
    }
    setLoading(false);
  }, [selectedSessionId]);

  useEffect(() => {
    if (activeTab === 'sessions') loadSessions();
    if (activeTab === 'leads') loadLeads();
  }, [activeTab, loadSessions, loadLeads]);

  // Start scraping
  const startScrape = async () => {
    if (!keyword.trim()) {
      showToast('Please enter a search keyword.', 'error');
      return;
    }
    if (!mapsTabId && isChromeExtension) {
      showToast('Please open Google Maps and search for your keyword first.', 'error');
      return;
    }

    setScrapeStatus('running');
    setLeadsFound(0);
    liveLeadsRef.current = [];
    setLeads([]);
    setStatusMsg('Creating session...');

    // Create session
    const sesRes = await sendMsg<{ session?: ScrapeSession; error?: string }>({
      type: 'CREATE_SESSION',
      payload: { keyword: keyword.trim(), location: '' },
    });

    const sid = (sesRes as { session?: { id: string } })?.session?.id ?? null;
    setSessionId(sid);

    if (!isChromeExtension) {
      setStatusMsg('Running in dev mode — no real scraping.');
      return;
    }

    // Inject content script and start
    await sendMsg({
      type: 'INJECT_AND_START',
      payload: { tabId: mapsTabId, keyword: keyword.trim(), sessionId: sid },
    });
  };

  const stopScrape = async () => {
    await sendMsg({ type: 'STOP_SCRAPE_TAB', payload: { tabId: mapsTabId } });
    setScrapeStatus('idle');
    setStatusMsg('Stopped by user.');
  };

  const handleExportCSV = () => {
    if (!leads.length) { showToast('No leads to export.', 'error'); return; }
    const slug = keyword.replace(/\s+/g, '-').toLowerCase() || 'leads';
    downloadCSV(leads, `maps-${slug}.csv`);
    showToast(`Exported ${leads.length} leads as CSV.`);
  };

  const handleExportJSON = () => {
    if (!leads.length) { showToast('No leads to export.', 'error'); return; }
    const slug = keyword.replace(/\s+/g, '-').toLowerCase() || 'leads';
    downloadJSON(leads, `maps-${slug}.json`);
    showToast(`Exported ${leads.length} leads as JSON.`);
  };

  const deleteSession = async (sid: string) => {
    await sendMsg({ type: 'DELETE_SESSION', payload: { sessionId: sid } });
    showToast('Session deleted.');
    loadSessions();
    if (selectedSessionId === sid) { setSelectedSessionId(null); setLeads([]); }
  };

  const viewSessionLeads = async (sid: string) => {
    setSelectedSessionId(sid);
    setActiveTab('leads');
    await loadLeads(sid);
  };

  const isRunning = scrapeStatus === 'running';

  return (
    <div className="w-[420px] min-h-[560px] max-h-[680px] flex flex-col bg-slate-50 font-sans overflow-hidden">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
            <MapPin className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-800 text-sm leading-tight">Maps Lead Scraper</h1>
            <p className="text-slate-400 text-[10px]">Google Maps Business Data</p>
          </div>
        </div>
        <StatusBadge status={scrapeStatus} />
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-slate-200 flex shrink-0">
        {(['scraper', 'leads', 'sessions'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`flex-1 py-2.5 text-xs font-semibold capitalize transition-colors ${
              activeTab === t
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'scraper' ? 'Scraper' : t === 'leads' ? `Leads${leads.length ? ` (${leads.length})` : ''}` : 'Sessions'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Scraper tab ── */}
        {activeTab === 'scraper' && (
          <div className="p-4 space-y-4">
            {/* Maps tab warning */}
            {!mapsTabId && isChromeExtension && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                <p>
                  Open <strong>Google Maps</strong> in your current tab, search for your keyword (e.g.{' '}
                  <em>Dermatologist Bakersfield</em>), then click Start.
                </p>
              </div>
            )}

            {!isChromeExtension && (
              <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                <p>Running in browser preview. Load as a Chrome Extension to scrape Google Maps.</p>
              </div>
            )}

            {/* Keyword input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Search Keyword</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !isRunning && startScrape()}
                  placeholder="e.g. Dermatologist Bakersfield"
                  disabled={isRunning}
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>
              <p className="text-[10px] text-slate-400">
                Tip: First search this keyword on Google Maps, then click Start.
              </p>
            </div>

            {/* Controls */}
            <div className="flex gap-2">
              {!isRunning ? (
                <button
                  onClick={startScrape}
                  disabled={!keyword.trim()}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                >
                  <Search className="w-4 h-4" />
                  Start Scraping
                </button>
              ) : (
                <button
                  onClick={stopScrape}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                >
                  <Square className="w-4 h-4" />
                  Stop
                </button>
              )}
            </div>

            {/* Status */}
            {statusMsg && (
              <div className={`flex items-start gap-2 rounded-xl p-3 text-xs ${
                scrapeStatus === 'error'
                  ? 'bg-red-50 border border-red-200 text-red-700'
                  : scrapeStatus === 'completed'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-blue-50 border border-blue-200 text-blue-700'
              }`}>
                {scrapeStatus === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : scrapeStatus === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <RefreshCw className="w-4 h-4 shrink-0 mt-0.5 animate-spin" />
                )}
                <p>{statusMsg}</p>
              </div>
            )}

            {/* Live stats */}
            {(isRunning || scrapeStatus === 'completed') && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-slate-800">{leadsFound}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Leads Found</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-slate-800">{sessionId ? '✓' : '—'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Session Active</p>
                </div>
              </div>
            )}

            {/* Export quick actions */}
            {leads.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={handleExportCSV}
                  className="flex-1 flex items-center justify-center gap-1.5 border border-slate-300 hover:border-slate-400 bg-white text-slate-700 text-xs font-semibold py-2 rounded-xl transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Export CSV
                </button>
                <button
                  onClick={handleExportJSON}
                  className="flex-1 flex items-center justify-center gap-1.5 border border-slate-300 hover:border-slate-400 bg-white text-slate-700 text-xs font-semibold py-2 rounded-xl transition-colors"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  Export JSON
                </button>
              </div>
            )}

            {/* Live leads preview */}
            {leads.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700">Live Results</p>
                  <button
                    onClick={() => setActiveTab('leads')}
                    className="text-xs text-blue-500 hover:text-blue-700"
                  >
                    View all →
                  </button>
                </div>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {leads.slice(0, 3).map((l, i) => (
                    <LeadCard key={l.id ?? i} lead={l} />
                  ))}
                  {leads.length > 3 && (
                    <p className="text-center text-xs text-slate-400 py-1">
                      +{leads.length - 3} more — view all in Leads tab
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Leads tab ── */}
        {activeTab === 'leads' && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">
                {leads.length} Lead{leads.length !== 1 ? 's' : ''}
                {selectedSessionId && <span className="text-slate-400 font-normal"> (filtered)</span>}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadLeads()}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleExportCSV}
                  disabled={!leads.length}
                  className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  <Download className="w-3 h-3" />
                  CSV
                </button>
                <button
                  onClick={handleExportJSON}
                  disabled={!leads.length}
                  className="flex items-center gap-1 text-xs border border-slate-300 hover:border-slate-400 bg-white text-slate-700 px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  <Download className="w-3 h-3" />
                  JSON
                </button>
              </div>
            </div>

            {selectedSessionId && (
              <button
                onClick={() => { setSelectedSessionId(null); loadLeads(undefined); }}
                className="text-xs text-blue-500 hover:text-blue-700"
              >
                ← Show all leads
              </button>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
              </div>
            ) : leads.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No leads yet</p>
                <p className="text-xs mt-1">Start scraping to collect leads</p>
              </div>
            ) : (
              <div className="space-y-2">
                {leads.map((l, i) => (
                  <div key={l.id ?? i}>
                    <button
                      className="w-full text-left"
                      onClick={() => setExpandedLead(expandedLead === (l.id ?? String(i)) ? null : (l.id ?? String(i)))}
                    >
                      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3 py-2.5 hover:shadow-sm transition-shadow">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{l.business_name || '—'}</p>
                          <p className="text-xs text-slate-400 truncate">{l.address || l.category || ''}</p>
                        </div>
                        {expandedLead === (l.id ?? String(i))
                          ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                        }
                      </div>
                    </button>
                    {expandedLead === (l.id ?? String(i)) && (
                      <div className="mt-1">
                        <LeadCard lead={l} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Sessions tab ── */}
        {activeTab === 'sessions' && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Scrape Sessions</p>
              <button
                onClick={loadSessions}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {sessions.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No sessions yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="bg-white border border-slate-200 rounded-xl p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{s.keyword}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {s.created_at ? new Date(s.created_at).toLocaleString() : ''}
                        </p>
                      </div>
                      <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        s.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                        s.status === 'running' ? 'bg-blue-50 text-blue-700' :
                        s.status === 'error' ? 'bg-red-50 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {s.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{s.total_results || 0} leads</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => viewSessionLeads(s.id!)}
                          className="text-blue-500 hover:text-blue-700 font-semibold"
                        >
                          View Leads
                        </button>
                        <button
                          onClick={() => deleteSession(s.id!)}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`absolute bottom-4 left-4 right-4 flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold shadow-lg animate-in fade-in slide-in-from-bottom-2 ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-800 text-white'
        }`}>
          {toast.type === 'error'
            ? <AlertCircle className="w-4 h-4 shrink-0" />
            : <CheckCircle2 className="w-4 h-4 shrink-0" />
          }
          {toast.msg}
        </div>
      )}
    </div>
  );
}
