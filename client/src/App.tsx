import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import AuthRedirect from './components/AuthRedirect';
import Landing from './pages/Landing';
import Onboarding from './pages/Onboarding';
import ExtensionLogin from './pages/ExtensionLogin';
import Feed from './pages/Feed';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import AnnotationPage from './pages/AnnotationPage';
import SitePage from './pages/SitePage';
import SearchPage from './pages/Search';
import Privacy from './pages/Privacy';
import { Toaster } from 'sonner';

function App() {
  return (
    <AuthProvider>
      <Toaster theme="dark" position="bottom-right" richColors />
      <BrowserRouter>
      <ErrorBoundary>
         <Routes>
          <Route path="/" element={<Layout />}>
            <Route element={<AuthRedirect />}>
              <Route index element={<Landing />} />
            </Route>
            <Route path="auth/extension-login" element={<ExtensionLogin />} />
            <Route path="u/:username" element={<Profile />} />
            <Route path="annotation/:id" element={<AnnotationPage />} />
            <Route path="page" element={<SitePage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="onboarding" element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            } />
            <Route path="feed" element={
              <ProtectedRoute>
                <Feed />
              </ProtectedRoute>
            } />
            <Route path="settings" element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            } />
          </Route>
        </Routes>
      </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
