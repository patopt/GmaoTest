import React, { useEffect, useState, useRef } from 'react';
import { Terminal, X, Trash2, Bug, ChevronUp, ChevronDown } from 'lucide-react';
import { logger, LogEntry } from '../utils/logger';

const LogConsole: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogs(logger.getHistory());
    const unsubscribe = logger.subscribe((entry) => {
      setLogs(prev => [...prev, entry]);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isOpen && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  const clearLogs = () => setLogs([]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-slate-800 hover:bg-slate-700 text-indigo-400 p-4 rounded-full shadow-2xl border border-indigo-500/30 transition-all z-50 group flex items-center gap-2"
        title="Ouvrir la console système"
      >
        <Bug className="w-5 h-5 group-hover:rotate-12 transition-transform" />
        <span className="text-xs font-bold uppercase tracking-wider hidden sm:block">Logs</span>
        {logs.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-indigo-500 text-[10px] items-center justify-center text-white">
              {logs.length > 99 ? '+' : logs.length}
            </span>
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 h-80 bg-slate-950 border-t border-slate-700 shadow-2xl z-50 flex flex-col font-mono text-xs sm:text-sm">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2 text-slate-300">
          <Terminal className="w-4 h-4 text-indigo-400" />
          <span className="font-bold">System Monitor</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={clearLogs} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400 transition-colors" title="Effacer les logs">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="Fermer la console">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-black/40">
        {logs.length === 0 ? (
          <div className="text-slate-600 italic text-center mt-20">En attente d'événements...</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-3 items-start hover:bg-white/5 p-1.5 rounded transition-colors group">
              <span className="text-slate-600 shrink-0 select-none">
                {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className={`font-bold px-2 py-0.5 rounded shrink-0 min-w-[70px] text-center text-[10px] uppercase
                ${log.level === 'error' ? 'bg-red-900/40 text-red-400 border border-red-500/20' : 
                  log.level === 'success' ? 'bg-green-900/40 text-green-400 border border-green-500/20' : 
                  log.level === 'warning' ? 'bg-orange-900/40 text-orange-400 border border-orange-500/20' : 
                  'bg-indigo-900/40 text-indigo-400 border border-indigo-500/20'}`}>
                {log.level}
              </span>
              <div className="flex-1">
                <span className="text-slate-200">{log.message}</span>
                {log.details && (
                  <pre className="mt-2 text-[10px] text-slate-500 overflow-x-auto bg-black/40 p-2 rounded border border-slate-800">
                    {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details)}
                  </pre>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
};

export default LogConsole;