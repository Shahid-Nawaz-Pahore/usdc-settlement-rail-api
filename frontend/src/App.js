import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import SubmitForm from './components/SubmitForm';
import ReconciliationPanel from './components/ReconciliationPanel';
import SettlementsTable from './components/SettlementsTable';
import SettlementDrawer from './components/SettlementDrawer';
import StatCard from './components/StatCard';
import { WalletIcon, LayersIcon, HourglassIcon, BoltIcon } from './components/icons';
import { usdc } from './lib/format';

const POLL_MS = 4000;
const IN_FLIGHT = new Set(['RECEIVED', 'COMPLIANCE_APPROVED', 'SUBMITTED', 'CONFIRMED']);

function App() {
  const [settlements, setSettlements] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backendUp, setBackendUp] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
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

  const inFlightCount = settlements.filter((s) => IN_FLIGHT.has(s.status)).length;
  const finalCount = settlements.filter((s) => s.status === 'FINAL').length;
  // Derive from the live list so the drawer summary updates as status changes.
  const selected = settlements.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <Header backendUp={backendUp} />

        {!backendUp && (
          <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            Cannot reach the API at <code>http://localhost:3000</code>. Start the
            backend with <code>npm run start:dev</code>.
          </div>
        )}

        {/* KPI strip */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Available"
            value={usdc(balance?.availableBalance)}
            sub="operator − in-flight"
            icon={WalletIcon}
            accent="emerald"
            loading={loading}
          />
          <StatCard
            label="Operator balance"
            value={usdc(balance?.operatorBalance)}
            sub={`${finalCount} finalized`}
            icon={LayersIcon}
            accent="brand"
            loading={loading}
          />
          <StatCard
            label="In-flight"
            value={usdc(balance?.inFlightAmount)}
            sub={`${inFlightCount} settlement${inFlightCount === 1 ? '' : 's'}`}
            icon={HourglassIcon}
            accent="amber"
            loading={loading}
          />
          <ReconciliationPanel />
        </div>

        {/* Main grid */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-6">
              <SubmitForm onSubmitted={refresh} />
            </div>
          </div>
          <div className="lg:col-span-8">
            <SettlementsTable
              settlements={settlements}
              loading={loading}
              onSelect={(s) => setSelectedId(s.id)}
            />
          </div>
        </div>

        <SettlementDrawer
          settlement={selected}
          onClose={() => setSelectedId(null)}
        />

        <footer className="mt-10 flex flex-col items-center gap-1 text-center text-xs text-slate-600">
          <span>settlement-rail · USDC clearing-to-chain on Ethereum Sepolia</span>
          <span>auto-refresh every {POLL_MS / 1000}s</span>
        </footer>
      </div>
    </div>
  );
}

function Header({ backendUp }) {
  return (
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white shadow-lg shadow-brand-500/30">
          <BoltIcon width={22} height={22} />
        </span>
        <div>
          <h1 className="bg-gradient-to-r from-white to-slate-400 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
            Settlement Rail
          </h1>
          <p className="text-sm text-slate-400">
            USDC clearing-to-chain · operator dashboard
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">
          <span className="h-2 w-2 rounded-full bg-brand-400" />
          Ethereum Sepolia
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              backendUp ? 'animate-pulse bg-emerald-400' : 'bg-rose-500'
            }`}
          />
          {backendUp ? 'API connected' : 'API offline'}
        </span>
      </div>
    </header>
  );
}

export default App;
