import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Header from './components/Header';
import EmailCard from './components/EmailCard';
import Setup from './components/Setup';
import LogConsole from './components/LogConsole';
import { GMAIL_DISCOVERY_DOCS, GMAIL_SCOPES, BATCH_SIZE, DEFAULT_AI_MODEL } from './constants';
import { EmailMessage, EnrichedEmail, EmailBatch } from './types';
import { analyzeBatchWithPuter } from './services/puterService';
import { moveEmailToLabel } from './services/gmailService';
import { Loader2, RefreshCw, AlertTriangle, Inbox, CheckCircle2, Layers, Play, Zap, Settings, EyeOff } from 'lucide-react';
import { logger } from './utils/logger';

export default function App() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<string>(DEFAULT_AI_MODEL);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  
  const [rawEmails, setRawEmails] = useState<EnrichedEmail[]>([]);
  const [ignoredIds, setIgnoredIds] = useState<string[]>(JSON.parse(localStorage.getItem('ignored_emails') || '[]'));
  
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);

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
    const token = window.gapi.client.getToken();
    if (token) window.google.accounts.oauth2.revoke(token.access_token, () => window.location.reload());
    localStorage.clear();
  };

  useEffect(() => {
    if (!clientId) return;
    const gapiScript = document.querySelector('script[src="https://apis.google.com/js/api.js"]');
    const gisScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');

    if (gapiScript && gisScript) {
      gapiScript.addEventListener('load', () => {
        window.gapi.load('client', async () => {
          await window.gapi.client.init({ discoveryDocs: GMAIL_DISCOVERY_DOCS });
          logger.success("GAPI Prêt.");
        });
      });

      gisScript.addEventListener('load', () => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GMAIL_SCOPES,
          callback: async (resp: any) => {
            if (resp.error) return setError("OAuth Error: " + resp.error);
            const userInfo = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
            setUserEmail(userInfo.result.emailAddress);
            fetchAllEmails();
          },
        });
        (window as any).tokenClient = client;
      });
    }
  }, [clientId]);

  const fetchAllEmails = async () => {
    setLoading(true);
    setStatusText('Récupération de vos emails...');
    try {
      const response = await window.gapi.client.gmail.users.messages.list({ userId: 'me', maxResults: 60, labelIds: ['INBOX'] });
      const messages = response.result.messages || [];
      
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
      logger.success(`${data.length} emails chargés en mémoire.`);
    } catch (err) {
      setError("Erreur Gmail Fetch.");
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
    setStatusText(`Analyse du groupe ${batchId} avec ${aiModel}...`);
    
    try {
      const results = await analyzeBatchWithPuter(batch.emails, aiModel, isQuick);
      
      setRawEmails(prev => prev.map(email => {
        if (results[email.id]) {
          return { ...email, analysis: results[email.id], processed: true };
        }
        return email;
      }));
      
      logger.success(`Groupe ${batchId} traité.`);
    } catch (err) {
      logger.error(`Erreur Batch ${batchId}`);
    } finally {
      setLoading(false);
    }
  };

  const applyAction = async (emailId: string, folder: string) => {
    logger.info(`Action: Déplacement vers ${folder}...`);
    const success = await moveEmailToLabel(emailId, folder);
    if (success) {
      setRawEmails(prev => prev.filter(e => e.id !== emailId));
      logger.success("Email déplacé et archivé.");
    }
  };

  const ignoreEmail = (id: string) => {
    const newList = [...ignoredIds, id];
    setIgnoredIds(newList);
    localStorage.setItem('ignored_emails', JSON.stringify(newList));
  };

  if (!clientId) return <div className="bg-slate-900 min-h-screen"><Setup onSave={handleSetupSave} /><LogConsole /></div>;

  return (
    <div className="min-h-screen flex flex-col bg-slate-900">
      <Header userEmail={userEmail} onLogout={handleLogout} />
      
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 lg:p-12 space-y-8">
        {!userEmail ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
            <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-2xl max-w-md w-full">
              <Inbox className="w-16 h-16 text-indigo-400 mx-auto mb-6" />
              <h2 className="text-2xl font-black text-white">Connexion Gmail</h2>
              <p className="text-slate-400 mt-2 mb-8">Nous allons analyser vos emails par tranches de {BATCH_SIZE} pour une précision maximale.</p>
              <button 
                onClick={() => (window as any).tokenClient.requestAccessToken({ prompt: 'select_account' })}
                className="w-full py-4 bg-white text-slate-900 font-black rounded-2xl flex items-center justify-center gap-3 hover:bg-slate-100 transition-all"
              >
                Connecter mon compte
              </button>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Dashboard Status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700 flex items-center gap-4">
                <div className="bg-indigo-500/20 p-3 rounded-2xl text-indigo-400"><Layers className="w-6 h-6" /></div>
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase">Emails en attente</div>
                  <div className="text-2xl font-black text-white">{rawEmails.filter(e => !e.processed).length}</div>
                </div>
              </div>
              <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700 flex items-center gap-4">
                <div className="bg-emerald-500/20 p-3 rounded-2xl text-emerald-400"><Zap className="w-6 h-6" /></div>
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase">Tranches (Batches)</div>
                  <div className="text-2xl font-black text-white">{batches.length}</div>
                </div>
              </div>
              <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700 flex items-center gap-4">
                <div className="bg-amber-500/20 p-3 rounded-2xl text-amber-400"><Settings className="w-6 h-6" /></div>
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase">Modèle Actif</div>
                  <div className="text-sm font-black text-white truncate">{aiModel}</div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-4 mb-10">
              <button onClick={() => processBatch(1, true)} className="px-6 py-3 bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 font-bold rounded-2xl hover:bg-indigo-600/20 transition-all flex items-center gap-2">
                <Zap className="w-4 h-4" /> Analyse Rapide (Objets)
              </button>
              <button onClick={fetchAllEmails} className="px-6 py-3 bg-slate-800 border border-slate-700 text-slate-300 font-bold rounded-2xl hover:bg-slate-700 transition-all flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> Actualiser la source
              </button>
            </div>

            {loading && (
              <div className="flex flex-col items-center justify-center py-20 animate-pulse">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
                <p className="text-indigo-300 font-black tracking-widest uppercase text-xs">{statusText}</p>
              </div>
            )}

            {/* Batch Workflow */}
            <div className="space-y-12">
              {batches.map((batch) => (
                <section key={batch.id} className="space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div className="flex items-center gap-4">
                      <span className="bg-indigo-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-lg shadow-indigo-600/30">{batch.id}</span>
                      <h3 className="text-xl font-black text-white">Tranche de {batch.emails.length} emails</h3>
                    </div>
                    {!batch.emails.some(e => e.processed) && (
                      <button 
                        onClick={() => processBatch(batch.id)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20"
                      >
                        <Play className="w-4 h-4 fill-current" /> Lancer l'analyse IA
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {batch.emails.map((email) => (
                      <div key={email.id} className="relative group">
                         <button 
                          onClick={() => ignoreEmail(email.id)}
                          className="absolute -top-2 -right-2 bg-slate-800 text-slate-500 p-1.5 rounded-full border border-slate-700 hover:bg-red-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all z-10 shadow-xl"
                          title="Ignorer cet email"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
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