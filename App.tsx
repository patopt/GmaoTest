import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Header from './components/Header';
import Setup from './components/Setup';
import LogConsole from './components/LogConsole';
import BatchAccordion from './components/BatchAccordion';
import { GMAIL_DISCOVERY_DOCS, GMAIL_SCOPES, BATCH_SIZE, DEFAULT_AI_MODEL } from './constants';
import { EnrichedEmail, EmailBatch } from './types';
import { analyzeBatchWithPuter } from './services/puterService';
import { moveEmailToLabel, bulkOrganize } from './services/gmailService';
import { Loader2, RefreshCw, Inbox, Layers, Play, Zap, Settings, Sparkles, FolderPlus, Database } from 'lucide-react';
import { logger } from './utils/logger';

export default function App() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<string>(DEFAULT_AI_MODEL);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);
  
  const [rawEmails, setRawEmails] = useState<EnrichedEmail[]>(() => {
    const saved = localStorage.getItem('ai_organizer_memory');
    return saved ? JSON.parse(saved) : [];
  });
  const [ignoredIds, setIgnoredIds] = useState<string[]>(JSON.parse(localStorage.getItem('ignored_emails') || '[]'));
  
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');

  // Sauvegarde automatique en mémoire locale
  useEffect(() => {
    localStorage.setItem('ai_organizer_memory', JSON.stringify(rawEmails));
  }, [rawEmails]);

  useEffect(() => {
    const storedId = localStorage.getItem('google_client_id');
    const storedModel = localStorage.getItem('ai_model');
    if (storedId) setClientId(storedId);
    if (storedModel) setAiModel(storedModel);
  }, []);

  const initGoogleServices = useCallback(() => {
    if (!clientId) return;
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
        client_id: clientId,
        scope: GMAIL_SCOPES,
        callback: async (resp: any) => {
          if (resp.error) return logger.error("OAuth : " + resp.error);
          const userInfo = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
          setUserEmail(userInfo.result.emailAddress);
          fetchAllEmails();
        },
      });
      (window as any).tokenClient = client;
      setIsClientReady(true);
    }
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    initGoogleServices();
    const gisScript = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (gisScript) gisScript.addEventListener('load', initGoogleServices);
    return () => gisScript?.removeEventListener('load', initGoogleServices);
  }, [clientId, initGoogleServices]);

  const fetchAllEmails = async () => {
    setLoading(true);
    setStatusText('Connexion Gmail...');
    try {
      let allMessages: any[] = [];
      let nextPageToken = null;
      const MAX_TOTAL = 200; // Capacité de récolte étendue

      logger.info("Début de la récolte massive d'emails...");
      
      do {
        const response: any = await window.gapi.client.gmail.users.messages.list({ 
          userId: 'me', 
          maxResults: 100,
          pageToken: nextPageToken,
          labelIds: ['INBOX'] 
        });
        const messages = response.result.messages || [];
        allMessages = [...allMessages, ...messages];
        nextPageToken = response.result.nextPageToken;
        setStatusText(`Récolte : ${allMessages.length} IDs trouvés...`);
      } while (nextPageToken && allMessages.length < MAX_TOTAL);

      const fetchedData: EnrichedEmail[] = [];
      const CHUNK_SIZE = 6; 

      for (let i = 0; i < allMessages.length; i += CHUNK_SIZE) {
        const chunk = allMessages.slice(i, i + CHUNK_SIZE);
        setStatusText(`Chargement contenu : ${Math.min(i + CHUNK_SIZE, allMessages.length)}/${allMessages.length}...`);
        
        const results = await Promise.all(chunk.map((msg: any) => 
          window.gapi.client.gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' })
        ));
        
        results.forEach((res: any) => {
          const headers = res.result.payload.headers;
          // On garde l'analyse si l'email existait déjà en mémoire
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
        await new Promise(r => setTimeout(r, 100));
      }

      setRawEmails(fetchedData);
      logger.success(`${fetchedData.length} emails synchronisés avec la mémoire locale.`);
    } catch (err) {
      logger.error("Erreur de récolte", err);
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const batches = useMemo(() => {
    const activeEmails = rawEmails.filter(e => !ignoredIds.includes(e.id));
    const result: EmailBatch[] = [];
    for (let i = 0; i < activeEmails.length; i += BATCH_SIZE) {
      result.push({
        id: Math.floor(i / BATCH_SIZE) + 1,
        emails: activeEmails.slice(i, i + BATCH_SIZE),
        status: 'pending'
      });
    }
    return result;
  }, [rawEmails, ignoredIds]);

  const processBatch = async (batchId: number) => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;

    setLoading(true);
    setStatusText(`Analyse IA - Groupe ${batchId}...`);
    
    try {
      const results = await analyzeBatchWithPuter(batch.emails, aiModel, false);
      setRawEmails(prev => prev.map(email => results[email.id] ? { ...email, analysis: results[email.id], processed: true } : email));
      logger.success(`Tranche ${batchId} analysée.`);
    } catch (err) { logger.error(`Batch ${batchId} fail`, err); }
    finally { setLoading(false); setStatusText(''); }
  };

  const runFullAutomation = async () => {
    logger.info("Démarrage de l'automatisation totale...");
    for (const batch of batches) {
      if (!batch.emails.every(e => e.processed)) {
        await processBatch(batch.id);
      }
    }
    await syncAllFolders();
  };

  const syncAllFolders = async () => {
    setLoading(true);
    setStatusText("Organisation massive des dossiers...");
    const count = await bulkOrganize(rawEmails);
    if (count > 0) {
      setRawEmails(prev => prev.filter(e => !e.processed));
      logger.success(`${count} emails archivés dans leurs nouveaux dossiers.`);
    } else {
      logger.warn("Aucun email analysé prêt pour le rangement.");
    }
    setLoading(false);
    setStatusText('');
  };

  const clearMemory = () => {
    if (confirm("Effacer la mémoire locale et réinitialiser ?")) {
      setRawEmails([]);
      localStorage.removeItem('ai_organizer_memory');
      logger.info("Mémoire locale vidée.");
    }
  };

  const handleAuthClick = () => {
    const client = (window as any).tokenClient;
    if (client) client.requestAccessToken({ prompt: 'select_account' });
  };

  if (!clientId) return <div className="bg-slate-900 min-h-screen"><Setup onSave={(id, mod) => { localStorage.setItem('google_client_id', id); localStorage.setItem('ai_model', mod); window.location.reload(); }} /><LogConsole /></div>;

  return (
    <div className="min-h-screen flex flex-col bg-slate-900">
      <Header userEmail={userEmail} onLogout={() => { localStorage.clear(); window.location.reload(); }} />
      
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 lg:p-12 space-y-10">
        {!userEmail ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="bg-slate-800 p-10 rounded-[40px] border border-slate-700 shadow-2xl max-w-lg w-full">
              <Inbox className="w-20 h-20 text-indigo-400 mx-auto mb-8" />
              <h2 className="text-4xl font-black text-white mb-4">Analyse Totale</h2>
              <p className="text-slate-400 mb-10 text-lg leading-relaxed">
                Connectez-vous pour traiter jusqu'à 200 emails. L'IA se souviendra de vos analyses même si vous fermez l'onglet.
              </p>
              <button 
                onClick={handleAuthClick}
                disabled={!isClientReady}
                className="w-full py-5 bg-white text-slate-900 font-black rounded-3xl flex items-center justify-center gap-3 hover:bg-slate-100 disabled:opacity-50 transition-all shadow-xl active:scale-95"
              >
                {!isClientReady ? <Loader2 className="w-5 h-5 animate-spin" /> : <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-7 h-7" alt="G" />}
                Démarrer la Synchronisation
              </button>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
            {/* Action Bar */}
            <div className="flex flex-wrap gap-4 items-center bg-slate-800/40 p-4 rounded-[32px] border border-slate-700/50 backdrop-blur-xl mb-12">
               <div className="flex items-center gap-3 px-4">
                  <div className="bg-indigo-500/20 p-2 rounded-xl text-indigo-400"><Database className="w-5 h-5" /></div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase">Mémoire IA</div>
                    <div className="text-sm font-black text-white">{rawEmails.filter(e => e.processed).length} Analysés</div>
                  </div>
               </div>
               <div className="h-10 w-px bg-slate-700 mx-2 hidden md:block" />
               <button onClick={runFullAutomation} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-2xl font-black text-sm flex items-center gap-3 shadow-lg shadow-indigo-600/20 active:scale-95 transition-all">
                  <Sparkles className="w-5 h-5" /> Analyser & Ranger tout
               </button>
               <button onClick={syncAllFolders} className="bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-indigo-500/20 px-6 py-3 rounded-2xl font-black text-sm flex items-center gap-3 active:scale-95 transition-all">
                  <FolderPlus className="w-5 h-5" /> Appliquer les Dossiers
               </button>
               <button onClick={fetchAllEmails} className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-2xl transition-all" title="Forcer la récolte">
                  <RefreshCw className="w-5 h-5" />
               </button>
               <button onClick={clearMemory} className="ml-auto text-xs font-bold text-red-500/50 hover:text-red-400 px-4 py-2">Réinitialiser</button>
            </div>

            {loading && (
              <div className="fixed inset-x-0 top-20 flex justify-center z-50 pointer-events-none">
                 <div className="bg-indigo-600 text-white px-8 py-4 rounded-full shadow-2xl flex items-center gap-4 animate-in slide-in-from-top-10 duration-300 pointer-events-auto">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="font-black text-sm tracking-widest uppercase">{statusText}</span>
                 </div>
              </div>
            )}

            {/* Collapsible Batches */}
            <div className="space-y-6">
              {batches.map((batch) => (
                <BatchAccordion 
                  key={batch.id}
                  batch={batch}
                  isLoading={loading}
                  onAnalyze={() => processBatch(batch.id)}
                  onIgnore={(id) => {
                    const newList = [...ignoredIds, id];
                    setIgnoredIds(newList);
                    localStorage.setItem('ignored_emails', JSON.stringify(newList));
                  }}
                  onAction={async (id, folder) => {
                    const success = await moveEmailToLabel(id, folder);
                    if (success) setRawEmails(prev => prev.filter(e => e.id !== id));
                  }}
                />
              ))}
            </div>
            
            {rawEmails.length === 0 && !loading && (
              <div className="text-center py-32 bg-slate-800/20 rounded-[40px] border border-dashed border-slate-700">
                <Inbox className="w-16 h-16 text-slate-700 mx-auto mb-6" />
                <p className="text-slate-500 font-bold">Aucun email en mémoire. Lancez une synchronisation.</p>
              </div>
            )}
          </div>
        )}
      </main>
      <LogConsole />
    </div>
  );
}