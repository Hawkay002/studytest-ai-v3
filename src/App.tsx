import { Route, Switch } from 'wouter';
import { AnimatePresence } from 'motion/react';

import { ApiKeyProvider } from '@/context/ApiKeyContext';
import { AppProvider } from '@/context/AppContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ApiKeyModalProvider } from '@/components/common/ApiKeyModal';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Toaster } from '@/components/ui/sonner';

import { LandingPage } from '@/pages/LandingPage';
import { AppPage } from '@/pages/AppPage';
import { TestDetailPage } from '@/pages/TestDetailPage';
import { TestPage } from '@/pages/TestPage';
import { ResultsPage } from '@/pages/ResultsPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { MyTestsPage } from '@/pages/MyTestsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export default function App() {
  return (
    <ThemeProvider>
      <ApiKeyProvider>
        <ApiKeyModalProvider>
          <AppProvider>
            <div className="flex min-h-screen flex-col">
              <Navbar />
              <main className="flex-1">
                <AnimatePresence mode="wait">
                  <Switch>
                    <Route path="/" component={LandingPage} />
                    <Route path="/app" component={AppPage} />
                    <Route path="/test/:id" component={TestDetailPage} />
                    <Route path="/test/:id/take" component={TestPage} />
                    <Route path="/results/:id" component={ResultsPage} />
                    <Route path="/history" component={HistoryPage} />
                    <Route path="/my-tests" component={MyTestsPage} />
                    <Route component={NotFoundPage} />
                  </Switch>
                </AnimatePresence>
              </main>
              <Footer />
            </div>
            <Toaster />
          </AppProvider>
        </ApiKeyModalProvider>
      </ApiKeyProvider>
    </ThemeProvider>
  );
}
