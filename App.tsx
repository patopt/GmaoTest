
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
  BrainCircuit, LayoutGrid, AlertTriangle, ChevronRight, Star, Clock, Trash2, Archive, Reply, Trash, MoreVertical
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

  useEffect(() => {
    localStorage.setItem('harvest_tranches_v8', JSON.stringify(tranches));
    localStorage.setItem('total_inbox_count', String(totalInboxCount));
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
              const total = await getTotalInboxCount();
              const profile = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
              setUserEmail(profile.result.emailAddress);
              setTotalInboxCount(total);
              if (tranches.length === 0) generateTranches(total);
            } catch (e) {
              logger.warn("Token expiré ou invalide. Déconnexion forcée.");
              localStorage.removeItem('google_access_token');
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
        },
      });
    }
    loadGapi();
  }, [tranches.length]);

  useEffect(() => { initGoogleServices(); }, [initGoogleServices]);

  const generateTranches = (total: number) => {
    const numTranches = Math.ceil(total / 1000);
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
        setStatusText(`Titan Turbo x${CONCURRENCY} : ${chunk.length} instances...`);

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
    if (!tranche || tranche.status === 'running') return;

    setLoading(true);
    stopSignal.current = false;
    setTranches(prev => prev.map(t => t.id === trancheId ? { ...t, status: 'running' } : t));

    try {
      let fetched = tranche.fetchedCount;
      let pageToken = tranche.nextPageToken || undefined;
      let allEmails = [...tranche.emails];

      while (fetched < tranche.totalToFetch && !stopSignal.current) {
        setStatusText(`Harvesting... ${fetched}/${tranche.totalToFetch}`);
        const response: any = await window.gapi.client.gmail.users.messages.list({ userId: 'me', maxResults: 50, pageToken, labelIds: ['INBOX'] });
        const messages = response.result.messages || [];
        pageToken = response.result.nextPageToken || null;

        const details = await Promise.all(messages.map(async (m: any) => {
          const res = await window.gapi.client.gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata' });
          const h = res.result.payload.headers;
          return {
            id: res.result.id, threadId: res.result.threadId, snippet: res.result.snippet, internalDate: res.result.internalDate,
            subject: h.find((x:any) => x.name === 'Subject')?.value || 'Sans objet',
            from: h.find((x:any) => x.name === 'From')?.value || 'Inconnu',
            processed: false, organized: false, failed: false
          } as EnrichedEmail;
        }));

        allEmails = [...allEmails, ...details];
        fetched += details.length;
        setTranches(prev => prev.map(t => t.id === trancheId ? { ...t, emails: allEmails, fetchedCount: fetched, nextPageToken: pageToken } : t));
        if (!pageToken) break;
      }
      setTranches(prev => prev.map(t => t.id === trancheId ? { ...t, status: stopSignal.current ? 'stopped' : 'completed' } : t));
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const startAutopilot = () => {
    setIsAutopilotRunning(true);
    setAutopilotLogs(["[SYSTEM] Autopilote activé. Analyse de la file d'attente..."]);
    // Simuler le processus autopilot
    const process = async () => {
      const pending = tranches.flatMap(t => t.emails).filter(e => !e.processed);
      for (const email of pending) {
        if (!isAutopilotRunning) break;
        setAutopilotLogs(prev => [`[ANALYSIS] Traitement de : ${email.subject}`, ...prev.slice(0, 10)]);
        await new Promise(r => setTimeout(r, 2000));
      }
    };
    process();
  };

  const startTrainingSession = () => {
    const sample = tranches.flatMap(t => t.emails).filter(e => !e.processed).slice(0, 5);
    if (sample.length === 0) {
      alert("Aucun email non traité pour l'entraînement.");
      return;
    }
    setTrainingSteps(sample.map(e => ({ email: e, completed: false })));
    setIsTrainingActive(true);
  };

  // RECHERCHE FILTRÉE (Fonctionne maintenant !)
  const allEmails = useMemo(() => tranches.flatMap(t => t.emails), [tranches]);
  const filteredEmails = useMemo(() => {
    if (!searchQuery.trim()) return allEmails;
    const q = searchQuery.toLowerCase().trim();
    return allEmails.filter(e => 
      e.subject?.toLowerCase().includes(q) || 
      e.from?.toLowerCase().includes(q) || 
      e.snippet?.toLowerCase().includes(q) ||
      e.analysis?.category.toLowerCase().includes(q) ||
      e.analysis?.suggestedFolder.toLowerCase().includes(q)
    );
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
        if (fs !== config.folderStyle && confirm("Changer de nomenclature ? Titan renommmera vos dossiers existants.")) {
          await renameAllLabelsToStyle(fs);
        }
        setConfig({ provider: p, model: m, concurrency: c, folderStyle: fs }); 
        localStorage.setItem('folder_style', fs);
        setShowSetup(false); 
      }} onReset={() => { localStorage.clear(); window.location.reload(); }} onLogout={() => {}} isLoggedIn={!!userEmail} />
      <LogConsole />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-white">
      <Header userEmail={userEmail} onLogout={() => { localStorage.removeItem('google_access_token'); window.location.reload(); }} />
      
      {userEmail && (
        <nav className="bg-black/80 border-b border-white/5 sticky top-[73px] z-40 backdrop-blur-xl">
           <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-1">
                <button onClick={() => setViewMode('pipeline')} className={`px-4 py-2 rounded-2xl text-[10px] font-black transition-all flex items-center gap-2 uppercase tracking-widest ${viewMode === 'pipeline' ? 'bg-indigo-600 shadow-lg shadow-indigo-600/30' : 'text-white/30 hover:bg-white/5'}`}><LayoutGrid className="w-3 h-3" /> Pipeline</button>
                <button onClick={() => setViewMode('mail')} className={`px-4 py-2 rounded-2xl text-[10px] font-black transition-all flex items-center gap-2 uppercase tracking-widest ${viewMode === 'mail' ? 'bg-indigo-600 shadow-lg shadow-indigo-600/30' : 'text-white/30 hover:bg-white/5'}`}><Mail className="w-3 h-3" /> Mail Manager</button>
                <button onClick={() => setViewMode('training')} className={`px-4 py-2 rounded-2xl text-[10px] font-black transition-all flex items-center gap-2 uppercase tracking-widest ${viewMode === 'training' ? 'bg-indigo-600 shadow-lg shadow-indigo-600/30' : 'text-white/30 hover:bg-white/5'}`}><BrainCircuit className="w-3 h-3" /> Training</button>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
                <input type="text" placeholder="RECHERCHER TITAN..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-2.5 text-[10px] font-bold outline-none focus:border-indigo-500 transition-all placeholder:text-white/10" />
              </div>
           </div>
        </nav>
      )}

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-10 space-y-8 pb-32">
        {!userEmail ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in duration-700">
             <div className="bg-indigo-600/10 p-10 rounded-[56px] border border-indigo-500/20 mb-10">
                <Mail className="w-20 h-20 text-indigo-500" />
             </div>
             <h2 className="text-4xl font-black tracking-tighter mb-4">Moteur Titan Désactivé</h2>
             <p className="text-white/40 mb-12 max-w-sm font-bold uppercase text-[10px] tracking-widest">Connectez votre Gmail pour lancer l'organisation intelligente x{config.concurrency}</p>
             <button onClick={() => window.tokenClient?.requestAccessToken({ prompt: 'select_account' })} className="py-7 px-14 bg-white text-black font-black rounded-[40px] flex items-center gap-6 shadow-2xl hover:scale-105 active:scale-95 transition-all text-xl"><img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-8 h-8" /> Sync Gmail</button>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-700">
            
            {/* Command Center - Uniquement sur Pipeline */}
            {viewMode === 'pipeline' && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                 <button onClick={() => setShowSummary(true)} className="group p-6 bg-indigo-600 rounded-[32px] font-black text-[10px] uppercase tracking-widest flex flex-col items-center gap-3 shadow-xl border border-indigo-400 hover:scale-[1.02] transition-all"><BarChart3 className="w-6 h-6 group-hover:scale-110 transition-transform" /> Bilan Global</button>
                 <button onClick={() => runHarvestMission(1)} className="group p-6 bg-white/5 rounded-[32px] font-black text-[10px] uppercase tracking-widest flex flex-col items-center gap-3 border border-white/10 hover:bg-white/10 transition-all"><Database className="w-6 h-6 group-hover:rotate-12 transition-transform" /> Récolte</button>
                 <button onClick={() => isAutopilotRunning ? setIsAutopilotRunning(false) : startAutopilot()} className={`group p-6 rounded-[32px] font-black text-[10px] uppercase tracking-widest flex flex-col items-center gap-3 transition-all ${isAutopilotRunning ? 'bg-red-500 border-red-400' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                    {isAutopilotRunning ? <StopCircle className="w-6 h-6 animate-pulse" /> : <Rocket className="w-6 h-6" />}
                    {isAutopilotRunning ? 'Stop Pilote' : 'Autopilote'}
                 </button>
                 <button onClick={() => setShowSetup(true)} className="group p-6 bg-white/5 rounded-[32px] font-black text-[10px] uppercase tracking-widest flex flex-col items-center gap-3 border border-white/10 hover:bg-white/10 transition-all"><Settings className="w-6 h-6 group-hover:rotate-90 transition-transform" /> Réglages</button>
              </div>
            )}

            {/* Autopilot Monitor */}
            {isAutopilotRunning && (
              <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-[40px] p-8 space-y-4 animate-in slide-in-from-top-4 duration-500">
                 <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-[0.4em] text-indigo-400 flex items-center gap-2"><Rocket className="w-4 h-4" /> Live Autopilote Monitor</h3>
                    <div className="flex gap-1">
                       <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
                       <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    </div>
                 </div>
                 <div className="bg-black/40 rounded-2xl p-4 font-mono text-[10px] h-32 overflow-y-auto space-y-1 border border-white/5 no-scrollbar">
                    {autopilotLogs.map((log, i) => <div key={i} className="text-white/60"><span className="text-indigo-500 font-bold">[{new Date().toLocaleTimeString()}]</span> {log}</div>)}
                 </div>
              </div>
            )}

            {viewMode === 'pipeline' && (
              <div className="space-y-8">
                <div className="flex items-center justify-between px-4">
                  <h2 className="text-3xl font-black tracking-tighter flex items-center gap-3">Pipeline Turbo <span className="bg-white/10 px-3 py-1 rounded-full text-xs text-indigo-400">x{config.concurrency}</span></h2>
                </div>
                {tranches.map(t => (
                  <MissionCard key={t.id} tranche={t} isLoading={loading} onStart={() => runHarvestMission(t.id)} onStop={() => stopSignal.current = true} onAnalyze={(emails: any, retry?: boolean) => handleSequentialAnalyze(t.id, emails, retry)} />
                ))}
              </div>
            )}

            {viewMode === 'mail' && (
              <div className="space-y-6 animate-in slide-in-from-bottom-6 duration-700">
                <div className="bg-white/5 border border-white/5 rounded-[48px] overflow-hidden">
                   {/* Header Gmail Style */}
                   <div className="bg-white/5 px-8 py-5 border-b border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <Archive className="w-4 h-4 text-white/20 hover:text-white transition-colors cursor-pointer" />
                        <Trash className="w-4 h-4 text-white/20 hover:text-white transition-colors cursor-pointer" />
                        <Reply className="w-4 h-4 text-white/20 hover:text-white transition-colors cursor-pointer" />
                      </div>
                      <MoreVertical className="w-4 h-4 text-white/20" />
                   </div>
                   {/* Inbox List */}
                   <div className="divide-y divide-white/5">
                     {filteredEmails.slice(0, 50).map(e => (
                       <div key={e.id} className="flex items-center gap-6 px-8 py-4 hover:bg-white/5 transition-all cursor-pointer group">
                          <Star className="w-4 h-4 text-white/5 group-hover:text-yellow-500/40 transition-colors shrink-0" />
                          <div className="w-32 sm:w-48 font-black text-[12px] text-white/80 truncate shrink-0">{e.from?.split('<')[0] || 'Inconnu'}</div>
                          <div className="flex-1 min-w-0 flex items-center gap-3">
                             <span className="font-bold text-[12px] text-white truncate shrink-0">{e.subject}</span>
                             <span className="text-white/20 text-[12px] truncate">- {e.snippet}</span>
                          </div>
                          {e.analysis && <span className="px-3 py-1 bg-indigo-600/20 text-indigo-400 text-[9px] font-black uppercase rounded-full border border-indigo-500/20">{e.analysis.category}</span>}
                          <div className="w-16 text-right text-[10px] font-bold text-white/10">{new Date(parseInt(e.internalDate)).toLocaleDateString([], {day:'2-digit', month:'2-digit'})}</div>
                       </div>
                     ))}
                     {filteredEmails.length === 0 && <div className="py-32 text-center text-white/10 font-black uppercase tracking-[0.4em]">Boîte de réception vide ou aucun résultat</div>}
                   </div>
                </div>
              </div>
            )}

            {viewMode === 'training' && (
              <div className="animate-in slide-in-from-bottom-6 duration-700">
                {!isTrainingActive ? (
                  <div className="p-16 bg-white/5 rounded-[56px] border border-white/5 flex flex-col items-center gap-8 text-center shadow-3xl">
                     <div className="bg-indigo-600/20 p-8 rounded-full border border-indigo-500/20"><BrainCircuit className="w-20 h-20 text-indigo-500" /></div>
                     <div className="space-y-2">
                        <h2 className="text-4xl font-black tracking-tighter">Académie Titan</h2>
                        <p className="text-white/30 max-w-sm font-bold uppercase text-[10px] tracking-widest leading-relaxed">Entraînez l'IA en classant manuellement une sélection de 5 emails incertains.</p>
                     </div>
                     <button onClick={startTrainingSession} className="px-12 py-6 bg-white text-black rounded-[32px] font-black text-sm hover:scale-105 active:scale-95 transition-all shadow-2xl">Lancer l'entraînement</button>
                  </div>
                ) : (
                  <div className="space-y-8">
                     <div className="flex items-center justify-between px-6">
                        <h2 className="text-2xl font-black flex items-center gap-3"><BrainCircuit className="text-indigo-500" /> Session en cours</h2>
                        <button onClick={() => setIsTrainingActive(false)} className="text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-red-400">Quitter</button>
                     </div>
                     <div className="grid gap-6">
                        {trainingSteps.map((step, i) => (
                          <div key={i} className={`p-8 rounded-[40px] border transition-all ${step.completed ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/5 border-white/10'}`}>
                             <div className="flex justify-between items-start gap-6">
                                <div className="space-y-4 flex-1">
                                   <div className="flex items-center gap-3">
                                      <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-black text-xs">{i+1}</span>
                                      <span className="font-black text-xs uppercase text-white/40">{step.email.from}</span>
                                   </div>
                                   <h4 className="text-xl font-black">{step.email.subject}</h4>
                                   <p className="text-white/40 text-[12px]">{step.email.snippet}</p>
                                </div>
                                <div className="flex gap-2">
                                   <button onClick={() => setTrainingSteps(prev => prev.map((s, idx) => idx === i ? {...s, completed: true, userChoice: 'ok'} : s))} className="p-4 bg-white/5 hover:bg-emerald-500 text-white rounded-2xl transition-all"><Check className="w-5 h-5" /></button>
                                   <button onClick={() => setTrainingSteps(prev => prev.map((s, idx) => idx === i ? {...s, completed: true, userChoice: 'ignore'} : s))} className="p-4 bg-white/5 hover:bg-red-500 text-white rounded-2xl transition-all"><Trash2 className="w-5 h-5" /></button>
                                </div>
                             </div>
                          </div>
                        ))}
                     </div>
                  </div>
                )}
              </div>
            )}

            {/* Bilan Global Modal */}
            {showSummary && (
              <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6 animate-in fade-in duration-500">
                <div className="bg-[#080808] w-full max-w-4xl h-[85vh] rounded-[64px] border border-white/10 p-12 overflow-y-auto relative shadow-4xl no-scrollbar">
                   <button onClick={() => setShowSummary(false)} className="absolute top-10 right-10 p-4 bg-white/5 rounded-full hover:bg-white/10 transition-all"><X className="w-6 h-6" /></button>
                   <div className="space-y-12">
                      <div className="space-y-4">
                        <h2 className="text-6xl font-black tracking-tighter">Bilan Intelligent</h2>
                        <p className="text-[10px] font-black uppercase tracking-[0.6em] text-indigo-500">Données extraites par titan x{config.concurrency}</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                        <div className="space-y-6">
                           <h3 className="text-xs font-black uppercase tracking-widest text-white/40 flex items-center gap-3"><Layers className="w-4 h-4" /> Dossiers Dynamiques</h3>
                           <div className="space-y-2">
                              {stats.folders.length > 0 ? stats.folders.map(([name, count]) => (
                                <div key={name} className="p-5 bg-white/5 rounded-3xl flex justify-between items-center border border-white/5"><span className="font-black text-sm">{name}</span><span className="bg-indigo-600 px-4 py-1 rounded-full text-[10px] font-black">{count}</span></div>
                              )) : <div className="py-10 text-white/10 font-black uppercase text-[10px]">Aucun dossier créé</div>}
                           </div>
                        </div>
                        <div className="space-y-10">
                           <div className="space-y-6">
                             <h3 className="text-xs font-black uppercase tracking-widest text-white/40 flex items-center gap-3"><ListFilter className="w-4 h-4" /> Intelligence Tags</h3>
                             <div className="flex flex-wrap gap-2">
                               {stats.tags.length > 0 ? stats.tags.map(([name, count]) => (
                                 <span key={name} className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-tighter">#{name} ({count})</span>
                               )) : <div className="text-white/10 font-black uppercase text-[10px]">Aucun tag identifié</div>}
                             </div>
                           </div>
                           <div className="p-8 bg-indigo-600 rounded-[40px] flex items-center justify-between shadow-2xl shadow-indigo-600/20">
                              <div className="space-y-1">
                                <p className="text-4xl font-black">{stats.count}</p>
                                <p className="text-[8px] font-black uppercase tracking-widest opacity-60">Emails rangés au total</p>
                              </div>
                              <PieChart className="w-12 h-12 opacity-40" />
                           </div>
                        </div>
                      </div>
                   </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
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
    <div className={`transition-all rounded-[56px] border ${isOpen ? 'bg-white/[0.06] border-white/20 shadow-4xl' : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.03]'}`}>
      <div className="p-10 flex justify-between items-center cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center gap-8 min-w-0">
          <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-[28px] flex items-center justify-center transition-all ${tranche.status === 'completed' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : tranche.status === 'running' ? 'bg-indigo-600 animate-pulse' : 'bg-white/5 text-white/20'}`}>
            {tranche.status === 'completed' ? <Check className="w-8 h-8 sm:w-10 sm:h-10" /> : <Database className="w-8 h-8 sm:w-10 sm:h-10" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-2xl sm:text-3xl font-black tracking-tighter truncate">Bloc de Récolte {tranche.id}</h3>
            <div className="flex items-center gap-3 mt-3">
               <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-1000 ${tranche.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${prog}%` }} />
               </div>
               <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">{tranche.fetchedCount} mails récoltés</span>
            </div>
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); tranche.status === 'running' ? onStop() : onStart(); }} disabled={isLoading && tranche.status !== 'running'} className={`p-5 rounded-[24px] transition-all active:scale-90 ${tranche.status === 'running' ? 'bg-red-500 text-white' : 'bg-white text-black hover:scale-105'}`}>{tranche.status === 'running' ? <StopCircle className="w-7 h-7" /> : <PlayCircle className="w-7 h-7" />}</button>
      </div>
      {isOpen && (
        <div className="p-10 space-y-6 animate-in slide-in-from-top-6 duration-700">
           <div className="h-px bg-white/5 mb-8"></div>
           {batches.length > 0 ? batches.map(b => <BatchAccordion key={b.id} batch={b} isLoading={isLoading} onAnalyze={(retry?: boolean) => onAnalyze(b.emails, retry)} onAction={() => {}} onIgnore={() => {}} />) : <div className="py-20 text-center text-white/5 font-black uppercase text-[12px] tracking-[0.5em]">Prêt pour extraction de données</div>}
        </div>
      )}
    </div>
  );
}
