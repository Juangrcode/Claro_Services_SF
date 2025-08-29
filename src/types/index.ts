// Service Types
export type ServiceType = 'REST' | 'SOAP';

// Environment Types
export type EnvironmentType = 'DEV' | 'QA' | 'SIT' | 'UAT' | 'PROD';

// Base Service Interface
export interface BaseService {
  id: string;
  name: string;
  type: ServiceType;
  enabled?: boolean; // Validate if service need consult or not
  url?: string; // URL complete
  baseUrl?: string; // Domain/URL base
  path?: string; // Path to service
  urlEnvVar?: string; // Environment variable for URL complete
  baseUrlEnvVar?: string; // Environment variable for domain/URL base
  environmentUrls?: Partial<Record<EnvironmentType, string>>; // Specific URLs by environment (can be partial)
  headers?: Record<string, string>;
  headerEnvVars?: Record<string, string | string[]>; // Environment variables for headers (string or array of strings)
  expectedContent?: string; // Expected content in response
  environment?: EnvironmentType; // Environment where service is deployed
}

// REST Service Interface
export interface RestService extends BaseService {
  type: 'REST';
  method: string;
  body?: Record<string, any>;
  expectedStatus?: number;
  timeout?: number;
}

// SOAP Service Interface
export interface SoapService extends BaseService {
  type: 'SOAP';
  method: string;
  args?: Record<string, any>;
  options?: Record<string, any>;
  xmlBody?: string; // Custom XML body for SOAP requests
  soapAction?: string; // SOAPAction header value
}

// Service Result Interface
export interface ServiceResult {
  id: string;
  name: string;
  type: ServiceType;
  url?: string;
  status: 'success' | 'failed';
  responseTime: string;
  statusCode?: number | string;
  timestamp: string;
  details: string;
  response?: any; // Respuesta completa del servicio
}

// Check Results Interface
export interface CheckResults {
  timestamp: string;
  environment: EnvironmentType;
  services: ServiceResult[];
  summary: {
    total: number;
    success: number;
    failed: number;
  };
}