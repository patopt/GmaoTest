
import React, { useState } from 'react';
import { ShieldCheck, Check, Cpu, Zap, Loader2, AlertCircle, Trash2, LogOut, Layers, Gauge } from 'lucide-react';
import { GEMINI_MODELS, DEFAULT_AI_MODEL, AI_PROVIDERS, DEFAULT_PROVIDER } from '../constants';
import { testAIConnection } from '../services/aiService';
import { FolderStyle } from '../types';

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

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-6">
      <div className="bg-slate-800/80 backdrop-blur-2xl p-8 rounded-[40px] border border-white/10 w-full max-w-3xl shadow-2xl space-y-8 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-black text-white flex items-center gap-3">
            <Cpu className="text-indigo-400" /> Configuration Titan
          </h2>
          {isLoggedIn && (
            <button 
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl text-xs font-bold transition-all border border-red-500/20"
            >
              <LogOut className="w-4 h-4" /> Déconnexion
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Moteur & Modèle */}
          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block px-1">Moteur d'IA</label>
              <div className="space-y-2">
                {AI_PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setProvider(p.id)}
                    className={`w-full p-4 rounded-3xl border flex items-center gap-3 transition-all ${provider === p.id ? 'bg-indigo-600/10 border-indigo-500 text-white' : 'bg-slate-900/50 border-slate-700 text-slate-400'}`}
                  >
                    <Zap className="w-4 h-4" />
                    <span className="text-xs font-bold">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block px-1">Modèle de langage</label>
              <select 
                value={model} 
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-3xl px-5 py-5 text-white text-xs outline-none appearance-none focus:ring-2 focus:ring-indigo-500"
              >
                {GEMINI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Turbo & Style */}
          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block px-1 flex items-center gap-2">
                <Gauge className="w-3 h-3" /> Mode Turbo (Simultanéité)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[3, 5, 7].map(n => (
                  <button
                    key={n}
                    onClick={() => setConcurrency(n)}
                    className={`p-4 rounded-2xl border font-black text-xs transition-all ${concurrency === n ? 'bg-purple-600 border-purple-400 text-white' : 'bg-slate-900/50 border-slate-700 text-slate-500'}`}
                  >
                    x{n}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-slate-500 italic px-1">Nombre d'emails analysés en même temps.</p>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block px-1 flex items-center gap-2">
                <Layers className="w-3 h-3" /> Nomenclature Dossiers
              </label>
              <div className="space-y-2">
                <button
                  onClick={() => setFolderStyle('standard')}
                  className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${folderStyle === 'standard' ? 'bg-indigo-600/10 border-indigo-500 text-white' : 'bg-slate-900/50 border-slate-700 text-slate-500'}`}
                >
                  <span className="text-xs font-bold">Standard</span>
                  <span className="text-[10px] opacity-40">"Dossier"</span>
                </button>
                <button
                  onClick={() => setFolderStyle('numbered')}
                  className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${folderStyle === 'numbered' ? 'bg-indigo-600/10 border-indigo-500 text-white' : 'bg-slate-900/50 border-slate-700 text-slate-500'}`}
                >
                  <span className="text-xs font-bold">Numéroté</span>
                  <span className="text-[10px] opacity-40">"01. Dossier"</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
          <button
            onClick={handleTest}
            disabled={testing}
            className="w-full sm:flex-1 py-5 bg-slate-700 hover:bg-slate-600 text-white rounded-3xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Tester IA
          </button>
          <button
            onClick={() => onSave(provider, model, concurrency, folderStyle)}
            className="w-full sm:flex-[2] py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-3xl font-black text-xs shadow-xl shadow-indigo-600/20 active:scale-95 transition-all"
          >
            Sauvegarder les réglages
          </button>
        </div>

        {testResult && (
          <div className={`p-5 rounded-3xl border flex items-center gap-4 ${testResult === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
            {testResult === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="text-xs font-bold tracking-tight">{testResult === 'success' ? 'Moteur Titan prêt à l\'action !' : 'Erreur de connexion IA.'}</span>
          </div>
        )}

        <div className="pt-8 border-t border-white/5">
          <button
            onClick={() => { if(confirm("Réinitialiser Titan ?")) onReset(); }}
            className="w-full py-4 bg-transparent hover:bg-red-500/10 text-red-400/60 hover:text-red-400 rounded-2xl font-bold text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 border border-dashed border-red-500/20 transition-all"
          >
            <Trash2 className="w-4 h-4" /> Réinitialiser tout
          </button>
        </div>
      </div>
    </div>
  );
};

export default Setup;
