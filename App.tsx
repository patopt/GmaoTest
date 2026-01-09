
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Header from './components/Header';
import Setup from './components/Setup';
import LogConsole from './components/LogConsole';
import BatchAccordion from './components/BatchAccordion';
import { GMAIL_DISCOVERY_DOCS, GMAIL_SCOPES, GOOGLE_CLIENT_ID, DEFAULT_AI_MODEL } from './constants';
import { EnrichedEmail, HarvestTranche, ViewMode, FolderStyle, TrainingStep } from './types';
import { getTotalInboxCount, moveEmailsToLabel, applyTagsToEmail, getUserLabels } from './services/gmailService';
import { analyzeSingleEmail, cleanAIResponse } from './services/aiService';
import { GoogleGenAI } from "@google/genai";
import { 
  Loader2, Database, Settings, StopCircle, Rocket, Layers, ListFilter, 
  PlayCircle, Check, Zap, BarChart3, PieChart, Info, X, Search, Mail, 
  BrainCircuit, LayoutGrid, Star, Archive, Trash, MoreVertical, Menu,
  Inbox, RefreshCw, ChevronLeft, Filter, Sparkles
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  
  const [isAutopilotRunning, setIsAutopilotRunning] = useState(false);
  const [autopilotLogs, setAutopilotLogs] = useState<string[]>([]);
  const [trainingSteps, setTrainingSteps] = useState<TrainingStep[]>([]);
  const [isTrainingActive, setIsTrainingActive] = useState(false);

  const [totalInboxCount, setTotalInboxCount] = useState<number>(() => Number(localStorage.getItem('total_inbox_count')) || 0);
  const [tranches, setTranches] = useState<HarvestTranche[]>(() => {
    const saved = localStorage.getItem('harvest_tranches_v12');
    return saved ? JSON.parse(saved) : [];
  });

  const stopSignal = useRef<boolean>(false);

  // Persistance Mémoire
  useEffect(() => {
    if (tranches.length > 0) {
      localStorage.setItem('harvest_tranches_v12', JSON.stringify(tranches));
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
          logger.success("Synchronisation Gmail établie.");
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
    if (isAnalyzing) return;
    setIsAnalyzing(true);
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
            const currentLabels = await getUserLabels();
            const analysis = await analyzeSingleEmail(email, config.model, config.provider, currentLabels);
            const moved = await moveEmailsToLabel([email.id], analysis.suggestedFolder, config.folderStyle);
            if (moved && analysis.tags.length > 0) {
              await applyTagsToEmail(email.id, analysis.tags, config.folderStyle);
            }
            setTranches(curr => curr.map(t => t.id === trancheId ? {
              ...t, emails: t.emails.map(e => e.id === email.id ? { ...e, analysis, processed: true, organized: moved, failed: false } : e)
            } : t));
          } catch {
            setTranches(curr => curr.map(t => t.id === trancheId ? {
              ...t, emails: t.emails.map(e => e.id === email.id ? { ...e, failed: true } : e)
            } : t));
          }
        }));
      }
    } finally {
      setIsAnalyzing(false);
      setStatusText('');
    }
  };

  const runHarvestMission = async (trancheId: number) => {
    const tranche = tranches.find(t => t.id === trancheId);
    if (!tranche || loading) return;

    setLoading(true);
    stopSignal.current = false;
    setTranches(prev => prev.map(t => t.id === trancheId ? { ...t, status: 'running' } : t));

    try {
      let fetched = tranche.fetchedCount;
      let pageToken = tranche.nextPageToken || undefined;
      let allEmails = [...tranche.emails];

      while (fetched < tranche.totalToFetch && !stopSignal.current) {
        setStatusText(`Récolte : ${fetched}/${tranche.totalToFetch}`);
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
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const startAutopilot = async () => {
    setIsAutopilotRunning(true);
    stopSignal.current = false;
    setAutopilotLogs(["[START] Autopilote Titanesque Activé.", "[STEP 1] Récolte globale des emails..."]);
    
    // 1. Récolte complète
    for (const tranche of tranches) {
      if (stopSignal.current) break;
      if (tranche.status !== 'completed') {
        setAutopilotLogs(prev => [`[HARVEST] Bloc ${tranche.id}`, ...prev]);
        await runHarvestMission(tranche.id);
      }
    }
    
    if (stopSignal.current) {
      setAutopilotLogs(prev => ["[STOP] Arrêt demandé.", ...prev]);
      setIsAutopilotRunning(false);
      return;
    }

    setAutopilotLogs(prev => ["[STEP 2] Analyse Neuronale par Blocs...", ...prev]);
    
    // 2. Analyse
    for (const tranche of tranches) {
      if (stopSignal.current) break;
      const pending = tranche.emails.filter(e => !e.processed);
      if (pending.length > 0) {
        setAutopilotLogs(prev => [`[ANALYSE] Bloc ${tranche.id} (${pending.length} mails)`, ...prev]);
        await handleSequentialAnalyze(tranche.id, tranche.emails);
      }
    }

    setIsAutopilotRunning(false);
    setAutopilotLogs(prev => ["[FIN] Autopilote terminé avec succès.", ...prev]);
  };

  const optimizeFolders = async () => {
    if (stats.folders.length < 2) return alert("Pas assez de dossiers.");
    setStatusText("Analyse de l'arborescence...");
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Voici mes dossiers Gmail : ${stats.folders.map(f => f[0]).join(', ')}. Suggère des simplifications en JSON : {"suggestions": [{"from": "Ancien", "to": "Nouveau", "reason": "Pq"}]}`;
      const response = await ai.models.generateContent({ model: config.model, contents: prompt, config: { responseMimeType: "application/json" } });
      const sugg = JSON.parse(cleanAIResponse(response.text)).suggestions;
      alert(`Suggestions d'optimisation : ${sugg.length}\n${sugg.map((s:any) => `- ${s.from} -> ${s.to}`).join('\n')}`);
    } catch { alert("Erreur optimisation."); }
    finally { setIsAnalyzing(false); setStatusText(""); }
  };

  const allEmails = useMemo(() => tranches.flatMap(t => t.emails), [tranches]);
  const filteredEmails = useMemo(() => {
    let list = allEmails;
    if (selectedFolder) list = list.filter(e => e.analysis?.suggestedFolder === selectedFolder);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(e => e.subject?.toLowerCase().includes(q) || e.from?.toLowerCase().includes(q) || e.snippet?.toLowerCase().includes(q));
    }
    return list;
  }, [allEmails, searchQuery, selectedFolder]);

  const stats = useMemo(() => {
    const folders = new Map<string, number>();
    const processed = allEmails.filter(e => e.processed);
    processed.forEach(e => {
      if (e.analysis) folders.set(e.analysis.suggestedFolder, (folders.get(e.analysis.suggestedFolder) || 0) + 1);
    });
    return { folders: Array.from(folders.entries()).sort((a,b) => b[1] - a[1]), count: processed.length };
  }, [allEmails]);

  if (showSetup) return (
    <div className="bg-black min-h-screen text-white">
      <Header userEmail={userEmail} onLogout={() => { localStorage.removeItem('google_access_token'); window.location.reload(); }} />
      <Setup onSave={(p, m, c, fs) => { setConfig({ provider: p, model: m, concurrency: c, folderStyle: fs }); localStorage.setItem('ai_provider', p); localStorage.setItem('ai_model', m); localStorage.setItem('ai_concurrency', String(c)); localStorage.setItem('folder_style', fs); setShowSetup(false); }} onReset={() => { localStorage.clear(); window.location.reload(); }} onLogout={() => {}} isLoggedIn={!!userEmail} />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-white overflow-hidden">
      <Header userEmail={userEmail} onLogout={() => { localStorage.removeItem('google_access_token'); window.location.reload(); }} />
      
      {userEmail && (
        <nav className="bg-black/80 border-b border-white/5 sticky top-[73px] z-40 backdrop-blur-xl shrink-0">
           <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                <button onClick={() => setViewMode('pipeline')} className={`px-4 py-2.5 rounded-2xl text-[10px] font-black transition-all flex items-center gap-2 uppercase tracking-widest shrink-0 ${viewMode === 'pipeline' ? 'bg-indigo-600 shadow-xl' : 'text-white/30 hover:bg-white/5'}`}><LayoutGrid className="w-4 h-4" /> Pipeline</button>
                <button onClick={() => setViewMode('mail')} className={`px-4 py-2.5 rounded-2xl text-[10px] font-black transition-all flex items-center gap-2 uppercase tracking-widest shrink-0 ${viewMode === 'mail' ? 'bg-indigo-600 shadow-xl' : 'text-white/30 hover:bg-white/5'}`}><Mail className="w-4 h-4" /> Manager</button>
                <button onClick={() => setViewMode('training')} className={`px-4 py-2.5 rounded-2xl text-[10px] font-black transition-all flex items-center gap-2 uppercase tracking-widest shrink-0 ${viewMode === 'training' ? 'bg-indigo-600 shadow-xl' : 'text-white/30 hover:bg-white/5'}`}><BrainCircuit className="w-4 h-4" /> Calibration</button>
              </div>
              <div className="relative hidden md:block w-72">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input type="text" placeholder="RECHERCHER..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-[10px] font-bold outline-none focus:border-indigo-500 transition-all placeholder:text-white/10" />
              </div>
           </div>
        </nav>
      )}

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {isAnalyzing && (
          <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
             <div className="bg-[#0A0A0A] border border-white/10 p-10 rounded-[48px] shadow-4xl flex flex-col items-center gap-6 max-w-sm w-full">
                <div className="relative"><Loader2 className="w-16 h-16 text-indigo-500 animate-spin" /><Sparkles className="absolute inset-0 m-auto w-6 h-6 text-indigo-400 animate-pulse" /></div>
                <div className="text-center space-y-2"><h3 className="text-xl font-black uppercase tracking-widest">Calcul Neural...</h3><p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">{statusText}</p></div>
                <button onClick={() => stopSignal.current = true} className="px-6 py-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-2xl text-[10px] font-black uppercase transition-all">Interrompre</button>
             </div>
          </div>
        )}

        {!userEmail ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
             <Rocket className="w-24 h-24 text-indigo-500 animate-pulse mb-10" />
             <h2 className="text-5xl font-black tracking-tighter mb-4">Titan Hors Ligne</h2>
             <button onClick={() => window.tokenClient?.requestAccessToken({ prompt: 'select_account' })} className="py-8 px-16 bg-white text-black font-black rounded-[40px] flex items-center gap-6 shadow-2xl hover:scale-105 transition-all text-xl"><img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-10 h-10" /> Sync Gmail</button>
          </div>
        ) : (
          <>
            {viewMode === 'pipeline' && (
              <div className="flex-1 overflow-y-auto p-4 sm:p-10 space-y-10 pb-32 max-w-6xl mx-auto w-full">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                   <button onClick={() => setShowSummary(true)} className="p-8 bg-indigo-600 rounded-[40px] font-black text-[10px] uppercase tracking-widest flex flex-col items-center gap-4 shadow-xl"><BarChart3 className="w-8 h-8" /> Bilan</button>
                   <button onClick={() => runHarvestMission(1)} className="p-8 bg-white/5 rounded-[40px] font-black text-[10px] uppercase tracking-widest flex flex-col items-center gap-4 border border-white/10"><Database className="w-8 h-8" /> Récolte</button>
                   <button onClick={() => isAutopilotRunning ? (stopSignal.current = true) : startAutopilot()} className={`p-8 rounded-[40px] font-black text-[10px] uppercase tracking-widest flex flex-col items-center gap-4 transition-all ${isAutopilotRunning ? 'bg-red-500 border-red-400' : 'bg-white/5 border-white/10'}`}>
                      {isAutopilotRunning ? <StopCircle className="w-8 h-8" /> : <Rocket className="w-8 h-8" />}
                      {isAutopilotRunning ? 'Stop' : 'Autopilot'}
                   </button>
                   <button onClick={() => setShowSetup(true)} className="p-8 bg-white/5 rounded-[40px] font-black text-[10px] uppercase tracking-widest flex flex-col items-center gap-4 border border-white/10"><Settings className="w-8 h-8" /> Réglages</button>
                </div>

                {isAutopilotRunning && (
                  <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-[48px] p-8 space-y-6">
                     <h3 className="text-xs font-black uppercase tracking-[0.5em] text-indigo-400 flex items-center gap-3"><Zap className="w-5 h-5" /> Autopilot Live</h3>
                     <div className="bg-black/40 rounded-3xl p-6 font-mono text-[11px] h-40 overflow-y-auto space-y-2 no-scrollbar">
                        {autopilotLogs.map((log, i) => <div key={i} className="text-white/60"><span className="text-indigo-500/60 font-bold">[{i}]</span> {log}</div>)}
                     </div>
                  </div>
                )}

                <div className="space-y-8">
                  <h2 className="text-4xl font-black tracking-tighter px-6">Mission Pipeline <span className="text-indigo-400">x{config.concurrency}</span></h2>
                  {tranches.map(t => (
                    <MissionCard key={t.id} tranche={t} isLoading={isAnalyzing || loading} onStart={() => runHarvestMission(t.id)} onStop={() => stopSignal.current = true} onAnalyze={(emails: any, retry?: boolean) => handleSequentialAnalyze(t.id, emails, retry)} />
                  ))}
                </div>
              </div>
            )}

            {viewMode === 'mail' && (
              <div className="flex-1 flex overflow-hidden bg-black relative">
                {/* Sidebar Responsif */}
                <aside className={`absolute md:relative z-40 h-full bg-[#0A0A0A] border-r border-white/5 transition-all duration-500 overflow-hidden flex flex-col ${isSidebarOpen ? 'w-80 translate-x-0' : 'w-0 -translate-x-full md:translate-x-0'}`}>
                  <div className="p-8 flex flex-col h-full space-y-10 w-80 shrink-0">
                    <button onClick={() => { setSelectedFolder(null); if(window.innerWidth < 768) setIsSidebarOpen(false); }} className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${!selectedFolder ? 'bg-indigo-600 shadow-xl' : 'text-white/40'}`}><Inbox className="w-5 h-5" /> Réception</button>
                    <div className="flex-1 overflow-y-auto no-scrollbar space-y-1">
                       <p className="px-6 text-[9px] font-black text-white/20 uppercase tracking-[0.4em] mb-4">Dossiers IA</p>
                       {stats.folders.map(([name, count]) => (
                         <button key={name} onClick={() => { setSelectedFolder(name); if(window.innerWidth < 768) setIsSidebarOpen(false); }} className={`w-full flex items-center justify-between px-6 py-3 rounded-xl text-[11px] font-bold transition-all ${selectedFolder === name ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/5'}`}>
                           <span className="truncate">{name}</span><span className="text-[9px] opacity-30">{count}</span>
                         </button>
                       ))}
                    </div>
                  </div>
                </aside>

                {/* Overlay pour fermer le menu sur mobile */}
                {isSidebarOpen && window.innerWidth < 768 && <div className="fixed inset-0 bg-black/60 z-30" onClick={() => setIsSidebarOpen(false)}></div>}
                
                <div className="flex-1 flex flex-col overflow-hidden bg-white/[0.02]">
                   <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#050505]/80 backdrop-blur-xl">
                      <div className="flex items-center gap-4">
                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-3 bg-white/5 rounded-2xl md:hidden"><Menu className="w-5 h-5" /></button>
                        <h3 className="text-xl font-black tracking-tighter">{selectedFolder || "Boîte de réception"}</h3>
                      </div>
                      <button onClick={() => window.location.reload()} className="p-3 bg-white/5 rounded-2xl hover:bg-indigo-600/20 transition-all"><RefreshCw className="w-5 h-5" /></button>
                   </div>
                   <div className="flex-1 overflow-y-auto divide-y divide-white/5 no-scrollbar">
                     {filteredEmails.map(e => (
                       <div key={e.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 px-6 py-5 hover:bg-white/[0.03] cursor-pointer group transition-all relative">
                          {e.analysis && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 shadow-xl"></div>}
                          <div className="flex items-center justify-between sm:justify-start gap-4 shrink-0">
                             <div className="flex items-center gap-4">
                               <Star className="w-4 h-4 text-white/5 group-hover:text-yellow-500/40 shrink-0" />
                               <div className="w-32 sm:w-48 text-[13px] font-black text-white/80 truncate shrink-0">{e.from.split('<')[0]}</div>
                             </div>
                             <span className="sm:hidden text-[10px] font-black text-white/10">{new Date(parseInt(e.internalDate)).toLocaleDateString([], {day:'2-digit', month:'2-digit'})}</span>
                          </div>
                          <div className="flex-1 min-w-0 flex flex-col">
                            <span className="font-bold text-[14px] text-white truncate">{e.subject}</span>
                            <span className="text-white/20 text-[12px] truncate mt-0.5">{e.snippet}</span>
                          </div>
                          <div className="hidden sm:block text-[10px] font-black text-white/10 uppercase tracking-tighter">{new Date(parseInt(e.internalDate)).toLocaleDateString([], {day:'2-digit', month:'2-digit'})}</div>
                       </div>
                     ))}
                     {filteredEmails.length === 0 && <div className="py-40 text-center opacity-10 font-black uppercase tracking-[0.4em] text-xs">Dossier Vide</div>}
                   </div>
                </div>
              </div>
            )}
            
            {viewMode === 'training' && (
              <div className="flex-1 overflow-y-auto p-10 max-w-4xl mx-auto w-full">
                <div className="p-20 bg-white/5 rounded-[64px] border border-white/5 flex flex-col items-center gap-10 text-center">
                   <BrainCircuit className="w-24 h-24 text-indigo-500 animate-bounce" />
                   <h2 className="text-5xl font-black tracking-tighter">Calibration Titan</h2>
                   <p className="text-white/20 max-w-sm font-bold uppercase text-[10px] tracking-[0.4em]">Optimisation manuelle des algorithmes de classement IA.</p>
                   <button onClick={() => alert("Calibration en cours de déploiement...")} className="px-14 py-7 bg-white text-black rounded-[40px] font-black text-sm active:scale-95 transition-all">Lancer Session</button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Bilan Global */}
      {showSummary && (
        <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-[#080808] w-full max-w-5xl h-[85vh] rounded-[72px] border border-white/10 p-12 sm:p-16 overflow-y-auto relative no-scrollbar shadow-4xl">
             <button onClick={() => setShowSummary(false)} className="absolute top-10 right-10 p-5 bg-white/5 rounded-full"><X className="w-6 h-6" /></button>
             <div className="space-y-16">
                <h2 className="text-6xl font-black tracking-tighter">Bilan Intelligent</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                   <div className="space-y-6">
                      <div className="flex justify-between items-center px-2">
                        <h3 className="text-xs font-black uppercase tracking-widest text-white/20">Répartition Dossiers</h3>
                        <button onClick={optimizeFolders} className="px-5 py-2.5 bg-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all"><Sparkles className="w-3 h-3" /> Optimiser</button>
                      </div>
                      <div className="space-y-2">
                         {stats.folders.map(([n, c]) => (
                           <div key={n} className="p-6 bg-white/5 rounded-3xl flex justify-between items-center border border-white/5 group hover:bg-white/10 transition-all">
                             <span className="font-black text-sm">{n}</span><span className="font-black text-indigo-400 bg-indigo-500/10 px-4 py-1 rounded-full text-xs">{c}</span>
                           </div>
                         ))}
                      </div>
                   </div>
                   <div className="space-y-12">
                      <div className="p-12 bg-indigo-600 rounded-[56px] shadow-3xl flex items-center justify-between relative overflow-hidden">
                         <div className="relative z-10"><p className="text-8xl font-black tracking-tighter">{stats.count}</p><p className="text-[10px] font-black uppercase opacity-60 tracking-widest">Emails Organisés</p></div>
                         <PieChart className="w-24 h-24 opacity-20 relative z-10" />
                         <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 blur-3xl rounded-full"></div>
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
    <div className={`transition-all duration-700 rounded-[64px] border ${isOpen ? 'bg-white/[0.06] border-white/20' : 'bg-white/[0.01] border-white/5'}`}>
      <div className="p-10 flex flex-col sm:flex-row justify-between items-center gap-8 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center gap-8 w-full sm:w-auto">
          <div className={`w-20 h-20 rounded-[32px] flex items-center justify-center transition-all ${tranche.status === 'completed' ? 'bg-emerald-500 text-black' : tranche.status === 'running' ? 'bg-indigo-600 animate-pulse' : 'bg-white/5 text-white/20'}`}><Database className="w-10 h-10" /></div>
          <div className="flex-1 min-w-0"><h3 className="text-3xl font-black truncate">Bloc {tranche.id}</h3><div className="flex items-center gap-4 mt-3"><div className="w-40 h-2 bg-white/5 rounded-full overflow-hidden"><div className={`h-full transition-all duration-1000 ${tranche.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${prog}%` }} /></div><span className="text-[11px] font-black text-white/30">{tranche.fetchedCount} / {tranche.totalToFetch}</span></div></div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); tranche.status === 'running' ? onStop() : onStart(); }} disabled={isLoading && tranche.status !== 'running'} className={`w-full sm:w-auto p-6 rounded-[28px] shadow-2xl transition-all active:scale-95 ${tranche.status === 'running' ? 'bg-red-500 text-white' : 'bg-white text-black hover:scale-105'}`}>{tranche.status === 'running' ? <StopCircle className="w-8 h-8" /> : <PlayCircle className="w-8 h-8" />}</button>
      </div>
      {isOpen && (
        <div className="p-10 pt-0 space-y-8 animate-in slide-in-from-top-10">
           {batches.length > 0 ? batches.map(b => <BatchAccordion key={b.id} batch={b} isLoading={isLoading} onAnalyze={(retry?: boolean) => onAnalyze(b.emails, retry)} onAction={() => {}} onIgnore={() => {}} />) : <div className="py-20 text-center opacity-10 font-black uppercase text-xs tracking-widest">En attente de données</div>}
        </div>
      )}
    </div>
  );
}
