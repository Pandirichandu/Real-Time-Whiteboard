import { Calendar, Trash2, Shield, Globe, ExternalLink } from 'lucide-react';

interface BoardCardProps {
  board: any;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function BoardCard({ board, onOpen, onDelete }: BoardCardProps) {
  const isPublic = board.visibility === 'PUBLIC';
  const updatedDate = new Date(board.updatedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 hover:shadow-md transition-all">
      {/* Title */}
      <div className="flex items-start justify-between">
        <h3 className="font-bold text-slate-800 dark:text-slate-100 group-hover:text-primary transition-colors line-clamp-1">
          {board.title}
        </h3>
        
        {/* Visibility indicator */}
        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
          isPublic 
            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/35'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700/50'
        }`}>
          {isPublic ? <Globe size={10} /> : <Shield size={10} />}
          {board.visibility}
        </span>
      </div>

      {/* Description */}
      <p className="mt-2 text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
        {board.description || 'No description provided.'}
      </p>

      {/* Footer Info */}
      <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Calendar size={13} />
          Updated {updatedDate}
        </span>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Delete Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(board.id);
            }}
            className="rounded p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            title="Delete Board"
          >
            <Trash2 size={14} />
          </button>
          
          {/* Open Board Button */}
          <button
            onClick={() => onOpen(board.id)}
            className="rounded p-1 text-primary hover:bg-primary/5 transition-colors"
            title="Open Board"
          >
            <ExternalLink size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
