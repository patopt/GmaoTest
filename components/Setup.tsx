
import React, { useState } from 'react';
import { Zap, RefreshCcw, Loader2, Check, ShieldCheck, Settings2, Trash2, Cpu } from 'lucide-react';
import { GEMINI_MODELS, DEFAULT_AI_MODEL, AI_PROVIDERS, DEFAULT_PROVIDER } from '../constants';
import { testAIConnection } from '../services/aiService';
import { FolderStyle } from '../types';
import { logger } from '../utils/logger';

interface SetupProps {
  onSave: (provider: string, model: string, concurrency: number, folderStyle: FolderStyle) => void;
  onReset: () => void;
  onLogout: () => void;
  isLoggedIn: boolean;
}

const Setup: React.FC<SetupProps> = ({ onSave, onReset, onLogout, isLoggedIn }) => {
  const [provider, setProvider] = useState(localStorage.getItem('ai_provider') || DEFAULT_PROVIDER);
  const [model, setModel] = useState(localStorage.getItem('ai_model') || DEFAULT_AI_MODEL);
  const [concurrency, setConcurrency] = useState(Number(localStorage.getItem('ai_concurrency')) || 3);
  const [folderStyle, setFolderStyle] = useState<FolderStyle>((localStorage.getItem('folder_style') as FolderStyle) || 'standard');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const ok = await testAIConnection(provider, model);
    setTestResult(ok ? 'success' : 'error');
    setTesting(false);
  };

  const resetPuter = () => {
    if (confirm("Voulez-vous réinitialiser la connexion Puter.js ? Vous devrez vous reconnecter au prochain appel IA.")) {
      if (window.puter) {
        window.puter.auth.signOut().then(() => {
          localStorage.removeItem('puter_session_token');
          logger.warn("Session Puter déconnectée.");
          alert("Connexion Puter réinitialisée.");
        });
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-10 bg-[#050505]">
      <div className="bg-[#0A0A0A] p-6 sm:p-12 rounded-[48px] border border-white/5 w-full max-w-4xl shadow-2xl space-y-10 overflow-y-auto max-h-[90vh] no-scrollbar">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <h2 className="text-3xl font-black text-white tracking-tighter">Configuration Titan</h2>
            <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.3em]">Paramètres de l'IA & Nomenclature</p>
          </div>
          {isLoggedIn && (
            <button onClick={onLogout} className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">
              Déconnexion
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-8">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] block px-1">Fournisseur IA</label>
              <div className="grid grid-cols-1 gap-2">
                {AI_PROVIDERS.map(p => (
                  <button key={p.id} onClick={() => setProvider(p.id)} className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${provider === p.id ? 'bg-indigo-600/10 border-indigo-500 text-white' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'}`}>
                    <div className="flex items-center gap-3">
                      <Zap className={`w-4 h-4 ${provider === p.id ? 'text-indigo-400' : ''}`} />
                      <span className="text-xs font-bold">{p.name}</span>
                    </div>
                    {provider === p.id && <Check className="w-4 h-4 text-indigo-400" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] block px-1">Modèle de langage</label>
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2 no-scrollbar">
                {GEMINI_MODELS.map(m => (
                  <button key={m} onClick={() => setModel(m)} className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${model === m ? 'bg-white/10 border-indigo-500/50 text-white' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'}`}>
                    <span className="text-[10px] font-black uppercase tracking-tight">{m}</span>
                    {model === m && <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></div>}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={resetPuter} className="w-full py-4 bg-white/5 border border-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-2xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all">
              <RefreshCcw className="w-3 h-3" /> Réinitialiser Connexion Puter
            </button>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] block px-1">Puissance Turbo (Parallélisme)</label>
              <div className="grid grid-cols-3 gap-3">
                {[3, 5, 7, 10].map(n => (
                  <button key={n} onClick={() => setConcurrency(n)} className={`p-5 rounded-2xl border font-black text-xs transition-all flex flex-col items-center gap-1 ${concurrency === n ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/20' : 'bg-white/5 border-white/5 text-white/30 hover:bg-white/10'}`}>
                    <span className="text-lg">x{n}</span>
                    <span className="text-[8px] opacity-40 uppercase">Instances</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] block px-1">Style des Dossiers</label>
              <div className="grid grid-cols-1 gap-2">
                <button onClick={() => setFolderStyle('standard')} className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${folderStyle === 'standard' ? 'bg-white/10 border-indigo-500 text-white' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'}`}>
                   <div className="flex items-center gap-3"><Settings2 className="w-4 h-4" /> <span className="text-xs font-bold">Standard (Nom direct)</span></div>
                   {folderStyle === 'standard' && <Check className="w-4 h-4" />}
                </button>
                <button onClick={() => setFolderStyle('numbered')} className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${folderStyle === 'numbered' ? 'bg-white/10 border-indigo-500 text-white' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'}`}>
                   <div className="flex items-center gap-3"><Cpu className="w-4 h-4" /> <span className="text-xs font-bold">Numéroté (01. Nom)</span></div>
                   {folderStyle === 'numbered' && <Check className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 pt-6">
          <button onClick={handleTest} disabled={testing} className={`w-full sm:flex-1 py-6 rounded-[32px] font-black text-xs flex items-center justify-center gap-2 transition-all border ${testResult === 'success' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : testResult === 'error' ? 'bg-red-500/10 border-red-500 text-red-400' : 'bg-white/5 border-white/5 text-white hover:bg-white/10'}`}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : testResult === 'success' ? <ShieldCheck className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
            {testResult === 'success' ? 'IA OPÉRATIONNELLE' : testResult === 'error' ? 'ERREUR CONNEXION' : 'TESTER LE MOTEUR'}
          </button>
          <button onClick={() => onSave(provider, model, concurrency, folderStyle)} className="w-full sm:flex-[2] py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[32px] font-black text-xs shadow-xl active:scale-95 transition-all">
            ENREGISTRER LA CONFIGURATION
          </button>
        </div>

        <div className="pt-10 border-t border-white/5 text-center">
          <button onClick={onReset} className="text-[10px] font-black text-white/10 hover:text-red-400 uppercase tracking-[0.4em] transition-all flex items-center gap-2 mx-auto"><Trash2 className="w-3 h-3" /> RÉINITIALISER TOUTES LES DONNÉES LOCALES</button>
        </div>
      </div>
    </div>
  );
};

export default Setup;
