import React, { useState, useEffect } from 'react';
import { KeyRound, ShieldCheck, Check, Cpu, Info, Zap } from 'lucide-react';
import { GEMINI_MODELS, DEFAULT_AI_MODEL } from '../constants';

interface SetupProps {
  onSave: (clientId: string, model: string) => void;
}

const Setup: React.FC<SetupProps> = ({ onSave }) => {
  const [clientId, setClientId] = useState('');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_AI_MODEL);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (clientId.trim()) {
      onSave(clientId.trim(), selectedModel);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-6">
      <div className="bg-slate-800 p-10 rounded-3xl shadow-2xl border border-slate-700 w-full max-w-xl">
        <div className="flex justify-center mb-8">
          <div className="bg-indigo-500/10 p-6 rounded-full border border-indigo-500/20">
            <ShieldCheck className="w-12 h-12 text-indigo-400" />
          </div>
        </div>
        
        <h2 className="text-3xl font-black text-center text-white mb-2">Configuration Expert</h2>
        <p className="text-slate-400 text-center mb-10">Accès gratuit aux modèles Gemini via Puter.js</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Google OAuth Client ID</label>
            <input
              type="text"
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="123456789-abc...apps.googleusercontent.com"
              className="w-full px-5 py-4 rounded-2xl bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Modèle Gemini (Gratuit via Puter)</label>
            <div className="grid grid-cols-1 gap-3">
              {GEMINI_MODELS.map(model => (
                <button
                  key={model}
                  type="button"
                  onClick={() => setSelectedModel(model)}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                    selectedModel === model 
                    ? 'bg-indigo-600/10 border-indigo-500 shadow-lg' 
                    : 'bg-slate-900 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-3 text-left">
                    <Zap className={`w-4 h-4 ${selectedModel === model ? 'text-indigo-400' : 'text-slate-600'}`} />
                    <span className={`text-sm font-bold ${selectedModel === model ? 'text-white' : 'text-slate-400'}`}>{model}</span>
                  </div>
                  {selectedModel === model && <Check className="w-4 h-4 text-indigo-400" />}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-5 rounded-2xl shadow-xl transition-all active:scale-[0.98] mt-4 flex items-center justify-center gap-3"
          >
            Démarrer l'Organisateur
          </button>
        </form>
      </div>
    </div>
  );
};

export default Setup;