
import React from 'react';
import { Tag, FolderOpen, Send, User, ChevronRight, Hash, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { EnrichedEmail } from '../types';

interface EmailCardProps {
  email: EnrichedEmail;
  onAction: (folder: string) => void;
}

const EmailCard: React.FC<EmailCardProps> = ({ email, onAction }) => {
  const analysis = email.analysis;

  return (
    <div className={`group relative bg-white/[0.04] backdrop-blur-3xl border rounded-[32px] sm:rounded-[40px] p-6 sm:p-8 transition-all duration-700 hover:bg-white/[0.08] ${
      analysis ? 'border-white/15 shadow-2xl' : 'border-white/5 opacity-50'
    }`}>
      
      {/* Organized Badge */}
      {email.organized && (
        <div className="absolute -top-3 -right-3 bg-emerald-500 text-black p-2 rounded-full shadow-xl animate-in zoom-in duration-500">
           <CheckCircle2 className="w-5 h-5" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className={`w-12 h-12 rounded-[18px] flex items-center justify-center text-white shrink-0 shadow-2xl transition-all duration-500 ${analysis ? 'bg-gradient-to-tr from-indigo-500 to-purple-600' : 'bg-white/10'}`}>
          <User className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] truncate">
            {email.from?.split('<')[0].trim() || 'Inconnu'}
          </p>
          <h3 className="text-md sm:text-lg font-black text-white/95 truncate leading-tight tracking-tighter">
            {email.subject}
          </h3>
        </div>
      </div>

      {/* Excerpt */}
      <div className="mb-8">
        <p className="text-white/40 text-[12px] sm:text-[13px] leading-relaxed line-clamp-2">
          {email.snippet}
        </p>
      </div>

      {/* Analysis UI */}
      {analysis ? (
        <div className="space-y-5 pt-5 border-t border-white/5 animate-in fade-in duration-1000">
          <div className="bg-white/5 rounded-[24px] p-4 sm:p-5 border border-white/5">
             <div className="flex items-start gap-3 mb-4">
               <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
               <p className="text-[12px] sm:text-[13px] text-white/80 font-bold leading-snug">
                 {analysis.summary}
               </p>
             </div>
             <div className="flex flex-wrap gap-2">
               {analysis.tags.map((tag, idx) => (
                 <span key={idx} className="bg-indigo-500/10 text-[8px] text-indigo-300 px-3 py-1 rounded-full border border-indigo-500/20 font-black uppercase tracking-widest">
                   #{tag}
                 </span>
               ))}
             </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1 py-4 bg-white/5 text-white/60 rounded-[20px] text-[10px] font-black uppercase tracking-widest border border-white/10 flex items-center justify-center gap-2">
              <FolderOpen className="w-4 h-4" />
              {analysis.suggestedFolder}
            </div>
          </div>
        </div>
      ) : (
        <div className="h-32 flex flex-col items-center justify-center border-t border-white/5 gap-3">
           <div className="flex gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500/30 animate-pulse"></div>
              <div className="w-2 h-2 rounded-full bg-indigo-500/30 animate-pulse [animation-delay:200ms]"></div>
              <div className="w-2 h-2 rounded-full bg-indigo-500/30 animate-pulse [animation-delay:400ms]"></div>
           </div>
           <span className="text-[8px] font-black text-white/10 uppercase tracking-[0.4em]">En attente Titan</span>
        </div>
      )}
    </div>
  );
};

export default EmailCard;
