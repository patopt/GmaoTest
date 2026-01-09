
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
    if (confirm("Voulez-vous réinitialiser la connexion Puter.js ?")) {
      if (window.puter) {
        window.puter.auth.signOut().then(() => {
          localStorage.removeItem('puter_session_token');
          logger.warn("Puter.js déconnecté.");
          alert("Session Puter réinitialisée.");
        });
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#050505]">
      <div className="bg-[#0A0A0A] p-8 sm:p-12 rounded-[56px] border border-white/5 w-full max-w-4xl shadow-2xl space-y-12 overflow-y-auto max-h-[90vh] no-scrollbar">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-black text-white tracking-tighter">Configuration Titan</h2>
          {isLoggedIn && <button onClick={onLogout} className="px-4 py-2 bg-red-500/10 text-red-400 rounded-2xl text-[10px] font-black uppercase tracking-widest">Déconnexion</button>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-8">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] block px-1">Source Intelligence</label>
              <div className="space-y-2">
                {AI_PROVIDERS.map(p => (
                  <button key={p.id} onClick={() => setProvider(p.id)} className={`w-full p-5 rounded-3xl border flex items-center justify-between transition-all ${provider === p.id ? 'bg-indigo-600/10 border-indigo-500 text-white' : 'bg-white/5 border-white/5 text-white/40'}`}>
                    <div className="flex items-center gap-3"><Zap className="w-4 h-4" /><span className="text-xs font-bold">{p.name}</span></div>
                    {provider === p.id && <Check className="w-4 h-4 text-indigo-400" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] block px-1">Modèle IA</label>
              <div className="space-y-2 max-h-40 overflow-y-auto no-scrollbar">
                {GEMINI_MODELS.map(m => (
                  <button key={m} onClick={() => setModel(m)} className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${model === m ? 'bg-white/10 border-indigo-500 text-white' : 'bg-white/5 border-white/5 text-white/40'}`}>
                    <span className="text-[10px] font-black uppercase tracking-tight">{m}</span>
                  </button>
                ))}
              </div>
            </div>
            
            <button onClick={resetPuter} className="w-full py-4 bg-white/5 border border-white/5 hover:bg-white/10 text-white/30 rounded-2xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
              <RefreshCcw className="w-3 h-3" /> Reset Connexion Puter
            </button>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] block px-1">Turbo Parallélisme</label>
              <div className="grid grid-cols-3 gap-3">
                {[3, 5, 10].map(n => (
                  <button key={n} onClick={() => setConcurrency(n)} className={`p-6 rounded-3xl border font-black transition-all ${concurrency === n ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl' : 'bg-white/5 border-white/5 text-white/30'}`}>x{n}</button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] block px-1">Style Nomenclature</label>
              <div className="grid grid-cols-1 gap-2">
                <button onClick={() => setFolderStyle('standard')} className={`p-5 rounded-2xl border flex items-center gap-3 transition-all ${folderStyle === 'standard' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-white/5 border-white/5 text-white/30'}`}><Settings2 className="w-4 h-4" /> Standard</button>
                <button onClick={() => setFolderStyle('numbered')} className={`p-5 rounded-2xl border flex items-center gap-3 transition-all ${folderStyle === 'numbered' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-white/5 border-white/5 text-white/30'}`}><Cpu className="w-4 h-4" /> Numéroté</button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-6">
          <button onClick={handleTest} className="flex-1 py-6 bg-white/5 rounded-[32px] font-black text-xs flex items-center justify-center gap-2 border border-white/5">
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Tester Moteur
          </button>
          <button onClick={() => onSave(provider, model, concurrency, folderStyle)} className="flex-[2] py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[32px] font-black text-xs shadow-2xl active:scale-95 transition-all">
            Appliquer Configuration
          </button>
        </div>

        <button onClick={onReset} className="w-full py-4 text-[9px] font-black text-white/10 hover:text-red-400 uppercase tracking-[0.5em] transition-all flex items-center justify-center gap-2"><Trash2 className="w-3 h-3" /> Effacer Données Locales</button>
      </div>
    </div>
  );
};

export default Setup;
