import React from 'react';
import { Tag, FolderOpen, Send, User, ChevronRight, Hash } from 'lucide-react';
import { EnrichedEmail } from '../types';

interface EmailCardProps {
  email: EnrichedEmail;
  onAction: (folder: string) => void;
}

const EmailCard: React.FC<EmailCardProps> = ({ email, onAction }) => {
  const analysis = email.analysis;

  return (
    <div className={`group relative bg-white/5 backdrop-blur-xl border rounded-[28px] p-5 transition-all duration-500 hover:bg-white/10 hover:shadow-2xl hover:-translate-y-1 ${
      analysis ? 'border-white/10' : 'border-white/5 opacity-50'
    }`}>
      {/* Sender & Badge */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white shrink-0 shadow-lg">
            <User className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest truncate">
              {email.from?.split('<')[0].trim() || 'Expéditeur inconnu'}
            </p>
            <h3 className="text-[15px] font-black text-white/90 truncate leading-tight">
              {email.subject || '(Sans objet)'}
            </h3>
          </div>
        </div>
        {analysis && (
          <div className="bg-white/10 px-2.5 py-1 rounded-full border border-white/5 text-[10px] font-black text-white/60 uppercase tracking-tighter">
            {analysis.category}
          </div>
        )}
      </div>

      {/* Content Preview */}
      <div className="mb-6">
        <p className="text-white/40 text-[13px] leading-relaxed line-clamp-2 italic font-medium">
          {email.snippet}
        </p>
      </div>

      {/* AI Intelligence / Actions */}
      {analysis ? (
        <div className="space-y-4 pt-4 border-t border-white/5">
          <div className="bg-indigo-500/5 rounded-2xl p-4 border border-indigo-500/10">
             <div className="flex items-start gap-2 mb-3">
               <Send className="w-3 h-3 text-indigo-400 mt-0.5" />
               <p className="text-[12px] text-indigo-200/80 font-semibold leading-snug">
                 {analysis.summary}
               </p>
             </div>
             <div className="flex flex-wrap gap-1.5">
               {analysis.tags.map((tag, idx) => (
                 <span key={idx} className="bg-white/5 text-[10px] text-white/40 px-2 py-0.5 rounded-lg border border-white/5 flex items-center gap-1">
                   <Hash className="w-2.5 h-2.5" /> {tag}
                 </span>
               ))}
             </div>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={() => onAction(analysis.suggestedFolder)}
              className="flex-1 py-3.5 bg-white text-slate-900 rounded-[20px] text-[13px] font-black transition-all hover:bg-indigo-50 flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-white/5"
            >
              <FolderOpen className="w-4 h-4" />
              Ranger dans {analysis.suggestedFolder}
            </button>
            <button className="p-3.5 bg-white/5 hover:bg-white/10 text-white/60 rounded-[20px] transition-all active:scale-95">
              <Tag className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="h-24 flex items-center justify-center border-t border-white/5">
          <div className="animate-pulse flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
            <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">En attente d'IA</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailCard;