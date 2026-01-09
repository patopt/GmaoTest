import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Play, CheckCircle2, Layers, Cpu } from 'lucide-react';
import { EmailBatch, EnrichedEmail } from '../types';
import EmailCard from './EmailCard';

interface BatchAccordionProps {
  batch: EmailBatch;
  onAnalyze: () => void;
  onAction: (emailId: string, folder: string) => void;
  onIgnore: (id: string) => void;
  isLoading: boolean;
}

const BatchAccordion: React.FC<BatchAccordionProps> = ({ batch, onAnalyze, onAction, onIgnore, isLoading }) => {
  const [isOpen, setIsOpen] = useState(false);
  const processedCount = batch.emails.filter(e => e.processed).length;
  const isFullyProcessed = processedCount === batch.emails.length && batch.emails.length > 0;

  return (
    <div className={`group transition-all duration-500 rounded-[32px] overflow-hidden mb-4 ${
      isOpen ? 'bg-white/[0.03] border-white/10 ring-1 ring-white/10' : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.02]'
    } border`}>
      <div 
        className="flex items-center justify-between p-6 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-5 min-w-0">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-inner ${
            isFullyProcessed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-white/30'
          }`}>
            {isFullyProcessed ? <CheckCircle2 className="w-6 h-6" /> : <Layers className="w-6 h-6" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[17px] font-black text-white/90">Tranche {batch.id}</h3>
              <span className="text-[10px] font-bold bg-white/5 px-2 py-0.5 rounded-full text-white/30 uppercase tracking-widest">
                {batch.emails.length} messages
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1.5">
               <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(99,102,241,0.5)]" 
                    style={{ width: `${(processedCount / batch.emails.length) * 100}%` }}
                  />
               </div>
               <span className="text-[11px] font-black text-white/40 tracking-tighter">
                {processedCount} / {batch.emails.length} analysés
               </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {!isFullyProcessed && (
            <button 
              onClick={(e) => { e.stopPropagation(); onAnalyze(); }}
              disabled={isLoading}
              className="hidden md:flex bg-white text-slate-900 px-5 py-2.5 rounded-2xl font-black text-xs items-center gap-2 transition-all hover:scale-105 active:scale-95"
            >
              <Cpu className="w-3.5 h-3.5" /> Analyser
            </button>
          )}
          <div className="p-2 bg-white/5 rounded-full">
            {isOpen ? <ChevronDown className="w-5 h-5 text-white/40" /> : <ChevronRight className="w-5 h-5 text-white/40" />}
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="px-6 pb-6 pt-2 animate-in fade-in slide-in-from-top-4 duration-500">
           <div className="md:hidden mb-6">
             <button 
                onClick={onAnalyze}
                disabled={isLoading}
                className="w-full bg-white text-slate-900 py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-3"
              >
                <Cpu className="w-4 h-4" /> Analyser ce groupe
              </button>
           </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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