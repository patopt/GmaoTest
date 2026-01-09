import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import EmailCard from './components/EmailCard';
import Setup from './components/Setup';
import LogConsole from './components/LogConsole';
import { GMAIL_DISCOVERY_DOCS, GMAIL_SCOPES } from './constants';
import { EmailMessage, EnrichedEmail } from './types';
import { analyzeEmailsWithPuter } from './services/puterService';
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
    logger.info("Application initialisée.");
    const storedId = localStorage.getItem('google_client_id');
    if (storedId) {
        setClientId(storedId);
        logger.info("Client ID récupéré du stockage local.");
    }
  }, []);

  const handleClientIdSave = (id: string) => {
    logger.info("Nouveau Client ID sauvegardé.");
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
        logger.success("Utilisateur déconnecté.");
      });
    }
  };

  useEffect(() => {
    if (!clientId) return;

    const gapiScript = document.querySelector('script[src="https://apis.google.com/js/api.js"]');
    const gisScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');

    if (gapiScript) {
      gapiScript.addEventListener('load', () => {
        window.gapi.load('client', async () => {
          try {
            await window.gapi.client.init({
              apiKey: undefined,
              discoveryDocs: GMAIL_DISCOVERY_DOCS,
            });
            setIsGapiLoaded(true);
            logger.info("GAPI Client initialisé avec succès.");
          } catch (e) {
            logger.error("Echec init GAPI", e);
            setError("Erreur d'initialisation Google API.");
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
                  logger.error("Erreur OAuth callback", resp);
                  if (resp.error.includes('origin_mismatch')) {
                      setError("ERREUR ORIGINE: L'URL de l'app n'est pas autorisée dans Google Cloud Console.");
                  } else {
                      setError("Erreur d'authentification: " + resp.error);
                  }
                  return;
                }
                
                logger.success("Token d'accès obtenu.", { scope: resp.scope });
                
                try {
                  const userInfo = await window.gapi.client.gmail.users.getProfile({
                    userId: 'me',
                  });
                  const email = userInfo.result.emailAddress;
                  logger.info(`Profil utilisateur récupéré: ${email}`);
                  setUserEmail(email);
                  fetchEmails();
                } catch (err) {
                  logger.error("Erreur récupération profil", err);
                  setError("Impossible de récupérer le profil utilisateur.");
                }
              },
            });
            setTokenClient(client);
            setIsGisLoaded(true);
            logger.info("GIS Token Client prêt.");
        } catch (e) {
            logger.error("Erreur initTokenClient. Vérifiez le Client ID.", e);
            setError("Client ID invalide ou configuration OAuth incorrecte.");
        }
      });
    }
  }, [clientId]);

  const handleAuthClick = () => {
    if (tokenClient) {
      logger.info("Demande d'autorisation utilisateur...");
      // Forcer le prompt pour debug si besoin, sinon laisser gérer par le cookie
      tokenClient.requestAccessToken({ prompt: '' });
    } else {
        logger.error("Token Client non prêt lors du clic.");
    }
  };

  // Optimisation: Utilisation de Promise.all pour paralléliser les requêtes
  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setStatusText('Récupération des emails...');
    setError(null);
    logger.info("Début de la séquence de récupération des emails.");

    try {
      // 1. Liste des IDs
      const startList = Date.now();
      const response = await window.gapi.client.gmail.users.messages.list({
        userId: 'me',
        maxResults: 15, // Augmenté légèrement car on est optimisé
        labelIds: ['INBOX'],
      });
      logger.info(`Liste récupérée en ${Date.now() - startList}ms.`);

      const messages = response.result.messages;
      if (!messages || messages.length === 0) {
        setStatusText('Aucun email trouvé.');
        logger.warn("Aucun message trouvé dans la boîte de réception.");
        setLoading(false);
        return;
      }

      setStatusText(`Téléchargement rapide de ${messages.length} emails...`);
      logger.info(`Démarrage du téléchargement parallèle de ${messages.length} messages.`);

      // 2. Récupération PARALLÈLE des détails (Optimisation majeure)
      const startDetails = Date.now();
      
      const detailPromises = messages.map((msg: any) => 
        window.gapi.client.gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full', 
        }).then((res: any) => ({ res, msg })) // On garde le contexte
      );

      const results = await Promise.all(detailPromises);
      logger.info(`Tous les détails téléchargés en ${Date.now() - startDetails}ms !`);

      const detailedEmails: EmailMessage[] = results.map(({ res, msg }) => {
        const payload = res.result.payload;
        const headers = payload.headers;
        const subject = headers.find((h: any) => h.name === 'Subject')?.value;
        const from = headers.find((h: any) => h.name === 'From')?.value;
        const date = headers.find((h: any) => h.name === 'Date')?.value;

        return {
          id: msg.id,
          threadId: msg.threadId,
          snippet: res.result.snippet,
          internalDate: res.result.internalDate,
          subject,
          from,
          date,
        };
      });

      setStatusText("Analyse IA en cours...");
      
      // 3. Analyse IA
      const analysisResults = await analyzeEmailsWithPuter(detailedEmails);

      // 4. Fusion
      const finalData: EnrichedEmail[] = detailedEmails.map(email => ({
        ...email,
        analysis: analysisResults[email.id]
      }));

      setEmails(finalData);
      setStatusText('');
      logger.success("Cycle complet terminé avec succès.");

    } catch (err: any) {
      logger.error("Erreur globale fetchEmails", err);
      setError(err.message || "Une erreur est survenue lors du traitement.");
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
    <div className="min-h-screen flex flex-col bg-slate-900">
      <Header userEmail={userEmail} onLogout={handleLogout} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 mb-20">
        {!userEmail ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
            <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-xl max-w-lg w-full">
              <h2 className="text-2xl font-bold text-white mb-4">Bienvenue</h2>
              <p className="text-slate-400 mb-8">
                Connectez-vous à votre compte Gmail pour permettre à Gemini 3 Pro d'analyser et d'organiser vos emails.
              </p>
              
              {!isGapiLoaded || !isGisLoaded ? (
                 <div className="flex justify-center items-center gap-2 text-indigo-400">
                    <Loader2 className="animate-spin w-5 h-5" />
                    <span>Chargement des services Google...</span>
                 </div>
              ) : (
                <button
                  onClick={handleAuthClick}
                  className="w-full bg-white text-slate-900 hover:bg-slate-100 font-bold py-3 px-6 rounded-lg shadow-lg transition-colors flex items-center justify-center gap-3"
                >
                  <img
                    src="https://www.svgrepo.com/show/475656/google-color.svg"
                    className="w-6 h-6"
                    alt="Google Logo"
                  />
                  Se connecter avec Google
                </button>
              )}
            </div>
            {error && (
                <div className="max-w-lg w-full bg-red-900/20 border border-red-500/50 text-red-300 p-4 rounded-lg text-sm text-left">
                    <p className="font-bold mb-1">Erreur de connexion :</p>
                    <p>{error}</p>
                    <p className="mt-2 text-xs opacity-70">Ouvrez la console de logs (bug icon) pour voir les détails techniques.</p>
                </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-slate-800/50 p-4 rounded-xl border border-slate-700 backdrop-blur-sm">
                <div>
                    <h2 className="text-xl font-bold text-white">Votre Boîte de Réception Intelligente</h2>
                    <p className="text-sm text-slate-400">Dernière analyse: {emails.length > 0 ? "À l'instant" : "Aucune"}</p>
                </div>
                <button
                    onClick={fetchEmails}
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all"
                >
                    {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                    {loading ? 'Traitement...' : 'Analyser nouveaux emails'}
                </button>
            </div>

            {loading && (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                <p className="text-lg text-indigo-300 animate-pulse">{statusText}</p>
                <p className="text-sm text-slate-500 max-w-md text-center">
                    Utilisation du modèle Gemini 3 Pro gratuit via Puter.js...
                </p>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
                <div>
                  <h3 className="text-red-400 font-bold">Erreur</h3>
                  <p className="text-red-200/80 text-sm">{error}</p>
                </div>
              </div>
            )}

            {!loading && emails.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {emails.map((email) => (
                        <EmailCard key={email.id} email={email} />
                    ))}
                </div>
            )}
            
            {!loading && emails.length === 0 && !error && (
                <div className="text-center py-20 text-slate-500">
                    <CheckCircle2 className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p>Appuyez sur "Analyser" pour commencer.</p>
                </div>
            )}
          </div>
        )}
      </main>
      
      {/* Live Log Console */}
      <LogConsole />
    </div>
  );
}
