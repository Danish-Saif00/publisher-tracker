import { useState } from 'react';
import { Outlet } from 'react-router';

import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export function AppShell() {
  const [navigationOpen, setNavigationOpen] = useState(false);

  return (
    <div className="app-shell">
      <div className="ambient-orb ambient-orb--violet" />
      <div className="ambient-orb ambient-orb--blue" />

      <Sidebar open={navigationOpen} onClose={() => setNavigationOpen(false)} />
      <Topbar onOpenNavigation={() => setNavigationOpen(true)} />

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
