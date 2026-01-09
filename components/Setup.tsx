import React, { useState, useEffect } from 'react';
import { KeyRound, HelpCircle, Copy, Check, AlertTriangle } from 'lucide-react';
import { logger } from '../utils/logger';

interface SetupProps {
  onSave: (clientId: string) => void;
}

const Setup: React.FC<SetupProps> = ({ onSave }) => {
  const [clientId, setClientId] = useState('');
  const [copied, setCopied] = useState(false);
  const [currentOrigin, setCurrentOrigin] = useState('');

  useEffect(() => {
    const origin = window.location.protocol + '//' + window.location.host;
    setCurrentOrigin(origin);
    logger.info("Setup Page Loaded. Detected Origin: " + origin);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (clientId.trim()) {
      logger.info("User submitted Client ID");
      onSave(clientId.trim());
    }
  };

  const copyOrigin = () => {
    navigator.clipboard.writeText(currentOrigin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    logger.info("URL Origin copied to clipboard");
  };

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
      <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 max-w-lg w-full">
        <div className="flex justify-center mb-6">
          <div className="bg-indigo-500/20 p-4 rounded-full">
            <KeyRound className="w-10 h-10 text-indigo-400" />
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-center text-white mb-2">
          Configuration requise
        </h2>
        <p className="text-slate-400 text-center text-sm mb-6">
          Entrez votre Client ID Google Cloud pour continuer.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Google Cloud Client ID
            </label>
            <input
              type="text"
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="ex: 12345...apps.googleusercontent.com"
              className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            Continuer
          </button>
        </form>

        <div className="mt-8 p-5 bg-slate-900/50 rounded-lg border border-slate-700/50 text-sm text-slate-400 space-y-3">
            <div className="flex items-start gap-2 text-slate-400 text-xs">
                <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                <p>
                    Si la connexion échoue, vérifiez dans <strong className="text-slate-300">Google Cloud Console</strong> que cette URL est bien dans "Origines JavaScript autorisées" :
                </p>
            </div>
            
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded p-2 group mt-2">
                <code className="flex-1 font-mono text-indigo-300 truncate text-xs select-all">{currentOrigin}</code>
                <button 
                  onClick={copyOrigin}
                  className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-white flex-shrink-0"
                  title="Copier l'URL"
                >
                  {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                </button>
            </div>
            <p className="text-[10px] text-slate-500 italic mt-1">
                (Astuce: En cas de problème, ouvrez le bouton "Bug" en bas à droite pour voir les logs d'erreur détaillés)
            </p>
        </div>
      </div>
    </div>
  );
};

export default Setup;
