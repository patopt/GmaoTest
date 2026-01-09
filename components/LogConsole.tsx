import React, { useEffect, useState, useRef } from 'react';
    import { Terminal, X, Minimize2, Maximize2, Trash2, Bug } from 'lucide-react';
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
            className="fixed bottom-4 right-4 bg-slate-800 hover:bg-slate-700 text-indigo-400 p-3 rounded-full shadow-lg border border-indigo-500/30 transition-all z-50 group"
            title="Ouvrir la console de logs"
          >
            <Bug className="w-6 h-6 group-hover:rotate-12 transition-transform" />
            {logs.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                </span>
            )}
          </button>
        );
      }
    
      return (
        <div className="fixed bottom-0 left-0 right-0 h-64 sm:h-80 bg-slate-950 border-t border-slate-700 shadow-2xl z-50 flex flex-col font-mono text-sm">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
            <div className="flex items-center gap-2 text-slate-300">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <span className="font-bold">System Logs</span>
              <span className="text-xs text-slate-500 ml-2">({logs.length} events)</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={clearLogs} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400" title="Effacer">
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white" title="Fermer">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
    
          {/* Log Output */}
          <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-black/50">
            {logs.length === 0 ? (
              <div className="text-slate-600 italic text-center mt-10">Aucun log pour le moment...</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex gap-2 items-start hover:bg-white/5 p-1 rounded">
                  <span className="text-slate-500 text-xs shrink-0 mt-0.5">
                    {log.timestamp.toLocaleTimeString().split(' ')[0]}
                  </span>
                  <span className={`text-xs font-bold px-1.5 rounded shrink-0 w-16 text-center
                    ${log.level === 'error' ? 'bg-red-900/50 text-red-300' : 
                      log.level === 'success' ? 'bg-green-900/50 text-green-300' : 
                      log.level === 'warning' ? 'bg-orange-900/50 text-orange-300' : 
                      'bg-blue-900/50 text-blue-300'}`}>
                    {log.level.toUpperCase()}
                  </span>
                  <div className="flex-1 break-all text-slate-300">
                    {log.message}
                    {log.details && (
                      <pre className="mt-1 text-xs text-slate-500 overflow-x-auto bg-black/30 p-2 rounded">
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
    