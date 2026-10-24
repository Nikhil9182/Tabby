import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { PageSkeleton } from './loading-skeleton';

export function ProtectedRoute() {
  const { isAuthenticated, isGuest, isLoading } = useAuth();

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (!isAuthenticated && !isGuest) {
    return <Navigate to="/welcome" replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
