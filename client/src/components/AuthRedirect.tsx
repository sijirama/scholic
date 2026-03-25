import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, Outlet } from 'react-router-dom';

const AuthRedirect: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (user) {
    if (!user.onboarded) {
      return <Navigate to="/onboarding" />;
    }
    return <Navigate to="/feed" />;
  }

  return <Outlet />;
};

export default AuthRedirect;
