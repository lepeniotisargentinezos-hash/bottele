export interface PerformanceStats {
  projectId: string;
  projectName: string;
  url: string | null;
  samples: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
}

export interface UptimeStats {
  projectId: string;
  projectName: string;
  totalChecks: number;
  successfulChecks: number;
  uptimePercent: number;
  totalDowntimeMs: number;
}

export interface UptimeCheckResult {
  url: string;
  success: boolean;
  statusCode: number | null;
  responseTimeMs: number;
  errorType: 'HTTP_ERROR' | 'TIMEOUT' | 'DNS_ERROR' | 'NETWORK_ERROR' | 'CONTENT_MISMATCH' | null;
  reason: string | null;
}

/** Configuração de monitoramento por projeto (persistida em settings). */
export interface ProjectCheckConfig {
  /** Texto que deve estar presente no corpo da home (detecta erros "silenciosos"). */
  expectedText?: string;
  /** URLs extras para monitorar além da home (ex.: /api/health). */
  extraUrls: string[];
}

export interface AccountOverview {
  totalProjects: number;
  activeProjects: number;
  openIncidents: number;
  deploysLast24h: number;
  failedDeploysLast24h: number;
  uptimePercent24h: number;
  lastSyncAt: Date | null;
}

export interface DailyReportData {
  date: Date;
  monitoredProjects: number;
  deploys: number;
  deploysPrev: number;
  failedDeploys: number;
  failedDeploysPrev: number;
  uptimePercent: number;
  uptimePercentPrev: number;
  openIncidents: Array<{ name: string; reason: string }>;
  slowestProject: { name: string; p95Ms: number } | null;
  sslExpiring: Array<{ project: string; daysRemaining: number }>;
}

export interface WeeklyReportData {
  weekStart: Date;
  weekEnd: Date;
  deploys: number;
  failedDeploys: number;
  incidents: number;
  totalDowntimeMs: number;
  uptimePercent: number;
}

export interface AlertSettings {
  chatId: string;
  deployFailures: boolean;
  deploySuccess: boolean;
  downtime: boolean;
  performance: boolean;
  newProjects: boolean;
  latencyThresholdMs: number;
  p95ThresholdMs: number;
  p99ThresholdMs: number;
}

export interface JobStatus {
  name: string;
  schedule: string;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  running: boolean;
  runs: number;
  failures: number;
}
