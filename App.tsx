import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Header from './components/Header';
import Setup from './components/Setup';
import LogConsole from './components/LogConsole';
import BatchAccordion from './components/BatchAccordion';
import { GMAIL_DISCOVERY_DOCS, GMAIL_SCOPES, BATCH_SIZE, MAX_HARVEST_LIMIT } from './constants';
import { EnrichedEmail, EmailBatch } from './types';
import { analyzeWithPuter, analyzeWithGeminiSDK } from './services/aiService';
import { moveEmailToLabel, bulkOrganize } from './services/gmailService';
import { Loader2, RefreshCw, Inbox, Layers, Play, Sparkles, FolderPlus, Database, Settings } from 'lucide-react';
import { logger } from './utils/logger';

export default function App() {
  const [config, setConfig] = useState(() => {
    return {
      clientId: localStorage.getItem('google_client_id'),
      provider: localStorage.getItem('ai_provider') || 'puter',
      model: localStorage.getItem('ai_model') || 'gemini-3-flash-preview'
    };
  });
  
  const [showSetup, setShowSetup] = useState(!config.clientId);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  
  const [rawEmails, setRawEmails] = useState<EnrichedEmail[]>(() => {
    const saved = localStorage.getItem('ai_organizer_memory');
    return saved ? JSON.parse(saved) : [];
  });
  const [ignoredIds, setIgnoredIds] = useState<string[]>(JSON.parse(localStorage.getItem('ignored_emails') || '[]'));

  useEffect(() => {
    localStorage.setItem('ai_organizer_memory', JSON.stringify(rawEmails));
  }, [rawEmails]);

  const initGoogleServices = useCallback(() => {
    if (!config.clientId) return;
    if (window.gapi) {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({ discoveryDocs: GMAIL_DISCOVERY_DOCS });
          logger.success("GAPI initialisé.");
        } catch (e) { logger.error("Erreur GAPI", e); }
      });
    }
    if (window.google?.accounts?.oauth2) {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: config.clientId,
        scope: GMAIL_SCOPES,
        callback: async (resp: any) => {
          if (resp.error) return logger.error("OAuth error", resp);
          const userInfo = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
          setUserEmail(userInfo.result.emailAddress);
          fetchAllEmails();
        },
      });
      (window as any).tokenClient = client;
      setIsClientReady(true);
    }
  }, [config.clientId]);

  useEffect(() => {
    if (!config.clientId) return;
    initGoogleServices();
  }, [config.clientId, initGoogleServices]);

  const fetchAllEmails = async () => {
    setLoading(true);
    setStatusText('Extraction totale...');
    try {
      let allMessages: any[] = [];
      let pageToken = null;

      logger.info("Démarrage de la récolte intégrale...");
      
      // Phase 1 : Collecter tous les IDs
      do {
        const response: any = await window.gapi.client.gmail.users.messages.list({ 
          userId: 'me', 
          maxResults: 100,
          pageToken: pageToken,
          labelIds: ['INBOX'] 
        });
        const messages = response.result.messages || [];
        allMessages = [...allMessages, ...messages];
        pageToken = response.result.nextPageToken;
        setStatusText(`Scan Inbox : ${allMessages.length} emails détectés...`);
      } while (pageToken && allMessages.length < MAX_HARVEST_LIMIT);

      // Phase 2 : Récupérer le contenu par micro-chunks (évite 429)
      const fetchedData: EnrichedEmail[] = [];
      const CHUNK = 10;
      for (let i = 0; i < allMessages.length; i += CHUNK) {
        const slice = allMessages.slice(i, i + CHUNK);
        setStatusText(`Récupération : ${i}/${allMessages.length}...`);
        
        const details = await Promise.all(slice.map((m: any) => 
          window.gapi.client.gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' })
        ));

        details.forEach((res: any) => {
          const headers = res.result.payload.headers;
          const existing = rawEmails.find(e => e.id === res.result.id);
          fetchedData.push({
            id: res.result.id,
            threadId: res.result.threadId,
            snippet: res.result.snippet,
            internalDate: res.result.internalDate,
            subject: headers.find((h: any) => h.name === 'Subject')?.value,
            from: headers.find((h: any) => h.name === 'From')?.value,
            processed: existing?.processed || false,
            analysis: existing?.analysis
          });
        });
        await new Promise(r => setTimeout(r, 200));
      }

      setRawEmails(fetchedData);
      logger.success(`${fetchedData.length} emails récoltés.`);
    } catch (err) { logger.error("Harvest Failed", err); }
    finally { setLoading(false); setStatusText(''); }
  };

  const batches = useMemo(() => {
    const active = rawEmails.filter(e => !ignoredIds.includes(e.id));
    const res: EmailBatch[] = [];
    for (let i = 0; i < active.length; i += BATCH_SIZE) {
      res.push({ id: Math.floor(i / BATCH_SIZE) + 1, emails: active.slice(i, i + BATCH_SIZE), status: 'pending' });
    }
    return res;
  }, [rawEmails, ignoredIds]);

  const processBatch = async (batchId: number) => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    setLoading(true);
    setStatusText(`IA (${config.provider}) - Groupe ${batchId}...`);
    try {
      const results = config.provider === 'puter' 
        ? await analyzeWithPuter(batch.emails, config.model)
        : await analyzeWithGeminiSDK(batch.emails, config.model);
      
      setRawEmails(prev => prev.map(e => results[e.id] ? { ...e, analysis: results[e.id], processed: true } : e));
      logger.success(`Analyse Batch ${batchId} réussie.`);
    } catch (err) { logger.error("AI Error", err); }
    finally { setLoading(false); setStatusText(''); }
  };

  const handleSaveConfig = (id: string, prov: string, mod: string) => {
    localStorage.setItem('google_client_id', id);
    localStorage.setItem('ai_provider', prov);
    localStorage.setItem('ai_model', mod);
    setConfig({ clientId: id, provider: prov, model: mod });
    setShowSetup(false);
    window.location.reload();
  };

  if (showSetup) return <div className="bg-slate-900 min-h-screen"><Setup onSave={handleSaveConfig} /><LogConsole /></div>;

  return (
    <div className="min-h-screen flex flex-col bg-slate-900">
      <Header userEmail={userEmail} onLogout={() => { localStorage.clear(); window.location.reload(); }} />
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 lg:p-12 space-y-10">
        {!userEmail ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="bg-slate-800 p-12 rounded-[50px] border border-slate-700 shadow-2xl max-w-lg w-full">
              <Inbox className="w-20 h-20 text-indigo-400 mx-auto mb-8" />
              <h2 className="text-4xl font-black text-white mb-6">Prêt pour l'Analyse ?</h2>
              <button 
                onClick={() => (window as any).tokenClient.requestAccessToken({ prompt: 'select_account' })}
                disabled={!isClientReady}
                className="w-full py-6 bg-white text-slate-900 font-black rounded-3xl flex items-center justify-center gap-4 hover:bg-slate-100 transition-all active:scale-95 shadow-2xl"
              >
                {!isClientReady ? <Loader2 className="w-6 h-6 animate-spin" /> : <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-7 h-7" alt="G" />}
                Démarrer la Synchronisation
              </button>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Command Center */}
            <div className="flex flex-wrap gap-4 items-center bg-slate-800/60 p-5 rounded-[40px] border border-slate-700/50 backdrop-blur-2xl mb-12 shadow-2xl">
               <div className="flex items-center gap-4 px-4">
                  <div className="bg-indigo-500/20 p-3 rounded-2xl text-indigo-400"><Database className="w-6 h-6" /></div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Inventaire</div>
                    <div className="text-xl font-black text-white">{rawEmails.length} Emails</div>
                  </div>
               </div>
               <div className="h-12 w-px bg-slate-700 mx-4 hidden md:block" />
               <button onClick={() => batches.forEach(b => !b.emails.every(e => e.processed) && processBatch(b.id))} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-3xl font-black text-sm flex items-center gap-3 shadow-xl shadow-indigo-600/20 active:scale-95 transition-all">
                  <Sparkles className="w-5 h-5" /> Automatiser tout
               </button>
               <button onClick={() => bulkOrganize(rawEmails)} className="bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-indigo-500/20 px-8 py-4 rounded-3xl font-black text-sm flex items-center gap-3 active:scale-95 transition-all">
                  <FolderPlus className="w-5 h-5" /> Appliquer les Dossiers
               </button>
               <button onClick={() => setShowSetup(true)} className="p-4 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-3xl transition-all ml-auto">
                  <Settings className="w-6 h-6" />
               </button>
               <button onClick={fetchAllEmails} className="p-4 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-3xl transition-all">
                  <RefreshCw className="w-6 h-6" />
               </button>
            </div>

            {loading && (
              <div className="fixed inset-x-0 top-24 flex justify-center z-50 animate-in slide-in-from-top-10">
                 <div className="bg-white text-slate-900 px-10 py-5 rounded-full shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] flex items-center gap-5 border border-slate-200">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    <span className="font-black text-xs tracking-widest uppercase">{statusText}</span>
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
                  onIgnore={(id) => setIgnoredIds(prev => [...prev, id])}
                  onAction={async (id, folder) => {
                    const ok = await moveEmailToLabel(id, folder);
                    if (ok) setRawEmails(prev => prev.filter(e => e.id !== id));
                  }}
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