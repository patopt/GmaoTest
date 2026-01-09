
import React from 'react';
import { Tag, FolderOpen, Send, User, ChevronRight, Hash, ShieldCheck, MoreHorizontal } from 'lucide-react';
import { EnrichedEmail } from '../types';

interface EmailCardProps {
  email: EnrichedEmail;
  onAction: (folder: string) => void;
}

const EmailCard: React.FC<EmailCardProps> = ({ email, onAction }) => {
  const analysis = email.analysis;

  return (
    <div className={`group relative bg-white/[0.04] backdrop-blur-3xl border rounded-[40px] p-8 transition-all duration-700 hover:bg-white/[0.08] hover:shadow-[0_40px_80px_-15px_rgba(0,0,0,0.7)] ${
      analysis ? 'border-white/15' : 'border-white/5 opacity-40'
    }`}>
      {/* Sender Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-5 min-w-0">
          <div className="w-14 h-14 rounded-[22px] bg-gradient-to-tr from-indigo-500 via-purple-600 to-pink-500 flex items-center justify-center text-white shrink-0 shadow-2xl group-hover:scale-110 transition-transform duration-500">
            <User className="w-7 h-7" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] truncate mb-1">
              {email.from?.split('<')[0].trim() || 'Expéditeur inconnu'}
            </p>
            <h3 className="text-xl font-black text-white/95 truncate leading-none tracking-tighter">
              {email.subject}
            </h3>
          </div>
        </div>
      </div>

      {/* Excerpt */}
      <div className="mb-10">
        <p className="text-white/40 text-[13px] leading-relaxed line-clamp-2 font-medium">
          {email.snippet}
        </p>
      </div>

      {/* Intelligence Section */}
      {analysis ? (
        <div className="space-y-6 pt-6 border-t border-white/5">
          <div className="bg-white/5 rounded-[32px] p-6 border border-white/5 group-hover:bg-white/10 transition-colors">
             <div className="flex items-start gap-4 mb-5">
               <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
               <p className="text-[14px] text-white/80 font-bold leading-snug">
                 {analysis.summary}
               </p>
             </div>
             <div className="flex flex-wrap gap-2.5">
               {analysis.tags.slice(0, 3).map((tag, idx) => (
                 <span key={idx} className="bg-indigo-500/10 text-[9px] text-indigo-300 px-4 py-1.5 rounded-full border border-indigo-500/20 font-black uppercase tracking-widest">
                   #{tag}
                 </span>
               ))}
               <span className="bg-white/10 text-[9px] text-white/60 px-4 py-1.5 rounded-full border border-white/10 font-black uppercase tracking-widest">
                 {analysis.category}
               </span>
             </div>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={() => onAction(analysis.suggestedFolder)}
              className="flex-1 py-5 bg-white text-black rounded-[24px] text-xs font-black transition-all hover:bg-white/90 flex items-center justify-center gap-3 active:scale-95 shadow-2xl"
            >
              <FolderOpen className="w-4 h-4" />
              {email.organized ? 'Classé' : 'Classer'}
            </button>
            <button className="p-5 bg-white/5 hover:bg-white/15 text-white/60 rounded-[24px] transition-all active:scale-95 border border-white/5">
              <Tag className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="h-40 flex flex-col items-center justify-center border-t border-white/5">
           <div className="flex gap-2 mb-4">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500/40 animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500/40 animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500/40 animate-bounce"></div>
           </div>
           <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em]">Calcul IA en cours</span>
        </div>
      )}
    </div>
  );
};

export default EmailCard;
