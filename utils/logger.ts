type LogLevel = 'info' | 'success' | 'warning' | 'error';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  details?: any;
}

type LogListener = (entry: LogEntry) => void;

class Logger {
  private listeners: LogListener[] = [];
  private logs: LogEntry[] = [];

  subscribe(listener: LogListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(entry: LogEntry) {
    this.logs.push(entry);
    this.listeners.forEach(l => l(entry));
  }

  getHistory() {
    return this.logs;
  }

  log(level: LogLevel, message: string, details?: any) {
    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      level,
      message,
      details
    };
    
    const style = level === 'error' ? 'color: #ff4d4d' : level === 'success' ? 'color: #2ecc71' : level === 'warning' ? 'color: #f1c40f' : 'color: #3498db';
    console.log(`%c[${level.toUpperCase()}] ${message}`, style, details || '');

    this.notify(entry);
  }

  info(msg: string, details?: any) { this.log('info', msg, details); }
  success(msg: string, details?: any) { this.log('success', msg, details); }
  warn(msg: string, details?: any) { this.log('warning', msg, details); }
  error(msg: string, details?: any) { this.log('error', msg, details); }
}

export const logger = new Logger();