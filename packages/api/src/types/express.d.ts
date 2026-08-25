import type { UserRole } from '../services/auth';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        type: 'admin' | 'site';
        userId?: string;
        email?: string;
        name?: string;
        isSuperAdmin?: boolean;
        websiteIds?: string[];
        rolesByWebsite?: Record<string, UserRole>;
        websiteId?: string;
        projectId?: string;
        siteKeyId?: string;
      };
    }
  }
}

export {};
