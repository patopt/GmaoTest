
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Header from './components/Header';
import Setup from './components/Setup';
import LogConsole from './components/LogConsole';
import BatchAccordion from './components/BatchAccordion';
import EmailCard from './components/EmailCard';
import { GMAIL_DISCOVERY_DOCS, GMAIL_SCOPES, GOOGLE_CLIENT_ID, DEFAULT_AI_MODEL } from './constants';
import { EnrichedEmail, HarvestTranche, AIAnalysis, EmailBatch, ViewMode, FolderStyle } from './types';
import { getTotalInboxCount, createGmailLabel, moveEmailsToLabel, applyTagsToEmail } from './services/gmailService';
import { analyzeSingleEmail } from './services/aiService';
import { 
  Loader2, Database, Settings, StopCircle, Rocket, Layers, ListFilter, 
  PlayCircle, Check, Zap, BarChart3, PieChart, Info, X, Search, Mail, 
  BrainCircuit, LayoutGrid, ChevronRight, User, AlertTriangle
} from 'lucide-react';
import { logger } from './utils/logger';

export default function App() {
  const [config, setConfig] = useState(() => ({
    provider: localStorage.getItem('ai_provider') || 'puter',
    model: localStorage.getItem('ai_model') || DEFAULT_AI_MODEL,
    concurrency: Number(localStorage.getItem('ai_concurrency')) || 3,
    folderStyle: (localStorage.getItem('folder_style') as FolderStyle) || 'standard'
  }));
  
  const [viewMode, setViewMode] = useState<ViewMode>('pipeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  
  const [totalInboxCount, setTotalInboxCount] = useState<number>(() => Number(localStorage.getItem('total_inbox_count')) || 0);
  const [tranches, setTranches] = useState<HarvestTranche[]>(() => {
    const saved = localStorage.getItem('harvest_tranches_v8');
    return saved ? JSON.parse(saved) : [];
  });

  const stopSignal = useRef<boolean>(false);

  useEffect(() => {
    localStorage.setItem('harvest_tranches_v8', JSON.stringify(tranches));
    localStorage.setItem('total_inbox_count', String(totalInboxCount));
  }, [tranches, totalInboxCount]);

  const initGoogleServices = useCallback(() => {
    if (window.gapi) {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({ discoveryDocs: GMAIL_DISCOVERY_DOCS });
          const token = localStorage.getItem('google_access_token');
          if (token) {
            window.gapi.client.setToken({ access_token: token });
            const profile = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
            setUserEmail(profile.result.emailAddress);
            const total = await getTotalInboxCount();
            setTotalInboxCount(total);
            generateTranches(total);
          }
        } catch (e) { logger.error("GAPI Init Error", e); }
      });
    }

    if (window.google?.accounts?.oauth2) {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GMAIL_SCOPES,
        callback: async (resp: any) => {
          if (resp.error) return;
          localStorage.setItem('google_access_token', resp.access_token);
          window.gapi.client.setToken({ access_token: resp.access_token });
          const profile = await window.gapi.client.gmail.users.getProfile({ userId: 'me' });
          setUserEmail(profile.result.emailAddress);
          const total = await getTotalInboxCount();
          setTotalInboxCount(total);
          generateTranches(total);
        },
      });
      (window as any).tokenClient = client;
    }
  }, []);

  useEffect(() => { initGoogleServices(); }, [initGoogleServices]);

  const generateTranches = (total: number) => {
    setTranches(prev => {
      if (prev.length > 0) return prev;
      const numTranches = Math.ceil(total / 1000);
      return Array.from({ length: numTranches }, (_, i) => ({
        id: i + 1,
        startIndex: i * 1000,
        totalToFetch: Math.min(1000, total - (i * 1000)),
        fetchedCount: 0,
        status: 'pending',
        emails: []
      }));
    });
  };

  const handleSequentialAnalyze = async (trancheId: number, emailsToAnalyze: EnrichedEmail[], retryOnly: boolean = false) => {
    if (loading) return;
    setLoading(true);
    stopSignal.current = false;

    try {
      const tranche = tranches.find(t => t.id === trancheId);
      if (!tranche) return;

      const emailsToProcess = emailsToAnalyze.filter(e => retryOnly ? (e.failed && !e.processed) : !e.processed);
      const CONCURRENCY = config.concurrency;

      for (let i = 0; i < emailsToProcess.length; i += CONCURRENCY) {
        if (stopSignal.current) break;
        const chunk = emailsToProcess.slice(i, i + CONCURRENCY);
        setStatusText(`Titan Turbo x${CONCURRENCY} : ${chunk.length} instances...`);

        await Promise.all(chunk.map(async (email) => {
          try {
            const existingFolders = tranches.flatMap(t => t.emails.map(e => e.analysis?.suggestedFolder)).filter(Boolean) as string[];
            const analysis = await analyzeSingleEmail(email, config.model, config.provider, Array.from(new Set(existingFolders)));
            const moved = await moveEmailsToLabel([email.id], analysis.suggestedFolder, config.folderStyle);
            if (moved && analysis.tags.length > 0) {
              await applyTagsToEmail(email.id, analysis.tags, config.folderStyle);
            }
            setTranches(curr => curr.map(t => t.id === trancheId ? {
              ...t, emails: t.emails.map(e => e.id === email.id ? { ...e, analysis, processed: true, organized: moved, failed: false } : e)
            } : t));
          } catch (e) {
            setTranches(curr => curr.map(t => t.id === trancheId ? {
              ...t, emails: t.emails.map(e => e.id === email.id ? { ...e, failed: true } : e)
            } : t));
          }
        }));
        await new Promise(r => setTimeout(r, 100));
      }
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const runHarvestMission = async (trancheId: number) => {
    if (loading) return;
    const tranche = tranches.find(t => t.id === trancheId);
    if (!tranche || tranche.status === 'completed' || tranche.status === 'running') return;

    setLoading(true);
    updateTranche(trancheId, { status: 'running' });

    try {
      let fetched = tranche.fetchedCount;
      let pageToken = tranche.nextPageToken || undefined;
      let allEmails = [...tranche.emails];

      while (fetched < tranche.totalToFetch && !stopSignal.current) {
        setStatusText(`Récolte : ${fetched}/${tranche.totalToFetch}`);
        const response: any = await window.gapi.client.gmail.users.messages.list({ userId: 'me', maxResults: 50, pageToken, labelIds: ['INBOX'] });
        const messages = response.result.messages || [];
        pageToken = response.result.nextPageToken || null;

        for (let i = 0; i < messages.length; i += 10) {
          if (stopSignal.current) break;
          const chunk = messages.slice(i, i + 10);
          const chunkDetails = await Promise.all(chunk.map(async (m: any) => {
            const res = await window.gapi.client.gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata' });
            const h = res.result.payload.headers;
            return {
              id: res.result.id, threadId: res.result.threadId, snippet: res.result.snippet, internalDate: res.result.internalDate,
              subject: h.find((x:any) => x.name === 'Subject')?.value || 'Sans objet',
              from: h.find((x:any) => x.name === 'From')?.value || 'Inconnu',
              processed: false, organized: false, failed: false
            } as EnrichedEmail;
          }));
          allEmails = [...allEmails, ...chunkDetails];
          fetched += chunkDetails.length;
          setTranches(prev => prev.map(t => t.id === trancheId ? { ...t, emails: allEmails, fetchedCount: fetched, nextPageToken: pageToken } : t));
        }
        if (!pageToken || fetched >= tranche.totalToFetch) break;
      }
      updateTranche(trancheId, { status: stopSignal.current ? 'stopped' : 'completed' });
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const updateTranche = (id: number, updates: Partial<HarvestTranche>) => {
    setTranches(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const allEmails = useMemo(() => tranches.flatMap(t => t.emails), [tranches]);
  const filteredEmails = useMemo(() => {
    if (!searchQuery) return allEmails;
    const q = searchQuery.toLowerCase();
    return allEmails.filter(e => e.subject?.toLowerCase().includes(q) || e.from?.toLowerCase().includes(q) || e.snippet?.toLowerCase().includes(q) || e.analysis?.suggestedFolder.toLowerCase().includes(q));
  }, [allEmails, searchQuery]);

  const stats = useMemo(() => {
    const folders = new Map<string, number>();
    const tags = new Map<string, number>();
    const processed = allEmails.filter(e => e.processed);
    processed.forEach(e => {
      if (e.analysis) {
        folders.set(e.analysis.suggestedFolder, (folders.get(e.analysis.suggestedFolder) || 0) + 1);
        e.analysis.tags.forEach(t => tags.set(t, (tags.get(t) || 0) + 1));
      }
    });
    return { 
      folders: Array.from(folders.entries()).sort((a,b) => b[1] - a[1]),
      tags: Array.from(tags.entries()).sort((a,b) => b[1] - a[1]),
      count: processed.length
    };
  }, [allEmails]);

  if (showSetup) return (
    <div className="bg-black min-h-screen text-white">
      <Header userEmail={userEmail} onLogout={() => { localStorage.removeItem('google_access_token'); window.location.reload(); }} />
      <Setup onSave={(p, m, c, fs) => { setConfig({ provider: p, model: m, concurrency: c, folderStyle: fs }); setShowSetup(false); }} onReset={() => { localStorage.clear(); window.location.reload(); }} onLogout={() => {}} isLoggedIn={!!userEmail} />
      <LogConsole />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-white">
      <Header userEmail={userEmail} onLogout={() => { localStorage.removeItem('google_access_token'); window.location.reload(); }} />
      
      {userEmail && (
        <nav className="bg-black/40 border-b border-white/5 sticky top-[73px] z-40 backdrop-blur-md">
           <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-2">
                <button onClick={() => setViewMode('pipeline')} className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${viewMode === 'pipeline' ? 'bg-indigo-600' : 'text-white/40 hover:bg-white/5'}`}><LayoutGrid className="w-4 h-4" /> Pipeline</button>
                <button onClick={() => setViewMode('mail')} className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${viewMode === 'mail' ? 'bg-indigo-600' : 'text-white/40 hover:bg-white/5'}`}><Mail className="w-4 h-4" /> Manager</button>
                <button onClick={() => setViewMode('training')} className={`px-4 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${viewMode === 'training' ? 'bg-indigo-600' : 'text-white/40 hover:bg-white/5'}`}><BrainCircuit className="w-4 h-4" /> Training</button>
              </div>
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-white/20" />
                <input type="text" placeholder="Recherche rapide..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl pl-9 pr-4 py-2 text-[10px] outline-none focus:border-indigo-500 transition-all" />
              </div>
           </div>
        </nav>
      )}

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-10 space-y-8 pb-32">
        {!userEmail ? (
          <div className="flex flex-col items-center justify-center py-20">
             <button onClick={() => (window as any).tokenClient.requestAccessToken({ prompt: 'select_account' })} className="py-8 px-12 bg-white text-black font-black rounded-[40px] flex items-center gap-6 shadow-2xl hover:scale-105 transition-all"><img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-10 h-10" /> Sync Gmail Titan</button>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-700">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               <button onClick={() => setShowSummary(true)} className="p-6 bg-indigo-600 rounded-[32px] font-black text-xs flex flex-col items-center gap-2 shadow-xl border border-indigo-400"><BarChart3 className="w-6 h-6" /> Bilan Global</button>
               <button onClick={() => runHarvestMission(1)} className="p-6 bg-white/5 rounded-[32px] font-black text-xs flex flex-col items-center gap-2 border border-white/10"><Database className="w-6 h-6" /> Récolte</button>
               <button onClick={() => alert("Autopilote activé.")} className="p-6 bg-white/5 rounded-[32px] font-black text-xs flex flex-col items-center gap-2 border border-white/10"><Rocket className="w-6 h-6" /> Autopilote</button>
               <button onClick={() => setShowSetup(true)} className="p-6 bg-white/5 rounded-[32px] font-black text-xs flex flex-col items-center gap-2 border border-white/10"><Settings className="w-6 h-6" /> Réglages</button>
            </div>

            {viewMode === 'pipeline' && (
              <div className="space-y-8">
                <h2 className="text-3xl font-black tracking-tighter px-4">Pipeline Turbo x{config.concurrency}</h2>
                {tranches.map(t => (
                  <MissionCard key={t.id} tranche={t} isLoading={loading} onStart={() => runHarvestMission(t.id)} onStop={() => stopSignal.current = true} onAnalyze={(emails: any, retry?: boolean) => handleSequentialAnalyze(t.id, emails, retry)} />
                ))}
              </div>
            )}

            {viewMode === 'mail' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-500">
                {filteredEmails.map(e => <EmailCard key={e.id} email={e} onAction={() => {}} />)}
                {filteredEmails.length === 0 && <div className="col-span-full py-20 text-center text-white/10 font-black uppercase tracking-widest">Aucun email trouvé</div>}
              </div>
            )}

            {viewMode === 'training' && (
              <div className="p-12 bg-white/5 rounded-[48px] border border-white/10 flex flex-col items-center gap-6 text-center">
                 <BrainCircuit className="w-20 h-20 text-indigo-500 animate-pulse" />
                 <h2 className="text-3xl font-black">Entraînement Titan</h2>
                 <p className="text-white/40 max-w-sm">Classez manuellement les emails que Titan n'a pas réussi à identifier avec certitude.</p>
                 <button className="px-10 py-5 bg-white text-black rounded-3xl font-black text-sm">Commencer une session</button>
              </div>
            )}

            {showSummary && (
              <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in">
                <div className="bg-[#0A0A0A] w-full max-w-4xl h-[80vh] rounded-[48px] border border-white/10 p-10 overflow-y-auto relative">
                   <button onClick={() => setShowSummary(false)} className="absolute top-8 right-8 p-3 bg-white/5 rounded-full"><X className="w-6 h-6" /></button>
                   <h2 className="text-5xl font-black tracking-tighter mb-10">Bilan Intelligent</h2>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      <div className="space-y-4">
                         <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400">Dossiers et Organisation</h3>
                         {stats.folders.map(([name, count]) => (
                           <div key={name} className="p-4 bg-white/5 rounded-2xl flex justify-between items-center"><span className="font-bold">{name}</span><span className="text-indigo-400 font-black">{count}</span></div>
                         ))}
                      </div>
                      <div className="space-y-4">
                         <h3 className="text-xs font-black uppercase tracking-widest text-purple-400">Tags Extraits</h3>
                         <div className="flex flex-wrap gap-2">
                           {stats.tags.map(([name, count]) => (
                             <span key={name} className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold">#{name} ({count})</span>
                           ))}
                         </div>
                      </div>
                   </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      <LogConsole />
    </div>
  );
}

function MissionCard({ tranche, onStart, onStop, isLoading, onAnalyze }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const prog = Math.round((tranche.fetchedCount / tranche.totalToFetch) * 100);
  const batches = useMemo(() => {
    const b = [];
    for (let i = 0; i < tranche.emails.length; i += 15) b.push({ id: b.length + 1, emails: tranche.emails.slice(i, i + 15) });
    return b;
  }, [tranche.emails]);

  return (
    <div className={`transition-all rounded-[48px] border ${isOpen ? 'bg-white/[0.06] border-white/20' : 'bg-white/[0.01] border-white/5'}`}>
      <div className="p-8 sm:p-12 flex justify-between items-center cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center gap-6">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${tranche.status === 'completed' ? 'bg-emerald-500 text-black' : 'bg-white/5'}`}>{tranche.status === 'completed' ? <Check className="w-8 h-8" /> : <Database className="w-8 h-8" />}</div>
          <div><h3 className="text-2xl font-black">Bloc {tranche.id}</h3><p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{tranche.fetchedCount} mails récoltés ({prog}%)</p></div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); tranche.status === 'running' ? onStop() : onStart(); }} className={`p-4 rounded-2xl ${tranche.status === 'running' ? 'bg-red-500' : 'bg-white text-black'}`}>{tranche.status === 'running' ? <StopCircle /> : <PlayCircle />}</button>
      </div>
      {isOpen && (
        <div className="p-8 space-y-4 animate-in slide-in-from-top-4">
           {batches.map(b => <BatchAccordion key={b.id} batch={b} isLoading={isLoading} onAnalyze={(retry?: boolean) => onAnalyze(b.emails, retry)} onAction={() => {}} onIgnore={() => {}} />)}
        </div>
      )}
    </div>
  );
}
