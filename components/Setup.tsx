import React, { useState } from 'react';
import { ShieldCheck, Check, Cpu, Zap, Loader2, AlertCircle } from 'lucide-react';
import { GEMINI_MODELS, DEFAULT_AI_MODEL, AI_PROVIDERS, DEFAULT_PROVIDER } from '../constants';
import { testAIConnection } from '../services/aiService';

interface SetupProps {
  onSave: (clientId: string, provider: string, model: string) => void;
}

const Setup: React.FC<SetupProps> = ({ onSave }) => {
  const [clientId, setClientId] = useState(localStorage.getItem('google_client_id') || '');
  const [provider, setProvider] = useState(localStorage.getItem('ai_provider') || DEFAULT_PROVIDER);
  const [model, setModel] = useState(localStorage.getItem('ai_model') || DEFAULT_AI_MODEL);
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
      <div className="bg-slate-800 p-8 rounded-[40px] border border-slate-700 w-full max-w-2xl shadow-2xl">
        <h2 className="text-3xl font-black text-white mb-8 flex items-center gap-3">
          <Cpu className="text-indigo-400" /> Configuration
        </h2>

        <div className="space-y-8">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">ID Client Google OAuth</label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-2xl px-5 py-4 text-white font-mono text-xs focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
              placeholder="12345-abc.apps.googleusercontent.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">Moteur IA</label>
              <div className="space-y-2">
                {AI_PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setProvider(p.id)}
                    className={`w-full p-4 rounded-2xl border flex items-center gap-3 transition-all ${provider === p.id ? 'bg-indigo-600/10 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
                  >
                    <Zap className="w-4 h-4" />
                    <span className="text-xs font-bold">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">Modèle</label>
              <select 
                value={model} 
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-2xl px-4 py-4 text-white text-xs outline-none"
              >
                {GEMINI_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex-1 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Tester l'IA
            </button>
            <button
              onClick={() => onSave(clientId, provider, model)}
              className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs shadow-lg shadow-indigo-600/20"
            >
              Enregistrer & Continuer
            </button>
          </div>

          {testResult && (
            <div className={`p-4 rounded-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${testResult === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
              {testResult === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <span className="text-xs font-bold">{testResult === 'success' ? 'IA opérationnelle !' : 'Échec du test. Vérifiez vos clés.'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Setup;