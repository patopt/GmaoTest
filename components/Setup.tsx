import React, { useState, useEffect } from 'react';
import { KeyRound, HelpCircle, Copy, Check, ExternalLink, ShieldCheck } from 'lucide-react';
import { logger } from '../utils/logger';

interface SetupProps {
  onSave: (clientId: string) => void;
}

const Setup: React.FC<SetupProps> = ({ onSave }) => {
  const [clientId, setClientId] = useState('');
  const [copied, setCopied] = useState(false);
  const [currentOrigin, setCurrentOrigin] = useState('');

  useEffect(() => {
    // Extraction propre de l'origine (Protocole + Host) sans slash final
    // Crucial pour Google Cloud Console
    const origin = window.location.origin.replace(/\/$/, "");
    setCurrentOrigin(origin);
    logger.info("Configuration: Origine détectée pour Google Cloud", { origin });
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (clientId.trim()) {
      logger.success("Client ID enregistré.");
      onSave(clientId.trim());
    }
  };

  const copyOrigin = () => {
    navigator.clipboard.writeText(currentOrigin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    logger.info("URL copiée pour la Cloud Console");
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-6">
      <div className="bg-slate-800 p-8 rounded-3xl shadow-2xl border border-slate-700 max-w-xl w-full">
        <div className="flex justify-center mb-6">
          <div className="bg-indigo-500/10 p-5 rounded-2xl border border-indigo-500/20">
            <KeyRound className="w-10 h-10 text-indigo-400" />
          </div>
        </div>
        
        <h2 className="text-3xl font-extrabold text-center text-white mb-2">
          Initialisation
        </h2>
        <p className="text-slate-400 text-center text-sm mb-8">
          Configurez votre accès sécurisé à l'API Google Gmail.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">
              Google OAuth Client ID
            </label>
            <input
              type="text"
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="ex: 123456789...apps.googleusercontent.com"
              className="w-full px-4 py-4 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-sm"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-4 rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            Développer l'application
          </button>
        </form>

        <div className="mt-10 p-6 bg-slate-900/60 rounded-2xl border border-slate-700/50 space-y-5">
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
            <HelpCircle className="w-4 h-4" />
            Guide Rapide Google Cloud
          </div>
          
          <div className="space-y-4">
            <div className="flex gap-3 text-sm">
              <span className="flex-shrink-0 w-6 h-6 bg-slate-800 rounded-full flex items-center justify-center text-xs font-bold text-slate-400 border border-slate-700">1</span>
              <p className="text-slate-400">
                Créez des identifiants <strong>ID client OAuth 2.0</strong> (type Web) sur la <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline inline-flex items-center gap-1">Console Cloud <ExternalLink className="w-3 h-3"/></a>.
              </p>
            </div>

            <div className="flex gap-3 text-sm">
              <span className="flex-shrink-0 w-6 h-6 bg-slate-800 rounded-full flex items-center justify-center text-xs font-bold text-slate-400 border border-slate-700">2</span>
              <div className="space-y-2 flex-1">
                <p className="text-slate-300 font-medium">Copiez cette URL dans "Origines JavaScript autorisées" :</p>
                <div className="flex items-center gap-2 bg-black/40 border border-slate-700 rounded-lg p-3 group">
                  <code className="flex-1 font-mono text-indigo-300 text-xs truncate select-all">{currentOrigin}</code>
                  <button 
                    onClick={copyOrigin}
                    className="p-1.5 hover:bg-slate-700 rounded-md transition-colors text-slate-400 hover:text-white"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 text-sm">
              <span className="flex-shrink-0 w-6 h-6 bg-slate-800 rounded-full flex items-center justify-center text-xs font-bold text-slate-400 border border-slate-700">3</span>
              <p className="text-slate-400 italic text-xs">
                N'oubliez pas d'activer la <strong>Gmail API</strong> dans la section Bibliothèque.
              </p>
            </div>
          </div>
        </div>
        
        <div className="mt-6 flex items-center justify-center gap-2 text-[10px] text-slate-600 uppercase tracking-widest font-bold">
          <ShieldCheck className="w-3 h-3" />
          Sécurisé via Google Identity
        </div>
      </div>
    </div>
  );
};

export default Setup;