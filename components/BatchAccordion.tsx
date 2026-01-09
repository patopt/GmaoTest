
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Play, CheckCircle2, Layers, Cpu, Zap, AlertTriangle, RefreshCcw } from 'lucide-react';
import { EmailBatch, EnrichedEmail } from '../types';
import EmailCard from './EmailCard';

interface BatchAccordionProps {
  batch: EmailBatch;
  onAnalyze: (retryOnly?: boolean) => void;
  onAction: (emailId: string, folder: string) => void;
  onIgnore: (id: string) => void;
  isLoading: boolean;
}

const BatchAccordion: React.FC<BatchAccordionProps> = ({ batch, onAnalyze, onAction, onIgnore, isLoading }) => {
  const [isOpen, setIsOpen] = useState(false);
  const processedCount = batch.emails.filter(e => e.processed).length;
  const failedCount = batch.emails.filter(e => e.failed && !e.processed).length;
  const isFullyProcessed = processedCount === batch.emails.length && batch.emails.length > 0;

  return (
    <div className={`group transition-all duration-500 rounded-[32px] overflow-hidden mb-4 ${
      isOpen ? 'bg-white/[0.04] border-white/10' : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.02]'
    } border`}>
      <div 
        className="flex items-center justify-between p-5 sm:p-8 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-4 sm:gap-6 min-w-0">
          <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all shadow-inner ${
            isFullyProcessed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-white/30'
          }`}>
            {isFullyProcessed ? <CheckCircle2 className="w-5 h-5 sm:w-7 sm:h-7" /> : <Zap className="w-5 h-5 sm:w-7 sm:h-7" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-xl font-black text-white tracking-tighter">Tranche {batch.id}</h3>
            <div className="flex items-center gap-3 mt-2">
               <div className="w-20 sm:w-32 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-700" 
                    style={{ width: `${(processedCount / batch.emails.length) * 100}%` }}
                  />
               </div>
               <span className="text-[9px] sm:text-[11px] font-black text-white/30 uppercase tracking-tighter">
                {processedCount} / {batch.emails.length} OK
               </span>
               {failedCount > 0 && (
                 <span className="flex items-center gap-1 text-red-400 text-[9px] font-black uppercase">
                   <AlertTriangle className="w-3 h-3" /> {failedCount} Échecs
                 </span>
               )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {failedCount > 0 && !isLoading && (
            <button 
              onClick={(e) => { e.stopPropagation(); onAnalyze(true); }}
              className="bg-red-500/20 text-red-400 p-3 sm:px-4 sm:py-2 rounded-xl font-black text-[9px] flex items-center gap-2 hover:bg-red-500/30 transition-all border border-red-500/30"
              title="Réessayer uniquement les échecs"
            >
              <RefreshCcw className="w-3 h-3" /> <span className="hidden sm:inline">Réessayer Échecs</span>
            </button>
          )}

          {!isFullyProcessed && (
            <button 
              onClick={(e) => { e.stopPropagation(); onAnalyze(); }}
              disabled={isLoading}
              className="bg-white text-black p-3 sm:px-6 sm:py-3 rounded-xl sm:rounded-2xl font-black text-[9px] sm:text-xs flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-lg"
            >
              <Cpu className="w-4 h-4" /> <span className="hidden sm:inline">Analyser</span>
            </button>
          )}
          <div className="p-2 bg-white/5 rounded-full">
            {isOpen ? <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-white/20" /> : <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-white/20" />}
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="px-5 sm:px-8 pb-8 pt-2 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-8">
            {batch.emails.map((email) => (
              <EmailCard 
                key={email.id} 
                email={email} 
                onAction={(folder) => onAction(email.id, folder)} 
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchAccordion;
