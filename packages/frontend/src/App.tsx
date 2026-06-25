import { Component, type ReactNode } from "react";
import { Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { ThemeProvider } from "./hooks/useTheme";
import { I18nProvider } from "./i18n";
import { GlobalConfirm } from "./components/ui/GlobalConfirm";
import { ChatPage } from "./pages/ChatPage";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("App crashed:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: "red", fontFamily: "monospace" }}>
          <h1>Error: {this.state.error.message}</h1>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 20, fontSize: 13 }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <ThemeProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                fontSize: "13px",
                fontFamily: "inherit",
              },
            }}
          />
          <GlobalConfirm />
          <Routes>
            <Route path="/" element={<ChatPage />} />
            <Route path="/chat/:sessionId" element={<ChatPage />} />
          </Routes>
        </ThemeProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
