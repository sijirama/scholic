import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Something went wrong.' };
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: '16px',
          color: '#fff',
          fontFamily: '"Inter", sans-serif',
        }}>
          <p style={{ fontSize: '14px', color: '#888', margin: 0 }}>
            {this.state.message}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '8px 20px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'rgba(110,183,129,0.15)',
              color: '#6EB781',
              border: '1px solid rgba(110,183,129,0.3)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
