import React from 'react';
import { Tag, FolderInput, Check, MoveRight } from 'lucide-react';
import { EnrichedEmail } from '../types';

interface EmailCardProps {
  email: EnrichedEmail;
  onAction: (folder: string) => void;
}

const EmailCard: React.FC<EmailCardProps> = ({ email, onAction }) => {
  const analysis = email.analysis;

  return (
    <div className={`bg-slate-800 border rounded-2xl p-5 transition-all duration-300 shadow-xl h-full flex flex-col ${
      analysis ? 'border-indigo-500/30 bg-slate-800/80' : 'border-slate-700 opacity-60'
    }`}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0 pr-2">
          <h3 className="text-sm font-bold text-white truncate" title={email.subject}>
            {email.subject || '(Sans objet)'}
          </h3>
          <p className="text-[10px] text-slate-500 font-mono truncate">{email.from}</p>
        </div>
        {analysis && (
          <span className="text-[9px] font-black px-2 py-0.5 rounded-md border bg-indigo-500/10 border-indigo-500/30 text-indigo-300 uppercase tracking-tighter shrink-0">
            {analysis.category}
          </span>
        )}
      </div>

      <p className="text-slate-400 text-xs mb-6 line-clamp-2 italic">
        {email.snippet}
      </p>

      {analysis ? (
        <div className="mt-auto space-y-4">
          <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-700/50">
            <p className="text-xs text-indigo-200 font-medium leading-relaxed">
              <span className="text-slate-500 mr-2 text-[10px] font-bold">IA:</span> 
              "{analysis.summary}"
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {analysis.tags.slice(0, 3).map((tag, idx) => (
                <span key={idx} className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 flex items-center gap-1">
                   <Tag className="w-2.5 h-2.5" /> {tag}
                </span>
              ))}
            </div>
          </div>

          <button 
            onClick={() => onAction(analysis.suggestedFolder)}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 group shadow-lg shadow-indigo-600/10"
          >
            Déplacer vers {analysis.suggestedFolder}
            <MoveRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      ) : (
        <div className="mt-auto py-8 text-center border-t border-slate-700/50">
          <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">En attente d'analyse</div>
        </div>
      )}
    </div>
  );
};

export default EmailCard;