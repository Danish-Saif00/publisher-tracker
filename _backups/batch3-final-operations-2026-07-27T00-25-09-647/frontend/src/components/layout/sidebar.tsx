import { NavLink } from 'react-router';

import { useAuth } from '../../features/auth/use-auth';
import { canViewNavigationItem, navigationGroups } from '../../routes/navigation';
import { BrandMark } from '../brand/brand-mark';
import { MaterialIcon } from '../icons/material-icon';

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function Sidebar({ open, onClose }: SidebarProps) {
  const auth = useAuth();
  const platformRole = auth.identity?.authorization.platformRole ?? null;
  const membership = auth.identity?.authorization.companyMembership ?? null;
  const companyRole = membership?.role ?? null;
  const membershipStatus = membership?.status ?? null;
  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        canViewNavigationItem(
          item.audience,
          platformRole,
          companyRole,
          membershipStatus,
        ),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <button
        aria-label="Close navigation"
        className={`sidebar-backdrop ${open ? 'sidebar-backdrop--visible' : ''}`}
        onClick={onClose}
        type="button"
      />

      <aside className={`app-sidebar glass-panel ${open ? 'app-sidebar--open' : ''}`}>
        <div className="app-sidebar__brand">
          <BrandMark />
          <button
            aria-label="Close navigation"
            className="icon-button app-sidebar__close"
            onClick={onClose}
            type="button"
          >
            <MaterialIcon name="close" />
          </button>
        </div>

        <nav className="app-sidebar__navigation" aria-label="Primary navigation">
          {visibleGroups.map((group) => (
            <div className="navigation-group" key={group.label}>
              <span className="navigation-group__label">{group.label}</span>
              <div className="navigation-group__items">
                {group.items.map((item) => (
                  <NavLink
                    className={({ isActive }) =>
                      `navigation-link ${isActive ? 'navigation-link--active' : ''}`
                    }
                    key={item.path}
                    onClick={onClose}
                    to={item.path}
                  >
                    <MaterialIcon name={item.icon} />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="app-sidebar__footer">
          <NavLink
            className={({ isActive }) =>
              `navigation-link ${isActive ? 'navigation-link--active' : ''}`
            }
            onClick={onClose}
            to="/settings"
          >
            <MaterialIcon name="tune" />
            <span>Customize</span>
          </NavLink>
        </div>
      </aside>
    </>
  );
}
