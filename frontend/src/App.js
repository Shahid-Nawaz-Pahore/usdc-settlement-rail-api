import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import SubmitForm from './components/SubmitForm';
import BalanceCard from './components/BalanceCard';
import ReconciliationPanel from './components/ReconciliationPanel';
import SettlementsTable from './components/SettlementsTable';

const POLL_MS = 4000;

function App() {
  const [settlements, setSettlements] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backendUp, setBackendUp] = useState(true);
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [list, bal] = await Promise.all([
        api.listSettlements(),
        api.getBalance(),
      ]);
      setSettlements(list);
      setBalance(bal);
      setBackendUp(true);
    } catch {
      setBackendUp(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer.current);
  }, [refresh]);

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <Header backendUp={backendUp} />

        {!backendUp && (
          <div className="mb-6 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            Cannot reach the API at <code>http://localhost:3000</code>. Start the
            backend with <code>npm run start:dev</code>.
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <SubmitForm onSubmitted={refresh} />
          </div>

          <div className="space-y-6 lg:col-span-2">
            <div className="grid gap-6 sm:grid-cols-2">
              <BalanceCard balance={balance} loading={loading} />
              <ReconciliationPanel />
            </div>
            <SettlementsTable settlements={settlements} loading={loading} />
          </div>
        </div>

        <footer className="mt-10 text-center text-xs text-slate-600">
          settlement-rail · Ethereum Sepolia · auto-refresh every{' '}
          {POLL_MS / 1000}s
        </footer>
      </div>
    </div>
  );
}

function Header({ backendUp }) {
  return (
    <header className="mb-8 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Settlement Rail
        </h1>
        <p className="text-sm text-slate-400">
          USDC clearing-to-chain · operator dashboard
        </p>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-ink-700 bg-ink-800/60 px-3 py-1.5">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            backendUp ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
          }`}
        />
        <span className="text-xs text-slate-300">
          {backendUp ? 'API connected' : 'API offline'}
        </span>
      </div>
    </header>
  );
}

export default App;
