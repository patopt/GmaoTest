
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
import { 
  Loader2, Database, Settings, StopCircle, Rocket, Layers, ListFilter, 
  PlayCircle, Check, Zap, BarChart3, PieChart, Info, X, Search, Mail, 
  BrainCircuit, LayoutGrid, AlertTriangle, ChevronRight, Star, Clock, Trash2, Archive, Reply, Trash, MoreVertical, Menu,
  Inbox, RefreshCw, ChevronLeft, Filter
} from 'lucide-react';
import { logger } from './utils/logger';

export default function App() {
  const [config, setConfig] = useState(() => ({
    provider: localStorage.getItem('ai_provider') || 'puter',
    model: localStorage.getItem('ai_model') || DEFAULT_AI_MODEL,
    concurrency: Number(localStorage.getItem('ai_concurrency')) || 3,
    folderStyle: (localStorage.getItem('folder_style') as FolderStyle) || 'standard'
  }));
  
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('last_view_mode') as ViewMode) || 'pipeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  
  const [isAutopilotRunning, setIsAutopilotRunning] = useState(false);
  const [autopilotLogs, setAutopilotLogs] = useState<string[]>([]);
  const [trainingSteps, setTrainingSteps] = useState<TrainingStep[]>([]);
  const [isTrainingActive, setIsTrainingActive] = useState(false);

  const [totalInboxCount, setTotalInboxCount] = useState<number>(() => Number(localStorage.getItem('total_inbox_count')) || 0);
  const [tranches, setTranches] = useState<HarvestTranche[]>(() => {
    const saved = localStorage.getItem('harvest_tranches_v10');
    return saved ? JSON.parse(saved) : [];
  });

  const stopSignal = useRef<boolean>(false);

  // Sauvegarde persistante Robuste
  useEffect(() => {
    if (tranches.length > 0) {
      localStorage.setItem('harvest_tranches_v10', JSON.stringify(tranches));
      localStorage.setItem('total_inbox_count', String(totalInboxCount));
    }
  }, [tranches, totalInboxCount]);

  useEffect(() => {
    localStorage.setItem('last_view_mode', viewMode);
  }, [viewMode]);

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
                logger.warn("Token Google expiré. Déconnexion.");
                localStorage.removeItem('google_access_token');
                setUserEmail(null);
              }
            }
          }
        } catch (e) { logger.error("Erreur GAPI Init", e); }
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
          logger.success("Synchronisation Gmail active.");
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
        setStatusText(`RÉCOLTE BLOC ${trancheId} : ${fetched}/${tranche.totalToFetch}`);
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
      logger.error("Échec de la récolte", e);
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
        await new Promise(r => setTimeout(r, 1000));
      }
      setIsAutopilotRunning(false);
      setAutopilotLogs(prev => ["[FIN] Autopilote terminé.", ...prev]);
    };
    run();
  };

  const startTrainingSession = () => {
    const sample = allEmails.filter(e => !e.processed).slice(0, 5);
    if (sample.length === 0) {
      alert("Aucun email disponible pour la calibration.");
      return;
    }
    setTrainingSteps(sample.map(e => ({ email: e, completed: false })));
    setIsTrainingActive(true);
  };

  const allEmails = useMemo(() => tranches.flatMap(t => t.emails), [tranches]);
  
  const filteredEmails = useMemo(() => {
    let list = allEmails;
    if (selectedFolder) {
      list = list.filter(e => e.analysis?.suggestedFolder === selectedFolder);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(e => 
        e.subject?.toLowerCase().includes(q) || 
        e.from?.toLowerCase().includes(q) || 
        e.snippet?.toLowerCase().includes(q) ||
        e.analysis?.category.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allEmails, searchQuery, selectedFolder]);

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
        if (fs !== config.folderStyle && confirm("Appliquer le nouveau style de nomenclature à vos dossiers Gmail existants ?")) {
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
           <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                <button onClick={() => setViewMode('pipeline')} className={`px-4 py-2.5 rounded-2xl text-[10px] font-black transition-all flex items-center gap-2 uppercase tracking-widest shrink-0 ${viewMode === 'pipeline' ? 'bg-indigo-600 shadow-lg shadow-indigo-600/30' : 'text-white/30 hover:bg-white/5'}`}><LayoutGrid className="w-4 h-4" /> Pipeline</button>
                <button onClick={() => setViewMode('mail')} className={`px-4 py-2.5 rounded-2xl text-[10px] font-black transition-all flex items-center gap-2 uppercase tracking-widest shrink-0 ${viewMode === 'mail' ? 'bg-indigo-600 shadow-lg shadow-indigo-600/30' : 'text-white/30 hover:bg-white/5'}`}><Mail className="w-4 h-4" /> Manager</button>
                <button onClick={() => setViewMode('training')} className={`px-4 py-2.5 rounded-2xl text-[10px] font-black transition-all flex items-center gap-2 uppercase tracking-widest shrink-0 ${viewMode === 'training' ? 'bg-indigo-600 shadow-lg shadow-indigo-600/30' : 'text-white/30 hover:bg-white/5'}`}><BrainCircuit className="w-4 h-4" /> Calibration</button>
              </div>
              <div className="relative hidden sm:block w-72">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input type="text" placeholder="RECHERCHE INTELLIGENTE..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-[10px] font-bold outline-none focus:border-indigo-500 transition-all placeholder:text-white/10" />
              </div>
              {viewMode === 'mail' && <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-3 bg-white/5 rounded-2xl sm:hidden"><Menu className="w-5 h-5" /></button>}
           </div>
        </nav>
      )}

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {!userEmail ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-center px-4 animate-in fade-in duration-1000">
             <div className="bg-indigo-600/10 p-12 rounded-[64px] border border-indigo-500/20 mb-10 shadow-2xl">
                <Rocket className="w-24 h-24 text-indigo-500 animate-pulse" />
             </div>
             <h2 className="text-5xl font-black tracking-tighter mb-4">Moteur Titan Désactivé</h2>
             <p className="text-white/30 mb-12 max-w-sm font-bold uppercase text-[10px] tracking-[0.4em] leading-relaxed">Synchronisez votre compte Google pour déployer l'organisation neuronale.</p>
             <button onClick={() => window.tokenClient?.requestAccessToken({ prompt: 'select_account' })} className="py-8 px-16 bg-white text-black font-black rounded-[40px] flex items-center gap-6 shadow-2xl hover:scale-105 active:scale-95 transition-all text-xl"><img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-10 h-10" /> Connexion Gmail</button>
          </div>
        ) : (
          <>
            {viewMode === 'pipeline' && (
              <div className="flex-1 overflow-y-auto p-4 sm:p-10 space-y-10 pb-32 max-w-6xl mx-auto w-full animate-in slide-in-from-bottom-6 duration-700">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                   <button onClick={() => setShowSummary(true)} className="group p-8 bg-indigo-600 rounded-[40px] font-black text-[10px] uppercase tracking-widest flex flex-col items-center gap-4 shadow-xl border border-indigo-400 hover:scale-[1.02] transition-all"><BarChart3 className="w-8 h-8 group-hover:scale-110 transition-transform" /> Bilan Global</button>
                   <button onClick={() => runHarvestMission(1)} className="group p-8 bg-white/5 rounded-[40px] font-black text-[10px] uppercase tracking-widest flex flex-col items-center gap-4 border border-white/10 hover:bg-white/10 transition-all"><Database className="w-8 h-8 group-hover:rotate-12 transition-transform" /> Récolte</button>
                   <button onClick={() => isAutopilotRunning ? setIsAutopilotRunning(false) : startAutopilot()} className={`group p-8 rounded-[40px] font-black text-[10px] uppercase tracking-widest flex flex-col items-center gap-4 transition-all ${isAutopilotRunning ? 'bg-red-500 border-red-400 shadow-lg shadow-red-500/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                      {isAutopilotRunning ? <StopCircle className="w-8 h-8 animate-pulse" /> : <Rocket className="w-8 h-8" />}
                      {isAutopilotRunning ? 'Stop Pilote' : 'Autopilote'}
                   </button>
                   <button onClick={() => setShowSetup(true)} className="group p-8 bg-white/5 rounded-[40px] font-black text-[10px] uppercase tracking-widest flex flex-col items-center gap-4 border border-white/10 hover:bg-white/10 transition-all"><Settings className="w-8 h-8 group-hover:rotate-90 transition-transform" /> Réglages</button>
                </div>

                {isAutopilotRunning && (
                  <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-[48px] p-10 space-y-6 shadow-2xl">
                     <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase tracking-[0.5em] text-indigo-400 flex items-center gap-3"><Zap className="w-5 h-5" /> Live Monitor</h3>
                        <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping"></div><div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div></div>
                     </div>
                     <div className="bg-black/40 rounded-3xl p-6 font-mono text-[11px] h-40 overflow-y-auto space-y-2 border border-white/5 no-scrollbar shadow-inner">
                        {autopilotLogs.map((log, i) => <div key={i} className="text-white/60"><span className="text-indigo-500/60 font-bold">[{new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}]</span> {log}</div>)}
                     </div>
                  </div>
                )}

                <div className="space-y-10">
                  <div className="flex items-center justify-between px-6">
                    <h2 className="text-4xl font-black tracking-tighter flex items-center gap-4">Pipeline x{config.concurrency} <span className="bg-white/5 px-4 py-1.5 rounded-full text-[10px] text-white/30 uppercase tracking-widest border border-white/5">Auto-Scaling</span></h2>
                    <div className="flex items-center gap-2 text-[10px] font-black text-white/20 uppercase tracking-widest"><Info className="w-4 h-4" /> {totalInboxCount} mails détectés</div>
                  </div>
                  {tranches.map(t => (
                    <MissionCard key={t.id} tranche={t} isLoading={loading} onStart={() => runHarvestMission(t.id)} onStop={() => stopSignal.current = true} onAnalyze={(emails: any, retry?: boolean) => handleSequentialAnalyze(t.id, emails, retry)} />
                  ))}
                </div>
              </div>
            )}

            {viewMode === 'mail' && (
              <div className="flex-1 flex overflow-hidden bg-black animate-in fade-in duration-700">
                {/* DUAL-PANE SIDEBAR */}
                <aside className={`${isSidebarOpen ? 'w-80 border-r' : 'w-0'} transition-all bg-[#0A0A0A] border-white/5 flex flex-col shrink-0 overflow-hidden relative z-30`}>
                  <div className="p-8 flex flex-col h-full space-y-10">
                    <div className="space-y-3">
                      <button onClick={() => setSelectedFolder(null)} className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${!selectedFolder ? 'bg-indigo-600 shadow-xl shadow-indigo-600/20' : 'text-white/40 hover:bg-white/5'}`}><Inbox className="w-5 h-5" /> Boîte de réception</button>
                      <button className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-[10px] font-black text-white/40 uppercase tracking-widest hover:bg-white/5 transition-all"><Star className="w-5 h-5" /> Favoris</button>
                      <button className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-[10px] font-black text-white/40 uppercase tracking-widest hover:bg-white/5 transition-all"><Archive className="w-5 h-5" /> Archives</button>
                    </div>

                    <div className="flex-1 overflow-hidden flex flex-col space-y-4">
                       <p className="px-6 text-[9px] font-black text-white/20 uppercase tracking-[0.4em] flex items-center justify-between">Intelligence Folders <Layers className="w-3 h-3" /></p>
                       <div className="flex-1 overflow-y-auto pr-2 space-y-1 no-scrollbar">
                         {stats.folders.map(([name, count]) => (
                           <button key={name} onClick={() => setSelectedFolder(name)} className={`w-full flex items-center justify-between px-6 py-3 rounded-xl text-[11px] font-bold transition-all group ${selectedFolder === name ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/5'}`}>
                             <div className="flex items-center gap-3 truncate"><div className={`w-2 h-2 rounded-full ${selectedFolder === name ? 'bg-indigo-500' : 'bg-white/10'}`}></div> {name}</div>
                             <span className="text-[9px] font-black opacity-30">{count}</span>
                           </button>
                         ))}
                         {stats.folders.length === 0 && <div className="px-6 py-10 text-[9px] text-white/10 font-black uppercase italic">Aucun dossier IA créé</div>}
                       </div>
                    </div>
                  </div>
                </aside>
                
                {/* DUAL-PANE MAIL LIST */}
                <div className="flex-1 flex flex-col overflow-hidden bg-[#050505]">
                   <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/40 backdrop-blur-md">
                      <div className="flex items-center gap-4">
                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-3 hover:bg-white/5 rounded-2xl text-white/20 transition-all"><Menu className="w-5 h-5" /></button>
                        <h3 className="text-xl font-black tracking-tighter flex items-center gap-3">{selectedFolder || "Réception"} <span className="bg-white/5 px-3 py-1 rounded-full text-[10px] font-black text-white/20">{filteredEmails.length}</span></h3>
                      </div>
                      <div className="flex gap-2">
                        <div className="relative sm:hidden">
                           <button className="p-3 bg-white/5 rounded-2xl text-white/40"><Search className="w-5 h-5" /></button>
                        </div>
                        <button onClick={() => window.location.reload()} className="p-3 hover:bg-white/5 rounded-2xl text-white/40 transition-all"><RefreshCw className="w-5 h-5" /></button>
                        <button className="p-3 hover:bg-white/5 rounded-2xl text-white/40 transition-all"><Filter className="w-5 h-5" /></button>
                      </div>
                   </div>
                   
                   <div className="flex-1 overflow-y-auto divide-y divide-white/5 no-scrollbar">
                     {filteredEmails.map(e => (
                       <div key={e.id} className="flex items-center gap-6 px-8 py-5 hover:bg-white/[0.03] cursor-pointer group transition-all relative">
                          {e.analysis && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 shadow-[0_0_12px_rgba(99,102,241,0.6)]"></div>}
                          <div className="flex items-center gap-4 shrink-0">
                             <Star className="w-4 h-4 text-white/5 group-hover:text-yellow-500/40 transition-colors" />
                             <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center font-black text-[10px] text-indigo-400 uppercase">{e.from[0]}</div>
                          </div>
                          <div className="w-40 sm:w-56 text-[13px] font-black text-white/80 truncate shrink-0 tracking-tight">{e.from.split('<')[0]}</div>
                          <div className="flex-1 min-w-0 flex flex-col">
                             <span className="font-bold text-[14px] text-white truncate leading-tight">{e.subject}</span>
                             <span className="text-white/20 text-[12px] truncate mt-0.5 font-medium">{e.snippet}</span>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                             {e.analysis && <span className="hidden sm:inline-block px-3 py-1 bg-indigo-600/20 text-indigo-400 text-[8px] font-black uppercase rounded-lg border border-indigo-500/20 tracking-widest">{e.analysis.category}</span>}
                             <span className="text-[10px] font-black text-white/10 uppercase tracking-tighter">{new Date(parseInt(e.internalDate)).toLocaleDateString([], {day:'2-digit', month:'2-digit'})}</span>
                          </div>
                       </div>
                     ))}
                     {filteredEmails.length === 0 && (
                       <div className="flex-1 flex flex-col items-center justify-center py-40 opacity-10 grayscale">
                          <Inbox className="w-20 h-20 mb-6" />
                          <p className="font-black uppercase tracking-[0.5em] text-xs">Aucun email dans ce secteur</p>
                       </div>
                     )}
                   </div>
                </div>
              </div>
            )}

            {viewMode === 'training' && (
              <div className="flex-1 overflow-y-auto p-10 max-w-4xl mx-auto w-full animate-in slide-in-from-bottom-8 duration-1000">
                {!isTrainingActive ? (
                  <div className="p-20 bg-white/5 rounded-[64px] border border-white/5 flex flex-col items-center gap-10 text-center shadow-3xl">
                     <div className="p-10 bg-indigo-600/10 rounded-full border border-indigo-500/20 shadow-2xl"><BrainCircuit className="w-24 h-24 text-indigo-500 animate-bounce" /></div>
                     <div className="space-y-4">
                        <h2 className="text-5xl font-black tracking-tighter">Académie de Calibration</h2>
                        <p className="text-white/20 max-w-sm font-bold uppercase text-[10px] tracking-[0.4em] leading-relaxed">Entraînez manuellement le moteur Titan sur des cas spécifiques pour affiner la précision neuronale.</p>
                     </div>
                     <button onClick={startTrainingSession} className="px-14 py-7 bg-white text-black rounded-[40px] font-black text-sm hover:scale-105 active:scale-95 transition-all shadow-3xl">DÉMARRER LA SESSION</button>
                  </div>
                ) : (
                  <div className="space-y-8">
                     <div className="flex justify-between items-center mb-10 px-6">
                        <div className="flex items-center gap-4">
                           <button onClick={() => setIsTrainingActive(false)} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10"><ChevronLeft className="w-5 h-5" /></button>
                           <h2 className="text-3xl font-black tracking-tighter">Session de Calibration Active</h2>
                        </div>
                        <span className="bg-indigo-600 px-4 py-1.5 rounded-full text-[10px] font-black uppercase">Alpha x{config.concurrency}</span>
                     </div>
                     <div className="grid gap-6">
                        {trainingSteps.map((s, i) => (
                          <div key={i} className={`p-10 rounded-[48px] border transition-all duration-700 ${s.completed ? 'bg-emerald-500/10 border-emerald-500/20 grayscale' : 'bg-white/5 border-white/10 hover:border-white/20'}`}>
                             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-8">
                                <div className="space-y-4 flex-1">
                                   <div className="flex items-center gap-4">
                                      <span className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center font-black text-sm">{i+1}</span>
                                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{s.email.from}</p>
                                   </div>
                                   <h4 className="text-2xl font-black tracking-tight">{s.email.subject}</h4>
                                   <p className="text-white/30 text-[13px] font-medium leading-relaxed">{s.email.snippet}</p>
                                </div>
                                <div className="flex gap-3 shrink-0">
                                   <button onClick={() => setTrainingSteps(prev => prev.map((st, idx) => idx === i ? {...st, completed: true} : st))} className="p-6 bg-emerald-500 text-black rounded-3xl hover:scale-110 active:scale-95 transition-all shadow-xl shadow-emerald-500/20"><Check className="w-6 h-6" /></button>
                                   <button className="p-6 bg-white/5 text-white/40 rounded-3xl hover:bg-red-500/20 hover:text-red-400 transition-all"><Trash2 className="w-6 h-6" /></button>
                                </div>
                             </div>
                          </div>
                        ))}
                     </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* BILAN GLOBAL MODAL */}
      {showSummary && (
        <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-6 animate-in fade-in duration-500">
          <div className="bg-[#080808] w-full max-w-5xl h-[85vh] rounded-[72px] border border-white/10 p-16 overflow-y-auto relative no-scrollbar shadow-[0_0_100px_rgba(0,0,0,0.8)]">
             <button onClick={() => setShowSummary(false)} className="absolute top-12 right-12 p-5 bg-white/5 rounded-full hover:bg-white/10 transition-all"><X className="w-6 h-6" /></button>
             <div className="space-y-16">
                <div className="space-y-3 text-center sm:text-left">
                  <h2 className="text-7xl font-black tracking-tighter leading-none">Bilan Intelligent</h2>
                  <p className="text-[11px] font-black uppercase tracking-[0.6em] text-indigo-500 pl-2">Rapport neuronal titan</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-20">
                   <div className="space-y-6">
                      <h3 className="text-xs font-black uppercase tracking-widest text-white/20 flex items-center gap-3 px-2">Structure des Dossiers <Layers className="w-4 h-4" /></h3>
                      <div className="space-y-2">
                         {stats.folders.length > 0 ? stats.folders.map(([n, c]) => (
                           <div key={n} className="p-6 bg-white/5 rounded-3xl flex justify-between items-center border border-white/5 group hover:bg-white/10 transition-all"><span className="font-black text-sm tracking-tight">{n}</span><span className="font-black text-indigo-400 bg-indigo-500/10 px-4 py-1.5 rounded-full text-xs">{c}</span></div>
                         )) : <div className="py-20 text-center text-white/5 font-black uppercase tracking-widest text-xs">Extraction en cours</div>}
                      </div>
                   </div>
                   <div className="space-y-12">
                      <div className="p-12 bg-indigo-600 rounded-[56px] shadow-3xl shadow-indigo-600/30 flex items-center justify-between relative overflow-hidden">
                         <div className="relative z-10">
                           <p className="text-8xl font-black tracking-tighter leading-none">{stats.count}</p>
                           <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mt-2">Emails organisés</p>
                         </div>
                         <PieChart className="w-32 h-32 opacity-20 relative z-10" />
                         <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 blur-3xl -mr-20 -mt-20"></div>
                      </div>
                      <div className="space-y-6">
                        <h3 className="text-xs font-black uppercase tracking-widest text-white/20 flex items-center gap-3 px-2">Intelligence Tags <ListFilter className="w-4 h-4" /></h3>
                        <div className="flex flex-wrap gap-3">
                           {stats.tags.map(([n, c]) => (
                             <span key={n} className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-tighter hover:bg-white/10 transition-all cursor-default">#{n} <span className="text-indigo-500 opacity-60 ml-2">{c}</span></span>
                           ))}
                        </div>
                      </div>
                   </div>
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
    <div className={`transition-all duration-700 rounded-[64px] border ${isOpen ? 'bg-white/[0.06] border-white/20 shadow-4xl' : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.03]'}`}>
      <div className="p-10 sm:p-14 flex justify-between items-center cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center gap-10 min-w-0">
          <div className={`w-20 h-20 rounded-[32px] flex items-center justify-center transition-all duration-700 shadow-2xl ${tranche.status === 'completed' ? 'bg-emerald-500 text-black' : tranche.status === 'running' ? 'bg-indigo-600 text-white animate-pulse' : 'bg-white/5 text-white/20'}`}>
            {tranche.status === 'completed' ? <Check className="w-10 h-10" /> : <Database className="w-10 h-10" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-3xl font-black tracking-tighter truncate">Bloc d'Analyse {tranche.id}</h3>
            <div className="flex items-center gap-4 mt-3">
               <div className="w-40 h-2 bg-white/5 rounded-full overflow-hidden shadow-inner">
                  <div className={`h-full transition-all duration-1000 ${tranche.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${prog}%` }} />
               </div>
               <span className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em]">{tranche.fetchedCount} / {tranche.totalToFetch}</span>
            </div>
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); tranche.status === 'running' ? onStop() : onStart(); }} disabled={isLoading && tranche.status !== 'running'} className={`p-6 rounded-[28px] transition-all active:scale-90 shadow-2xl ${tranche.status === 'running' ? 'bg-red-500 text-white' : 'bg-white text-black hover:scale-105'}`}>
          {tranche.status === 'running' ? <StopCircle className="w-8 h-8" /> : <PlayCircle className="w-8 h-8" />}
        </button>
      </div>
      {isOpen && (
        <div className="p-10 sm:p-14 pt-0 space-y-8 animate-in slide-in-from-top-10 duration-700">
           <div className="h-px bg-white/5 mb-10 shadow-[0_0_15px_rgba(255,255,255,0.05)]"></div>
           {batches.length > 0 ? batches.map(b => <BatchAccordion key={b.id} batch={b} isLoading={isLoading} onAnalyze={(retry?: boolean) => onAnalyze(b.emails, retry)} onAction={() => {}} onIgnore={() => {}} />) : <div className="py-24 text-center grayscale opacity-10"><Database className="w-20 h-20 mx-auto mb-4" /><p className="font-black uppercase tracking-[0.5em] text-xs">En attente de récolte de données</p></div>}
        </div>
      )}
    </div>
  );
}
