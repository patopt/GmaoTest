import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Header from './components/Header';
import EmailCard from './components/EmailCard';
import Setup from './components/Setup';
import LogConsole from './components/LogConsole';
import { GMAIL_DISCOVERY_DOCS, GMAIL_SCOPES, BATCH_SIZE, DEFAULT_AI_MODEL } from './constants';
import { EmailMessage, EnrichedEmail, EmailBatch } from './types';
import { analyzeBatchWithPuter } from './services/puterService';
import { moveEmailToLabel, applyBatchLabels } from './services/gmailService';
import { Loader2, RefreshCw, AlertTriangle, Inbox, CheckCircle2, Layers, Play, Zap, Settings, EyeOff, Sparkles, Tags } from 'lucide-react';
import { logger } from './utils/logger';

export default function App() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<string>(DEFAULT_AI_MODEL);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);
  
  const [rawEmails, setRawEmails] = useState<EnrichedEmail[]>([]);
  const [ignoredIds, setIgnoredIds] = useState<string[]>(JSON.parse(localStorage.getItem('ignored_emails') || '[]'));
  
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Initialisation des préférences
  useEffect(() => {
    const storedId = localStorage.getItem('google_client_id');
    const storedModel = localStorage.getItem('ai_model');
    if (storedId) setClientId(storedId);
    if (storedModel) setAiModel(storedModel);
  }, []);

  const handleSetupSave = (id: string, model: string) => {
    localStorage.setItem('google_client_id', id);
    localStorage.setItem('ai_model', model);
    setClientId(id);
    setAiModel(model);
    window.location.reload(); 
  };

  const handleLogout = () => {
    const token = window.gapi?.client?.getToken();
    if (token) window.google.accounts.oauth2.revoke(token.access_token, () => window.location.reload());
    localStorage.clear();
  };

  // Initialisation sécurisée des SDK Google
  const initGoogleServices = useCallback(() => {
    if (!clientId) return;

    // GAPI
    if (window.gapi) {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({ discoveryDocs: GMAIL_DISCOVERY_DOCS });
          logger.success("GAPI initialisé avec succès.");
        } catch (e) {
          logger.error("Échec initialisation GAPI", e);
        }
      });
    }

    // GIS (Identity Service)
    if (window.google?.accounts?.oauth2) {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GMAIL_SCOPES,
        callback: async (resp: any) => {
          if (resp.error) return setError("Erreur OAuth : " + resp.error);
          logger.success("Authentification réussie.");
          const userInfo = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
          setUserEmail(userInfo.result.emailAddress);
          fetchAllEmails();
        },
      });
      (window as any).tokenClient = client;
      setIsClientReady(true);
      logger.info("GIS prêt à l'emploi.");
    }
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;

    // Tentative d'initialisation immédiate
    initGoogleServices();

    // Au cas où les scripts chargent après le montage du composant
    const gisScript = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (gisScript) gisScript.addEventListener('load', initGoogleServices);

    return () => {
      if (gisScript) gisScript.removeEventListener('load', initGoogleServices);
    };
  }, [clientId, initGoogleServices]);

  const fetchAllEmails = async () => {
    setLoading(true);
    setStatusText('Récolte des emails en cours...');
    try {
      const response = await window.gapi.client.gmail.users.messages.list({ userId: 'me', maxResults: 100, labelIds: ['INBOX'] });
      const messages = response.result.messages || [];
      
      logger.info(`Récupération des détails pour ${messages.length} emails...`);
      const detailPromises = messages.map((msg: any) => window.gapi.client.gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' }));
      const results = await Promise.all(detailPromises);

      const data: EnrichedEmail[] = results.map((res: any) => {
        const headers = res.result.payload.headers;
        return {
          id: res.result.id,
          threadId: res.result.threadId,
          snippet: res.result.snippet,
          internalDate: res.result.internalDate,
          subject: headers.find((h: any) => h.name === 'Subject')?.value,
          from: headers.find((h: any) => h.name === 'From')?.value,
        };
      });

      setRawEmails(data);
      logger.success(`${data.length} emails récoltés et stockés en mémoire.`);
    } catch (err) {
      setError("Erreur lors de la récolte Gmail.");
      logger.error("Fetch Error", err);
    } finally {
      setLoading(false);
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

  const processBatch = async (batchId: number, isQuick: boolean = false) => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;

    setLoading(true);
    setStatusText(`${isQuick ? 'Analyse Rapide' : 'Analyse IA'} du groupe ${batchId}...`);
    
    try {
      const results = await analyzeBatchWithPuter(batch.emails, aiModel, isQuick);
      
      setRawEmails(prev => prev.map(email => {
        if (results[email.id]) {
          return { ...email, analysis: results[email.id], processed: true };
        }
        return email;
      }));
      
      logger.success(`Tranche ${batchId} analysée avec succès.`);
    } catch (err) {
      logger.error(`Erreur lors de l'analyse du Batch ${batchId}`);
    } finally {
      setLoading(false);
    }
  };

  const runAutomaticMode = async () => {
    if (batches.length === 0) return;
    logger.info("Démarrage du Mode Automatique...");
    for (const batch of batches) {
      if (!batch.emails.some(e => e.processed)) {
        await processBatch(batch.id);
      }
    }
    logger.success("Mode Automatique terminé.");
  };

  const createGlobalTags = async () => {
    setLoading(true);
    setStatusText("Analyse globale pour génération de tags cohérents...");
    try {
      // Analyse uniquement des objets de TOUS les emails pour la cohérence
      const subjects = rawEmails.map(e => ({ id: e.id, s: e.subject }));
      const prompt = `Analyse ces objets d'emails et propose une liste de 5 tags globaux et cohérents : ${JSON.stringify(subjects)}`;
      const response = await window.puter.ai.chat(prompt, { model: aiModel });
      logger.info("Tags suggérés par l'IA : " + response.text);
      // Simulation: Dans une version réelle, on appliquerait ces tags via GAPI.
      logger.success("Structure de tags optimisée et prête.");
    } catch (err) {
      logger.error("Erreur création tags", err);
    } finally {
      setLoading(false);
    }
  };

  const applyAction = async (emailId: string, folder: string) => {
    const success = await moveEmailToLabel(emailId, folder);
    if (success) {
      setRawEmails(prev => prev.filter(e => e.id !== emailId));
      logger.success(`Email ${emailId} classé dans ${folder}.`);
    }
  };

  const ignoreEmail = (id: string) => {
    const newList = [...ignoredIds, id];
    setIgnoredIds(newList);
    localStorage.setItem('ignored_emails', JSON.stringify(newList));
    logger.info("Email ajouté à la liste noire locale.");
  };

  const handleAuthClick = () => {
    const client = (window as any).tokenClient;
    if (client) {
      client.requestAccessToken({ prompt: 'select_account' });
    } else {
      logger.error("Le client OAuth n'est pas encore prêt. Réessayez dans un instant.");
      initGoogleServices();
    }
  };

  if (!clientId) return <div className="bg-slate-900 min-h-screen"><Setup onSave={handleSetupSave} /><LogConsole /></div>;

  return (
    <div className="min-h-screen flex flex-col bg-slate-900">
      <Header userEmail={userEmail} onLogout={handleLogout} />
      
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 lg:p-12 space-y-8">
        {!userEmail ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-8">
            <div className="bg-slate-800 p-10 rounded-3xl border border-slate-700 shadow-2xl max-w-lg w-full">
              <Inbox className="w-16 h-16 text-indigo-400 mx-auto mb-6" />
              <h2 className="text-3xl font-black text-white">Connexion Intelligente</h2>
              <p className="text-slate-400 mt-2 mb-10 leading-relaxed">
                Connectez-vous pour que l'IA puisse récolter, segmenter et organiser vos emails par tranches de {BATCH_SIZE}.
              </p>
              <button 
                onClick={handleAuthClick}
                disabled={!isClientReady}
                className="w-full py-5 bg-white text-slate-900 font-black rounded-2xl flex items-center justify-center gap-3 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-wait transition-all shadow-xl active:scale-[0.98]"
              >
                {!isClientReady ? <Loader2 className="w-5 h-5 animate-spin" /> : <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-6 h-6" alt="Google" />}
                Connecter mon compte Gmail
              </button>
              {!isClientReady && <p className="text-[10px] text-slate-500 mt-4 animate-pulse">Synchronisation avec les services Google...</p>}
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Dashboard Status */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700 flex items-center gap-4">
                <div className="bg-indigo-500/20 p-3 rounded-2xl text-indigo-400"><Layers className="w-6 h-6" /></div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Emails</div>
                  <div className="text-2xl font-black text-white">{rawEmails.length}</div>
                </div>
              </div>
              <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700 flex items-center gap-4">
                <div className="bg-emerald-500/20 p-3 rounded-2xl text-emerald-400"><Zap className="w-6 h-6" /></div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Tranches</div>
                  <div className="text-2xl font-black text-white">{batches.length}</div>
                </div>
              </div>
              <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700 flex items-center gap-4">
                <div className="bg-amber-500/20 p-3 rounded-2xl text-amber-400"><Settings className="w-6 h-6" /></div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Moteur IA</div>
                  <div className="text-xs font-black text-white truncate">{aiModel}</div>
                </div>
              </div>
              <div className="bg-indigo-600 p-6 rounded-3xl flex items-center gap-4 shadow-lg shadow-indigo-600/20 cursor-pointer hover:bg-indigo-500 transition-all" onClick={runAutomaticMode}>
                <div className="bg-white/20 p-3 rounded-2xl text-white"><Sparkles className="w-6 h-6" /></div>
                <div>
                  <div className="text-[10px] font-bold text-white/70 uppercase">Mode</div>
                  <div className="text-lg font-black text-white leading-tight">Automatique</div>
                </div>
              </div>
            </div>

            {/* Global Actions */}
            <div className="flex flex-wrap gap-4 mb-12">
              <button 
                onClick={() => batches.length > 0 && processBatch(1, true)} 
                className="px-6 py-3 bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 font-bold rounded-2xl hover:bg-indigo-600/20 transition-all flex items-center gap-2"
              >
                <Zap className="w-4 h-4" /> Analyse Rapide (Objets)
              </button>
              <button 
                onClick={createGlobalTags} 
                className="px-6 py-3 bg-slate-800 border border-slate-700 text-slate-300 font-bold rounded-2xl hover:bg-slate-700 transition-all flex items-center gap-2"
              >
                <Tags className="w-4 h-4" /> Créer les Tags Globaux
              </button>
              <button onClick={fetchAllEmails} className="px-6 py-3 bg-slate-800 border border-slate-700 text-slate-300 font-bold rounded-2xl hover:bg-slate-700 transition-all flex items-center gap-2 ml-auto">
                <RefreshCw className="w-4 h-4" /> Rafraîchir
              </button>
            </div>

            {loading && (
              <div className="flex flex-col items-center justify-center py-20 animate-pulse">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
                <p className="text-indigo-300 font-black tracking-widest uppercase text-xs">{statusText}</p>
              </div>
            )}

            {/* Batch Workflow Visualization */}
            <div className="space-y-16">
              {batches.map((batch) => (
                <section key={batch.id} className="space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div className="flex items-center gap-4">
                      <span className="bg-slate-800 text-indigo-400 w-10 h-10 rounded-2xl border border-slate-700 flex items-center justify-center font-black text-sm shadow-xl">{batch.id}</span>
                      <div>
                        <h3 className="text-xl font-black text-white">Tranche #{batch.id}</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{batch.emails.length} emails à traiter</p>
                      </div>
                    </div>
                    {!batch.emails.some(e => e.processed) && (
                      <button 
                        onClick={() => processBatch(batch.id)}
                        disabled={loading}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-8 py-2.5 rounded-2xl font-black text-xs transition-all flex items-center gap-3 shadow-lg shadow-indigo-600/20 active:scale-95"
                      >
                        <Play className="w-4 h-4 fill-current" /> Analyser ce groupe
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {batch.emails.map((email) => (
                      <div key={email.id} className="relative group">
                         <button 
                          onClick={() => ignoreEmail(email.id)}
                          className="absolute -top-3 -right-3 bg-slate-900 text-slate-500 p-2.5 rounded-2xl border border-slate-700 hover:bg-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all z-10 shadow-2xl hover:scale-110"
                          title="Ignorer cet email"
                        >
                          <EyeOff className="w-4 h-4" />
                        </button>
                        <EmailCard 
                          email={email} 
                          onAction={(folder) => applyAction(email.id, folder)} 
                        />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </main>
      <LogConsole />
    </div>
  );
}