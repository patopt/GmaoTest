
import React, { useState } from 'react';
import { ShieldCheck, Check, Cpu, Zap, Loader2, AlertCircle, Trash2, LogOut, Layers, Gauge, RefreshCcw } from 'lucide-react';
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
    if (confirm("Voulez-vous déconnecter Puter.js ? Vous devrez vous reconnecter au prochain appel IA.")) {
      if (window.puter) {
        window.puter.auth.signOut();
        localStorage.removeItem('puter_session_token');
        logger.warn("Session Puter réinitialisée.");
        alert("Session Puter déconnectée.");
      }
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-6">
      <div className="bg-[#0A0A0A] p-8 sm:p-12 rounded-[56px] border border-white/5 w-full max-w-3xl shadow-2xl space-y-10 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-black text-white flex items-center gap-3 tracking-tighter">
            Configuration Titan
          </h2>
          {isLoggedIn && (
            <button onClick={onLogout} className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">
              Déconnexion
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] block px-1">Moteur IA</label>
              <div className="space-y-2">
                {AI_PROVIDERS.map(p => (
                  <button key={p.id} onClick={() => setProvider(p.id)} className={`w-full p-5 rounded-[24px] border flex items-center gap-3 transition-all ${provider === p.id ? 'bg-indigo-600/10 border-indigo-500 text-white' : 'bg-white/5 border-white/5 text-white/40'}`}>
                    <Zap className="w-4 h-4" />
                    <span className="text-xs font-black">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
            
            <button onClick={resetPuter} className="w-full py-4 border border-white/5 hover:bg-white/5 text-white/30 rounded-[24px] text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all">
              <RefreshCcw className="w-3 h-3" /> Reset Connexion Puter
            </button>
          </div>

          <div className="space-y-10">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] block px-1">Mode Turbo</label>
              <div className="grid grid-cols-3 gap-2">
                {[3, 5, 7].map(n => (
                  <button key={n} onClick={() => setConcurrency(n)} className={`p-5 rounded-[20px] border font-black text-xs transition-all ${concurrency === n ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-white/5 border-white/5 text-white/30'}`}>x{n}</button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em] block px-1">Nomenclature Dossiers</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setFolderStyle('standard')} className={`p-5 rounded-[20px] border font-black text-[10px] uppercase tracking-widest transition-all ${folderStyle === 'standard' ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-white/5 border-white/5 text-white/30'}`}>Standard</button>
                <button onClick={() => setFolderStyle('numbered')} className={`p-5 rounded-[20px] border font-black text-[10px] uppercase tracking-widest transition-all ${folderStyle === 'numbered' ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-white/5 border-white/5 text-white/30'}`}>Numéroté</button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 pt-6">
          <button onClick={handleTest} disabled={testing} className="w-full sm:flex-1 py-6 bg-white/5 hover:bg-white/10 text-white rounded-[32px] font-black text-xs flex items-center justify-center gap-2 transition-all">
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Tester IA
          </button>
          <button onClick={() => onSave(provider, model, concurrency, folderStyle)} className="w-full sm:flex-[2] py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[32px] font-black text-xs shadow-xl active:scale-95 transition-all">
            Appliquer la Configuration
          </button>
        </div>

        <div className="pt-10 border-t border-white/5 text-center">
          <button onClick={onReset} className="text-[10px] font-black text-white/10 hover:text-red-400 uppercase tracking-[0.4em] transition-all">Réinitialiser Titan Total</button>
        </div>
      </div>
    </div>
  );
};

export default Setup;
