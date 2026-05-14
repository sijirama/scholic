import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="theme-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`
          @keyframes pulse { 0% { opacity: 0.3; } 50% { opacity: 0.5; } 100% { opacity: 0.3; } }
          .pulse-bg { animation: pulse 2s infinite; width: 100%; height: 100%; }
        `}</style>
        <div className="pulse-bg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" />;
  }

  if (!user.onboarded && window.location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
