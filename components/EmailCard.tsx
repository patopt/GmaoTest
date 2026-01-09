
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
    <div className={`group relative bg-white/[0.04] backdrop-blur-2xl border rounded-[38px] p-6 transition-all duration-700 hover:bg-white/[0.08] hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] ${
      analysis ? 'border-white/10' : 'border-white/5 opacity-50'
    }`}>
      {/* Sender Header */}
      <div className="flex justify-between items-start mb-5">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-lg group-hover:scale-110 transition-transform duration-500">
            <User className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.2em] truncate mb-1">
              {email.from?.split('<')[0].trim()}
            </p>
            <h3 className="text-lg font-black text-white/90 truncate leading-tight tracking-tight">
              {email.subject}
            </h3>
          </div>
        </div>
        <button className="p-2 bg-white/5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
          <MoreHorizontal className="w-4 h-4 text-white/40" />
        </button>
      </div>

      {/* Excerpt */}
      <div className="mb-8">
        <p className="text-white/40 text-sm leading-relaxed line-clamp-2 font-medium">
          {email.snippet}
        </p>
      </div>

      {/* Intelligence Section */}
      {analysis ? (
        <div className="space-y-5 pt-5 border-t border-white/5">
          <div className="bg-indigo-500/5 rounded-3xl p-5 border border-indigo-500/10">
             <div className="flex items-start gap-3 mb-4">
               <div className="mt-1"><ShieldCheck className="w-4 h-4 text-indigo-400" /></div>
               <p className="text-[13px] text-indigo-100/80 font-semibold leading-relaxed">
                 {analysis.summary}
               </p>
             </div>
             <div className="flex flex-wrap gap-2">
               {analysis.tags.slice(0, 3).map((tag, idx) => (
                 <span key={idx} className="bg-white/5 text-[10px] text-white/50 px-3 py-1 rounded-full border border-white/5 font-black uppercase tracking-tighter">
                   #{tag}
                 </span>
               ))}
               <span className="bg-indigo-400/10 text-[10px] text-indigo-400 px-3 py-1 rounded-full border border-indigo-400/20 font-black uppercase tracking-tighter">
                 {analysis.category}
               </span>
             </div>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={() => onAction(analysis.suggestedFolder)}
              className="flex-1 py-4 bg-white text-black rounded-2xl text-sm font-black transition-all hover:bg-white/90 flex items-center justify-center gap-2 active:scale-95 shadow-xl"
            >
              <FolderOpen className="w-4 h-4" />
              Classer
            </button>
            <button className="p-4 bg-white/5 hover:bg-white/10 text-white/60 rounded-2xl transition-all active:scale-95 border border-white/5">
              <Tag className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="h-32 flex flex-col items-center justify-center border-t border-white/5">
           <div className="flex gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500/20 animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-2 h-2 rounded-full bg-indigo-500/20 animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-2 h-2 rounded-full bg-indigo-500/20 animate-bounce"></div>
           </div>
           <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">IA Processing</span>
        </div>
      )}
    </div>
  );
};

export default EmailCard;
