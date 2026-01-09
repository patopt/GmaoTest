
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Header from './components/Header';
import Setup from './components/Setup';
import LogConsole from './components/LogConsole';
import BatchAccordion from './components/BatchAccordion';
import { GMAIL_DISCOVERY_DOCS, GMAIL_SCOPES, GOOGLE_CLIENT_ID, DEFAULT_AI_MODEL } from './constants';
import { EnrichedEmail, HarvestTranche, AIAnalysis, EmailBatch } from './types';
import { getTotalInboxCount, createGmailLabel, moveEmailsToLabel, applyTagsToEmail } from './services/gmailService';
import { analyzeSingleEmail } from './services/aiService';
import { Loader2, Inbox, Database, Settings, StopCircle, PlayCircle, ShieldAlert, CheckCircle2, Zap, Rocket, FolderPlus, Tag, Play, Check, Layers, ListFilter } from 'lucide-react';
import { logger } from './utils/logger';

export default function App() {
  const [config, setConfig] = useState(() => ({
    provider: localStorage.getItem('ai_provider') || 'gemini-sdk',
    model: localStorage.getItem('ai_model') || DEFAULT_AI_MODEL
  }));
  
  const [showSetup, setShowSetup] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [isAutoPilotActive, setIsAutoPilotActive] = useState(false);
  
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
    if (window.gapi) {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({ discoveryDocs: GMAIL_DISCOVERY_DOCS });
          const token = localStorage.getItem('google_access_token');
          if (token) {
            window.gapi.client.setToken({ access_token: token });
            const profile = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
            setUserEmail(profile.result.emailAddress);
            const total = await getTotalInboxCount();
            setTotalInboxCount(total);
            generateTranches(total);
          }
        } catch (e) { logger.error("GAPI Init Error", e); }
      });
    }

    if (window.google?.accounts?.oauth2) {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GMAIL_SCOPES,
        callback: async (resp: any) => {
          localStorage.setItem('google_access_token', resp.access_token);
          window.gapi.client.setToken({ access_token: resp.access_token });
          const profile = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
          setUserEmail(profile.result.emailAddress);
          const total = await getTotalInboxCount();
          setTotalInboxCount(total);
          generateTranches(total);
        },
      });
      (window as any).tokenClient = client;
      setIsClientReady(true);
    }
  }, []);

  useEffect(() => { initGoogleServices(); }, [initGoogleServices]);

  const generateTranches = (total: number) => {
    setTranches(prev => {
      if (prev.length > 0) return prev;
      const numTranches = Math.ceil(total / 1000);
      return Array.from({ length: numTranches }, (_, i) => ({
        id: i + 1,
        startIndex: i * 1000,
        totalToFetch: Math.min(1000, total - (i * 1000)),
        fetchedCount: 0,
        status: 'pending',
        emails: []
      }));
    });
  };

  const updateTranche = (id: number, updates: Partial<HarvestTranche>) => {
    setTranches(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const getExistingFolders = () => {
    const folders = new Set<string>();
    tranches.forEach(t => t.emails.forEach(e => {
      if (e.analysis?.suggestedFolder) folders.add(e.analysis.suggestedFolder);
    }));
    return Array.from(folders);
  };

  const getExistingTags = () => {
    const tags = new Set<string>();
    tranches.forEach(t => t.emails.forEach(e => {
      e.analysis?.tags.forEach(tag => tags.add(tag));
    }));
    return Array.from(tags);
  };

  const handleSequentialAnalyze = async (trancheId: number, emailsToAnalyze: EnrichedEmail[]) => {
    if (loading) return;
    setLoading(true);
    stopSignal.current = false;

    try {
      const tranche = tranches.find(t => t.id === trancheId);
      if (!tranche) return;

      const updatedEmails = [...tranche.emails];

      for (const email of emailsToAnalyze) {
        if (stopSignal.current) break;

        setStatusText(`Analyse IA : ${email.subject?.slice(0, 20)}...`);
        const existingFolders = getExistingFolders();
        
        try {
          // 1. ANALYSE INDIVIDUELLE
          const analysis = await analyzeSingleEmail(email, config.model, existingFolders);
          logger.info(`IA OK [${email.subject?.slice(0, 25)}] -> ${analysis.suggestedFolder}`);

          // 2. ACTIONS RÉELLES GMAIL
          setStatusText(`Gmail : Classement dans ${analysis.suggestedFolder}...`);
          await moveEmailsToLabel([email.id], analysis.suggestedFolder);
          
          if (analysis.tags.length > 0) {
            setStatusText(`Gmail : Application des tags...`);
            await applyTagsToEmail(email.id, analysis.tags);
          }

          // 3. MISE À JOUR LIVE DE L'INTERFACE
          const idx = updatedEmails.findIndex(e => e.id === email.id);
          if (idx !== -1) {
            updatedEmails[idx] = { ...updatedEmails[idx], analysis, processed: true, organized: true };
            // On déclenche un re-render immédiat pour voir la progression
            setTranches(prev => prev.map(t => t.id === trancheId ? { ...t, emails: [...updatedEmails] } : t));
          }
          
          // Petit délai pour l'effet visuel et éviter les ratelimits
          await new Promise(r => setTimeout(r, 400));
        } catch (e) {
          logger.error(`Erreur sur l'email ${email.id}`, e);
        }
      }
      
      logger.success("Séquence d'analyse terminée.");
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const runHarvestMission = async (trancheId: number) => {
    if (loading) return;
    const tranche = tranches.find(t => t.id === trancheId);
    if (!tranche || tranche.status === 'completed' || tranche.status === 'running') return;

    setLoading(true);
    stopSignal.current = false;
    updateTranche(trancheId, { status: 'running' });

    try {
      let fetched = tranche.fetchedCount;
      let pageToken = tranche.nextPageToken || undefined;
      let allEmails = [...tranche.emails];

      while (fetched < tranche.totalToFetch && !stopSignal.current) {
        setStatusText(`Récolte : ${fetched}/${tranche.totalToFetch}`);
        
        const response: any = await window.gapi.client.gmail.users.messages.list({ 
          userId: 'me', maxResults: 50, pageToken: pageToken, labelIds: ['INBOX'] 
        });

        const messages = response.result.messages || [];
        pageToken = response.result.nextPageToken || null;

        const CONCURRENCY = 10;
        for (let i = 0; i < messages.length; i += CONCURRENCY) {
          if (stopSignal.current) break;
          const chunk = messages.slice(i, i + CONCURRENCY);
          const chunkDetails = await Promise.all(chunk.map(async (m: any) => {
            const res = await window.gapi.client.gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata' });
            const h = res.result.payload.headers;
            return {
              id: res.result.id, threadId: res.result.threadId, snippet: res.result.snippet, internalDate: res.result.internalDate,
              subject: h.find((x:any) => x.name === 'Subject')?.value || 'Sans objet',
              from: h.find((x:any) => x.name === 'From')?.value || 'Inconnu',
              processed: false, organized: false
            } as EnrichedEmail;
          }));
          
          allEmails = [...allEmails, ...chunkDetails];
          fetched += chunkDetails.length;
          setTranches(prev => prev.map(t => t.id === trancheId ? { ...t, emails: allEmails, fetchedCount: fetched, nextPageToken: pageToken } : t));
          await new Promise(r => setTimeout(r, 50));
        }

        if (!pageToken || fetched >= tranche.totalToFetch) break;
      }
      updateTranche(trancheId, { status: stopSignal.current ? 'stopped' : 'completed' });
    } catch (err: any) {
      logger.error("Harvest failed", err);
      updateTranche(trancheId, { status: 'error' });
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const showFolders = () => {
    const folders = getExistingFolders();
    alert(`Dossiers IA identifiés :\n\n${folders.join('\n') || 'Aucun pour le moment'}`);
  };

  const showTags = () => {
    const tags = getExistingTags();
    alert(`Tags IA identifiés :\n\n${tags.map(t => `#${t}`).join('\n') || 'Aucun pour le moment'}`);
  };

  // Added progress calculation variables to fix "Cannot find name" errors
  const processedTotal = useMemo(() => tranches.reduce((acc, t) => acc + t.emails.filter(e => e.processed).length, 0), [tranches]);
  const globalFetched = useMemo(() => tranches.reduce((acc, t) => acc + t.fetchedCount, 0), [tranches]);
  const progressPercent = useMemo(() => totalInboxCount > 0 ? Math.round((globalFetched / totalInboxCount) * 100) : 0, [globalFetched, totalInboxCount]);

  if (showSetup) return (
    <div className="bg-black min-h-screen text-white">
      <Header userEmail={userEmail} onLogout={() => { localStorage.removeItem('google_access_token'); window.location.reload(); }} />
      <Setup onSave={(p, m) => { setConfig({ provider: p, model: m }); setShowSetup(false); }} onReset={() => { localStorage.clear(); window.location.reload(); }} onLogout={() => {}} isLoggedIn={!!userEmail} />
      <LogConsole />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-white font-sans antialiased selection:bg-indigo-500/30">
      <Header userEmail={userEmail} onLogout={() => { localStorage.removeItem('google_access_token'); window.location.reload(); }} />
      
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-10 space-y-8 pb-32">
        {!userEmail ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
             <div className="relative group w-full max-w-md">
                <div className="absolute -inset-2 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-[48px] blur-2xl opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                <button onClick={() => (window as any).tokenClient.requestAccessToken({ prompt: 'select_account' })} className="relative w-full py-8 bg-white text-black font-black rounded-[40px] flex items-center justify-center gap-6 hover:scale-[1.02] transition-all active:scale-95 shadow-2xl">
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-10 h-10" /> 
                    <span className="text-xl sm:text-2xl tracking-tighter">Connexion Gmail</span>
                </button>
             </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000 space-y-8">
            
            {/* Command Center - Mobile Optimized */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
               <button onClick={() => setIsAutoPilotActive(!isAutoPilotActive)} className={`p-5 sm:p-6 rounded-[32px] font-black text-[10px] sm:text-xs flex flex-col items-center justify-center gap-2 transition-all active:scale-95 border ${isAutoPilotActive ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-white text-black border-white shadow-xl shadow-white/5'}`}>
                 <Rocket className={`w-5 h-5 sm:w-6 sm:h-6 ${isAutoPilotActive ? 'animate-bounce' : ''}`} /> Auto-Pilote
               </button>
               <button onClick={showFolders} className="p-5 sm:p-6 bg-white/5 border border-white/10 rounded-[32px] font-black text-[10px] sm:text-xs text-white/60 hover:text-white transition-all active:scale-95 flex flex-col items-center justify-center gap-2 hover:bg-white/10">
                 <Layers className="w-5 h-5 sm:w-6 sm:h-6" /> Explorer Dossiers
               </button>
               <button onClick={showTags} className="p-5 sm:p-6 bg-white/5 border border-white/10 rounded-[32px] font-black text-[10px] sm:text-xs text-white/60 hover:text-white transition-all active:scale-95 flex flex-col items-center justify-center gap-2 hover:bg-white/10">
                 <ListFilter className="w-5 h-5 sm:w-6 sm:h-6" /> Explorer Tags
               </button>
               <button onClick={() => setShowSetup(true)} className="p-5 sm:p-6 bg-white/5 border border-white/10 rounded-[32px] flex flex-col items-center justify-center gap-2 hover:bg-white/10 transition-all text-white/40">
                  <Settings className="w-5 h-5 sm:w-6 sm:h-6" /> Réglages
               </button>
            </div>

            {/* Dashboard Status */}
            <div className="bg-white/[0.02] backdrop-blur-3xl p-8 sm:p-12 rounded-[48px] sm:rounded-[56px] border border-white/5 shadow-3xl relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity hidden sm:block">
                  <ShieldAlert className="w-32 h-32 text-white" />
               </div>
               <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 relative z-10 gap-6">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-4">Moteur Intelligent Actif</span>
                    <span className="text-6xl sm:text-8xl font-black text-white tracking-tighter leading-none">{processedTotal}</span>
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mt-2">Emails analysés par Titan</span>
                  </div>
                  <div className="text-left sm:text-right w-full sm:w-auto">
                    <span className="text-2xl sm:text-4xl font-black text-white/40 block mb-1 tracking-tighter">{progressPercent}%</span>
                    <span className="text-[10px] font-black text-white/10 uppercase tracking-widest">{globalFetched.toLocaleString()} / {totalInboxCount.toLocaleString()} récoltés</span>
                  </div>
               </div>
               <div className="h-2.5 bg-white/5 rounded-full overflow-hidden p-0.5 shadow-inner">
                  <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 rounded-full transition-all duration-1000 shadow-[0_0_20px_rgba(99,102,241,0.6)]" style={{ width: `${progressPercent}%` }} />
               </div>
            </div>

            {loading && (
              <div className="fixed bottom-12 inset-x-0 flex justify-center z-[100] pointer-events-none px-4">
                 <div className="bg-white text-black px-8 sm:px-10 py-5 sm:py-7 rounded-[32px] sm:rounded-[40px] shadow-4xl flex items-center gap-6 sm:gap-8 animate-in slide-in-from-bottom-12 pointer-events-auto border-4 border-black">
                    <div className="relative">
                       <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-indigo-600" />
                    </div>
                    <span className="font-black text-[10px] sm:text-[12px] tracking-[0.2em] uppercase truncate max-w-[150px] sm:max-w-none">{statusText}</span>
                    <div className="h-8 w-px bg-black/10 mx-1"></div>
                    <button onClick={() => stopSignal.current = true} className="p-3 sm:p-4 bg-red-500 text-white rounded-2xl hover:bg-red-600 transition-all active:scale-90"><StopCircle className="w-6 h-6 sm:w-7 sm:h-7" /></button>
                 </div>
              </div>
            )}

            {/* Content Pipeline */}
            <div className="space-y-6 sm:space-y-10">
               <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tighter px-4">Pipeline en Direct</h2>
               {tranches.map(t => (
                 <MissionCard 
                    key={t.id} tranche={t} isLoading={loading}
                    onStart={() => runHarvestMission(t.id)} 
                    onStop={() => stopSignal.current = true}
                    onAnalyze={(emails: EnrichedEmail[]) => handleSequentialAnalyze(t.id, emails)}
                 />
               ))}
            </div>
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
    const b: EmailBatch[] = [];
    for (let i = 0; i < tranche.emails.length; i += 15) {
      b.push({ id: b.length + 1, emails: tranche.emails.slice(i, i + 15) });
    }
    return b;
  }, [tranche.emails]);

  return (
    <div className={`transition-all duration-700 rounded-[40px] sm:rounded-[56px] overflow-hidden border ${isOpen ? 'bg-white/[0.06] border-white/20 shadow-4xl' : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.03]'}`}>
      <div className="flex items-center justify-between p-8 sm:p-12 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center gap-6 sm:gap-10">
          <div className={`w-14 h-14 sm:w-20 sm:h-20 rounded-[22px] sm:rounded-[28px] flex items-center justify-center shadow-3xl transition-all ${tranche.status === 'completed' ? 'bg-emerald-500 text-black' : tranche.status === 'running' ? 'bg-indigo-600 text-white animate-pulse' : 'bg-white/5 text-white/20'}`}>
             {tranche.status === 'completed' ? <Check className="w-7 h-7 sm:w-10 sm:h-10" strokeWidth={4} /> : <Database className="w-7 h-7 sm:w-10 sm:h-10" />}
          </div>
          <div>
            <h3 className="text-xl sm:text-3xl font-black text-white tracking-tighter">Bloc {tranche.id}</h3>
            <div className="flex items-center gap-3 sm:gap-5 mt-3 sm:mt-5">
               <div className="w-24 sm:w-40 h-1.5 sm:h-2 bg-white/5 rounded-full overflow-hidden shadow-inner">
                  <div className={`h-full transition-all duration-1000 ${tranche.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${prog}%` }} />
               </div>
               <span className="text-[9px] sm:text-[12px] font-black text-white/30 uppercase tracking-[0.2em]">{tranche.fetchedCount} emails</span>
            </div>
          </div>
        </div>
        <div className="flex items-center">
           {tranche.status !== 'completed' && (
              <button onClick={(e) => { e.stopPropagation(); tranche.status === 'running' ? onStop() : onStart(); }}
                disabled={isLoading && tranche.status !== 'running'}
                className={`p-4 sm:p-6 rounded-[20px] sm:rounded-[24px] transition-all active:scale-90 shadow-2xl ${tranche.status === 'running' ? 'bg-red-500 text-white' : 'bg-white text-black'}`}>
                {tranche.status === 'running' ? <StopCircle className="w-6 h-6 sm:w-8 sm:h-8" /> : <PlayCircle className="w-6 h-6 sm:w-8 sm:h-8" />}
              </button>
           )}
        </div>
      </div>
      {isOpen && (
        <div className="px-6 sm:px-12 pb-12 sm:pb-16 space-y-6 sm:space-y-8 animate-in slide-in-from-top-6 duration-700">
           <div className="h-px bg-white/10 mb-6 sm:mb-10"></div>
           {batches.length > 0 ? batches.map((batch, idx) => (
             <BatchAccordion key={idx} batch={batch} isLoading={isLoading} onAnalyze={() => onAnalyze(batch.emails)} onAction={() => {}} onIgnore={() => {}} />
           )) : <div className="text-center py-12 text-white/10 font-black uppercase tracking-[0.4em]">En attente de récolte</div>}
        </div>
      )}
    </div>
  );
}
