import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Play, CheckCircle2, Zap, Layers } from 'lucide-react';
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
  const [isOpen, setIsOpen] = useState(batch.id === 1);
  const isProcessed = batch.emails.every(e => e.processed);
  const processedCount = batch.emails.filter(e => e.processed).length;

  return (
    <div className={`border rounded-3xl overflow-hidden transition-all duration-300 ${
      isProcessed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-800 bg-slate-800/30'
    }`}>
      <div 
        className="flex items-center justify-between p-5 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-xl ${isProcessed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
            {isProcessed ? <CheckCircle2 className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              Tranche #{batch.id}
              <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-500">
                {batch.emails.length} emails
              </span>
            </h3>
            <div className="flex items-center gap-3 mt-0.5">
               <div className="w-24 h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 transition-all duration-500" 
                    style={{ width: `${(processedCount / batch.emails.length) * 100}%` }}
                  />
               </div>
               <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {processedCount} / {batch.emails.length} Analysés
               </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {!isProcessed && (
            <button 
              onClick={(e) => { e.stopPropagation(); onAnalyze(); }}
              disabled={isLoading}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/20"
            >
              <Play className="w-3 h-3 fill-current" /> Analyser
            </button>
          )}
          {isOpen ? <ChevronDown className="w-5 h-5 text-slate-500" /> : <ChevronRight className="w-5 h-5 text-slate-500" />}
        </div>
      </div>

      {isOpen && (
        <div className="p-6 pt-0 animate-in slide-in-from-top-2 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
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