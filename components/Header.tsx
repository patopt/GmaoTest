
import React from 'react';
import { Bot, LogOut, UserCircle2 } from 'lucide-react';

interface HeaderProps {
  userEmail: string | null;
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ userEmail, onLogout }) => {
  return (
    <header className="bg-black/50 backdrop-blur-2xl border-b border-white/5 p-5 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex justify-between items-center px-2">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-tr from-indigo-500 to-purple-600 p-2.5 rounded-2xl shadow-xl shadow-indigo-500/20">
            <Bot className="text-white w-6 h-6" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-xl font-black text-white tracking-tighter leading-none">AI Organizer</h1>
            <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.3em] mt-1">Intelligence Pipeline</p>
          </div>
        </div>
        
        {userEmail && (
          <div className="flex items-center gap-4 group">
            <div className="flex items-center gap-3 bg-white/5 px-4 py-2.5 rounded-2xl border border-white/10 transition-all group-hover:bg-white/10">
              <UserCircle2 className="w-5 h-5 text-indigo-400" />
              <span className="text-xs font-black text-white/80 max-w-[120px] sm:max-w-none truncate">{userEmail}</span>
            </div>
            <button 
              onClick={onLogout} 
              className="p-3 bg-white/5 hover:bg-red-500/20 text-white/30 hover:text-red-400 rounded-2xl transition-all active:scale-95" 
              title="Changer de compte"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
