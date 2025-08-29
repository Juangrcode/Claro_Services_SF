import axios from 'axios';
// Define tipos para Axios
type AxiosResponse = {
  status: number;
  data: any;
};

type AxiosRequestConfig = {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
  validateStatus?: (status: number) => boolean;
  data?: any;
};
import { logger } from '../../utils/logger';
import { RestService, ServiceResult } from '../../types';
import { processBulkDocumentCheck, saveResultsToExcel } from './bulkDocumentCheck';

/**
 * Check REST services health
 * @param {RestService[]} services - Array of REST service configurations to check
 * @param {Record<string, boolean>} disabledServicesList - Optional list of disabled services
 * @returns {Promise<ServiceResult[]>} - Results of service checks
 */
export async function checkRestServices(services: RestService[], disabledServicesList: Record<string, boolean> = {}): Promise<ServiceResult[]> {
  logger.info(`Checking ${services.length} REST services`);
  const results: ServiceResult[] = [];

  for (const service of services) {
    try {
      logger.info(`Checking REST service: ${service.name} (${service.id})`);
      
      const startTime = Date.now();

      const serviceId = service.id || service.name.replace(/\s+/g, '-').toLowerCase();
      const isServiceDisabled = disabledServicesList[serviceId]
      let response:any

      if (!isServiceDisabled){
        response = await makeRestRequest(service);
      }

      const responseTime = Date.now() - startTime;
      
      // Validate response based on service configuration
      const isValid = validateRestResponse(service, response);

      // console.log({results})
      
      results.push({
        id: service.id,
        name: service.name,
        type: 'REST',
        url: service.url,
        status: isValid ? 'success' : 'failed',
        responseTime: `${responseTime}ms`,
        statusCode: response.status,
        timestamp: new Date().toISOString(),
        details: isValid ? 'Service is healthy' : 'Service response validation failed',
        response: response.data // Incluir la respuesta completa
      });

      logger.info(`REST service ${service.name} check completed: ${isValid ? 'SUCCESS' : 'FAILED'}`);
    } catch (error: any) {
      logger.error(`Error checking REST service ${service.name}:`, error.message);
      
      results.push({
        id: service.id,
        name: service.name,
        type: 'REST',
        url: service.url,
        status: 'failed',
        responseTime: 'N/A',
        statusCode: error.response?.status || 'N/A',
        timestamp: new Date().toISOString(),
        details: `Error: ${error.message}`
      });
    }
  }

  return results;
}

/**
 * Make a REST API request based on service configuration
 * @param {RestService} service - Service configuration
 * @returns {Promise<AxiosResponse>} - Axios response
 */
async function makeRestRequest(service: RestService): Promise<AxiosResponse> {
  const { url, method = 'GET', headers = {}, body, timeout = 30000 } = service;

  console.log({service})
  
  if (!url) {
    throw new Error(`URL is required for REST service ${service.name} (${service.id})`);
  }
  
  // Configurar opciones para axios
  console.log('Service headers:', headers);
  console.log('Service ID:', service.id);
  console.log('NAME_API_KEY value:', headers['NAME_API_KEY']);
  
  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    // console.log({
    //   url,
    //   method,
    //   headers,
    //   timeout,
    //   data: body,
    //   validateStatus: () => true // Don't throw on any status code
    // })
    // Con body
    const response = await axios({
      url,
      method,
      headers,
      timeout,
      data: body,
      validateStatus: () => true // Don't throw on any status code
    });
    // console.log({response})
    // console.log({data:JSON.stringify(response.data)})
    return {
      status: response.status,
      data: response.data
    };
  } else {
    // Sin body
    const response = await axios({
      url,
      method,
      headers,
      timeout,
      validateStatus: () => true // Don't throw on any status code
    });
    return {
      status: response.status,
      data: response.data
    };
  }
}

/**
 * Validate REST response based on service configuration
 * @param {RestService} service - Service configuration
 * @param {AxiosResponse} response - Axios response
 * @returns {boolean} - Whether the response is valid
 */
function validateRestResponse(service: RestService, response: AxiosResponse): boolean {
  // Check status code if expected status is defined
  if (service.expectedStatus && response.status !== service.expectedStatus) {
    logger.warn(`Service ${service.name} returned status ${response.status}, expected ${service.expectedStatus}`);
    return false;
  }

  // console.log({data: response.data})

  // Check for expected response content if defined
  // if (service.expectedContent) {
  //   const responseBody = JSON.stringify(response.data);

  //   console.log({responseBody})
  //   console.log({responseExpected:JSON.stringify(service.expectedContent)})

  //   if (!responseBody.includes(JSON.stringify(service.expectedContent))) {
  //     logger.warn(`Service ${service.name} response does not contain expected content`);
  //     return false;
  //   }
  // }

  if (!service.expectedContent) return true;
  
  try {
    const responseData = response.data;
    const expectedStructure = service.expectedContent;
    
    // Método 1: Comparar solo estructura
    if (compareStructure(responseData, expectedStructure)) {
      console.log(`✓ Service ${service.name}: Structure matches`);
      return true;
    }
    
    // Método 2: Usar schema validation
    const schema = generateSchema(expectedStructure);
    if (validateSchema(responseData, schema)) {
      console.log(`✓ Service ${service.name}: Schema validation passed`);
      return true;
    }
    
    // Método 3: Pattern matching
    const pattern = createPattern(expectedStructure);
    if (matchesPattern(responseData, pattern)) {
      console.log(`✓ Service ${service.name}: Pattern matches`);
      return true;
    }
    
    // Método 4: Validación flexible
    if (compareFlexible(responseData, expectedStructure, {
      typeStrict: false,
      allowExtraFields: false
    })) {
      console.log(`✓ Service ${service.name}: Flexible validation passed`);
      return true;
    }
    
    logger.warn(`Service ${service.name} response structure does not match expected structure`);
    console.log('Response keys:', Object.keys(responseData));
    console.log('Expected keys:', Object.keys(expectedStructure));
    
    return false;
    
  } catch (error) {
    logger.error(`Error validating service ${service.name} response:`, error);
    return false;
  }
}


// Opción 1: Comparar solo la estructura (claves) recursivamente
function compareStructure(obj1:any, obj2:any):any {
  if (typeof obj1 !== typeof obj2) return false;
  
  if (obj1 === null || obj2 === null) return obj1 === obj2;
  
  if (typeof obj1 !== 'object') return true; // Solo comparamos estructura, no valores
  
  if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;
  
  if (Array.isArray(obj1)) {
    if (obj1.length !== obj2.length) return false;
    return obj1.every((item, index) => compareStructure(item, obj2[index]));
  }
  
  const keys1 = Object.keys(obj1).sort();
  const keys2 = Object.keys(obj2).sort();
  
  if (keys1.length !== keys2.length) return false;
  if (!keys1.every((key, index) => key === keys2[index])) return false;
  
  return keys1.every(key => compareStructure(obj1[key], obj2[key]));
}

// Opción 2: Validar con JSON Schema básico
function generateSchema(obj:any):any {
  if (obj === null) return { type: 'null' };
  if (Array.isArray(obj)) {
    return {
      type: 'array',
      items: obj.length > 0 ? generateSchema(obj[0]) : { type: 'any' }
    };
  }
  if (typeof obj === 'object') {
    const properties:any = {};
    Object.keys(obj).forEach(key => {
      properties[key] = generateSchema(obj[key]);
    });
    return { type: 'object', properties, required: Object.keys(obj) };
  }
  return { type: typeof obj };
}

function validateSchema(obj:any, schema:any):any {
  if (schema.type === 'null') return obj === null;
  if (schema.type === 'array') {
    if (!Array.isArray(obj)) return false;
    return obj.every(item => validateSchema(item, schema.items));
  }
  if (schema.type === 'object') {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
    
    // Verificar propiedades requeridas
    const requiredKeys:any = schema.required || [];
    if (!requiredKeys.every((key:any) => obj.hasOwnProperty(key))) return false;
    
    // Verificar que no hay propiedades extra
    const objKeys = Object.keys(obj);
    const schemaKeys = Object.keys(schema.properties);
    if (objKeys.length !== schemaKeys.length) return false;
    
    // Validar cada propiedad
    return objKeys.every(key => 
      schema.properties[key] && validateSchema(obj[key], schema.properties[key])
    );
  }
  return typeof obj === schema.type;
}

// Opción 3: Comparar con patrones usando wildcards
function createPattern(obj:any):any {
  if (obj === null) return null;
  if (Array.isArray(obj)) {
    return obj.map(() => '*'); // Wildcard para arrays
  }
  if (typeof obj === 'object') {
    const pattern:any = {};
    Object.keys(obj).forEach(key => {
      pattern[key] = createPattern(obj[key]);
    });
    return pattern;
  }
  return '*'; // Wildcard para valores primitivos
}

function matchesPattern(obj:any, pattern:any):any {
  if (pattern === '*') return true;
  if (pattern === null) return obj === null;
  
  if (Array.isArray(pattern)) {
    if (!Array.isArray(obj)) return false;
    if (obj.length !== pattern.length) return false;
    return obj.every((item, index) => matchesPattern(item, pattern[index]));
  }
  
  if (typeof pattern === 'object' && pattern !== null) {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
    
    const patternKeys = Object.keys(pattern).sort();
    const objKeys = Object.keys(obj).sort();
    
    if (patternKeys.length !== objKeys.length) return false;
    if (!patternKeys.every((key, index) => key === objKeys[index])) return false;
    
    return patternKeys.every(key => matchesPattern(obj[key], pattern[key]));
  }
  
  return obj === pattern;
}

// Opción 4: Validación flexible con tipos específicos
function compareFlexible(response:any, expected:any, options = {}):any {
  const {
    ignoreArrayOrder = false,
    allowExtraFields = false,
    typeStrict = true
  }:any = options;
  
  function compare(actual:any, expected:any):any {
    // Null check
    if (expected === null) return actual === null;
    if (actual === null) return false;
    
    // Array handling
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual)) return false;
      
      if (ignoreArrayOrder) {
        return expected.length === actual.length &&
               expected.every(expectedItem => 
                 actual.some(actualItem => compare(actualItem, expectedItem))
               );
      } else {
        return expected.length === actual.length &&
               expected.every((expectedItem, index) => 
                 compare(actual[index], expectedItem)
               );
      }
    }
    
    // Object handling
    if (typeof expected === 'object') {
      if (typeof actual !== 'object' || Array.isArray(actual)) return false;
      
      // Check required fields
      const expectedKeys = Object.keys(expected);
      const actualKeys = Object.keys(actual);
      
      if (!allowExtraFields && expectedKeys.length !== actualKeys.length) {
        return false;
      }
      
      return expectedKeys.every(key => {
        if (!actual.hasOwnProperty(key)) return false;
        return compare(actual[key], expected[key]);
      });
    }
    
    // Primitive type checking
    if (typeStrict) {
      return typeof actual === typeof expected;
    }
    
    return true; // For primitive values, just check type
  }
  
  return compare(response, expected);
}

// Exportar funciones
export {
  compareStructure,
  generateSchema,
  validateSchema,
  createPattern,
  matchesPattern,
  compareFlexible,
  processBulkDocumentCheck,
  saveResultsToExcel
};

