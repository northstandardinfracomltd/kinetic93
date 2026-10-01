// @ts-nocheck
import React from 'react';

interface Props {
  children: React.ReactNode;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  public componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-xl mx-auto my-8 bg-white border border-gray-200 rounded-2xl shadow-sm text-center font-sans">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 mx-auto flex items-center justify-center text-2xl font-bold mb-4">
            ⚠️
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            {this.props.fallbackMessage || "Une erreur est survenue lors de l'affichage de cette section."}
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            Les données sont préservées. Vous pouvez actualiser la vue ou revenir à l'accueil.
          </p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-5 py-2.5 rounded-xl font-semibold text-white bg-black hover:bg-gray-800 transition-all cursor-pointer text-sm"
            >
              Réessayer
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all cursor-pointer text-sm"
            >
              Actualiser la page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
