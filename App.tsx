
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Header from './components/Header';
import Setup from './components/Setup';
import LogConsole from './components/LogConsole';
import BatchAccordion from './components/BatchAccordion';
import { GMAIL_DISCOVERY_DOCS, GMAIL_SCOPES, GOOGLE_CLIENT_ID, DEFAULT_AI_MODEL } from './constants';
import { EnrichedEmail, HarvestTranche, AIAnalysis, EmailBatch } from './types';
import { getTotalInboxCount, createGmailLabel, moveEmailsToLabel, applyTagsToEmail } from './services/gmailService';
import { analyzeWithPuter, analyzeWithGeminiSDK } from './services/aiService';
import { Loader2, Inbox, Database, Settings, StopCircle, PlayCircle, Clock, ShieldAlert, CheckCircle2, Zap, Rocket, FolderPlus, Tag, Play, Check } from 'lucide-react';
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
          maxResults: 50,
          pageToken: pageToken,
          labelIds: ['INBOX'] 
        });

        const messages = response.result.messages || [];
        pageToken = response.result.nextPageToken || null;

        const detailed: EnrichedEmail[] = [];
        // Optimisation MAX: Parallélisme 10 pour une vitesse éclair
        const CONCURRENCY = 10;
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
          await new Promise(r => setTimeout(r, 50)); // Throttling minimal
        }

        currentEmails = [...currentEmails, ...detailed];
        fetched += detailed.length;
        
        updateTranche(trancheId, { 
          emails: currentEmails, 
          fetchedCount: fetched,
          nextPageToken: pageToken 
        });

        if (!pageToken || fetched >= tranche.totalToFetch) break;
      }

      if (stopSignal.current) {
        updateTranche(trancheId, { status: 'stopped' });
      } else {
        updateTranche(trancheId, { status: 'cooldown' });
        logger.success(`Bloc ${trancheId} terminé !`);
        setTimeout(() => updateTranche(trancheId, { status: 'completed' }), 1000);
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
    setStatusText(`Intelligence IA : Analyse mail par mail (${emailsToAnalyze.length})...`);
    try {
      const results = config.provider === 'puter' 
        ? await analyzeWithPuter(emailsToAnalyze, config.model)
        : await analyzeWithGeminiSDK(emailsToAnalyze, config.model);

      const tranche = tranches.find(t => t.id === trancheId);
      if (tranche) {
        const updatedEmails = tranche.emails.map(e => {
          if (results[e.id]) return { ...e, analysis: results[e.id], processed: true };
          return e;
        });
        updateTranche(trancheId, { emails: updatedEmails });
        logger.success(`Batch ${batchIndex + 1} : ${Object.keys(results).length} emails analysés.`);
      }
    } catch (e) {
      logger.error("Erreur IA", e);
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const applyAllTags = async () => {
    setLoading(true);
    let count = 0;
    for (const t of tranches) {
      for (const e of t.emails) {
        if (e.analysis?.tags && e.analysis.tags.length > 0 && !e.organized) {
          setStatusText(`Tagging : ${e.subject?.slice(0, 20)}...`);
          await applyTagsToEmail(e.id, e.analysis.tags);
          count++;
          await new Promise(r => setTimeout(r, 100));
        }
      }
    }
    setLoading(false);
    setStatusText('');
    logger.success(`${count} emails taggués avec succès.`);
  };

  const createFolders = async () => {
    const folders = new Set<string>();
    tranches.forEach(t => t.emails.forEach(e => {
      if (e.analysis?.suggestedFolder) folders.add(e.analysis.suggestedFolder);
    }));

    if (folders.size === 0) return logger.warn("Aucune suggestion de dossier à créer.");
    
    setLoading(true);
    setStatusText("Création de la structure Gmail...");
    for (const f of Array.from(folders)) {
      await createGmailLabel(f);
      await new Promise(r => setTimeout(r, 300));
    }
    setLoading(false);
    setStatusText("");
    logger.success(`${folders.size} dossiers créés.`);
  };

  const globalFetched = useMemo(() => tranches.reduce((acc, t) => acc + t.fetchedCount, 0), [tranches]);
  const progressPercent = totalInboxCount > 0 ? Math.round((globalFetched / totalInboxCount) * 100) : 0;

  const handleReset = () => { localStorage.clear(); window.location.reload(); };
  const handleLogout = () => { localStorage.removeItem('google_access_token'); window.location.reload(); };

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
                  <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-8 h-8" />
                  Démarrer
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000">
            {/* Action Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-10">
               <button 
                  onClick={() => setIsAutoPilotActive(!isAutoPilotActive)}
                  className={`py-5 rounded-[32px] font-black text-xs flex items-center justify-center gap-3 transition-all active:scale-95 border ${
                    isAutoPilotActive ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-white text-black border-white'
                  }`}
               >
                 <Rocket className="w-4 h-4" /> Auto-Pilote
               </button>
               <button onClick={createFolders} className="py-5 bg-white/5 border border-white/10 rounded-[32px] font-black text-[10px] text-white/60 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2">
                 <FolderPlus className="w-4 h-4" /> Créer Dossiers
               </button>
               <button onClick={applyAllTags} className="py-5 bg-white/5 border border-white/10 rounded-[32px] font-black text-[10px] text-white/60 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-2">
                 <Tag className="w-4 h-4" /> Appliquer Tags
               </button>
               <button onClick={() => setShowSetup(true)} className="py-5 bg-white/5 border border-white/10 rounded-[32px] flex items-center justify-center hover:bg-white/10 transition-all">
                  <Settings className="w-5 h-5 text-white/40" />
               </button>
            </div>

            <div className="bg-white/[0.02] backdrop-blur-2xl p-10 rounded-[48px] border border-white/5 mb-12 shadow-2xl">
               <div className="flex justify-between items-end mb-4">
                  <span className="text-6xl font-black text-white tracking-tighter">{progressPercent}%</span>
                  <span className="text-xs font-bold text-white/30 mb-2 uppercase tracking-widest">{globalFetched.toLocaleString()} récoltés</span>
               </div>
               <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000" style={{ width: `${progressPercent}%` }} />
               </div>
            </div>

            {loading && (
              <div className="fixed bottom-10 inset-x-0 flex justify-center z-50 pointer-events-none">
                 <div className="bg-white text-black px-8 py-5 rounded-full shadow-2xl flex items-center gap-5 animate-in slide-in-from-bottom-12 pointer-events-auto border border-black/10">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                    <span className="font-black text-[9px] tracking-[0.2em] uppercase">{statusText}</span>
                    <button onClick={() => stopSignal.current = true} className="ml-4 p-2 bg-red-500 text-white rounded-full"><StopCircle className="w-5 h-5" /></button>
                 </div>
              </div>
            )}

            <div className="space-y-6">
               <h2 className="text-2xl font-black text-white tracking-tight px-4">Flux de Travail</h2>
               {tranches.map(t => (
                 <MissionCard 
                    key={t.id} tranche={t} isLoading={loading}
                    onStart={() => runHarvestMission(t.id)} 
                    onStop={() => stopSignal.current = true}
                    onBatchAnalyze={handleBatchAnalyze}
                    onAction={(id: string, f: string) => moveEmailsToLabel([id], f)}
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
      b.push({ id: b.length + 1, emails: tranche.emails.slice(i, i + 15) });
    }
    return b;
  }, [tranche.emails]);

  return (
    <div className={`transition-all duration-500 rounded-[40px] overflow-hidden border ${
      isOpen ? 'bg-white/[0.04] border-white/10 shadow-2xl' : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.02]'
    }`}>
      <div className="flex items-center justify-between p-8 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center gap-6">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
            tranche.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : 
            tranche.status === 'running' ? 'bg-indigo-500/10 text-indigo-400 animate-pulse' : 'bg-white/5 text-white/30'
          }`}>
             {tranche.status === 'completed' ? <Check className="w-6 h-6" /> : <Database className="w-6 h-6" />}
          </div>
          <div>
            <h3 className="text-xl font-black text-white/90 leading-none">Tranche {tranche.id}</h3>
            <div className="flex items-center gap-3 mt-3">
               <div className="w-24 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${prog}%` }} />
               </div>
               <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">{tranche.fetchedCount} emails</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
           {tranche.status !== 'completed' && (
              <button onClick={(e) => { e.stopPropagation(); tranche.status === 'running' ? onStop() : onStart(); }}
                disabled={isLoading && tranche.status !== 'running'}
                className={`p-4 rounded-2xl transition-all ${tranche.status === 'running' ? 'bg-red-500 text-white' : 'bg-white text-black'}`}>
                {tranche.status === 'running' ? <StopCircle className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
           )}
        </div>
      </div>
      
      {isOpen && batches.length > 0 && (
        <div className="px-8 pb-10 space-y-4 animate-in slide-in-from-top-2 duration-500">
           {batches.map((batch, idx) => (
             <BatchAccordion 
                key={idx} batch={batch} isLoading={isLoading}
                onAnalyze={() => onBatchAnalyze(tranche.id, idx, batch.emails)}
                onAction={onAction} onIgnore={() => {}}
             />
           ))}
        </div>
      )}
    </div>
  );
}
