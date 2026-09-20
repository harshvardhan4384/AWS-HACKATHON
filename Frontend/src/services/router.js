/**
 * Re:COVER Lightweight Browser History & Route Synchronizer
 * 
 * Provides bidirectional synchronization between application tabs,
 * selected incident IDs, and browser URL / HTML5 History API.
 */

export const TAB_ROUTES = {
  LANDING: 'landing',
  DASHBOARD: 'dashboard',
  INCIDENTS: 'incidents',
  INVESTIGATION: 'investigation',
  BLAST_RADIUS: 'blast-radius',
  RECOVERY: 'recovery',
  TELEMETRY: 'telemetry',
  ACCOUNTS: 'accounts',
  PROTOTYPE: 'prototype',
  PROFILE: 'profile'
};

export const PROTECTED_TABS = new Set([
  TAB_ROUTES.DASHBOARD,
  TAB_ROUTES.INCIDENTS,
  TAB_ROUTES.INVESTIGATION,
  TAB_ROUTES.BLAST_RADIUS,
  TAB_ROUTES.RECOVERY,
  TAB_ROUTES.TELEMETRY,
  TAB_ROUTES.ACCOUNTS,
  TAB_ROUTES.PROFILE
]);

/**
 * Parses the current window location pathname and query string
 * into a structured route representation.
 */
export function parseLocation(loc = (typeof window !== 'undefined' ? window.location : { pathname: '/', search: '' })) {
  const pathname = loc?.pathname || '/';
  const search = loc?.search || '';

  const params = new URLSearchParams(search);
  const queryIncidentId = params.get('incidentId') || params.get('id') || null;

  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  const parts = cleanPath.split('/').filter(Boolean);

  let tab = null;
  let incidentId = queryIncidentId;

  if (cleanPath === '/' || cleanPath === '/landing') {
    tab = TAB_ROUTES.LANDING;
  } else if (cleanPath === '/dashboard') {
    tab = TAB_ROUTES.DASHBOARD;
  } else if (cleanPath === '/accounts' || cleanPath === '/fabrics') {
    tab = TAB_ROUTES.ACCOUNTS;
  } else if (cleanPath === '/telemetry' || cleanPath === '/events') {
    tab = TAB_ROUTES.TELEMETRY;
  } else if (cleanPath === '/blast-radius' || cleanPath === '/graph' || cleanPath === '/topology') {
    tab = TAB_ROUTES.BLAST_RADIUS;
  } else if (cleanPath === '/prototype' || cleanPath === '/sandbox') {
    tab = TAB_ROUTES.PROTOTYPE;
  } else if (cleanPath === '/profile' || cleanPath === '/settings') {
    tab = TAB_ROUTES.PROFILE;
  } else if (parts[0] === 'incidents') {
    if (parts.length >= 3 && parts[2] === 'investigation') {
      tab = TAB_ROUTES.INVESTIGATION;
      incidentId = decodeURIComponent(parts[1]);
    } else if (parts.length >= 3 && parts[2] === 'recovery') {
      tab = TAB_ROUTES.RECOVERY;
      incidentId = decodeURIComponent(parts[1]);
    } else if (parts.length >= 2) {
      tab = TAB_ROUTES.INCIDENTS;
      incidentId = decodeURIComponent(parts[1]);
    } else {
      tab = TAB_ROUTES.INCIDENTS;
    }
  } else if (parts[0] === 'investigation') {
    tab = TAB_ROUTES.INVESTIGATION;
    if (parts.length >= 2) {
      incidentId = decodeURIComponent(parts[1]);
    }
  } else if (parts[0] === 'recovery') {
    tab = TAB_ROUTES.RECOVERY;
    if (parts.length >= 2) {
      incidentId = decodeURIComponent(parts[1]);
    }
  }

  return { tab, incidentId };
}

/**
 * Formats a clean browser URL from a tab and optional incident ID.
 */
export function formatUrl(tab, incidentId = null) {
  switch (tab) {
    case TAB_ROUTES.LANDING:
      return '/';
    case TAB_ROUTES.DASHBOARD:
      return '/dashboard';
    case TAB_ROUTES.ACCOUNTS:
      return '/accounts';
    case TAB_ROUTES.TELEMETRY:
      return '/telemetry';
    case TAB_ROUTES.BLAST_RADIUS:
      return incidentId ? `/blast-radius?id=${encodeURIComponent(incidentId)}` : '/blast-radius';
    case TAB_ROUTES.PROTOTYPE:
      return '/sandbox';
    case TAB_ROUTES.INCIDENTS:
      return incidentId && incidentId !== 'inc-placeholder'
        ? `/incidents/${encodeURIComponent(incidentId)}`
        : '/incidents';
    case TAB_ROUTES.INVESTIGATION:
      return incidentId && incidentId !== 'inc-placeholder'
        ? `/investigation/${encodeURIComponent(incidentId)}`
        : '/investigation';
    case TAB_ROUTES.RECOVERY:
      return incidentId && incidentId !== 'inc-placeholder'
        ? `/recovery/${encodeURIComponent(incidentId)}`
        : '/recovery';
    case TAB_ROUTES.PROFILE:
      return '/profile';
    default:
      return '/dashboard';
  }
}

/**
 * Checks whether a given tab requires an authenticated session.
 */
export function isProtectedTab(tab) {
  return PROTECTED_TABS.has(tab);
}

