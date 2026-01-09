import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import EmailCard from './components/EmailCard';
import Setup from './components/Setup';
import LogConsole from './components/LogConsole';
import { GMAIL_DISCOVERY_DOCS, GMAIL_SCOPES } from './constants';
import { EmailMessage, EnrichedEmail } from './types';
import { analyzeEmailsWithPuter } from './services/puterService';
import { Loader2, RefreshCw, AlertTriangle, Inbox, CheckCircle2 } from 'lucide-react';
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedId = localStorage.getItem('google_client_id');
    if (storedId) {
      setClientId(storedId);
      logger.info("Client ID récupéré depuis le cache navigateur.");
    }
  }, []);

  const handleClientIdSave = (id: string) => {
    localStorage.setItem('google_client_id', id);
    setClientId(id);
    logger.success("Configuration mise à jour. Redémarrage des services...");
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
        logger.warn("Session fermée par l'utilisateur.");
      });
    }
  };

  useEffect(() => {
    if (!clientId) return;

    logger.info("Chargement des SDKs Google (GAPI + GIS)...");

    const gapiScript = document.querySelector('script[src="https://apis.google.com/js/api.js"]');
    const gisScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');

    if (gapiScript) {
      gapiScript.addEventListener('load', () => {
        window.gapi.load('client', async () => {
          try {
            await window.gapi.client.init({
              discoveryDocs: GMAIL_DISCOVERY_DOCS,
            });
            setIsGapiLoaded(true);
            logger.success("GAPI Client Gmail initialisé.");
          } catch (e) {
            logger.error("Erreur fatale GAPI Init", e);
            setError("Impossible de charger les APIs Gmail.");
          }
        });
      });
    }

    if (gisScript) {
      gisScript.addEventListener('load', () => {
        try {
          const client = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: GMAIL_SCOPES,
            callback: async (resp: any) => {
              if (resp.error) {
                logger.error("Échec de l'authentification OAuth", resp);
                if (resp.error === 'idpiframe_initialization_failed' || resp.error === 'origin_mismatch') {
                  setError("Origine non autorisée. Vérifiez l'URL dans la Cloud Console.");
                } else {
                  setError("Erreur Google : " + resp.error);
                }
                return;
              }
              
              logger.success("Authentification réussie. Accès Gmail autorisé.");
              
              try {
                const userInfo = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
                setUserEmail(userInfo.result.emailAddress);
                logger.info("Utilisateur identifié : " + userInfo.result.emailAddress);
                fetchEmails();
              } catch (err) {
                logger.error("Erreur de récupération du profil", err);
              }
            },
          });
          setTokenClient(client);
          setIsGisLoaded(true);
          logger.info("GIS (Google Identity) prêt.");
        } catch (e) {
          logger.error("Erreur initTokenClient. Client ID probablement incorrect.", e);
        }
      });
    }
  }, [clientId]);

  const handleAuthClick = () => {
    if (tokenClient) {
      logger.info("Déclenchement du sélecteur de compte Google...");
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    }
  };

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setStatusText('Recherche des emails...');
    setError(null);
    logger.info("Démarrage du cycle d'analyse intelligente...");

    try {
      // 1. Liste des IDs
      const response = await window.gapi.client.gmail.users.messages.list({
        userId: 'me',
        maxResults: 15,
        labelIds: ['INBOX'],
      });

      const messages = response.result.messages;
      if (!messages || messages.length === 0) {
        setStatusText('Boîte de réception vide.');
        logger.warn("Aucun email trouvé dans la boîte de réception.");
        setLoading(false);
        return;
      }

      logger.info(`${messages.length} IDs récupérés. Lancement du téléchargement parallèle...`);
      setStatusText(`Téléchargement de ${messages.length} messages...`);

      // 2. Récupération PARALLÈLE (Optimisé)
      const startFetch = Date.now();
      const detailPromises = messages.map((msg: any) => 
        window.gapi.client.gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        })
      );

      const results = await Promise.all(detailPromises);
      logger.success(`${messages.length} emails téléchargés en ${Date.now() - startFetch}ms.`);

      const detailedEmails: EmailMessage[] = results.map((res: any) => {
        const payload = res.result.payload;
        const headers = payload.headers;
        return {
          id: res.result.id,
          threadId: res.result.threadId,
          snippet: res.result.snippet,
          internalDate: res.result.internalDate,
          subject: headers.find((h: any) => h.name === 'Subject')?.value,
          from: headers.find((h: any) => h.name === 'From')?.value,
          date: headers.find((h: any) => h.name === 'Date')?.value,
        };
      });

      // 3. Analyse IA
      setStatusText("Gemini 3 Pro analyse vos données...");
      logger.info("Envoi des données à l'IA...");
      const analysisResults = await analyzeEmailsWithPuter(detailedEmails);

      // 4. Fusion
      const finalData: EnrichedEmail[] = detailedEmails.map(email => ({
        ...email,
        analysis: analysisResults[email.id]
      }));

      setEmails(finalData);
      setStatusText('');
      logger.success("Analyse terminée. Interface mise à jour.");

    } catch (err: any) {
      logger.error("Erreur lors de la récupération/analyse", err);
      setError("Le service est temporairement indisponible. Vérifiez les logs.");
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
    <div className="min-h-screen flex flex-col bg-slate-900 text-slate-100 selection:bg-indigo-500/30">
      <Header userEmail={userEmail} onLogout={handleLogout} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 lg:p-12 mb-20">
        {!userEmail ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 animate-in fade-in zoom-in duration-500">
            <div className="bg-slate-800/80 p-10 rounded-3xl border border-slate-700 shadow-2xl backdrop-blur-xl max-w-lg w-full">
              <div className="mb-6 flex justify-center">
                <div className="p-4 bg-indigo-500/10 rounded-full border border-indigo-500/20">
                  <Inbox className="w-12 h-12 text-indigo-400" />
                </div>
              </div>
              <h2 className="text-3xl font-extrabold text-white mb-3">Accès Gmail</h2>
              <p className="text-slate-400 mb-10 leading-relaxed">
                Autorisez l'application à lire vos emails pour bénéficier de l'organisation intelligente par Intelligence Artificielle.
              </p>
              
              {!isGapiLoaded || !isGisLoaded ? (
                <div className="flex items-center justify-center gap-3 text-indigo-400 font-medium">
                  <Loader2 className="animate-spin w-5 h-5" />
                  <span>Synchronisation Cloud...</span>
                </div>
              ) : (
                <button
                  onClick={handleAuthClick}
                  className="w-full bg-white text-slate-900 hover:bg-slate-100 font-bold py-4 px-6 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 active:scale-[0.97]"
                >
                  <img
                    src="https://www.svgrepo.com/show/475656/google-color.svg"
                    className="w-6 h-6"
                    alt="Google"
                  />
                  Continuer avec Google
                </button>
              )}
            </div>
            
            {error && (
              <div className="max-w-lg w-full bg-red-950/40 border border-red-500/30 text-red-300 p-5 rounded-2xl flex gap-3 text-left">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div className="text-sm">
                  <p className="font-bold">Problème d'accès :</p>
                  <p className="opacity-80">{error}</p>
                  <p className="mt-3 text-xs italic opacity-60">Consultez les logs (bouton bug) pour le détail technique.</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-800/40 p-6 rounded-3xl border border-slate-700 backdrop-blur-md">
                <div>
                    <h2 className="text-2xl font-black text-white tracking-tight">Intelligence Inbox</h2>
                    <p className="text-sm text-slate-400 mt-1">
                      {emails.length > 0 ? `${emails.length} emails analysés avec Gemini` : "Prêt pour l'analyse"}
                    </p>
                </div>
                <button
                    onClick={fetchEmails}
                    disabled={loading}
                    className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white px-8 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                >
                    {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <RefreshCw className="w-5 h-5" />}
                    {loading ? 'Analyse...' : 'Relancer l\'analyse'}
                </button>
            </div>

            {loading && (
              <div className="flex flex-col items-center justify-center py-24 space-y-6">
                <div className="relative">
                  <Loader2 className="w-16 h-16 text-indigo-500 animate-spin" />
                  <div className="absolute inset-0 blur-2xl bg-indigo-500/20 animate-pulse"></div>
                </div>
                <p className="text-xl font-medium text-indigo-300 animate-pulse">{statusText}</p>
                <div className="bg-slate-800/50 px-4 py-2 rounded-full border border-slate-700">
                   <p className="text-xs text-slate-500 font-mono">Parallel Pipeline Enabled</p>
                </div>
              </div>
            )}

            {!loading && emails.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {emails.map((email) => (
                  <EmailCard key={email.id} email={email} />
                ))}
              </div>
            )}
            
            {!loading && emails.length === 0 && !error && (
              <div className="text-center py-32 text-slate-600">
                <CheckCircle2 className="w-20 h-20 mx-auto mb-6 opacity-10" />
                <p className="text-lg font-medium">Appuyez sur "Relancer l'analyse" pour charger votre boîte.</p>
              </div>
            )}
          </div>
        )}
      </main>
      
      <LogConsole />
    </div>
  );
}