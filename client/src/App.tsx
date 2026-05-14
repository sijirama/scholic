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
import Discover from './pages/Discover';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import DocumentPage from './pages/DocumentPage';
import AnnotationPage from './pages/AnnotationPage';
import SitePage from './pages/SitePage';
import SearchPage from './pages/Search';
import Privacy from './pages/Privacy';
import Notifications from './pages/Notifications';
import { Toaster } from 'sonner';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';

function AppShell() {
  const { theme } = useTheme();

  return (
    <AuthProvider>
      <Toaster theme={theme} position="bottom-right" richColors />
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
              <Route path="document/:id" element={<DocumentPage />} />
              <Route path="page" element={<SitePage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="privacy" element={<Privacy />} />
              <Route
                path="onboarding"
                element={
                  <ProtectedRoute>
                    <Onboarding />
                  </ProtectedRoute>
                }
              />
              <Route
                path="feed"
                element={
                  <ProtectedRoute>
                    <Feed />
                  </ProtectedRoute>
                }
              />
              <Route path="discover" element={<Discover />} />
              <Route
                path="settings"
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="notifications"
                element={
                  <ProtectedRoute>
                    <Notifications />
                  </ProtectedRoute>
                }
              />
            </Route>
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

export default App;
