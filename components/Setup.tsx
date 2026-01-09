import React, { useState, useEffect } from 'react';
import { KeyRound, HelpCircle, Copy, Check, ExternalLink, ShieldCheck, Cpu, Zap, Beaker, Loader2, AlertCircle } from 'lucide-react';
import { logger } from '../utils/logger';
import { testAIConnection, AIProvider } from '../services/aiService';

interface SetupProps {
  onSave: (clientId: string, provider: AIProvider) => void;
}

const Setup: React.FC<SetupProps> = ({ onSave }) => {
  const [clientId, setClientId] = useState('');
  const [provider, setProvider] = useState<AIProvider>('puter');
  const [copied, setCopied] = useState(false);
  const [currentOrigin, setCurrentOrigin] = useState('');
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    const origin = window.location.origin.replace(/\/$/, "");
    setCurrentOrigin(origin);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (clientId.trim()) {
      onSave(clientId.trim(), provider);
    }
  };

  const handleTest = async (e: React.MouseEvent) => {
    e.preventDefault();
    setTesting(true);
    setTestStatus('idle');
    const result = await testAIConnection(provider);
    setTestStatus(result ? 'success' : 'error');
    setTesting(false);
  };

  const copyOrigin = () => {
    navigator.clipboard.writeText(currentOrigin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 space-y-8 max-w-4xl mx-auto">
      <div className="bg-slate-800 p-8 rounded-3xl shadow-2xl border border-slate-700 w-full animate-in fade-in zoom-in duration-500">
        <div className="flex justify-center mb-6">
          <div className="bg-indigo-500/10 p-5 rounded-2xl border border-indigo-500/20">
            <KeyRound className="w-10 h-10 text-indigo-400" />
          </div>
        </div>
        
        <h2 className="text-3xl font-extrabold text-center text-white mb-2 tracking-tight">Configuration Initiale</h2>
        <p className="text-slate-400 text-center text-sm mb-8">Établissez la connexion avec Gmail et choisissez votre moteur d'IA.</p>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Étape 1: Google SDK */}
          <div className="space-y-4">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">1. Google OAuth Client ID</label>
            <input
              type="text"
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="ex: 123456789...apps.googleusercontent.com"
              className="w-full px-4 py-4 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-sm"
            />
          </div>

          {/* Étape 2: Choix IA */}
          <div className="space-y-4">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">2. Moteur d'Intelligence Artificielle</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setProvider('puter')}
                className={`flex flex-col p-5 rounded-2xl border transition-all text-left group ${
                  provider === 'puter' ? 'bg-indigo-600/10 border-indigo-500 shadow-lg' : 'bg-slate-900 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <Cpu className={`w-6 h-6 ${provider === 'puter' ? 'text-indigo-400' : 'text-slate-500'}`} />
                  {provider === 'puter' && <Check className="w-5 h-5 text-indigo-400" />}
                </div>
                <span className="font-bold text-white">Gemini via Puter</span>
                <span className="text-xs text-slate-500 mt-1">Prêt à l'emploi, géré par l'infrastructure Puter.js.</span>
              </button>

              <button
                type="button"
                onClick={() => setProvider('gemini-sdk')}
                className={`flex flex-col p-5 rounded-2xl border transition-all text-left group ${
                  provider === 'gemini-sdk' ? 'bg-indigo-600/10 border-indigo-500 shadow-lg' : 'bg-slate-900 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <Zap className={`w-6 h-6 ${provider === 'gemini-sdk' ? 'text-indigo-400' : 'text-slate-500'}`} />
                  {provider === 'gemini-sdk' && <Check className="w-5 h-5 text-indigo-400" />}
                </div>
                <span className="font-bold text-white">Gemini Direct</span>
                <span className="text-xs text-slate-500 mt-1">Utilise le SDK @google/genai officiel (système).</span>
              </button>
            </div>
          </div>

          {/* Test Zone */}
          <div className="flex flex-col items-center gap-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
             <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors py-2 px-4 rounded-full bg-indigo-500/5 border border-indigo-500/10 hover:border-indigo-500/30"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Beaker className="w-4 h-4" />}
              {testing ? 'Test en cours...' : 'Tester la connexion IA'}
            </button>
            
            {testStatus === 'success' && (
              <div className="flex items-center gap-2 text-green-400 text-xs font-bold animate-in fade-in slide-in-from-top-2">
                <Check className="w-4 h-4" /> La connexion IA fonctionne parfaitement !
              </div>
            )}
            {testStatus === 'error' && (
              <div className="flex items-center gap-2 text-red-400 text-xs font-bold animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-4 h-4" /> Erreur de connexion au modèle. Vérifiez vos quotas.
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-white text-slate-900 hover:bg-slate-100 font-bold py-4 px-4 rounded-xl shadow-lg transition-all active:scale-[0.98] text-lg"
          >
            Lancer l'Application
          </button>
        </form>

        {/* Info Google Console */}
        <div className="mt-8 pt-8 border-t border-slate-700/50">
          <div className="flex items-center gap-2 text-slate-400 font-bold text-xs uppercase tracking-widest mb-4">
            <HelpCircle className="w-4 h-4" /> Guide Google Cloud
          </div>
          <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-700 flex flex-col sm:flex-row items-center gap-4">
            <p className="text-xs text-slate-500 flex-1">Configurez l'origine JS autorisée dans votre console :</p>
            <div className="flex items-center gap-2 bg-black/40 border border-slate-700 rounded-lg p-2 group w-full sm:w-auto">
              <code className="font-mono text-indigo-300 text-[10px] truncate select-all">{currentOrigin}</code>
              <button onClick={copyOrigin} className="p-1 hover:bg-slate-700 rounded text-slate-400">
                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Setup;