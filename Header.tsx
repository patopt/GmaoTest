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
          <div className="bg-indigo-500 p-2 rounded-lg">
            <Bot className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Gmail AI Organizer
            </h1>
            <p className="text-xs text-slate-400">Propulsé par Puter.js & Gemini 3</p>
          </div>
        </div>

        {userEmail && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-300 hidden sm:block">
              {userEmail}
            </span>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md text-sm transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
