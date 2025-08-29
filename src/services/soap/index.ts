import * as soap from 'soap';
import axios from 'axios';
import { logger } from '../../utils/logger';
import { SoapService, ServiceResult } from '../../types';

/**
 * Check SOAP services health
 * @param {SoapService[]} services - Array of SOAP service configurations to check
 * @returns {Promise<ServiceResult[]>} - Results of service checks
 */
export async function checkSoapServices(services: SoapService[]): Promise<ServiceResult[]> {
  logger.info(`Checking ${services.length} SOAP services`);
  const results: ServiceResult[] = [];

  for (const service of services) {
    try {
      logger.info(`Checking SOAP service: ${service.name} (${service.id})`);
      
      const startTime = Date.now();
      const response = await makeSoapRequest(service);
      const responseTime = Date.now() - startTime;
      
      // Validate response based on service configuration
      const isValid = validateSoapResponse(service, response);
      
      results.push({
        id: service.id,
        name: service.name,
        type: 'SOAP',
        url: service.url,
        status: isValid ? 'success' : 'failed',
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString(),
        details: isValid ? 'Service is healthy' : 'Service response validation failed',
        response: response // Incluir la respuesta completa
      });

      logger.info(`SOAP service ${service.name} check completed: ${isValid ? 'SUCCESS' : 'FAILED'}`);
    } catch (error: any) {
      logger.error(`Error checking SOAP service ${service.name}:`, error.message);
      
      results.push({
        id: service.id,
        name: service.name,
        type: 'SOAP',
        url: service.url,
        status: 'failed',
        responseTime: 'N/A',
        timestamp: new Date().toISOString(),
        details: `Error: ${error.message}`
      });
    }
  }

  return results;
}

interface SoapClient extends soap.Client {
  [method: string]: any;
}

/**
 * Make a SOAP API request based on service configuration
 * @param {SoapService} service - Service configuration
 * @returns {Promise<any>} - SOAP response
 */
async function makeSoapRequest(service: SoapService): Promise<any> {
  const { url, method, args = {}, options = {}, xmlBody, headers = {} } = service;
  
  if (!url) {
    throw new Error(`URL is required for SOAP service ${service.name} (${service.id})`);
  }
  
  console.log({service});
  
  // If xmlBody is provided, make direct HTTP request
  if (xmlBody) {
    const requestHeaders = {
      'Content-Type': 'application/xml',
      'SOAPAction': service.soapAction || method,
      ...headers
    };
    
    console.log('Making SOAP request with custom XML body');
    console.log('Headers:', requestHeaders);
    console.log('XML Body:', xmlBody);
    
    const response = await axios.post(url, xmlBody, {
       headers: requestHeaders,
       timeout: 30000
     });
     
     console.log('SOAP Response Status:', response.status);
     console.log('SOAP Response Data:', response.data);
     
     return response.data;
  }
  
  // Fallback to traditional SOAP client
  const client = await soap.createClientAsync(url, options) as SoapClient;
  
  // Add headers if provided
  if (headers) {
    Object.entries(headers).forEach(([key, value]) => {
      client.addHttpHeader(key, value);
    });
  }

  // Call the SOAP method
  if (!client[method]) {
    throw new Error(`Method ${method} not found in SOAP service`);
  }
  
  const [result] = await client[method + 'Async'](args);
  return result;
}

/**
 * Validate SOAP response based on service configuration
 * @param {SoapService} service - Service configuration
 * @param {any} response - SOAP response
 * @returns {boolean} - Whether the response is valid
 */
function validateSoapResponse(service: SoapService, response: any): boolean {
  // Check for expected response content if defined
  if (service.expectedContent) {
    const responseStr = JSON.stringify(response);
    if (!responseStr.includes(service.expectedContent)) {
      logger.warn(`Service ${service.name} response does not contain expected content`);
      return false;
    }
  }

  // Check for error indicators in response
  if (response.Fault || response.fault || response.error || response.Error) {
    logger.warn(`Service ${service.name} response contains error indicators`);
    return false;
  }

  return true;
}