import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { Sun, Moon, LogOut } from 'lucide-react';

export default function Header() {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useUIStore();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between px-6">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white font-bold text-lg shadow-sm shadow-primary/20 text-outfit">
            CB
          </div>
          <span className="font-bold tracking-tight text-slate-800 dark:text-slate-100 text-outfit hidden sm:block">
            CollabBoard
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-4">
          {/* Theme Switcher */}
          <button
            onClick={toggleTheme}
            className="rounded-lg p-2 hover:bg-muted text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {/* User Account Context */}
          {user && (
            <div className="flex items-center gap-3 pl-2 border-l border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-sm font-semibold text-slate-700 dark:text-slate-200 uppercase">
                  {user.name.slice(0, 2)}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-none">
                    {user.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {user.role}
                  </p>
                </div>
              </div>

              {/* Logout Button */}
              <button
                onClick={logout}
                className="rounded-lg p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                title="Log Out"
              >
                <LogOut size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
