
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Header from './components/Header';
import Setup from './components/Setup';
import LogConsole from './components/LogConsole';
import BatchAccordion from './components/BatchAccordion';
import { GMAIL_DISCOVERY_DOCS, GMAIL_SCOPES, GOOGLE_CLIENT_ID, DEFAULT_AI_MODEL } from './constants';
import { EnrichedEmail, HarvestTranche, AIAnalysis, EmailBatch } from './types';
import { getTotalInboxCount, createGmailLabel, moveEmailsToLabel, applyTagsToEmail } from './services/gmailService';
import { analyzeSingleEmail } from './services/aiService';
import { Loader2, Database, Settings, StopCircle, ShieldAlert, Rocket, Layers, ListFilter, PlayCircle, Check, Zap, BarChart3, PieChart, Info, X } from 'lucide-react';
import { logger } from './utils/logger';

export default function App() {
  const [config, setConfig] = useState(() => ({
    provider: localStorage.getItem('ai_provider') || 'puter',
    model: localStorage.getItem('ai_model') || DEFAULT_AI_MODEL
  }));
  
  const [showSetup, setShowSetup] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  
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
      (window as any).tokenClient = client;
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

  /**
   * PIPELINE PARALLÈLE (3 INSTANCES SIMULTANÉES)
   */
  const handleSequentialAnalyze = async (trancheId: number, emailsToAnalyze: EnrichedEmail[]) => {
    if (loading) return;
    setLoading(true);
    stopSignal.current = false;

    try {
      const tranche = tranches.find(t => t.id === trancheId);
      if (!tranche) return;

      const emailsRef = [...tranche.emails];
      const emailsToProcess = emailsToAnalyze.filter(e => !e.processed);
      
      const CONCURRENCY = 3;
      for (let i = 0; i < emailsToProcess.length; i += CONCURRENCY) {
        if (stopSignal.current) break;
        
        const chunk = emailsToProcess.slice(i, i + CONCURRENCY);
        setStatusText(`Analyse Triple-Turbo : ${chunk.length} mails en cours...`);

        await Promise.all(chunk.map(async (email) => {
          try {
            const existingFolders = tranches.flatMap(t => t.emails.map(e => e.analysis?.suggestedFolder)).filter(Boolean) as string[];
            
            // 1. Appel IA Individualisé
            const analysis = await analyzeSingleEmail(email, config.model, config.provider, Array.from(new Set(existingFolders)));
            
            // 2. Action Gmail Réelle
            const moved = await moveEmailsToLabel([email.id], analysis.suggestedFolder);
            if (moved && analysis.tags.length > 0) {
              await applyTagsToEmail(email.id, analysis.tags);
            }

            // 3. Mise à jour immédiate de l'objet
            setTranches(currentTranches => currentTranches.map(t => {
              if (t.id !== trancheId) return t;
              const newEmails = t.emails.map(e => 
                e.id === email.id ? { ...e, analysis, processed: true, organized: moved } : e
              );
              return { ...t, emails: newEmails };
            }));
          } catch (e) {
            logger.error(`Pipeline Fail: ${email.subject}`, e);
          }
        }));

        // Temps de respiration pour l'UI et éviter throttle Puter
        await new Promise(r => setTimeout(r, 200));
      }
      logger.success("Traitement par pipeline terminé.");
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
        const response: any = await window.gapi.client.gmail.users.messages.list({ userId: 'me', maxResults: 50, pageToken, labelIds: ['INBOX'] });
        const messages = response.result.messages || [];
        pageToken = response.result.nextPageToken || null;

        for (let i = 0; i < messages.length; i += 10) {
          if (stopSignal.current) break;
          const chunk = messages.slice(i, i + 10);
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
        }
        if (!pageToken || fetched >= tranche.totalToFetch) break;
      }
      updateTranche(trancheId, { status: stopSignal.current ? 'stopped' : 'completed' });
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const updateTranche = (id: number, updates: Partial<HarvestTranche>) => {
    setTranches(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  // CALCULS DU BILAN
  const processedEmails = useMemo(() => tranches.flatMap(t => t.emails).filter(e => e.processed), [tranches]);
  const stats = useMemo(() => {
    const folders = new Map<string, number>();
    const tags = new Map<string, number>();
    const sentiments = { Positif: 0, Neutre: 0, Négatif: 0 };
    
    processedEmails.forEach(e => {
      if (e.analysis) {
        folders.set(e.analysis.suggestedFolder, (folders.get(e.analysis.suggestedFolder) || 0) + 1);
        e.analysis.tags.forEach(t => tags.set(t, (tags.get(t) || 0) + 1));
        sentiments[e.analysis.sentiment]++;
      }
    });

    return {
      folders: Array.from(folders.entries()).sort((a,b) => b[1] - a[1]),
      tags: Array.from(tags.entries()).sort((a,b) => b[1] - a[1]),
      sentiments
    };
  }, [processedEmails]);

  const globalFetchedCount = useMemo(() => tranches.reduce((acc, t) => acc + t.fetchedCount, 0), [tranches]);
  const progressPercent = useMemo(() => totalInboxCount > 0 ? Math.round((globalFetchedCount / totalInboxCount) * 100) : 0, [globalFetchedCount, totalInboxCount]);

  if (showSetup) return (
    <div className="bg-black min-h-screen text-white">
      <Header userEmail={userEmail} onLogout={() => { localStorage.removeItem('google_access_token'); window.location.reload(); }} />
      <Setup onSave={(p, m) => { setConfig({ provider: p, model: m }); setShowSetup(false); }} onReset={() => { localStorage.clear(); window.location.reload(); }} onLogout={() => {}} isLoggedIn={!!userEmail} />
      <LogConsole />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-white font-sans antialiased">
      <Header userEmail={userEmail} onLogout={() => { localStorage.removeItem('google_access_token'); window.location.reload(); }} />
      
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-10 space-y-8 pb-32">
        {!userEmail ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
             <div className="relative group w-full max-w-md">
                <div className="absolute -inset-2 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-[48px] blur-2xl opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                <button onClick={() => (window as any).tokenClient.requestAccessToken({ prompt: 'select_account' })} className="relative w-full py-8 bg-white text-black font-black rounded-[40px] flex items-center justify-center gap-6 hover:scale-[1.02] transition-all active:scale-95 shadow-2xl">
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-10 h-10" alt="Google" /> 
                    <span className="text-xl sm:text-2xl tracking-tighter">Synchronisation Live</span>
                </button>
             </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000 space-y-8">
            
            {/* Nouveau Command Center Turbo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
               <button onClick={() => setShowSummary(true)} className="p-5 sm:p-6 bg-indigo-600 rounded-[32px] font-black text-[10px] sm:text-xs text-white flex flex-col items-center justify-center gap-2 hover:scale-[1.02] transition-all active:scale-95 border border-indigo-400 shadow-xl shadow-indigo-600/20">
                 <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6" /> Bilan Intelligent
               </button>
               <button onClick={() => alert(`Dossiers Actifs : ${stats.folders.length}`)} className="p-5 sm:p-6 bg-white/5 border border-white/10 rounded-[32px] font-black text-[10px] sm:text-xs text-white/60 hover:text-white transition-all flex flex-col items-center justify-center gap-2 hover:bg-white/10">
                 <Layers className="w-5 h-5 sm:w-6 sm:h-6" /> Dossiers IA ({stats.folders.length})
               </button>
               <button onClick={() => alert(`Tags Créés : ${stats.tags.length}`)} className="p-5 sm:p-6 bg-white/5 border border-white/10 rounded-[32px] font-black text-[10px] sm:text-xs text-white/60 hover:text-white transition-all flex flex-col items-center justify-center gap-2 hover:bg-white/10">
                 <ListFilter className="w-5 h-5 sm:w-6 sm:h-6" /> Tags IA ({stats.tags.length})
               </button>
               <button onClick={() => setShowSetup(true)} className="p-5 sm:p-6 bg-white/5 border border-white/10 rounded-[32px] flex flex-col items-center justify-center gap-2 hover:bg-white/10 transition-all text-white/40">
                  <Settings className="w-5 h-5 sm:w-6 sm:h-6" /> Réglages
               </button>
            </div>

            {/* DashBoard de Progression */}
            <div className="bg-white/[0.02] backdrop-blur-3xl p-8 sm:p-12 rounded-[48px] border border-white/5 shadow-3xl relative overflow-hidden group">
               <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 relative z-10 gap-6">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-4">Pipeline Turbo {config.provider.toUpperCase()}</span>
                    <span className="text-6xl sm:text-8xl font-black text-white tracking-tighter leading-none">{processedEmails.length}</span>
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mt-2">Emails analysés par Titan</span>
                  </div>
                  <div className="text-left sm:text-right w-full sm:w-auto">
                    <span className="text-2xl sm:text-4xl font-black text-white/40 block mb-1 tracking-tighter">{progressPercent}%</span>
                    <span className="text-[10px] font-black text-white/10 uppercase tracking-widest">{globalFetchedCount.toLocaleString()} / {totalInboxCount.toLocaleString()} récoltés</span>
                  </div>
               </div>
               <div className="h-2.5 bg-white/5 rounded-full overflow-hidden p-0.5 shadow-inner">
                  <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 rounded-full transition-all duration-1000 shadow-[0_0_20px_rgba(99,102,241,0.6)]" style={{ width: `${progressPercent}%` }} />
               </div>
            </div>

            {loading && (
              <div className="fixed bottom-12 inset-x-0 flex justify-center z-[100] pointer-events-none px-4">
                 <div className="bg-white text-black px-8 sm:px-10 py-5 sm:py-7 rounded-[32px] shadow-4xl flex items-center gap-6 animate-in slide-in-from-bottom-12 pointer-events-auto border-4 border-black">
                    <div className="relative"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
                    <span className="font-black text-[10px] sm:text-[12px] tracking-[0.2em] uppercase truncate max-w-[150px]">{statusText}</span>
                    <button onClick={() => stopSignal.current = true} className="p-3 bg-red-500 text-white rounded-2xl hover:bg-red-600 transition-all active:scale-90"><StopCircle className="w-6 h-6" /></button>
                 </div>
              </div>
            )}

            {/* Modal de Bilan */}
            {showSummary && (
              <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-4 sm:p-10 animate-in fade-in duration-300">
                <div className="bg-[#0A0A0A] w-full max-w-4xl h-full max-h-[85vh] rounded-[48px] border border-white/10 flex flex-col overflow-hidden relative shadow-2xl">
                  <button onClick={() => setShowSummary(false)} className="absolute top-8 right-8 p-4 bg-white/5 rounded-full hover:bg-white/10 transition-all"><X className="w-6 h-6 text-white" /></button>
                  
                  <div className="p-10 sm:p-16 overflow-y-auto space-y-12">
                    <div className="space-y-4">
                      <h2 className="text-4xl sm:text-6xl font-black text-white tracking-tighter">Bilan IA</h2>
                      <p className="text-white/40 text-sm font-bold uppercase tracking-widest">Intelligence extraite de vos emails</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      {/* Dossiers */}
                      <div className="space-y-6">
                        <div className="flex items-center gap-3"><Layers className="text-indigo-400 w-5 h-5" /><h3 className="font-black text-white uppercase text-xs tracking-widest">Répartition Dossiers</h3></div>
                        <div className="space-y-3">
                          {stats.folders.slice(0, 6).map(([name, count]) => (
                            <div key={name} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                              <span className="font-black text-sm text-white/80">{name}</span>
                              <span className="px-3 py-1 bg-indigo-500 rounded-full text-[10px] font-black">{count} mails</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Tags & Sentiments */}
                      <div className="space-y-10">
                        <div className="space-y-6">
                           <div className="flex items-center gap-3"><Zap className="text-purple-400 w-5 h-5" /><h3 className="font-black text-white uppercase text-xs tracking-widest">Tags Dominateurs</h3></div>
                           <div className="flex flex-wrap gap-2">
                             {stats.tags.slice(0, 15).map(([name, count]) => (
                               <span key={name} className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold text-white/60">#{name} ({count})</span>
                             ))}
                           </div>
                        </div>

                        <div className="space-y-6">
                           <div className="flex items-center gap-3"><PieChart className="text-emerald-400 w-5 h-5" /><h3 className="font-black text-white uppercase text-xs tracking-widest">Température Inbox</h3></div>
                           <div className="grid grid-cols-3 gap-4">
                              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-center">
                                 <p className="text-emerald-400 font-black text-lg">{stats.sentiments.Positif}</p>
                                 <p className="text-[8px] uppercase font-bold text-emerald-400/50">Positif</p>
                              </div>
                              <div className="p-4 bg-white/5 border border-white/10 rounded-2xl text-center">
                                 <p className="text-white/40 font-black text-lg">{stats.sentiments.Neutre}</p>
                                 <p className="text-[8px] uppercase font-bold text-white/20">Neutre</p>
                              </div>
                              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-center">
                                 <p className="text-red-400 font-black text-lg">{stats.sentiments.Négatif}</p>
                                 <p className="text-[8px] uppercase font-bold text-red-400/50">Négatif</p>
                              </div>
                           </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-10 bg-indigo-600 rounded-[32px] flex flex-col sm:flex-row items-center justify-between gap-6">
                       <div className="flex items-center gap-6">
                          <div className="p-4 bg-white/20 rounded-full"><Info className="w-8 h-8 text-white" /></div>
                          <div>
                            <p className="text-xl font-black text-white">Impact du Titan</p>
                            <p className="text-white/60 text-xs font-bold uppercase tracking-widest">Classement réel effectué dans votre Gmail</p>
                          </div>
                       </div>
                       <div className="text-center sm:text-right">
                          <p className="text-4xl font-black text-white">~{processedEmails.length * 30}s</p>
                          <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">Temps humain économisé</p>
                       </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-10">
               <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tighter px-4 flex items-center gap-4">
                 <Zap className="text-indigo-500 w-8 h-8" /> Pipeline Turbo (Simultanéité x3)
               </h2>
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
    <div className={`transition-all duration-700 rounded-[48px] overflow-hidden border ${isOpen ? 'bg-white/[0.06] border-white/20 shadow-4xl' : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.03]'}`}>
      <div className="flex items-center justify-between p-8 sm:p-12 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center gap-6 sm:gap-10 min-w-0">
          <div className={`w-14 h-14 sm:w-20 sm:h-20 rounded-[24px] sm:rounded-[28px] flex items-center justify-center shadow-3xl transition-all ${tranche.status === 'completed' ? 'bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.3)]' : tranche.status === 'running' ? 'bg-indigo-600 text-white animate-pulse' : 'bg-white/5 text-white/20'}`}>
             {tranche.status === 'completed' ? <Check className="w-8 h-8 sm:w-10 sm:h-10" strokeWidth={4} /> : <Database className="w-8 h-8 sm:w-10 sm:h-10" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-xl sm:text-3xl font-black text-white tracking-tighter truncate">Bloc {tranche.id}</h3>
            <div className="flex items-center gap-3 mt-3">
               <div className="w-24 sm:w-40 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-1000 ${tranche.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${prog}%` }} />
               </div>
               <span className="text-[9px] sm:text-[11px] font-black text-white/30 uppercase tracking-[0.2em]">{tranche.fetchedCount} mails</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
           {tranche.status !== 'completed' && (
              <button onClick={(e) => { e.stopPropagation(); tranche.status === 'running' ? onStop() : onStart(); }}
                disabled={isLoading && tranche.status !== 'running'}
                className={`p-4 sm:p-6 rounded-[20px] transition-all active:scale-90 ${tranche.status === 'running' ? 'bg-red-500 text-white' : 'bg-white text-black'}`}>
                {tranche.status === 'running' ? <StopCircle className="w-6 h-6 sm:w-8 sm:h-8" /> : <PlayCircle className="w-6 h-6 sm:w-8 sm:h-8" />}
              </button>
           )}
        </div>
      </div>
      {isOpen && (
        <div className="px-6 sm:px-12 pb-12 sm:pb-16 space-y-6 sm:space-y-8 animate-in slide-in-from-top-6 duration-700">
           <div className="h-px bg-white/10 mb-6"></div>
           {batches.length > 0 ? batches.map((batch, idx) => (
             <BatchAccordion key={idx} batch={batch} isLoading={isLoading} onAnalyze={() => onAnalyze(batch.emails)} onAction={() => {}} onIgnore={() => {}} />
           )) : <div className="text-center py-12 text-white/10 font-black uppercase tracking-[0.4em]">En attente de récolte de données</div>}
        </div>
      )}
    </div>
  );
}
