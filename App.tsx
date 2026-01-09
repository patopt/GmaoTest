
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Header from './components/Header';
import Setup from './components/Setup';
import LogConsole from './components/LogConsole';
import BatchAccordion from './components/BatchAccordion';
import { GMAIL_DISCOVERY_DOCS, GMAIL_SCOPES, BATCH_SIZE, GOOGLE_CLIENT_ID } from './constants';
import { EnrichedEmail, EmailBatch } from './types';
import { analyzeWithPuter, analyzeWithGeminiSDK } from './services/aiService';
import { moveEmailToLabel, bulkOrganize, getTotalInboxCount } from './services/gmailService';
import { Loader2, RefreshCw, Inbox, Sparkles, FolderPlus, Database, Settings, Zap, ArrowRight, UserCircle2 } from 'lucide-react';
import { logger } from './utils/logger';

export default function App() {
  const [config, setConfig] = useState(() => ({
    provider: localStorage.getItem('ai_provider') || 'puter',
    model: localStorage.getItem('ai_model') || 'gemini-3-flash-preview'
  }));
  
  const [showSetup, setShowSetup] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  
  const [totalInboxCount, setTotalInboxCount] = useState<number>(0);
  const [rawEmails, setRawEmails] = useState<EnrichedEmail[]>(() => {
    const saved = localStorage.getItem('ai_organizer_memory_v3');
    return saved ? JSON.parse(saved) : [];
  });

  // Track message IDs that have been moved out of Inbox or archived
  const [handledIds, setHandledIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('handled_email_ids');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  useEffect(() => {
    localStorage.setItem('ai_organizer_memory_v3', JSON.stringify(rawEmails.slice(0, 5000)));
    localStorage.setItem('handled_email_ids', JSON.stringify(Array.from(handledIds)));
  }, [rawEmails, handledIds]);

  const initGoogleServices = useCallback(() => {
    if (window.gapi) {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({ discoveryDocs: GMAIL_DISCOVERY_DOCS });
          logger.success("Services Cloud Google initialisés.");
          
          // Try to restore previous session if token exists
          const token = localStorage.getItem('google_access_token');
          if (token) {
            window.gapi.client.setToken({ access_token: token });
            try {
              const userInfo = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
              setUserEmail(userInfo.result.emailAddress);
              const total = await getTotalInboxCount();
              setTotalInboxCount(total);
              logger.success("Session restaurée avec succès.");
            } catch (e) {
              logger.warn("Session expirée, reconnexion nécessaire.");
              localStorage.removeItem('google_access_token');
            }
          }
        } catch (e) { logger.error("Erreur GAPI", e); }
      });
    }

    if (window.google?.accounts?.oauth2) {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GMAIL_SCOPES,
        callback: async (resp: any) => {
          if (resp.error) return logger.error("Erreur OAuth", resp);
          
          localStorage.setItem('google_access_token', resp.access_token);
          const userInfo = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
          setUserEmail(userInfo.result.emailAddress);
          const total = await getTotalInboxCount();
          setTotalInboxCount(total);
          fetchNextBatch(1000);
        },
      });
      (window as any).tokenClient = client;
      setIsClientReady(true);
    }
  }, []);

  useEffect(() => {
    initGoogleServices();
  }, [initGoogleServices]);

  const fetchNextBatch = async (limit: number = 1000) => {
    setLoading(true);
    setStatusText(`Extraction de ${limit} emails...`);
    try {
      const response: any = await window.gapi.client.gmail.users.messages.list({ 
        userId: 'me', 
        maxResults: limit,
        labelIds: ['INBOX'] 
      });
      const messages = response.result.messages || [];
      const fetchedData: EnrichedEmail[] = [];
      
      // Filter out messages already in memory or handled
      const newMessages = messages.filter((m: any) => !handledIds.has(m.id) && !rawEmails.some(re => re.id === m.id));

      if (newMessages.length === 0) {
        logger.info("Tous les emails de cette tranche sont déjà connus ou traités.");
        setLoading(false);
        return;
      }

      const SUB_CHUNK = 20;
      for (let i = 0; i < newMessages.length; i += SUB_CHUNK) {
        const slice = newMessages.slice(i, i + SUB_CHUNK);
        setStatusText(`Synchronisation : ${Math.min(i + SUB_CHUNK, newMessages.length)}/${newMessages.length}...`);
        
        const details = await Promise.all(slice.map((m: any) => 
          window.gapi.client.gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' })
        ));

        details.forEach((res: any) => {
          const headers = res.result.payload.headers;
          fetchedData.push({
            id: res.result.id,
            threadId: res.result.threadId,
            snippet: res.result.snippet,
            internalDate: res.result.internalDate,
            subject: headers.find((h: any) => h.name === 'Subject')?.value,
            from: headers.find((h: any) => h.name === 'From')?.value,
            processed: false
          });
        });
        await new Promise(r => setTimeout(r, 100));
      }

      setRawEmails(prev => {
        const combined = [...prev, ...fetchedData];
        // Ensure uniqueness
        const uniqueMap = new Map();
        combined.forEach(item => uniqueMap.set(item.id, item));
        return Array.from(uniqueMap.values());
      });
      logger.success(`${fetchedData.length} nouveaux emails découverts.`);
    } catch (err) { logger.error("Échec de la récolte", err); }
    finally { setLoading(false); setStatusText(''); }
  };

  const batches = useMemo(() => {
    // Only show emails that haven't been handled yet
    const activeEmails = rawEmails.filter(e => !handledIds.has(e.id));
    const res: EmailBatch[] = [];
    for (let i = 0; i < activeEmails.length; i += BATCH_SIZE) {
      res.push({ id: Math.floor(i / BATCH_SIZE) + 1, emails: activeEmails.slice(i, i + BATCH_SIZE), status: 'pending' });
    }
    return res;
  }, [rawEmails, handledIds]);

  const processBatch = async (batchId: number) => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    setLoading(true);
    setStatusText(`Analyse IA par ${config.provider}...`);
    try {
      const results = config.provider === 'puter' 
        ? await analyzeWithPuter(batch.emails, config.model)
        : await analyzeWithGeminiSDK(batch.emails, config.model);
      
      setRawEmails(prev => prev.map(e => results[e.id] ? { ...e, analysis: results[e.id], processed: true } : e));
      logger.success(`Tranche ${batchId} analysée.`);
    } catch (err) { logger.error("IA Fail", err); }
    finally { setLoading(false); setStatusText(''); }
  };

  const globalProgress = useMemo(() => {
    if (totalInboxCount === 0) return 0;
    const processed = rawEmails.filter(e => e.processed).length;
    const handled = handledIds.size;
    return Math.min(100, Math.round(((processed + handled) / totalInboxCount) * 100));
  }, [rawEmails, handledIds, totalInboxCount]);

  const handleReset = () => {
    localStorage.clear();
    window.location.reload();
  };

  const handleLogout = () => {
    const token = window.gapi.client.getToken();
    if (token) {
      window.google.accounts.oauth2.revoke(token.access_token, () => {
        localStorage.removeItem('google_access_token');
        setUserEmail(null);
        window.location.reload();
      });
    } else {
      localStorage.removeItem('google_access_token');
      window.location.reload();
    }
  };

  if (showSetup) return (
    <div className="bg-black min-h-screen text-white font-sans">
      <Header userEmail={userEmail} onLogout={handleLogout} />
      <Setup 
        onSave={(prov, mod) => {
          localStorage.setItem('ai_provider', prov);
          localStorage.setItem('ai_model', mod);
          setConfig({ provider: prov, model: mod });
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
    <div className="min-h-screen flex flex-col bg-black text-white selection:bg-indigo-500/30 font-sans antialiased overflow-x-hidden">
      <Header userEmail={userEmail} onLogout={handleLogout} />
      
      <main className="flex-1 max-w-5xl w-full mx-auto p-5 sm:p-10 space-y-12">
        {!userEmail ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="relative w-full max-w-lg">
              <div className="absolute -inset-2 bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-500 rounded-[60px] blur-2xl opacity-20 animate-pulse"></div>
              <div className="relative bg-white/5 backdrop-blur-3xl p-12 rounded-[56px] border border-white/10 shadow-3xl">
                <div className="w-28 h-28 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-[38px] mx-auto mb-10 flex items-center justify-center shadow-2xl rotate-3 transform hover:rotate-0 transition-transform duration-500">
                  <Inbox className="w-14 h-14 text-white" />
                </div>
                <h2 className="text-5xl font-black text-white mb-6 tracking-tight leading-none">Intelligence Inbox</h2>
                <p className="text-white/40 mb-12 text-xl font-medium leading-relaxed px-4">
                  L'expérience d'organisation la plus raffinée, propulsée par l'IA.
                </p>
                <button 
                  onClick={() => (window as any).tokenClient.requestAccessToken({ prompt: 'select_account' })}
                  disabled={!isClientReady}
                  className="w-full py-6 bg-white text-black font-black rounded-3xl flex items-center justify-center gap-4 hover:bg-white/90 transition-all active:scale-95 shadow-2xl"
                >
                  {!isClientReady ? <Loader2 className="w-6 h-6 animate-spin" /> : <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-8 h-8" alt="G" />}
                  Connexion Gmail
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-12 duration-1000">
            {/* Command Center */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
               <div className="group bg-white/[0.03] backdrop-blur-3xl p-7 rounded-[40px] border border-white/10 flex items-center gap-6 hover:bg-white/[0.05] transition-all">
                  <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400 shadow-inner group-hover:scale-110 transition-transform"><Database className="w-8 h-8" /></div>
                  <div>
                    <div className="text-[11px] font-black text-white/20 uppercase tracking-[0.2em] mb-1">Inbox</div>
                    <div className="text-3xl font-black text-white tracking-tighter">{totalInboxCount.toLocaleString()}</div>
                  </div>
               </div>
               <div className="group bg-white/[0.03] backdrop-blur-3xl p-7 rounded-[40px] border border-white/10 flex items-center gap-6 hover:bg-white/[0.05] transition-all">
                  <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-400 shadow-inner group-hover:scale-110 transition-transform"><Zap className="w-8 h-8" /></div>
                  <div>
                    <div className="text-[11px] font-black text-white/20 uppercase tracking-[0.2em] mb-1">Analysés</div>
                    <div className="text-3xl font-black text-white tracking-tighter">{rawEmails.filter(e => e.processed).length.toLocaleString()}</div>
                  </div>
               </div>
               <button 
                onClick={() => fetchNextBatch(1000)}
                className="group bg-indigo-600 p-7 rounded-[40px] flex items-center gap-6 shadow-2xl shadow-indigo-500/20 hover:bg-indigo-500 active:scale-95 transition-all"
               >
                  <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-white group-hover:rotate-180 transition-transform duration-700"><RefreshCw className="w-8 h-8" /></div>
                  <div className="text-left">
                    <div className="text-[11px] font-black text-white/50 uppercase tracking-[0.2em] mb-1">Récupérer</div>
                    <div className="text-3xl font-black text-white tracking-tighter">+1000</div>
                  </div>
               </button>
            </div>

            {/* Main Progress Hub */}
            <div className="bg-white/[0.02] backdrop-blur-2xl p-8 rounded-[48px] border border-white/5 mb-12 shadow-2xl">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
                <div className="space-y-2">
                  <h3 className="text-xs font-black text-white/30 uppercase tracking-[0.3em]">Status de l'Analyse</h3>
                  <p className="text-6xl font-black text-white tracking-tighter">{globalProgress}%</p>
                </div>
                <div className="flex flex-wrap gap-4 w-full md:w-auto">
                  <button onClick={() => bulkOrganize(rawEmails)} className="flex-1 md:flex-none bg-white text-black px-8 py-5 rounded-3xl font-black text-sm flex items-center justify-center gap-3 transition-all hover:bg-white/90 active:scale-95 shadow-xl shadow-white/5">
                    <FolderPlus className="w-5 h-5" /> Créer dossiers
                  </button>
                  <button onClick={() => setShowSetup(true)} className="p-5 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 transition-all active:scale-95">
                    <Settings className="w-6 h-6 text-white/60" />
                  </button>
                </div>
              </div>
              <div className="relative h-4 bg-white/5 rounded-full overflow-hidden border border-white/5 p-1">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-[length:200%_auto] animate-gradient-x transition-all duration-1000 rounded-full shadow-[0_0_30px_rgba(99,102,241,0.4)]" 
                  style={{ width: `${globalProgress}%` }} 
                />
              </div>
            </div>

            {loading && (
              <div className="fixed bottom-10 inset-x-0 flex justify-center z-50 pointer-events-none">
                 <div className="bg-white text-black px-10 py-5 rounded-full shadow-[0_40px_80px_rgba(0,0,0,0.5)] flex items-center gap-5 animate-in slide-in-from-bottom-12 pointer-events-auto border border-white/10">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    <span className="font-black text-xs tracking-[0.2em] uppercase">{statusText}</span>
                 </div>
              </div>
            )}

            <div className="space-y-6">
              {batches.length > 0 ? (
                batches.map((batch) => (
                  <BatchAccordion 
                    key={batch.id}
                    batch={batch}
                    isLoading={loading}
                    onAnalyze={() => processBatch(batch.id)}
                    onIgnore={() => {}}
                    onAction={async (id, folder) => {
                      const ok = await moveEmailToLabel(id, folder);
                      if (ok) {
                        setHandledIds(prev => new Set(prev).add(id));
                        logger.success("Email organisé et déplacé.");
                      }
                    }}
                  />
                ))
              ) : (
                <div className="text-center py-24 bg-white/[0.01] rounded-[56px] border border-dashed border-white/10">
                   <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Zap className="w-8 h-8 text-white/20" />
                   </div>
                   <p className="text-white/30 font-black text-lg tracking-tight uppercase">Aucun email en attente d'organisation</p>
                   <p className="text-white/10 text-xs mt-2 uppercase tracking-widest font-bold">Chargez de nouveaux emails ou connectez un autre compte</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      <LogConsole />
      <style>{`
        @keyframes gradient-x {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient-x {
          animation: gradient-x 4s ease infinite;
        }
        ::selection { background: rgba(99, 102, 241, 0.4); }
      `}</style>
    </div>
  );
}
