
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Header from './components/Header';
import Setup from './components/Setup';
import LogConsole from './components/LogConsole';
import BatchAccordion from './components/BatchAccordion';
import { GMAIL_DISCOVERY_DOCS, GMAIL_SCOPES, GOOGLE_CLIENT_ID, DEFAULT_AI_MODEL } from './constants';
import { EnrichedEmail, HarvestTranche, AIAnalysis, EmailBatch } from './types';
import { getTotalInboxCount, createGmailLabel, moveEmailsToLabel } from './services/gmailService';
import { analyzeWithPuter, analyzeWithGeminiSDK } from './services/aiService';
import { Loader2, Inbox, Database, Settings, StopCircle, PlayCircle, Clock, ShieldAlert, CheckCircle2, Zap, Rocket, FolderPlus, Tag, Play } from 'lucide-react';
import { logger } from './utils/logger';

export default function App() {
  const [config, setConfig] = useState(() => ({
    provider: localStorage.getItem('ai_provider') || 'puter',
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

  // Persistence
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
        } catch (e) { logger.error("Erreur GAPI", e); }
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

  const runHarvestMission = async (trancheId: number) => {
    if (loading) return;
    const tranche = tranches.find(t => t.id === trancheId);
    if (!tranche || tranche.status === 'completed' || tranche.status === 'cooldown') return;

    stopSignal.current = false;
    setLoading(true);
    updateTranche(trancheId, { status: 'running' });

    try {
      let currentEmails = [...tranche.emails];
      let fetched = tranche.fetchedCount;
      let pageToken = tranche.nextPageToken || undefined;

      while (fetched < tranche.totalToFetch && !stopSignal.current) {
        setStatusText(`Récolte Bloc ${trancheId}: ${fetched}/${tranche.totalToFetch}`);
        
        const response: any = await window.gapi.client.gmail.users.messages.list({ 
          userId: 'me', 
          maxResults: Math.min(50, tranche.totalToFetch - fetched),
          pageToken: pageToken,
          labelIds: ['INBOX'] 
        });

        const messages = response.result.messages || [];
        pageToken = response.result.nextPageToken || null;

        // Optimisation : Récupération parallèle par lots de 5 pour éviter le rate-limiting tout en étant rapide
        const detailed: EnrichedEmail[] = [];
        const CONCURRENCY = 5;
        for (let i = 0; i < messages.length; i += CONCURRENCY) {
          if (stopSignal.current) break;
          const chunk = messages.slice(i, i + CONCURRENCY);
          const chunkDetails = await Promise.all(chunk.map(async (m: any) => {
            const res = await window.gapi.client.gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata' });
            const h = res.result.payload.headers;
            return {
              id: res.result.id,
              threadId: res.result.threadId,
              snippet: res.result.snippet,
              internalDate: res.result.internalDate,
              subject: h.find((x:any) => x.name === 'Subject')?.value || '',
              from: h.find((x:any) => x.name === 'From')?.value || '',
              processed: false,
              organized: false
            } as EnrichedEmail;
          }));
          detailed.push(...chunkDetails);
          // Petit délai de sécurité entre les lots parallèles
          await new Promise(r => setTimeout(r, 100));
        }

        currentEmails = [...currentEmails, ...detailed];
        fetched += detailed.length;
        
        updateTranche(trancheId, { 
          emails: currentEmails, 
          fetchedCount: fetched,
          nextPageToken: pageToken 
        });

        if (!pageToken || fetched >= tranche.totalToFetch) break;
        // Délai plus court entre les pages list
        await new Promise(r => setTimeout(r, 800));
      }

      if (stopSignal.current) {
        updateTranche(trancheId, { status: 'stopped' });
      } else {
        updateTranche(trancheId, { status: 'cooldown' });
        logger.success(`Bloc ${trancheId} récolté ! Pause de sécurité...`);
        let cd = 30;
        const itv = setInterval(() => {
          cd--;
          if (cd <= 0) {
            clearInterval(itv);
            updateTranche(trancheId, { status: 'completed' });
          }
        }, 1000);
      }
    } catch (err: any) {
      logger.error("Mission échouée", err);
      updateTranche(trancheId, { status: 'error' });
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const handleBatchAnalyze = async (trancheId: number, batchIndex: number, emailsToAnalyze: EnrichedEmail[]) => {
    if (loading) return;
    setLoading(true);
    setStatusText(`Analyse IA du groupe ${batchIndex + 1}...`);
    try {
      const results = config.provider === 'puter' 
        ? await analyzeWithPuter(emailsToAnalyze, config.model)
        : await analyzeWithGeminiSDK(emailsToAnalyze, config.model);

      const tranche = tranches.find(t => t.id === trancheId);
      if (tranche) {
        const updatedEmails = tranche.emails.map(e => {
          if (results[e.id]) {
            return { ...e, analysis: results[e.id], processed: true };
          }
          return e;
        });
        updateTranche(trancheId, { emails: updatedEmails });
        logger.success(`Groupe ${batchIndex + 1} analysé avec succès.`);
      }
    } catch (e) {
      logger.error("Erreur d'analyse de groupe", e);
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const handleAction = async (trancheId: number, emailId: string, folder: string) => {
    try {
      setStatusText(`Déplacement vers ${folder}...`);
      const success = await moveEmailsToLabel([emailId], folder);
      if (success) {
        const tranche = tranches.find(t => t.id === trancheId);
        if (tranche) {
          const updatedEmails = tranche.emails.map(e => e.id === emailId ? { ...e, organized: true } : e);
          updateTranche(trancheId, { emails: updatedEmails });
          logger.success(`Email déplacé vers ${folder}`);
        }
      }
    } catch (e) {
      logger.error("Erreur déplacement", e);
    } finally {
      setStatusText('');
    }
  };

  const runAutoPilot = async () => {
    if (isAutoPilotActive) return setIsAutoPilotActive(false);
    setIsAutoPilotActive(true);
    logger.info("Mode Auto-Pilote activé. Lancement de l'analyse et l'organisation...");

    for (const tranche of tranches) {
      const pending = tranche.emails.filter(e => !e.organized);
      if (pending.length === 0) continue;

      const chunks = [];
      for (let i = 0; i < pending.length; i += 10) {
        chunks.push(pending.slice(i, i + 10));
      }

      for (const chunk of chunks) {
        if (!isAutoPilotActive) break;
        try {
          setStatusText(`Analyse IA (${chunk.length} emails)...`);
          const results = config.provider === 'puter' 
            ? await analyzeWithPuter(chunk, config.model)
            : await analyzeWithGeminiSDK(chunk, config.model);

          const folderGroups: Record<string, string[]> = {};
          chunk.forEach(e => {
            const analysis = results[e.id];
            if (analysis) {
              const folder = analysis.suggestedFolder;
              if (!folderGroups[folder]) folderGroups[folder] = [];
              folderGroups[folder].push(e.id);
            }
          });

          for (const [folder, ids] of Object.entries(folderGroups)) {
             setStatusText(`Déplacement vers ${folder}...`);
             await moveEmailsToLabel(ids, folder);
             logger.info(`${ids.length} emails déplacés vers [${folder}]`);
          }

          const updatedEmails = tranche.emails.map(e => {
            if (results[e.id]) return { ...e, analysis: results[e.id], processed: true, organized: true };
            return e;
          });
          updateTranche(tranche.id, { emails: updatedEmails });
          
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          logger.error("Erreur Auto-Pilote", e);
        }
      }
    }
    setIsAutoPilotActive(false);
  };

  const createAllFolders = async () => {
    const folders = new Set<string>();
    tranches.forEach(t => t.emails.forEach(e => {
      if (e.analysis?.suggestedFolder) folders.add(e.analysis.suggestedFolder);
    }));

    if (folders.size === 0) return logger.warn("Aucun dossier suggéré trouvé. Lancez une analyse d'abord.");
    
    setLoading(true);
    setStatusText("Création de la structure Gmail...");
    for (const f of Array.from(folders)) {
      await createGmailLabel(f);
      await new Promise(r => setTimeout(r, 500));
    }
    setLoading(false);
    setStatusText("");
    logger.success("Structure Gmail prête !");
  };

  const globalFetched = useMemo(() => tranches.reduce((acc, t) => acc + t.fetchedCount, 0), [tranches]);
  const progressPercent = totalInboxCount > 0 ? Math.round((globalFetched / totalInboxCount) * 100) : 0;

  const handleReset = () => {
    localStorage.clear();
    window.location.reload();
  };

  const handleLogout = () => {
    localStorage.removeItem('google_access_token');
    window.location.reload();
  };

  if (showSetup) return (
    <div className="bg-black min-h-screen text-white">
      <Header userEmail={userEmail} onLogout={handleLogout} />
      <Setup onSave={(p, m) => {
          localStorage.setItem('ai_provider', p);
          localStorage.setItem('ai_model', m);
          setConfig({ provider: p, model: m });
          setShowSetup(false);
        }} 
        onReset={handleReset} onLogout={handleLogout} isLoggedIn={!!userEmail} />
      <LogConsole />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-white font-sans antialiased">
      <Header userEmail={userEmail} onLogout={handleLogout} />
      
      <main className="flex-1 max-w-5xl w-full mx-auto p-5 sm:p-10 space-y-12 pb-32">
        {!userEmail ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
             <div className="relative w-full max-w-lg">
              <div className="absolute -inset-2 bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-500 rounded-[60px] blur-3xl opacity-20 animate-pulse"></div>
              <div className="relative bg-white/[0.03] backdrop-blur-3xl p-12 rounded-[56px] border border-white/10 shadow-3xl">
                <div className="w-28 h-28 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-[40px] mx-auto mb-10 flex items-center justify-center shadow-2xl">
                  <Inbox className="w-14 h-14 text-white" />
                </div>
                <h2 className="text-5xl font-black text-white mb-6 tracking-tight leading-none">AI Organizer</h2>
                <button 
                  onClick={() => (window as any).tokenClient.requestAccessToken({ prompt: 'select_account' })}
                  disabled={!isClientReady}
                  className="w-full py-6 bg-white text-black font-black rounded-3xl flex items-center justify-center gap-4 hover:bg-white/90 transition-all active:scale-95 shadow-2xl"
                >
                  {!isClientReady ? <Loader2 className="w-6 h-6 animate-spin" /> : <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-8 h-8" />}
                  Démarrer
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000">
            {/* Dashboard Actions */}
            <div className="flex flex-wrap gap-4 mb-10">
               <button 
                  onClick={runAutoPilot}
                  className={`flex-1 py-5 rounded-[32px] font-black text-sm flex items-center justify-center gap-3 transition-all active:scale-95 border ${
                    isAutoPilotActive ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-white text-black border-white'
                  }`}
               >
                 <Rocket className={`w-5 h-5 ${isAutoPilotActive ? 'animate-bounce' : ''}`} />
                 {isAutoPilotActive ? 'Auto-Pilote : ON' : 'Lancer l\'Auto-Pilote'}
               </button>
               <button 
                  onClick={createAllFolders}
                  className="px-8 py-5 bg-white/5 border border-white/10 rounded-[32px] font-black text-xs text-white/60 hover:text-white hover:bg-white/10 transition-all active:scale-95 flex items-center gap-3"
               >
                 <FolderPlus className="w-5 h-5" />
                 Générer Structure Gmail
               </button>
               <button onClick={() => setShowSetup(true)} className="p-5 bg-white/5 border border-white/10 rounded-[32px] hover:bg-white/10 transition-all">
                  <Settings className="w-6 h-6 text-white/40" />
               </button>
            </div>

            {/* Global Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
               <div className="bg-white/[0.02] backdrop-blur-2xl p-10 rounded-[48px] border border-white/5 shadow-2xl">
                  <h3 className="text-xs font-black text-white/30 uppercase tracking-[0.3em] mb-8">Progression de Récolte</h3>
                  <div className="flex items-end justify-between mb-4">
                    <span className="text-6xl font-black text-white tracking-tighter">{progressPercent}%</span>
                    <span className="text-xs font-bold text-white/30 mb-2">{globalFetched.toLocaleString()} / {totalInboxCount.toLocaleString()} emails</span>
                  </div>
                  <div className="h-3 bg-white/5 rounded-full overflow-hidden p-0.5">
                    <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${progressPercent}%` }} />
                  </div>
               </div>
               
               <div className="bg-white/[0.02] backdrop-blur-2xl p-10 rounded-[48px] border border-white/5 shadow-2xl flex flex-col justify-between">
                  <div className="flex items-center gap-4 mb-4">
                    <ShieldAlert className="w-6 h-6 text-emerald-400" />
                    <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">Moteur Sécurisé</span>
                  </div>
                  <p className="text-sm text-white/40 font-medium leading-relaxed">
                    Chaque bloc de 1000 est traité séparément. Les pauses automatiques protègent votre compte Gmail contre les limitations API (Error 429).
                  </p>
               </div>
            </div>

            {loading && (
              <div className="fixed bottom-10 inset-x-0 flex justify-center z-50 pointer-events-none">
                 <div className="bg-white text-black px-8 py-5 rounded-full shadow-2xl flex items-center gap-5 animate-in slide-in-from-bottom-12 pointer-events-auto border border-black/10">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    <span className="font-black text-[10px] tracking-[0.2em] uppercase">{statusText}</span>
                    <button 
                      onClick={() => stopSignal.current = true}
                      className="ml-4 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all active:scale-95"
                    >
                      <StopCircle className="w-6 h-6" />
                    </button>
                 </div>
              </div>
            )}

            <div className="space-y-6">
               <h2 className="text-2xl font-black text-white tracking-tight px-4">Missions de Récolte</h2>
               {tranches.map(t => (
                 <MissionCard 
                    key={t.id} 
                    tranche={t} 
                    isLoading={loading}
                    onStart={() => runHarvestMission(t.id)} 
                    onStop={() => stopSignal.current = true}
                    onBatchAnalyze={handleBatchAnalyze}
                    onAction={handleAction}
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

function MissionCard({ tranche, onStart, onStop, isLoading, onBatchAnalyze, onAction }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const prog = Math.round((tranche.fetchedCount / tranche.totalToFetch) * 100);

  const batches = useMemo(() => {
    const b: EmailBatch[] = [];
    for (let i = 0; i < tranche.emails.length; i += 15) {
      b.push({
        id: b.length + 1,
        emails: tranche.emails.slice(i, i + 15)
      });
    }
    return b;
  }, [tranche.emails]);

  return (
    <div className={`transition-all duration-500 rounded-[38px] overflow-hidden border ${
      isOpen ? 'bg-white/[0.04] border-white/10 ring-1 ring-white/10' : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.02]'
    }`}>
      <div className="flex items-center justify-between p-7 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center gap-6 min-w-0">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
            tranche.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 
            tranche.status === 'running' ? 'bg-indigo-500/20 text-indigo-400 animate-pulse' : 'bg-white/5 text-white/30'
          }`}>
             {tranche.status === 'completed' ? <CheckCircle2 className="w-7 h-7" /> : <Database className="w-7 h-7" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-xl font-black text-white/90">Bloc {tranche.id} <span className="text-xs text-white/30 ml-2">({tranche.startIndex} - {tranche.startIndex + tranche.totalToFetch})</span></h3>
            <div className="flex items-center gap-4 mt-2">
               <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-1000 ${tranche.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${prog}%` }} />
               </div>
               <span className="text-xs font-black text-white/40">{tranche.fetchedCount} / {tranche.totalToFetch}</span>
               {tranche.status === 'cooldown' && <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-[0.2em] animate-pulse">Repos Anti-429...</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
           {tranche.status !== 'completed' && (
              <button 
                onClick={(e) => { e.stopPropagation(); tranche.status === 'running' ? onStop() : onStart(); }}
                disabled={isLoading && tranche.status !== 'running'}
                className={`p-4 rounded-2xl transition-all active:scale-95 ${
                  tranche.status === 'running' ? 'bg-red-500 text-white shadow-xl shadow-red-500/20' : 'bg-white text-black hover:bg-white/90 shadow-xl shadow-white/5'
                }`}
              >
                {tranche.status === 'running' ? <StopCircle className="w-6 h-6" /> : <Play className="w-6 h-6" />}
              </button>
           )}
        </div>
      </div>
      
      {isOpen && batches.length > 0 && (
        <div className="px-8 pb-10 pt-4 animate-in fade-in duration-700 space-y-4">
           <h4 className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] mb-4">Groupes d'Analyse (Lots de 15)</h4>
           {batches.map((batch, idx) => (
             <BatchAccordion 
                key={idx}
                batch={batch}
                isLoading={isLoading}
                onAnalyze={() => onBatchAnalyze(tranche.id, idx, batch.emails)}
                onAction={(emailId, folder) => onAction(tranche.id, emailId, folder)}
                onIgnore={() => {}}
             />
           ))}
        </div>
      )}
    </div>
  );
}
