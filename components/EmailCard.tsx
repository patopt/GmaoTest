import React from 'react';
import { Tag, FolderInput, AlertCircle } from 'lucide-react';
import { EnrichedEmail } from '../types';

interface EmailCardProps {
  email: EnrichedEmail;
}

const EmailCard: React.FC<EmailCardProps> = ({ email }) => {
  const analysis = email.analysis;

  if (!analysis) return null;

  const sentimentColor =
    analysis.sentiment === 'Positif'
      ? 'text-green-400'
      : analysis.sentiment === 'Négatif'
      ? 'text-red-400'
      : 'text-slate-400';

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-indigo-500/50 transition-all duration-300 shadow-lg">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0 pr-4">
          <h3 className="text-lg font-semibold text-white truncate" title={email.subject}>
            {email.subject}
          </h3>
          <p className="text-sm text-slate-400 truncate">{email.from}</p>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full border ${
            analysis.category === 'Urgent'
              ? 'bg-red-500/20 border-red-500/50 text-red-200'
              : 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200'
          }`}
        >
          {analysis.category}
        </span>
      </div>

      <p className="text-slate-300 text-sm mb-4 line-clamp-2">
        {email.snippet}
      </p>

      {/* AI Insights */}
      <div className="bg-slate-900/50 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Résumé IA:</span>
          <span className={`font-medium ${sentimentColor}`}>{analysis.sentiment}</span>
        </div>
        <p className="text-sm text-slate-300 italic">"{analysis.summary}"</p>
        
        <div className="h-px bg-slate-700/50 my-2" />
        
        <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center text-xs text-indigo-400 bg-indigo-950/30 px-2 py-1 rounded">
                <FolderInput className="w-3 h-3 mr-1.5" />
                Dossier: {analysis.suggestedFolder}
            </div>
            {analysis.tags.map((tag, idx) => (
                <div key={idx} className="flex items-center text-xs text-slate-400 bg-slate-800 border border-slate-700 px-2 py-1 rounded">
                    <Tag className="w-3 h-3 mr-1" />
                    {tag}
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default EmailCard;
