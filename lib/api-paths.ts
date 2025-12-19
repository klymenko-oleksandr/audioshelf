/**
 * API Endpoint Paths
 * Centralized constants for all API endpoints
 */

// Public API endpoints
export const API_PATHS = {
  // Books
  books: {
    list: '/api/books',
    byId: (id: string) => `/api/books/${id}`,
    playUrl: (id: string) => `/api/books/${id}/play-url`,
    progress: (id: string) => `/api/books/${id}/progress`,
  },
} as const;

// Admin API endpoints
export const ADMIN_API_PATHS = {
  // Auth
  auth: '/api/admin/auth',
  logout: '/api/admin/logout',
  
  // Books management
  books: {
    list: '/api/admin/books',
    byId: (id: string) => `/api/admin/books/${id}`,
  },
  
  // Upload
  uploadUrl: '/api/admin/upload-url',
} as const;
