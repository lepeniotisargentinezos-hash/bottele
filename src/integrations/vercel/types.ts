export interface VercelPagination {
  count: number;
  next: number | null;
  prev: number | null;
}

export interface VercelProjectTarget {
  alias?: string[];
  readyState?: string;
}

export interface VercelProject {
  id: string;
  name: string;
  framework: string | null;
  createdAt: number;
  updatedAt: number;
  targets?: {
    production?: VercelProjectTarget;
  };
  latestDeployments?: Array<{
    alias?: string[];
    readyState?: string;
  }>;
}

export interface VercelProjectsResponse {
  projects: VercelProject[];
  pagination: VercelPagination;
}

export type VercelDeploymentState =
  | 'QUEUED'
  | 'BUILDING'
  | 'INITIALIZING'
  | 'READY'
  | 'ERROR'
  | 'CANCELED';

export interface VercelDeploymentMeta {
  githubCommitRef?: string;
  githubCommitSha?: string;
  githubCommitMessage?: string;
  githubCommitAuthorName?: string;
  githubCommitAuthorLogin?: string;
  gitlabCommitRef?: string;
  gitlabCommitSha?: string;
  gitlabCommitMessage?: string;
  gitlabCommitAuthorName?: string;
  [key: string]: string | undefined;
}

export interface VercelDeployment {
  uid: string;
  name: string;
  url: string | null;
  state?: VercelDeploymentState;
  readyState?: VercelDeploymentState;
  target?: 'production' | 'staging' | null;
  created: number;
  ready?: number;
  meta?: VercelDeploymentMeta;
  errorMessage?: string | null;
}

export interface VercelDeploymentsResponse {
  deployments: VercelDeployment[];
  pagination: VercelPagination;
}

export interface VercelDeploymentEvent {
  type: string;
  created: number;
  payload?: {
    text?: string;
    [key: string]: unknown;
  };
}

export interface VercelDomain {
  name: string;
  verified: boolean;
}

export interface VercelDomainsResponse {
  domains: VercelDomain[];
  pagination?: VercelPagination;
}

export interface VercelAnalyticsTimeseriesPoint {
  key?: string;
  total?: number;
  devices?: number;
}

export interface VercelWebAnalyticsStats {
  visitors: number;
  uniqueVisitors: number;
  pageViews: number;
  topPages: Array<{ page: string; views: number }>;
  countries: Array<{ country: string; visitors: number }>;
  devices: Array<{ device: string; visitors: number }>;
}
