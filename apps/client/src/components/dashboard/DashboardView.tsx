import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import BoardCard from './BoardCard';
import Header from '../layout/Header';
import { Plus, Link, Loader2, Sparkles, BarChart2, Folder, Calendar, CreditCard } from 'lucide-react';

interface DashboardViewProps {
  onSelectBoard: (id: string) => void;
}

export default function DashboardView({ onSelectBoard }: DashboardViewProps) {
  const [activeTab, setActiveTab] = useState<'boards' | 'analytics' | 'billing'>('boards');
  const [boards, setBoards] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingInfo, setBillingInfo] = useState<any>(null);
  
  // Modals / Inputs
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE');
  const [inviteCode, setInviteCode] = useState('');
  
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchBoards = async () => {
    try {
      const res = await api.get('/boards');
      if (res.data?.status === 'success') {
        setBoards(res.data.data);
      }
    } catch (err) {
      console.error('Fetch boards error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchActivityLogs = async () => {
    try {
      const res = await api.get('/boards/activity/logs');
      if (res.data?.status === 'success') {
        setActivityLogs(res.data.data);
      }
    } catch (err) {
      console.error('Fetch logs error:', err);
    }
  };

  const fetchBillingInfo = async () => {
    try {
      const res = await api.get('/billing/status');
      if (res.data?.status === 'success') {
        setBillingInfo(res.data.data);
      }
    } catch (err) {
      console.error('Fetch billing error:', err);
    }
  };

  useEffect(() => {
    fetchBoards();
    fetchActivityLogs();
    fetchBillingInfo();
  }, []);

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setActionLoading(true);
    setError('');

    try {
      const res = await api.post('/boards', { title, description, visibility });
      if (res.data?.status === 'success') {
        setTitle('');
        setDescription('');
        setVisibility('PRIVATE');
        setShowCreateModal(false);
        fetchBoards();
        fetchActivityLogs();
        onSelectBoard(res.data.data.id);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create board');
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;

    setActionLoading(true);
    setError('');

    try {
      const res = await api.post('/boards/join', { inviteCode });
      if (res.data?.status === 'success') {
        setInviteCode('');
        fetchBoards();
        fetchActivityLogs();
        onSelectBoard(res.data.data.id);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to join board');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteBoard = async (id: string) => {
    if (!confirm('Are you sure you want to delete this board? This action is permanent.')) return;

    try {
      const res = await api.delete(`/boards/${id}`);
      if (res.data?.status === 'success') {
        fetchBoards();
        fetchActivityLogs();
      }
    } catch (err) {
      console.error('Delete board error:', err);
      alert('Failed to delete board');
    }
  };

  const handleUpgrade = async () => {
    setActionLoading(true);
    try {
      const res = await api.post('/billing/checkout');
      if (res.data?.status === 'success') {
        window.location.href = res.data.data.url;
      }
    } catch (err) {
      console.error('Upgrade session creation error:', err);
      alert('Failed to initiate billing portal.');
    } finally {
      setActionLoading(false);
    }
  };

  const publicBoardsCount = boards.filter((b) => b.visibility === 'PUBLIC').length;
  const privateBoardsCount = boards.filter((b) => b.visibility === 'PRIVATE').length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-6">
        
        {/* Navigation Tabs */}
        <div className="flex border-b border-border gap-6">
          <button
            onClick={() => setActiveTab('boards')}
            className={`pb-3 text-sm font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'boards'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Folder size={16} />
            My Boards
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`pb-3 text-sm font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'analytics'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <BarChart2 size={16} />
            Workspace Analytics
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={`pb-3 text-sm font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'billing'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <CreditCard size={16} />
            Billing & Plans
          </button>
        </div>

        {activeTab === 'boards' ? (
          <>
            {/* Header Hero Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100 text-outfit">
                  My Workspaces
                </h1>
                <p className="text-xs text-muted-foreground mt-1">
                  Create, invite teams, and build infinite visual concepts collaboratively
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Join input form */}
                <form onSubmit={handleJoinBoard} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Enter invite code"
                    className="px-3.5 py-2 border border-border bg-card text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-primary w-40 sm:w-48 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 px-4 py-2 border border-border hover:bg-muted text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Link size={13} />
                    Join
                  </button>
                </form>

                {/* Create button */}
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/95 text-white text-xs font-semibold rounded-lg shadow-sm hover:shadow transition-all"
                >
                  <Plus size={15} />
                  New Board
                </button>
              </div>
            </div>

            {/* Board Cards Grid */}
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 size={36} className="animate-spin text-primary" />
              </div>
            ) : boards.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-80 rounded-2xl border border-dashed border-border bg-card p-8 text-center max-w-lg mx-auto">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center mb-4">
                  <Sparkles size={24} className="text-slate-400" />
                </div>
                <h3 className="font-bold text-slate-700 dark:text-slate-300">
                  No boards found
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Get started by creating a new collaborative canvas or entering an invitation code to join a room.
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-5 px-4 py-2 bg-primary hover:bg-primary/95 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Create first board
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {boards.map((board) => (
                  <BoardCard
                    key={board.id}
                    board={board}
                    onOpen={onSelectBoard}
                    onDelete={handleDeleteBoard}
                  />
                ))}
              </div>
            )}
          </>
        ) : activeTab === 'analytics' ? (
          // Analytics Dashboard Tab
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-slate-900 p-6 border border-border rounded-xl shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Boards</span>
                <h3 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-1">{boards.length}</h3>
              </div>
              <div className="bg-white dark:bg-slate-900 p-6 border border-border rounded-xl shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Public Workspaces</span>
                <h3 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-1">{publicBoardsCount}</h3>
              </div>
              <div className="bg-white dark:bg-slate-900 p-6 border border-border rounded-xl shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Private Workspaces</span>
                <h3 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-1">{privateBoardsCount}</h3>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 border border-border rounded-xl shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <Calendar className="text-primary" size={16} />
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 text-outfit">
                  Recent Collaboration Activities
                </h3>
              </div>

              {activityLogs.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  No activity actions recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {activityLogs.map((log) => (
                    <div key={log.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-100 mr-3 uppercase tracking-wider text-[9px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                          {log.action}
                        </span>
                        <span className="text-slate-600 dark:text-slate-300">{log.details}</span>
                      </div>
                      <span className="text-muted-foreground text-[10px]">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          // Billing & Plans View
          <div className="space-y-6">
            {/* Plan Header Card */}
            <div className="bg-white dark:bg-slate-900 border border-border rounded-xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  Current Tier: {billingInfo?.plan || 'FREE'}
                </span>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 text-outfit">
                  Manage Workspace Subscription
                </h2>
                <p className="text-xs text-muted-foreground font-medium">
                  Your team has created {billingInfo?.boardsCreated || 0} of {billingInfo?.maxFreeBoards || 3} free workspaces.
                </p>
              </div>

              {billingInfo?.plan !== 'PREMIUM' ? (
                <button
                  onClick={handleUpgrade}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all disabled:opacity-50"
                >
                  <Sparkles size={14} className="animate-pulse" />
                  Upgrade to Premium ($15/mo)
                </button>
              ) : (
                <div className="flex items-center gap-1 bg-emerald-500/10 text-emerald-500 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-500/20">
                  👑 Premium Subscription Active
                </div>
              )}
            </div>

            {/* Feature comparison grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Free plan details */}
              <div className="bg-white dark:bg-slate-900 border border-border rounded-xl p-6 space-y-4">
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 text-outfit">
                  Basic (Free) Plan
                </h3>
                <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">
                  $0 <span className="text-xs text-muted-foreground font-normal">/ month</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Perfect for individual brainstormers starting their collaboration journey.
                </div>
                <div className="h-px bg-border/60" />
                <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                  <li>✅ Up to 3 active boards</li>
                  <li>✅ Real-time multi-user cursor syncing</li>
                  <li>✅ Sticky Notes, Rich Text, UML elements</li>
                  <li>❌ AI Copilot board assistants</li>
                  <li>❌ WebRTC real-time voice call rooms</li>
                  <li>❌ Viewport-following presentation mode</li>
                </ul>
              </div>

              {/* Premium plan details */}
              <div className="bg-white dark:bg-slate-900 border border-violet-500/30 rounded-xl p-6 space-y-4 relative overflow-hidden">
                {/* Popular badge */}
                <div className="absolute top-3 right-3 text-[8px] font-bold uppercase tracking-wider bg-violet-600 text-white px-2 py-0.5 rounded-full">
                  Recommended
                </div>

                <h3 className="font-bold text-sm text-violet-600 dark:text-violet-400 text-outfit">
                  Pro SaaS Tier
                </h3>
                <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">
                  $15 <span className="text-xs text-muted-foreground font-normal">/ month</span>
                </div>
                <div className="text-xs text-muted-foreground font-medium">
                  The absolute collaborative workstation for enterprise architects, startups, and agile teams.
                </div>
                <div className="h-px bg-border/60" />
                <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-450 font-medium">
                  <li className="text-slate-800 dark:text-slate-200 font-semibold">⭐ Unlimited collaboration boards</li>
                  <li className="text-slate-800 dark:text-slate-200 font-semibold">⭐ AI Copilot context-aware assistants</li>
                  <li className="text-slate-800 dark:text-slate-200 font-semibold">⭐ High fidelity WebRTC voice rooms</li>
                  <li className="text-slate-800 dark:text-slate-200 font-semibold">⭐ Real-time Presentation spotlight mode</li>
                  <li className="text-slate-800 dark:text-slate-200 font-semibold">⭐ PDF & High Res SVG file attachments</li>
                  <li className="text-slate-800 dark:text-slate-200 font-semibold">⭐ Complete version snapshot restores</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Create Board Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-card rounded-xl border border-border p-6 shadow-2xl space-y-4">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 text-outfit">
              Create New Board
            </h2>
            
            <form onSubmit={handleCreateBoard} className="space-y-4">
              {error && <div className="text-xs text-red-500">{error}</div>}

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Board Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Brainstorming session"
                  className="w-full px-3 py-2 border border-border bg-background rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe board contents (optional)"
                  rows={3}
                  className="w-full px-3 py-2 border border-border bg-background rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Visibility
                </label>
                <select
                  value={visibility}
                  onChange={(e: any) => setVisibility(e.target.value)}
                  className="w-full px-3 py-2 border border-border bg-background rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="PRIVATE">Private (Only Collaborators)</option>
                  <option value="PUBLIC">Public (Anyone can view)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-border hover:bg-muted text-xs font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/95 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {actionLoading && <Loader2 size={13} className="animate-spin" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
