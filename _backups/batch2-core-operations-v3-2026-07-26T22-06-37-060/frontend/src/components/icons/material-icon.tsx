// publisher_tracker_batch1_svg_icons_v1
import type { CSSProperties, ReactNode } from 'react';

type MaterialIconProps = {
  name: string;
  className?: string;
  filled?: boolean;
  title?: string;
};

type IconGlyph =
  | 'activity'
  | 'archive'
  | 'arrow-back'
  | 'arrows'
  | 'at'
  | 'bell'
  | 'bolt'
  | 'box'
  | 'building'
  | 'building-plus'
  | 'calendar'
  | 'camera'
  | 'card'
  | 'chart'
  | 'chat'
  | 'check'
  | 'chevron-down'
  | 'close'
  | 'copy'
  | 'cursor'
  | 'edit'
  | 'error'
  | 'eye'
  | 'file'
  | 'filter'
  | 'globe'
  | 'info'
  | 'key'
  | 'link'
  | 'lock'
  | 'login'
  | 'logout'
  | 'mail'
  | 'menu'
  | 'network'
  | 'pause'
  | 'play'
  | 'plus'
  | 'refresh'
  | 'save'
  | 'search'
  | 'send'
  | 'server'
  | 'settings'
  | 'shield'
  | 'spinner'
  | 'star'
  | 'table'
  | 'tag'
  | 'tools'
  | 'trash'
  | 'unlock'
  | 'user'
  | 'user-check'
  | 'user-plus'
  | 'users'
  | 'wallet';

const iconAliases: Record<string, IconGlyph> = {
  account_balance_wallet: 'wallet',
  admin_panel_settings: 'shield',
  account_tree: 'network',
  add: 'plus',
  add_business: 'building-plus',
  add_card: 'card',
  add_circle: 'plus',
  add_link: 'link',
  add_moderator: 'shield',
  ads_click: 'cursor',
  alternate_email: 'at',
  analytics: 'chart',
  apartment: 'building',
  archive: 'archive',
  arrow_back: 'arrow-back',
  assignment_turned_in: 'check',
  bolt: 'bolt',
  business: 'building',
  cancel: 'close',
  chat_bubble: 'chat',
  check: 'check',
  check_circle: 'check',
  close: 'close',
  cloud_off: 'error',
  construction: 'tools',
  content_copy: 'copy',
  dashboard: 'chart',
  delete: 'trash',
  dns: 'server',
  domain: 'building',
  domain_add: 'building-plus',
  domain_disabled: 'error',
  edit: 'edit',
  encrypted: 'lock',
  error: 'error',
  expand_more: 'chevron-down',
  file_copy: 'copy',
  filter_alt: 'filter',
  forward_to_inbox: 'mail',
  gpp_bad: 'shield',
  group: 'users',
  group_off: 'users',
  history: 'calendar',
  history_toggle_off: 'calendar',
  how_to_reg: 'user-check',
  hub: 'network',
  info: 'info',
  inventory_2: 'box',
  key: 'key',
  language: 'globe',
  link: 'link',
  link_off: 'link',
  local_offer: 'tag',
  lock: 'lock',
  lock_open: 'unlock',
  lock_reset: 'key',
  login: 'login',
  logout: 'logout',
  mail: 'mail',
  manage_accounts: 'user',
  mark_email_read: 'mail',
  menu: 'menu',
  monitor_heart: 'activity',
  notifications: 'bell',
  outgoing_mail: 'send',
  pause_circle: 'pause',
  payments: 'card',
  person: 'user',
  person_add: 'user-plus',
  person_check: 'user-check',
  person_off: 'user',
  photo_camera: 'camera',
  play_circle: 'play',
  policy: 'shield',
  progress_activity: 'spinner',
  public: 'globe',
  query_stats: 'chart',
  refresh: 'refresh',
  save: 'save',
  schedule: 'calendar',
  search: 'search',
  security: 'shield',
  sell: 'tag',
  send: 'send',
  shield: 'shield',
  shield_lock: 'shield',
  shield_person: 'shield',
  star: 'star',
  sync_alt: 'arrows',
  table_rows: 'table',
  text_snippet: 'file',
  tune: 'settings',
  update: 'refresh',
  verified: 'check',
  verified_user: 'shield',
  visibility: 'eye',
  vpn_lock: 'shield',
  webhook: 'network',
  workspace_premium: 'star',
};

function IconDrawing({ glyph }: { glyph: IconGlyph }): ReactNode {
  switch (glyph) {
    case 'activity':
      return <path d="M3 12h4l2.2-5 4.1 10 2.2-5H21" />;
    case 'archive':
      return <><path d="M4 7h16" /><path d="M5 7l1 13h12l1-13" /><path d="M3 4h18v3H3z" /><path d="M9 11h6" /></>;
    case 'arrow-back':
      return <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>;
    case 'arrows':
      return <><path d="M7 7h11l-3-3" /><path d="m18 7-3 3" /><path d="M17 17H6l3 3" /><path d="m6 17 3-3" /></>;
    case 'at':
      return <><circle cx="12" cy="12" r="8" /><path d="M16 12v-1a4 4 0 1 0-1.2 2.9c.8.8 2.2.6 2.8-.2" /></>;
    case 'bell':
      return <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8" /><path d="M10 21h4" /></>;
    case 'bolt':
      return <path d="m13 2-8 12h6l-1 8 9-13h-6z" />;
    case 'box':
      return <><path d="m4 7 8-4 8 4-8 4z" /><path d="M4 7v10l8 4 8-4V7" /><path d="M12 11v10" /></>;
    case 'building':
      return <><path d="M4 21V5l8-3 8 3v16" /><path d="M2 21h20" /><path d="M8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2" /></>;
    case 'building-plus':
      return <><path d="M3 21V6l7-3 7 3v6" /><path d="M1 21h13" /><path d="M7 8h2M7 12h2M7 16h2" /><path d="M18 14v7M14.5 17.5h7" /></>;
    case 'calendar':
      return <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>;
    case 'camera':
      return <><path d="M4 7h4l2-2h4l2 2h4v12H4z" /><circle cx="12" cy="13" r="3.5" /></>;
    case 'card':
      return <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>;
    case 'chart':
      return <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M7 16v-4M12 16V8M17 16v-7" /></>;
    case 'chat':
      return <path d="M4 4h16v12H8l-4 4z" />;
    case 'check':
      return <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.6 2.6L16.5 9" /></>;
    case 'chevron-down':
      return <path d="m7 9 5 5 5-5" />;
    case 'close':
      return <><path d="M6 6l12 12M18 6 6 18" /></>;
    case 'copy':
      return <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>;
    case 'cursor':
      return <><path d="m5 3 13 8-6 2-3 6z" /><path d="m13 14 4 5" /></>;
    case 'edit':
      return <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>;
    case 'error':
      return <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 17h.01" /></>;
    case 'eye':
      return <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6" /><circle cx="12" cy="12" r="2.5" /></>;
    case 'file':
      return <><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5M9 12h6M9 16h6" /></>;
    case 'filter':
      return <path d="M3 5h18l-7 8v5l-4 2v-7z" />;
    case 'globe':
      return <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></>;
    case 'info':
      return <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>;
    case 'key':
      return <><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8M15 8l3 3M17 6l2 2" /></>;
    case 'link':
      return <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" /></>;
    case 'lock':
      return <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>;
    case 'login':
      return <><path d="M10 4H5v16h5" /><path d="M13 8l4 4-4 4M17 12H8" /></>;
    case 'logout':
      return <><path d="M14 4h5v16h-5" /><path d="m11 8-4 4 4 4M7 12h9" /></>;
    case 'mail':
      return <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>;
    case 'menu':
      return <><path d="M4 7h16M4 12h16M4 17h16" /></>;
    case 'network':
      return <><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="7" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="m8 7 7.5-.5M7.5 8l3.2 7.5M16.5 9l-3 6.5" /></>;
    case 'pause':
      return <><circle cx="12" cy="12" r="9" /><path d="M10 9v6M14 9v6" /></>;
    case 'play':
      return <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4z" /></>;
    case 'plus':
      return <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>;
    case 'refresh':
      return <><path d="M20 6v5h-5" /><path d="M19 11a8 8 0 1 0 1 5" /></>;
    case 'save':
      return <><path d="M5 3h12l3 3v15H4V3z" /><path d="M8 3v6h8V3M8 21v-7h8v7" /></>;
    case 'search':
      return <><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></>;
    case 'send':
      return <path d="m3 11 18-8-8 18-2-7zM11 14l10-11" />;
    case 'server':
      return <><rect x="3" y="3" width="18" height="7" rx="2" /><rect x="3" y="14" width="18" height="7" rx="2" /><path d="M7 6h.01M7 17h.01M11 6h6M11 17h6" /></>;
    case 'settings':
      return <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></>;
    case 'shield':
      return <><path d="m12 2 8 3v6c0 5-3.3 8.5-8 11-4.7-2.5-8-6-8-11V5z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>;
    case 'spinner':
      return <><circle cx="12" cy="12" r="9" opacity=".25" /><path d="M12 3a9 9 0 0 1 9 9" /></>;
    case 'star':
      return <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" />;
    case 'table':
      return <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v16M15 4v16" /></>;
    case 'tag':
      return <><path d="M3 12V4h8l10 10-7 7z" /><circle cx="8" cy="8" r="1" /></>;
    case 'tools':
      return <><path d="m14 6 4-4 4 4-4 4" /><path d="M16 8 4 20M6 4l14 14M4 2l4 4-3 3-4-4z" /></>;
    case 'trash':
      return <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" /></>;
    case 'unlock':
      return <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M9 10V7a4 4 0 0 1 7-2.6" /></>;
    case 'user':
      return <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>;
    case 'user-check':
      return <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 12-5" /><path d="m15 18 2 2 4-5" /></>;
    case 'user-plus':
      return <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" /></>;
    case 'users':
      return <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0" /><path d="M16 5a4 4 0 0 1 0 7M17 15a6 6 0 0 1 5 6" /></>;
    case 'wallet':
      return <><path d="M4 6h14a2 2 0 0 1 2 2v12H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h13" /><path d="M15 12h5v5h-5a2.5 2.5 0 0 1 0-5" /></>;
  }
}

export function MaterialIcon({
  name,
  className,
  filled = false,
  title,
}: MaterialIconProps) {
  const glyph = iconAliases[name] ?? 'info';
  const style = {
    '--material-fill': filled ? 1 : 0,
  } as CSSProperties;

  return (
    <svg
      aria-hidden={title === undefined}
      aria-label={title}
      className={`app-icon material-symbols-outlined ${className ?? ''}`.trim()}
      fill="none"
      focusable="false"
      role={title === undefined ? undefined : 'img'}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={filled ? 2.2 : 1.9}
      style={style}
      viewBox="0 0 24 24"
    >
      {title === undefined ? null : <title>{title}</title>}
      <IconDrawing glyph={glyph} />
    </svg>
  );
}