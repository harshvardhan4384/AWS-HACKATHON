/**
 * Re:COVER API Client
 * Native fetch wrapper with automatic credentials: 'include',
 * safe JSON parsing, and normalized error handling.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status = 500, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Normalizes backend error responses into safe, user-friendly messages.
 * Prevents leaking database errors, stack traces, or internal paths.
 */
function extractErrorMessage(status, data) {
  if (data && typeof data === 'object') {
    // If validation error with details array
    if (data.error && typeof data.error === 'object' && Array.isArray(data.error.details) && data.error.details.length > 0) {
      const firstDetail = data.error.details[0];
      return firstDetail.message || data.error.message || 'Validation failed';
    }

    if (typeof data.error === 'string') {
      return data.error;
    }

    if (data.error && typeof data.error.message === 'string') {
      return data.error.message;
    }

    if (typeof data.message === 'string') {
      return data.message;
    }
  }

  switch (status) {
    case 400:
      return 'Invalid request data. Please check your inputs.';
    case 401:
      return 'Authentication required. Please log in.';
    case 403:
      return 'Access denied. You do not have permission to perform this action.';
    case 404:
      return 'Requested resource was not found.';
    case 409:
      return 'A conflict occurred. The resource may already exist.';
    case 429:
      return 'Too many requests. Please slow down and try again shortly.';
    case 500:
    case 502:
    case 503:
      return 'Security service temporarily unavailable. Please try again later.';
    default:
      return `Request failed with status ${status}`;
  }
}

/**
 * Serializes query parameters into a URL-encoded string.
 */
function buildQueryString(params) {
  if (!params || typeof params !== 'object') return '';
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }
  const str = searchParams.toString();
  return str ? `?${str}` : '';
}

/**
 * Core request dispatcher using native fetch.
 */
async function request(endpoint, { method = 'GET', body, params, headers = {}, ...customOptions } = {}) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const queryString = buildQueryString(params);
  const url = `${BASE_URL}${cleanEndpoint}${queryString}`;

  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  };

  let serializedBody;
  if (body !== undefined && body !== null) {
    requestHeaders['Content-Type'] = 'application/json';
    serializedBody = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const fetchOptions = {
    method,
    headers: requestHeaders,
    body: serializedBody,
    credentials: 'include', // Essential for HttpOnly session cookie transmission
    ...customOptions,
  };

  let response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (networkErr) {
    throw new ApiError(
      'Unable to connect to security server. Please verify backend is running.',
      0,
      null
    );
  }

  // Parse JSON response safely
  let responseData = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      responseData = await response.json();
    } catch {
      responseData = null;
    }
  } else {
    try {
      const text = await response.text();
      responseData = text ? { raw: text } : null;
    } catch {
      responseData = null;
    }
  }

  if (!response.ok) {
    const status = response.status;
    const safeMessage = extractErrorMessage(status, responseData);
    throw new ApiError(safeMessage, status, responseData);
  }

  return responseData;
}

export const api = {
  get: (endpoint, options) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options) => request(endpoint, { ...options, body, method: 'POST' }),
  put: (endpoint, body, options) => request(endpoint, { ...options, body, method: 'PUT' }),
  delete: (endpoint, options) => request(endpoint, { ...options, method: 'DELETE' }),
};

export default api;

