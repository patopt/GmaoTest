import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Header from './components/Header';
import Setup from './components/Setup';
import LogConsole from './components/LogConsole';
import { GMAIL_DISCOVERY_DOCS, GMAIL_SCOPES, GOOGLE_CLIENT_ID } from './constants';
import { EnrichedEmail, HarvestTranche, TaskStatus } from './types';
import { getTotalInboxCount } from './services/gmailService';
import { Loader2, Inbox, Database, Settings, StopCircle, PlayCircle, Clock, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { logger } from './utils/logger';

export default function App() {
  const [config, setConfig] = useState(() => ({
    provider: localStorage.getItem('ai_provider') || 'puter',
    model: localStorage.getItem('ai_model') || 'gemini-2.5-pro-preview',
    apiKey: localStorage.getItem('gemini_api_key') || ''
  }));
  
  const [showSetup, setShowSetup] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  
  const [totalInboxCount, setTotalInboxCount] = useState<number>(() => Number(localStorage.getItem('total_inbox_count')) || 0);
  const [tranches, setTranches] = useState<HarvestTranche[]>(() => {
    const saved = localStorage.getItem('harvest_tranches_v6');
    return saved ? JSON.parse(saved) : [];
  });

  const stopSignal = useRef<boolean>(false);
  const cooldownTimers = useRef<Record<number, number>>({});

  useEffect(() => {
    localStorage.setItem('harvest_tranches_v6', JSON.stringify(tranches));
    localStorage.setItem('total_inbox_count', String(totalInboxCount));
  }, [tranches, totalInboxCount]);

  const initGoogleServices = useCallback(() => {
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.onload = () => {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({ discoveryDocs: GMAIL_DISCOVERY_DOCS });
          const token = localStorage.getItem('google_access_token');
          if (token) {
            window.gapi.client.setToken({ access_token: token });
            try {
              const userInfo = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
              setUserEmail(userInfo.result.emailAddress);
              const total = await getTotalInboxCount();
              setTotalInboxCount(total);
              generateTranches(total);
            } catch (e) {
              localStorage.removeItem('google_access_token');
            }
          }
        } catch (e) { logger.error("Erreur GAPI", e); }
      });
    };
    document.body.appendChild(gapiScript);

    const gisScript = document.createElement('script');
    gisScript.src = 'https://accounts.google.com/gsi/client';
    gisScript.onload = () => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GMAIL_SCOPES,
        callback: async (resp: any) => {
          if (resp.error) return logger.error("Erreur OAuth", resp);
          localStorage.setItem('google_access_token', resp.access_token);
          window.gapi.client.setToken({ access_token: resp.access_token });
          const userInfo = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
          setUserEmail(userInfo.result.emailAddress);
          const total = await getTotalInboxCount();
          setTotalInboxCount(total);
          generateTranches(total);
        },
      });
      (window as any).tokenClient = client;
      setIsClientReady(true);
    };
    document.body.appendChild(gisScript);
  }, []);

  useEffect(() => { initGoogleServices(); }, [initGoogleServices]);

  const generateTranches = (total: number) => {
    setTranches(prev => {
      if (prev.length > 0) return prev;
      const newTranches: HarvestTranche[] = [];
      const numTranches = Math.ceil(total / 1000);
      for (let i = 0; i < numTranches; i++) {
        newTranches.push({
          id: i + 1,
          startIndex: i * 1000,
          totalToFetch: Math.min(1000, total - (i * 1000)),
          fetchedCount: 0,
          status: 'pending',
          emails: []
        });
      }
      return newTranches;
    });
  };

  const updateTranche = (id: number, updates: Partial<HarvestTranche>) => {
    setTranches(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const startHarvesting = async (trancheId: number) => {
    if (loading) return;
    const tranche = tranches.find(t => t.id === trancheId);
    if (!tranche || tranche.status === 'completed' || tranche.status === 'cooldown') return;

    stopSignal.current = false;
    setLoading(true);
    updateTranche(trancheId, { status: 'running' });

    try {
      let currentEmails = [...tranche.emails];
      let fetchedInTranche = tranche.fetchedCount;
      let pageToken = tranche.nextPageToken || undefined;

      const SUB_FETCH_SIZE = 50; 
      const API_DELAY = 2000; // 2s entre sub-batch pour sécurité

      while (fetchedInTranche < tranche.totalToFetch && !stopSignal.current) {
        setStatusText(`Tranche ${trancheId}: ${fetchedInTranche}/${tranche.totalToFetch}...`);
        
        try {
          const response: any = await window.gapi.client.gmail.users.messages.list({ 
            userId: 'me', 
            maxResults: Math.min(SUB_FETCH_SIZE, tranche.totalToFetch - fetchedInTranche),
            pageToken: pageToken,
            labelIds: ['INBOX'] 
          });

          const messages = response.result.messages || [];
          pageToken = response.result.nextPageToken || null;

          const detailedEmails: EnrichedEmail[] = [];
          for (const m of messages) {
            if (stopSignal.current) break;
            try {
              const res = await window.gapi.client.gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata' });
              const headers = res.result.payload.headers;
              detailedEmails.push({
                id: res.result.id,
                threadId: res.result.threadId,
                snippet: res.result.snippet,
                internalDate: res.result.internalDate,
                subject: headers.find((h: any) => h.name === 'Subject')?.value || '(Sans objet)',
                from: headers.find((h: any) => h.name === 'From')?.value || 'Inconnu',
                processed: false
              });
              await new Promise(r => setTimeout(r, 200)); // Throttling
            } catch (e: any) {
              if (e.status === 429) {
                logger.warn("Limite atteinte. Pause de 10s...");
                await new Promise(r => setTimeout(r, 10000));
              }
            }
          }

          currentEmails = [...currentEmails, ...detailedEmails];
          fetchedInTranche += detailedEmails.length;
          
          updateTranche(trancheId, { 
            emails: currentEmails, 
            fetchedCount: fetchedInTranche,
            nextPageToken: pageToken 
          });

          if (!pageToken || fetchedInTranche >= tranche.totalToFetch) break;
          await new Promise(r => setTimeout(r, API_DELAY));
        } catch (err: any) {
          if (err.status === 429) {
             logger.error("Bloqué par Google (429). Arrêt de sécurité.");
             stopSignal.current = true;
          } else {
             throw err;
          }
        }
      }

      if (stopSignal.current) {
        updateTranche(trancheId, { status: 'stopped' });
      } else {
        updateTranche(trancheId, { status: 'cooldown' });
        logger.success(`Tranche ${trancheId} finie. Cooldown actif.`);
        startCooldown(trancheId);
      }
    } catch (err: any) {
      logger.error("Erreur récolte", err);
      updateTranche(trancheId, { status: 'error' });
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const startCooldown = (id: number) => {
    let timeLeft = 30; // 30s de pause obligatoire entre tranches de 1000
    const interval = setInterval(() => {
      timeLeft--;
      if (timeLeft <= 0) {
        clearInterval(interval);
        updateTranche(id, { status: 'completed' });
      }
    }, 1000);
  };

  const stopHarvesting = () => {
    stopSignal.current = true;
    setStatusText('Arrêt en cours...');
  };

  const handleReset = () => {
    localStorage.clear();
    window.location.reload();
  };

  const globalFetched = useMemo(() => tranches.reduce((acc, t) => acc + t.fetchedCount, 0), [tranches]);
  const progressPercent = totalInboxCount > 0 ? Math.round((globalFetched / totalInboxCount) * 100) : 0;

  if (showSetup) return (
    <div className="bg-[#050505] min-h-screen text-white font-sans">
      <Header userEmail={userEmail} onLogout={handleLogout} />
      <Setup 
        onSave={(prov, mod, key) => {
          localStorage.setItem('ai_provider', prov);
          localStorage.setItem('ai_model', mod);
          localStorage.setItem('gemini_api_key', key);
          setConfig({ provider: prov, model: mod, apiKey: key });
          setShowSetup(false);
        }} 
        onReset={handleReset} 
        onLogout={handleLogout} 
        isLoggedIn={!!userEmail} 
      />
      <LogConsole />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-white selection:bg-indigo-500/30 font-sans antialiased">
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
                <p className="text-white/40 mb-12 text-xl font-medium leading-relaxed">Récolte Gmail par tranches de 1000 avec protection anti-ban.</p>
                <button 
                  onClick={() => (window as any).tokenClient.requestAccessToken({ prompt: 'select_account' })}
                  disabled={!isClientReady}
                  className="w-full py-6 bg-white text-black font-black rounded-3xl flex items-center justify-center gap-4 hover:bg-white/90 transition-all active:scale-95 shadow-2xl"
                >
                  {!isClientReady ? <Loader2 className="w-6 h-6 animate-spin" /> : <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-8 h-8" alt="G" />}
                  Lancer la session
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000">
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
               <div className="bg-white/[0.03] backdrop-blur-3xl p-8 rounded-[40px] border border-white/10 flex items-center gap-6">
                  <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400"><Database className="w-8 h-8" /></div>
                  <div>
                    <div className="text-[11px] font-black text-white/20 uppercase tracking-[0.2em]">Total Emails</div>
                    <div className="text-3xl font-black text-white">{totalInboxCount.toLocaleString()}</div>
                  </div>
               </div>
               <div className="bg-white/[0.03] backdrop-blur-3xl p-8 rounded-[40px] border border-white/10 flex items-center gap-6">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400"><CheckCircle2 className="w-8 h-8" /></div>
                  <div>
                    <div className="text-[11px] font-black text-white/20 uppercase tracking-[0.2em]">En Cache</div>
                    <div className="text-3xl font-black text-white">{globalFetched.toLocaleString()}</div>
                  </div>
               </div>
               <div className="bg-white/[0.03] backdrop-blur-3xl p-8 rounded-[40px] border border-white/10 flex items-center gap-6">
                  <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-400"><Clock className="w-8 h-8" /></div>
                  <div>
                    <div className="text-[11px] font-black text-white/20 uppercase tracking-[0.2em]">Temps estimé</div>
                    <div className="text-3xl font-black text-white">~{Math.ceil((totalInboxCount - globalFetched) * 0.4 / 60)} min</div>
                  </div>
               </div>
            </div>

            {/* Global Progress */}
            <div className="bg-white/[0.02] backdrop-blur-2xl p-8 rounded-[48px] border border-white/5 mb-12 shadow-2xl">
              <div className="flex justify-between items-end mb-10">
                <div className="space-y-1">
                  <h3 className="text-xs font-black text-white/30 uppercase tracking-[0.3em]">Progression Totale</h3>
                  <p className="text-6xl font-black text-white tracking-tighter">{progressPercent}%</p>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => setShowSetup(true)} className="p-5 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 transition-all">
                    <Settings className="w-6 h-6 text-white/60" />
                  </button>
                </div>
              </div>
              <div className="h-4 bg-white/5 rounded-full overflow-hidden border border-white/5 p-1">
                <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 transition-all duration-1000 rounded-full" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            <div className="bg-amber-500/5 border border-amber-500/20 p-5 rounded-3xl mb-8 flex items-center gap-4">
               <ShieldAlert className="w-6 h-6 text-amber-400 shrink-0" />
               <p className="text-xs font-medium text-amber-200/60 leading-relaxed">
                 Mode Sécurisé Actif : Récupération progressive avec minuteur de repos. 
                 État sauvegardé en temps réel.
               </p>
            </div>

            {loading && (
              <div className="fixed bottom-10 inset-x-0 flex justify-center z-50 pointer-events-none">
                 <div className="bg-white text-black px-8 py-5 rounded-full shadow-2xl flex items-center gap-5 animate-in slide-in-from-bottom-12 pointer-events-auto border border-black/10">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    <span className="font-black text-xs tracking-[0.2em] uppercase">{statusText}</span>
                    <button 
                      onClick={stopHarvesting}
                      className="ml-4 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all active:scale-95"
                    >
                      <StopCircle className="w-6 h-6" />
                    </button>
                 </div>
              </div>
            )}

            <div className="space-y-6">
               {tranches.map(t => (
                 <TrancheAccordion 
                    key={t.id} 
                    tranche={t} 
                    isLoading={loading}
                    onStart={() => startHarvesting(t.id)} 
                    onStop={stopHarvesting}
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

function TrancheAccordion({ tranche, onStart, onStop, isLoading }: { tranche: HarvestTranche, onStart: () => void, onStop: () => void, isLoading: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const progress = Math.round((tranche.fetchedCount / tranche.totalToFetch) * 100);

  return (
    <div className={`transition-all duration-500 rounded-[38px] overflow-hidden mb-4 border ${
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
            <h3 className="text-xl font-black text-white/90">Bloc {tranche.id} <span className="text-xs text-white/30 font-bold ml-2">({tranche.startIndex} - {tranche.startIndex + tranche.totalToFetch})</span></h3>
            <div className="flex items-center gap-4 mt-2">
               <div className="w-32 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-1000 ${tranche.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${progress}%` }} />
               </div>
               <span className="text-xs font-black text-white/40">{tranche.fetchedCount} / {tranche.totalToFetch}</span>
               {tranche.status === 'stopped' && <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest px-2 py-0.5 bg-amber-400/10 rounded-full">En pause</span>}
               {tranche.status === 'cooldown' && <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest px-2 py-0.5 bg-indigo-400/10 rounded-full animate-pulse">Repos...</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
           {tranche.status !== 'completed' && (
              <button 
                onClick={(e) => { e.stopPropagation(); tranche.status === 'running' ? onStop() : onStart(); }}
                disabled={isLoading && tranche.status !== 'running'}
                className={`p-4 rounded-2xl transition-all active:scale-95 ${
                  tranche.status === 'running' ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-white text-black hover:bg-white/90'
                }`}
              >
                {tranche.status === 'running' ? <StopCircle className="w-6 h-6" /> : <PlayCircle className="w-6 h-6" />}
              </button>
           )}
        </div>
      </div>
      
      {isOpen && tranche.emails.length > 0 && (
        <div className="px-8 pb-8 space-y-4 border-t border-white/5 pt-6">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tranche.emails.slice(-9).reverse().map(e => (
                <div key={e.id} className="bg-white/5 p-4 rounded-3xl border border-white/5">
                   <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest truncate mb-1">{e.from}</p>
                   <p className="text-xs font-bold text-white/90 truncate mb-1">{e.subject}</p>
                   <p className="text-[10px] text-white/30 line-clamp-1 italic">{e.snippet}</p>
                </div>
              ))}
           </div>
        </div>
      )}
    </div>
  );
}

function handleLogout() {
  localStorage.removeItem('google_access_token');
  window.location.reload();
}