import React from 'react';
import { Bot, LogOut } from 'lucide-react';

interface HeaderProps {
  userEmail: string | null;
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ userEmail, onLogout }) => {
  return (
    <header className="bg-slate-800 border-b border-slate-700 p-4 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
            <Bot className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight leading-tight">Gmail AI</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Puter.js & Gemini 3</p>
          </div>
        </div>
        {userEmail && (
          <div className="flex items-center gap-4">
            <span className="text-xs font-medium text-slate-400 hidden sm:block bg-slate-900 px-3 py-1.5 rounded-full border border-slate-700">{userEmail}</span>
            <button onClick={onLogout} className="p-2 bg-slate-700 hover:bg-red-500/20 hover:text-red-400 text-slate-300 rounded-xl transition-all" title="Déconnexion">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;