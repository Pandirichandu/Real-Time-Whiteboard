import { useAuthStore } from './stores/authStore';
import { useBoardStore } from './stores/boardStore';
import AuthView from './components/auth/AuthView';
import DashboardView from './components/dashboard/DashboardView';
import WhiteboardView from './components/canvas/WhiteboardView';
import { ErrorBoundary } from './components/common/ErrorBoundary';

export default function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { boardId, setBoardId } = useBoardStore();

  if (!isAuthenticated) {
    return <AuthView />;
  }

  if (boardId) {
    return (
      <ErrorBoundary>
        <WhiteboardView boardId={boardId} onClose={() => setBoardId(null)} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <DashboardView
        onSelectBoard={(id) => {
          setBoardId(id);
        }}
      />
    </ErrorBoundary>
  );
}
