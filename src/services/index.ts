import { checkRestServices } from './rest';
import { checkSoapServices } from './soap';
import { getServiceConfig } from '../config';
import { logger } from '../utils/logger';
import { BaseService, ServiceResult, CheckResults, RestService, SoapService, EnvironmentType } from '../types';

/**
 * Check all services or a specific service by ID
 * @param {string} serviceId - Optional service ID to check
 * @param {EnvironmentType} environment - Optional environment to filter services
 * @param {Record<string, boolean>} disabledServicesList - Optional list of disabled services
 * @returns {Promise<CheckResults>} - Results of service checks
 */
export async function checkAllServices(serviceId: string | null = null, environment: EnvironmentType | null = null, disabledServicesList: Record<string, boolean> = {}): Promise<CheckResults> {
  try {
    // Use environment from parameter or from environment variable
    const currentEnvironment = environment || (process.env.ENVIRONMENT as EnvironmentType || 'SIT');
    logger.info(`Checking services for environment: ${currentEnvironment}`);
    
    const config = getServiceConfig(currentEnvironment);
    const results: CheckResults = {
      timestamp: new Date().toISOString(),
      environment: currentEnvironment,
      services: [],
      summary: {
        total: 0,
        success: 0,
        failed: 0
      }
    };

    // Use the provided disabled services list
    const disabledServices: Record<string, boolean> = disabledServicesList || {};

    // Filter services by ID if provided and exclude disabled services
    // let servicesToCheckComplete = serviceId 
    //   ? config.filter(service => service.id === serviceId)
    //   : config;
    let servicesToCheck = serviceId 
      ? config.filter(service => service.id === serviceId)
      : config;
      
    // // Filter out disabled services unless checking a specific service
    // if (!serviceId) {
    //   servicesToCheck = servicesToCheck.filter(service => {
    //     const serviceId = service.id || service.name.replace(/\s+/g, '-').toLowerCase();
    //     return !disabledServices[serviceId];
    //   });
    // }

    if (serviceId && servicesToCheck.length === 0) {
      throw new Error(`Service with ID ${serviceId} not found`);
    }

    // Check REST services
    const restServices = servicesToCheck.filter(service => service.type === 'REST') as RestService[];
    if (restServices.length > 0) {
      const restResults = await checkRestServices(restServices,disabledServices);
      
      results.services = [...results.services, ...restResults];
    }

    // Check SOAP services
    const soapServices = servicesToCheck.filter(service => service.type === 'SOAP') as SoapService[];
    if (soapServices.length > 0) {
      const soapResults = await checkSoapServices(soapServices);
      results.services = [...results.services, ...soapResults];
    }

    // Calculate summary
    results.summary.total = results.services.length;
    results.summary.success = results.services.filter(s => s.status === 'success').length;
    results.summary.failed = results.summary.total - results.summary.success;

    return results;
  } catch (error) {
    logger.error('Error in checkAllServices:', error);
    throw error;
  }
}