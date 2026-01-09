
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
  const [nextPageToken, setNextPageToken] = useState<string | null>(localStorage.getItem('gmail_next_page_token'));
  
  const [totalInboxCount, setTotalInboxCount] = useState<number>(() => Number(localStorage.getItem('total_inbox_count')) || 0);
  const [rawEmails, setRawEmails] = useState<EnrichedEmail[]>(() => {
    const saved = localStorage.getItem('ai_organizer_memory_v4');
    return saved ? JSON.parse(saved) : [];
  });

  const [handledIds, setHandledIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('handled_email_ids_v4');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  useEffect(() => {
    localStorage.setItem('ai_organizer_memory_v4', JSON.stringify(rawEmails.slice(0, 5000)));
    localStorage.setItem('handled_email_ids_v4', JSON.stringify(Array.from(handledIds)));
    localStorage.setItem('total_inbox_count', String(totalInboxCount));
    if (nextPageToken) localStorage.setItem('gmail_next_page_token', nextPageToken);
  }, [rawEmails, handledIds, totalInboxCount, nextPageToken]);

  const initGoogleServices = useCallback(() => {
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.onload = () => {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({ discoveryDocs: GMAIL_DISCOVERY_DOCS });
          logger.success("GAPI initialisé.");
          
          const token = localStorage.getItem('google_access_token');
          if (token) {
            window.gapi.client.setToken({ access_token: token });
            try {
              const userInfo = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
              setUserEmail(userInfo.result.emailAddress);
              const total = await getTotalInboxCount();
              setTotalInboxCount(total);
              logger.success("Session restaurée.");
            } catch (e) {
              logger.warn("Session expirée.");
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
          fetchEmails(1000);
        },
      });
      (window as any).tokenClient = client;
      setIsClientReady(true);
    };
    document.body.appendChild(gisScript);
  }, []);

  useEffect(() => { initGoogleServices(); }, [initGoogleServices]);

  const fetchEmails = async (limit: number = 1000) => {
    if (loading) return;
    setLoading(true);
    setStatusText(`Récupération de ${limit} emails...`);
    try {
      const response: any = await window.gapi.client.gmail.users.messages.list({ 
        userId: 'me', 
        maxResults: limit,
        pageToken: nextPageToken || undefined,
        labelIds: ['INBOX'] 
      });
      
      const messages = response.result.messages || [];
      setNextPageToken(response.result.nextPageToken || null);
      
      const newMessages = messages.filter((m: any) => !handledIds.has(m.id) && !rawEmails.some(re => re.id === m.id));

      if (newMessages.length === 0) {
        logger.info("Aucun nouvel email dans cette tranche.");
        setLoading(false);
        return;
      }

      const fetchedData: EnrichedEmail[] = [];
      const SUB_CHUNK = 25;
      for (let i = 0; i < newMessages.length; i += SUB_CHUNK) {
        const slice = newMessages.slice(i, i + SUB_CHUNK);
        setStatusText(`Extraction : ${Math.min(i + SUB_CHUNK, newMessages.length)}/${newMessages.length}...`);
        
        const details = await Promise.all(slice.map((m: any) => 
          window.gapi.client.gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' })
        ));

        details.forEach((res: any) => {
          const payload = res.result.payload;
          const headers = payload.headers;
          fetchedData.push({
            id: res.result.id,
            threadId: res.result.threadId,
            snippet: res.result.snippet,
            internalDate: res.result.internalDate,
            subject: headers.find((h: any) => h.name === 'Subject')?.value || '(Sans objet)',
            from: headers.find((h: any) => h.name === 'From')?.value || 'Inconnu',
            processed: false
          });
        });
        await new Promise(r => setTimeout(r, 100));
      }

      setRawEmails(prev => [...prev, ...fetchedData]);
      logger.success(`${fetchedData.length} emails synchronisés.`);
    } catch (err) { logger.error("Échec récupération", err); }
    finally { setLoading(false); setStatusText(''); }
  };

  const batches = useMemo(() => {
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
    setStatusText(`Intelligence Artificielle en cours...`);
    try {
      const results = config.provider === 'puter' 
        ? await analyzeWithPuter(batch.emails, config.model)
        : await analyzeWithGeminiSDK(batch.emails, config.model);
      
      setRawEmails(prev => prev.map(e => results[e.id] ? { ...e, analysis: results[e.id], processed: true } : e));
    } catch (err) { logger.error("Erreur IA", err); }
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
    localStorage.removeItem('google_access_token');
    window.location.reload();
  };

  if (showSetup) return (
    <div className="bg-[#050505] min-h-screen text-white font-sans">
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
                <p className="text-white/40 mb-12 text-xl font-medium leading-relaxed">L'intelligence Apple au service de votre boîte Gmail.</p>
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
            {/* Stats Dashboard */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
               <div className="bg-white/[0.03] backdrop-blur-3xl p-8 rounded-[40px] border border-white/10 flex items-center gap-6">
                  <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400"><Database className="w-8 h-8" /></div>
                  <div>
                    <div className="text-[11px] font-black text-white/20 uppercase tracking-[0.2em]">Boîte de réception</div>
                    <div className="text-3xl font-black text-white">{totalInboxCount.toLocaleString()}</div>
                  </div>
               </div>
               <div className="bg-white/[0.03] backdrop-blur-3xl p-8 rounded-[40px] border border-white/10 flex items-center gap-6">
                  <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-400"><Zap className="w-8 h-8" /></div>
                  <div>
                    <div className="text-[11px] font-black text-white/20 uppercase tracking-[0.2em]">Emails Prêts</div>
                    <div className="text-3xl font-black text-white">{batches.reduce((acc, b) => acc + b.emails.length, 0)}</div>
                  </div>
               </div>
               <button onClick={() => fetchEmails(1000)} className="group bg-indigo-600 p-8 rounded-[40px] flex items-center gap-6 shadow-2xl shadow-indigo-500/20 hover:bg-indigo-500 active:scale-95 transition-all">
                  <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-white"><RefreshCw className="w-8 h-8 group-hover:rotate-180 transition-transform duration-700" /></div>
                  <div className="text-left">
                    <div className="text-[11px] font-black text-white/50 uppercase tracking-[0.2em]">Charger plus</div>
                    <div className="text-3xl font-black text-white tracking-tighter">+1000</div>
                  </div>
               </button>
            </div>

            {/* Apple Progress Bar */}
            <div className="bg-white/[0.02] backdrop-blur-2xl p-8 rounded-[48px] border border-white/5 mb-12 shadow-2xl">
              <div className="flex justify-between items-end mb-10">
                <div className="space-y-1">
                  <h3 className="text-xs font-black text-white/30 uppercase tracking-[0.3em]">Analyse de la boîte</h3>
                  <p className="text-6xl font-black text-white tracking-tighter">{globalProgress}%</p>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => bulkOrganize(rawEmails)} className="bg-white text-black px-8 py-5 rounded-3xl font-black text-sm flex items-center gap-3 hover:bg-white/90 active:scale-95 shadow-xl transition-all">
                    <FolderPlus className="w-5 h-5" /> Créer tous les dossiers
                  </button>
                  <button onClick={() => setShowSetup(true)} className="p-5 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 transition-all">
                    <Settings className="w-6 h-6 text-white/60" />
                  </button>
                </div>
              </div>
              <div className="h-4 bg-white/5 rounded-full overflow-hidden border border-white/5 p-1">
                <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-[length:200%_auto] animate-gradient-x transition-all duration-1000 rounded-full" style={{ width: `${globalProgress}%` }} />
              </div>
            </div>

            {loading && (
              <div className="fixed bottom-10 inset-x-0 flex justify-center z-50 pointer-events-none">
                 <div className="bg-white text-black px-10 py-5 rounded-full shadow-2xl flex items-center gap-5 animate-in slide-in-from-bottom-12 pointer-events-auto">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    <span className="font-black text-xs tracking-[0.2em] uppercase">{statusText}</span>
                 </div>
              </div>
            )}

            <div className="space-y-6">
              {batches.map((batch) => (
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
                      logger.success("Email classé.");
                    }
                  }}
                />
              ))}
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
      `}</style>
    </div>
  );
}
