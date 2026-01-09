
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Header from './components/Header';
import Setup from './components/Setup';
import LogConsole from './components/LogConsole';
import BatchAccordion from './components/BatchAccordion';
import EmailCard from './components/EmailCard';
import { GMAIL_DISCOVERY_DOCS, GMAIL_SCOPES, GOOGLE_CLIENT_ID, DEFAULT_AI_MODEL } from './constants';
import { EnrichedEmail, HarvestTranche, AIAnalysis, EmailBatch, ViewMode, FolderStyle, TrainingStep } from './types';
import { getTotalInboxCount, createGmailLabel, moveEmailsToLabel, applyTagsToEmail, renameAllLabelsToStyle } from './services/gmailService';
import { analyzeSingleEmail } from './services/aiService';
// Added missing Inbox and RefreshCw imports
import { 
  Loader2, Database, Settings, StopCircle, Rocket, Layers, ListFilter, 
  PlayCircle, Check, Zap, BarChart3, PieChart, Info, X, Search, Mail, 
  BrainCircuit, LayoutGrid, AlertTriangle, ChevronRight, Star, Clock, Trash2, Archive, Reply, Trash, MoreVertical, Menu,
  Inbox, RefreshCw
} from 'lucide-react';
import { logger } from './utils/logger';

export default function App() {
  const [config, setConfig] = useState(() => ({
    provider: localStorage.getItem('ai_provider') || 'puter',
    model: localStorage.getItem('ai_model') || DEFAULT_AI_MODEL,
    concurrency: Number(localStorage.getItem('ai_concurrency')) || 3,
    folderStyle: (localStorage.getItem('folder_style') as FolderStyle) || 'standard'
  }));
  
  const [viewMode, setViewMode] = useState<ViewMode>('pipeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const [isAutopilotRunning, setIsAutopilotRunning] = useState(false);
  const [autopilotLogs, setAutopilotLogs] = useState<string[]>([]);
  const [trainingSteps, setTrainingSteps] = useState<TrainingStep[]>([]);
  const [isTrainingActive, setIsTrainingActive] = useState(false);

  const [totalInboxCount, setTotalInboxCount] = useState<number>(() => Number(localStorage.getItem('total_inbox_count')) || 0);
  const [tranches, setTranches] = useState<HarvestTranche[]>(() => {
    const saved = localStorage.getItem('harvest_tranches_v8');
    return saved ? JSON.parse(saved) : [];
  });

  const stopSignal = useRef<boolean>(false);

  // Sauvegarde persistante avec garde-fou
  useEffect(() => {
    if (tranches.length > 0) {
      localStorage.setItem('harvest_tranches_v8', JSON.stringify(tranches));
      localStorage.setItem('total_inbox_count', String(totalInboxCount));
    }
  }, [tranches, totalInboxCount]);

  const initGoogleServices = useCallback(() => {
    const loadGapi = () => {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({ discoveryDocs: GMAIL_DISCOVERY_DOCS });
          const token = localStorage.getItem('google_access_token');
          if (token) {
            window.gapi.client.setToken({ access_token: token });
            try {
              const profile = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
              setUserEmail(profile.result.emailAddress);
              const total = await getTotalInboxCount();
              setTotalInboxCount(total);
              if (tranches.length === 0) generateTranches(total);
            } catch (e: any) {
              if (e.status === 401) {
                logger.warn("Session expirée. Veuillez vous reconnecter.");
                localStorage.removeItem('google_access_token');
                setUserEmail(null);
              }
            }
          }
        } catch (e) { logger.error("GAPI Init Error", e); }
      });
    };

    if (window.google?.accounts?.oauth2) {
      window.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GMAIL_SCOPES,
        callback: async (resp: any) => {
          if (resp.error) return;
          localStorage.setItem('google_access_token', resp.access_token);
          window.gapi.client.setToken({ access_token: resp.access_token });
          const profile = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
          setUserEmail(profile.result.emailAddress);
          const total = await getTotalInboxCount();
          setTotalInboxCount(total);
          generateTranches(total);
          logger.success("Connexion Google réussie");
        },
      });
    }
    loadGapi();
  }, [tranches.length]);

  useEffect(() => { initGoogleServices(); }, [initGoogleServices]);

  const generateTranches = (total: number) => {
    const numTranches = Math.ceil(total / 1000) || 1;
    const newTranches = Array.from({ length: numTranches }, (_, i) => ({
      id: i + 1,
      startIndex: i * 1000,
      totalToFetch: Math.min(1000, total - (i * 1000)),
      fetchedCount: 0,
      status: 'pending' as const,
      emails: []
    }));
    setTranches(newTranches);
  };

  const handleSequentialAnalyze = async (trancheId: number, emailsToAnalyze: EnrichedEmail[], retryOnly: boolean = false) => {
    if (loading) return;
    setLoading(true);
    stopSignal.current = false;
    try {
      const tranche = tranches.find(t => t.id === trancheId);
      if (!tranche) return;
      const emailsToProcess = emailsToAnalyze.filter(e => retryOnly ? (e.failed && !e.processed) : !e.processed);
      const CONCURRENCY = config.concurrency;

      for (let i = 0; i < emailsToProcess.length; i += CONCURRENCY) {
        if (stopSignal.current) break;
        const chunk = emailsToProcess.slice(i, i + CONCURRENCY);
        setStatusText(`Titan x${CONCURRENCY} : ${i + chunk.length}/${emailsToProcess.length}`);

        await Promise.all(chunk.map(async (email) => {
          try {
            const existingFolders = tranches.flatMap(t => t.emails.map(e => e.analysis?.suggestedFolder)).filter(Boolean) as string[];
            const analysis = await analyzeSingleEmail(email, config.model, config.provider, Array.from(new Set(existingFolders)));
            const moved = await moveEmailsToLabel([email.id], analysis.suggestedFolder, config.folderStyle);
            if (moved && analysis.tags.length > 0) {
              await applyTagsToEmail(email.id, analysis.tags, config.folderStyle);
            }
            setTranches(curr => curr.map(t => t.id === trancheId ? {
              ...t, emails: t.emails.map(e => e.id === email.id ? { ...e, analysis, processed: true, organized: moved, failed: false } : e)
            } : t));
          } catch (e) {
            setTranches(curr => curr.map(t => t.id === trancheId ? {
              ...t, emails: t.emails.map(e => e.id === email.id ? { ...e, failed: true } : e)
            } : t));
          }
        }));
      }
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const runHarvestMission = async (trancheId: number) => {
    if (loading) return;
    const tranche = tranches.find(t => t.id === trancheId);
    if (!tranche) return;

    setLoading(true);
    stopSignal.current = false;
    setTranches(prev => prev.map(t => t.id === trancheId ? { ...t, status: 'running' } : t));

    try {
      let fetched = tranche.fetchedCount;
      let pageToken = tranche.nextPageToken || undefined;
      let allEmails = [...tranche.emails];

      while (fetched < tranche.totalToFetch && !stopSignal.current) {
        setStatusText(`Récolte Bloc ${trancheId} : ${fetched}/${tranche.totalToFetch}`);
        const response: any = await window.gapi.client.gmail.users.messages.list({ 
          userId: 'me', 
          maxResults: 100, 
          pageToken, 
          labelIds: ['INBOX'] 
        });
        
        const messages = response.result.messages || [];
        pageToken = response.result.nextPageToken || null;

        if (messages.length === 0) break;

        const details = await Promise.all(messages.map(async (m: any) => {
          try {
            const res = await window.gapi.client.gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata' });
            const h = res.result.payload.headers;
            return {
              id: res.result.id, threadId: res.result.threadId, snippet: res.result.snippet, internalDate: res.result.internalDate,
              subject: h.find((x:any) => x.name === 'Subject')?.value || 'Sans objet',
              from: h.find((x:any) => x.name === 'From')?.value || 'Inconnu',
              processed: false, organized: false, failed: false
            } as EnrichedEmail;
          } catch { return null; }
        }));

        const validDetails = details.filter(d => d !== null) as EnrichedEmail[];
        allEmails = [...allEmails, ...validDetails];
        fetched += validDetails.length;
        
        setTranches(prev => prev.map(t => t.id === trancheId ? { ...t, emails: allEmails, fetchedCount: fetched, nextPageToken: pageToken } : t));
        if (!pageToken) break;
      }
      setTranches(prev => prev.map(t => t.id === trancheId ? { ...t, status: stopSignal.current ? 'stopped' : 'completed' } : t));
    } catch (e) {
      logger.error("Erreur de récolte", e);
      setTranches(prev => prev.map(t => t.id === trancheId ? { ...t, status: 'error' } : t));
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const startAutopilot = () => {
    setIsAutopilotRunning(true);
    setAutopilotLogs(["[SYSTEM] Autopilote activé.", "[INFO] Scan des emails non traités..."]);
    
    const run = async () => {
      const pending = allEmails.filter(e => !e.processed);
      for (const email of pending) {
        if (!isAutopilotRunning || stopSignal.current) break;
        setAutopilotLogs(prev => [`[ANALYSIS] ${email.subject}`, ...prev.slice(0, 15)]);
        // On pourrait appeler handleSequentialAnalyze ici par petits blocs
        await new Promise(r => setTimeout(r, 1500));
      }
      setIsAutopilotRunning(false);
      setAutopilotLogs(prev => ["[FIN] Autopilote terminé.", ...prev]);
    };
    run();
  };

  const startTrainingSession = () => {
    const sample = allEmails.filter(e => !e.processed).slice(0, 5);
    if (sample.length === 0) {
      alert("Aucun email pour l'entraînement.");
      return;
    }
    setTrainingSteps(sample.map(e => ({ email: e, completed: false })));
    setIsTrainingActive(true);
  };

  const allEmails = useMemo(() => tranches.flatMap(t => t.emails), [tranches]);
  const filteredEmails = useMemo(() => {
    let list = allEmails;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(e => 
        e.subject?.toLowerCase().includes(q) || 
        e.from?.toLowerCase().includes(q) || 
        e.snippet?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allEmails, searchQuery]);

  const stats = useMemo(() => {
    const folders = new Map<string, number>();
    const tags = new Map<string, number>();
    const processed = allEmails.filter(e => e.processed);
    processed.forEach(e => {
      if (e.analysis) {
        folders.set(e.analysis.suggestedFolder, (folders.get(e.analysis.suggestedFolder) || 0) + 1);
        e.analysis.tags.forEach(t => tags.set(t, (tags.get(t) || 0) + 1));
      }
    });
    return { 
      folders: Array.from(folders.entries()).sort((a,b) => b[1] - a[1]),
      tags: Array.from(tags.entries()).sort((a,b) => b[1] - a[1]),
      count: processed.length
    };
  }, [allEmails]);

  if (showSetup) return (
    <div className="bg-black min-h-screen text-white">
      <Header userEmail={userEmail} onLogout={() => { localStorage.removeItem('google_access_token'); window.location.reload(); }} />
      <Setup onSave={async (p, m, c, fs) => { 
        if (fs !== config.folderStyle && confirm("Adapter la nomenclature des dossiers existants ?")) {
          await renameAllLabelsToStyle(fs);
        }
        setConfig({ provider: p, model: m, concurrency: c, folderStyle: fs }); 
        localStorage.setItem('ai_provider', p);
        localStorage.setItem('ai_model', m);
        localStorage.setItem('ai_concurrency', String(c));
        localStorage.setItem('folder_style', fs);
        setShowSetup(false); 
      }} onReset={() => { localStorage.clear(); window.location.reload(); }} onLogout={() => {}} isLoggedIn={!!userEmail} />
      <LogConsole />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-white overflow-hidden">
      <Header userEmail={userEmail} onLogout={() => { localStorage.removeItem('google_access_token'); window.location.reload(); }} />
      
      {userEmail && (
        <nav className="bg-black/80 border-b border-white/5 sticky top-[73px] z-40 backdrop-blur-xl shrink-0">
           <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-1">
                <button onClick={() => setViewMode('pipeline')} className={`px-4 py-2 rounded-2xl text-[10px] font-black transition-all flex items-center gap-2 uppercase tracking-widest ${viewMode === 'pipeline' ? 'bg-indigo-600 shadow-lg shadow-indigo-600/30' : 'text-white/30 hover:bg-white/5'}`}><LayoutGrid className="w-3 h-3" /> Pipeline</button>
                <button onClick={() => setViewMode('mail')} className={`px-4 py-2 rounded-2xl text-[10px] font-black transition-all flex items-center gap-2 uppercase tracking-widest ${viewMode === 'mail' ? 'bg-indigo-600 shadow-lg shadow-indigo-600/30' : 'text-white/30 hover:bg-white/5'}`}><Mail className="w-3 h-3" /> Manager</button>
                <button onClick={() => setViewMode('training')} className={`px-4 py-2 rounded-2xl text-[10px] font-black transition-all flex items-center gap-2 uppercase tracking-widest ${viewMode === 'training' ? 'bg-indigo-600 shadow-lg shadow-indigo-600/30' : 'text-white/30 hover:bg-white/5'}`}><BrainCircuit className="w-3 h-3" /> Training</button>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
                <input type="text" placeholder="RECHERCHER..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-2.5 text-[10px] font-bold outline-none focus:border-indigo-500 transition-all placeholder:text-white/10" />
              </div>
           </div>
        </nav>
      )}

      <main className="flex-1 flex flex-col overflow-hidden">
        {!userEmail ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-center px-4">
             <div className="bg-indigo-600/10 p-10 rounded-[56px] border border-indigo-500/20 mb-10">
                <Mail className="w-20 h-20 text-indigo-500" />
             </div>
             <h2 className="text-4xl font-black tracking-tighter mb-4">Connectez Titan</h2>
             <button onClick={() => window.tokenClient?.requestAccessToken({ prompt: 'select_account' })} className="py-7 px-14 bg-white text-black font-black rounded-[40px] flex items-center gap-6 shadow-2xl hover:scale-105 transition-all text-xl"><img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-8 h-8" /> Sync Gmail</button>
          </div>
        ) : (
          <>
            {viewMode === 'pipeline' && (
              <div className="flex-1 overflow-y-auto p-4 sm:p-10 space-y-8 pb-32 max-w-5xl mx-auto w-full">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                   <button onClick={() => setShowSummary(true)} className="p-6 bg-indigo-600 rounded-[32px] font-black text-[10px] uppercase tracking-widest flex flex-col items-center gap-3 shadow-xl border border-indigo-400"><BarChart3 className="w-6 h-6" /> Bilan</button>
                   <button onClick={() => runHarvestMission(1)} className="p-6 bg-white/5 rounded-[32px] font-black text-[10px] uppercase tracking-widest flex flex-col items-center gap-3 border border-white/10"><Database className="w-6 h-6" /> Récolte</button>
                   <button onClick={() => isAutopilotRunning ? setIsAutopilotRunning(false) : startAutopilot()} className={`p-6 rounded-[32px] font-black text-[10px] uppercase tracking-widest flex flex-col items-center gap-3 transition-all ${isAutopilotRunning ? 'bg-red-500 border-red-400' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                      {isAutopilotRunning ? <StopCircle className="w-6 h-6 animate-pulse" /> : <Rocket className="w-6 h-6" />}
                      Autopilote
                   </button>
                   <button onClick={() => setShowSetup(true)} className="p-6 bg-white/5 rounded-[32px] font-black text-[10px] uppercase tracking-widest flex flex-col items-center gap-3 border border-white/10"><Settings className="w-6 h-6" /> Réglages</button>
                </div>

                {isAutopilotRunning && (
                  <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-[40px] p-8 space-y-4">
                     <h3 className="text-xs font-black uppercase tracking-[0.4em] text-indigo-400 flex items-center gap-2"><Rocket className="w-4 h-4" /> Autopilote Monitor</h3>
                     <div className="bg-black/40 rounded-2xl p-4 font-mono text-[10px] h-32 overflow-y-auto space-y-1 border border-white/5">
                        {autopilotLogs.map((log, i) => <div key={i} className="text-white/60"><span className="text-indigo-500 font-bold">[{i}]</span> {log}</div>)}
                     </div>
                  </div>
                )}

                <div className="space-y-8">
                  <h2 className="text-3xl font-black tracking-tighter px-4">Pipeline x{config.concurrency}</h2>
                  {tranches.map(t => (
                    <MissionCard key={t.id} tranche={t} isLoading={loading} onStart={() => runHarvestMission(t.id)} onStop={() => stopSignal.current = true} onAnalyze={(emails: any, retry?: boolean) => handleSequentialAnalyze(t.id, emails, retry)} />
                  ))}
                </div>
              </div>
            )}

            {viewMode === 'mail' && (
              <div className="flex-1 flex overflow-hidden">
                {/* Sidebar Dossiers */}
                <aside className={`${isSidebarOpen ? 'w-64' : 'w-0'} transition-all bg-black/40 border-r border-white/5 flex flex-col shrink-0 overflow-hidden`}>
                  <div className="p-6 space-y-4">
                    <button className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-600 rounded-xl text-xs font-black uppercase tracking-widest"><Inbox className="w-4 h-4" /> Inbox</button>
                    <div className="pt-6 space-y-2">
                       <p className="px-4 text-[9px] font-black text-white/20 uppercase tracking-[0.3em]">Dossiers IA</p>
                       <div className="space-y-1 max-h-[50vh] overflow-y-auto no-scrollbar">
                         {stats.folders.map(([name, count]) => (
                           <button key={name} className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/5 rounded-xl text-[10px] font-bold text-white/60 group">
                             <div className="flex items-center gap-2"><Layers className="w-3 h-3 group-hover:text-indigo-400" /> {name}</div>
                             <span className="opacity-40">{count}</span>
                           </button>
                         ))}
                       </div>
                    </div>
                  </div>
                </aside>
                
                {/* List Emails */}
                <div className="flex-1 flex flex-col overflow-hidden bg-white/[0.01]">
                   <div className="p-4 border-b border-white/5 flex items-center justify-between">
                      <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-white/5 rounded-lg text-white/40"><Menu className="w-5 h-5" /></button>
                      <div className="flex gap-2">
                         <button className="p-2 hover:bg-white/5 rounded-lg text-white/40"><RefreshCw className="w-4 h-4" /></button>
                         <button className="p-2 hover:bg-white/5 rounded-lg text-white/40"><MoreVertical className="w-4 h-4" /></button>
                      </div>
                   </div>
                   <div className="flex-1 overflow-y-auto divide-y divide-white/5">
                     {filteredEmails.map(e => (
                       <div key={e.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/5 cursor-pointer group">
                          <Star className="w-4 h-4 text-white/5 group-hover:text-yellow-500/40 shrink-0" />
                          <div className="w-32 sm:w-48 text-[12px] font-black text-white/80 truncate shrink-0">{e.from.split('<')[0]}</div>
                          <div className="flex-1 min-w-0 flex items-center gap-3">
                             <span className="font-bold text-[12px] text-white truncate shrink-0">{e.subject}</span>
                             <span className="text-white/20 text-[12px] truncate">- {e.snippet}</span>
                          </div>
                          <div className="w-20 text-right text-[10px] font-bold text-white/10">{new Date(parseInt(e.internalDate)).toLocaleDateString([], {day:'2-digit', month:'2-digit'})}</div>
                       </div>
                     ))}
                     {filteredEmails.length === 0 && <div className="py-32 text-center text-white/10 font-black uppercase text-xs tracking-widest">Aucun email</div>}
                   </div>
                </div>
              </div>
            )}

            {viewMode === 'training' && (
              <div className="flex-1 overflow-y-auto p-10 max-w-4xl mx-auto w-full">
                {!isTrainingActive ? (
                  <div className="p-16 bg-white/5 rounded-[56px] border border-white/5 flex flex-col items-center gap-8 text-center">
                     <BrainCircuit className="w-20 h-20 text-indigo-500" />
                     <h2 className="text-3xl font-black">Training Academy</h2>
                     <button onClick={startTrainingSession} className="px-12 py-6 bg-white text-black rounded-[32px] font-black text-sm">Lancer une session</button>
                  </div>
                ) : (
                  <div className="space-y-6">
                     <div className="flex justify-between items-center mb-10">
                        <h2 className="text-2xl font-black">Calibration IA</h2>
                        <button onClick={() => setIsTrainingActive(false)} className="text-xs font-black text-red-400">Quitter</button>
                     </div>
                     {trainingSteps.map((s, i) => (
                       <div key={i} className="p-8 bg-white/5 rounded-[40px] border border-white/5 flex justify-between items-center">
                          <div>
                            <p className="text-[10px] font-black text-indigo-400 uppercase mb-2">{s.email.from}</p>
                            <h4 className="font-black text-lg">{s.email.subject}</h4>
                          </div>
                          <div className="flex gap-2">
                             <button className="p-4 bg-emerald-500 rounded-2xl"><Check className="w-5 h-5 text-black" /></button>
                             <button className="p-4 bg-red-500 rounded-2xl"><Trash2 className="w-5 h-5 text-black" /></button>
                          </div>
                       </div>
                     ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {showSummary && (
        <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-[#080808] w-full max-w-4xl h-[85vh] rounded-[64px] border border-white/10 p-12 overflow-y-auto relative no-scrollbar">
             <button onClick={() => setShowSummary(false)} className="absolute top-10 right-10 p-4 bg-white/5 rounded-full"><X className="w-6 h-6" /></button>
             <h2 className="text-6xl font-black tracking-tighter mb-12">Bilan Intelligent</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-4">
                   <h3 className="text-xs font-black uppercase text-indigo-400">Dossiers Créés</h3>
                   {stats.folders.map(([n, c]) => (
                     <div key={n} className="p-5 bg-white/5 rounded-3xl flex justify-between items-center"><span className="font-bold">{n}</span><span className="font-black text-indigo-400">{c}</span></div>
                   ))}
                </div>
                <div className="space-y-10 text-center">
                   <div className="p-10 bg-indigo-600 rounded-[48px] shadow-2xl">
                      <p className="text-6xl font-black">{stats.count}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Emails rangés</p>
                   </div>
                   <PieChart className="w-32 h-32 mx-auto text-white/5" />
                </div>
             </div>
          </div>
        </div>
      )}

      <LogConsole />
    </div>
  );
}

function MissionCard({ tranche, onStart, onStop, isLoading, onAnalyze }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const prog = Math.round((tranche.fetchedCount / tranche.totalToFetch) * 100);
  const batches = useMemo(() => {
    const b = [];
    for (let i = 0; i < tranche.emails.length; i += 15) b.push({ id: b.length + 1, emails: tranche.emails.slice(i, i + 15) });
    return b;
  }, [tranche.emails]);

  return (
    <div className={`transition-all rounded-[56px] border ${isOpen ? 'bg-white/[0.06] border-white/20' : 'bg-white/[0.01] border-white/5'}`}>
      <div className="p-10 flex justify-between items-center cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center gap-8">
          <div className={`w-16 h-16 rounded-[28px] flex items-center justify-center ${tranche.status === 'completed' ? 'bg-emerald-500 text-black' : 'bg-white/5'}`}>
            {tranche.status === 'completed' ? <Check /> : <Database />}
          </div>
          <div>
            <h3 className="text-2xl font-black">Bloc {tranche.id}</h3>
            <p className="text-[10px] font-black text-white/20">{tranche.fetchedCount} mails ({prog}%)</p>
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); tranche.status === 'running' ? onStop() : onStart(); }} className={`p-5 rounded-3xl ${tranche.status === 'running' ? 'bg-red-500' : 'bg-white text-black'}`}>
          {tranche.status === 'running' ? <StopCircle /> : <PlayCircle />}
        </button>
      </div>
      {isOpen && (
        <div className="p-10 pt-0 space-y-6">
           {batches.map(b => <BatchAccordion key={b.id} batch={b} isLoading={isLoading} onAnalyze={(retry?: boolean) => onAnalyze(b.emails, retry)} onAction={() => {}} onIgnore={() => {}} />)}
           {batches.length === 0 && <p className="text-center py-10 text-white/5 font-black uppercase text-[10px]">Prêt pour la récolte</p>}
        </div>
      )}
    </div>
  );
}
