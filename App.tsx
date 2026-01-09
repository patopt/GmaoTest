import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import EmailCard from './components/EmailCard';
import Setup from './components/Setup';
import LogConsole from './components/LogConsole';
import { GMAIL_DISCOVERY_DOCS, GMAIL_SCOPES } from './constants';
import { EmailMessage, EnrichedEmail } from './types';
import { analyzeEmailsWithPuter } from './services/puterService';
import { Loader2, RefreshCw, AlertTriangle, Inbox, CheckCircle2, ExternalLink } from 'lucide-react';
import { logger } from './utils/logger';

export default function App() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [isGapiLoaded, setIsGapiLoaded] = useState(false);
  const [isGisLoaded, setIsGisLoaded] = useState(false);
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  
  const [emails, setEmails] = useState<EnrichedEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<{ message: string; link?: string } | null>(null);

  useEffect(() => {
    const storedId = localStorage.getItem('google_client_id');
    if (storedId) {
      setClientId(storedId);
      logger.info("Client ID récupéré du cache.");
    }
  }, []);

  const handleClientIdSave = (id: string) => {
    localStorage.setItem('google_client_id', id);
    setClientId(id);
    window.location.reload(); 
  };

  const handleLogout = () => {
    const token = window.gapi.client.getToken();
    if (token !== null) {
      window.google.accounts.oauth2.revoke(token.access_token, () => {
        window.gapi.client.setToken('');
        setUserEmail(null);
        setEmails([]);
        localStorage.removeItem('google_client_id');
        setClientId(null);
      });
    }
  };

  useEffect(() => {
    if (!clientId) return;

    const loadScripts = async () => {
      if (!window.gapi || !window.google) return;

      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({
            discoveryDocs: GMAIL_DISCOVERY_DOCS,
          });
          setIsGapiLoaded(true);
        } catch (e) {
          logger.error("GAPI Init Fail", e);
          setError({ message: "Erreur d'initialisation Google SDK." });
        }
      });

      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GMAIL_SCOPES,
          callback: async (resp: any) => {
            if (resp.error) {
              setError({ message: "Erreur d'auth : " + resp.error });
              return;
            }
            try {
              const userInfo = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
              setUserEmail(userInfo.result.emailAddress);
              fetchEmails();
            } catch (err: any) {
              logger.error("Erreur Profil Gmail", err);
              // Détection du service désactivé (Erreur 403 SERVICE_DISABLED)
              if (err.result?.error?.status === "PERMISSION_DENIED" || err.result?.error?.message?.includes("disabled")) {
                setError({ 
                  message: "La Gmail API n'est pas activée sur votre projet Google Cloud.",
                  link: `https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=${clientId.split('-')[0]}`
                });
              } else {
                setError({ message: "Échec de lecture Gmail. Vérifiez vos permissions." });
              }
            }
          },
        });
        setTokenClient(client);
        setIsGisLoaded(true);
      } catch (e) {
        logger.error("GIS Init Fail", e);
      }
    };

    const timer = setTimeout(loadScripts, 1000);
    return () => clearTimeout(timer);
  }, [clientId]);

  const handleAuthClick = () => {
    if (tokenClient) tokenClient.requestAccessToken({ prompt: 'select_account' });
  };

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setStatusText('Analyse en cours...');
    setError(null);

    try {
      const response = await window.gapi.client.gmail.users.messages.list({
        userId: 'me',
        maxResults: 15,
        labelIds: ['INBOX'],
      });

      const messages = response.result.messages;
      if (!messages || messages.length === 0) {
        setLoading(false);
        return;
      }

      const detailPromises = messages.map((msg: any) => 
        window.gapi.client.gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' })
      );

      const results = await Promise.all(detailPromises);
      const detailedEmails: EmailMessage[] = results.map((res: any) => {
        const payload = res.result.payload;
        return {
          id: res.result.id,
          threadId: res.result.threadId,
          snippet: res.result.snippet,
          internalDate: res.result.internalDate,
          subject: payload.headers.find((h: any) => h.name === 'Subject')?.value,
          from: payload.headers.find((h: any) => h.name === 'From')?.value,
          date: payload.headers.find((h: any) => h.name === 'Date')?.value,
        };
      });

      const analysisResults = await analyzeEmailsWithPuter(detailedEmails);

      setEmails(detailedEmails.map(email => ({
        ...email,
        analysis: analysisResults[email.id]
      })));
    } catch (err: any) {
      logger.error("Erreur Fetch/IA", err);
      setError({ message: "Erreur lors de l'analyse des emails." });
    } finally {
      setLoading(false);
    }
  }, []);

  if (!clientId) {
    return (
      <div className="min-h-screen bg-slate-900">
        <Header userEmail={null} onLogout={() => {}} />
        <Setup onSave={handleClientIdSave} />
        <LogConsole />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-slate-100">
      <Header userEmail={userEmail} onLogout={handleLogout} />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 lg:p-12 mb-20">
        {!userEmail ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8">
            <div className="bg-slate-800/80 p-10 rounded-3xl border border-slate-700 shadow-2xl backdrop-blur-xl max-w-lg w-full">
              <div className="mb-6 flex justify-center">
                <div className="p-4 bg-indigo-500/10 rounded-full border border-indigo-500/20">
                  <Inbox className="w-12 h-12 text-indigo-400" />
                </div>
              </div>
              <h2 className="text-3xl font-extrabold text-white mb-3">Boîte de réception IA</h2>
              <p className="text-slate-400 mb-10 leading-relaxed">Connectez votre Gmail pour que Gemini organise vos messages automatiquement.</p>
              
              {!isGapiLoaded || !isGisLoaded ? (
                <div className="flex items-center justify-center gap-3 text-indigo-400 font-medium">
                  <Loader2 className="animate-spin w-5 h-5" />
                  <span>Synchronisation...</span>
                </div>
              ) : (
                <button
                  onClick={handleAuthClick}
                  className="w-full bg-white text-slate-900 hover:bg-slate-100 font-bold py-4 px-6 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 active:scale-95"
                >
                  <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-6 h-6" alt="G" />
                  Se connecter à Gmail
                </button>
              )}
            </div>

            {error && (
              <div className="max-w-lg w-full bg-red-950/40 border border-red-500/30 text-red-300 p-6 rounded-2xl flex flex-col gap-4 text-left">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-red-500" />
                  <p className="text-sm font-semibold">{error.message}</p>
                </div>
                {error.link && (
                  <div className="space-y-3">
                    <p className="text-xs text-red-200 opacity-80">L'accès à vos emails est bloqué car la Gmail API est éteinte dans votre projet Google Cloud.</p>
                    <a 
                      href={error.link} 
                      target="_blank" 
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-3 px-5 rounded-xl transition-all shadow-lg"
                    >
                      Activer la Gmail API maintenant <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-800/40 p-6 rounded-3xl border border-slate-700">
                <div>
                    <h2 className="text-2xl font-black text-white tracking-tight">Intelligence Inbox</h2>
                    <p className="text-sm text-slate-400 mt-1">{emails.length} emails analysés avec succès.</p>
                </div>
                <button
                    onClick={fetchEmails}
                    disabled={loading}
                    className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
                >
                    {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <RefreshCw className="w-5 h-5" />}
                    {loading ? 'Analyse...' : 'Relancer l\'analyse'}
                </button>
            </div>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-32 space-y-4">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                <p className="text-xl font-medium text-indigo-300 animate-pulse">{statusText}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {emails.map((email) => <EmailCard key={email.id} email={email} />)}
              </div>
            )}
          </div>
        )}
      </main>
      <LogConsole />
    </div>
  );
}