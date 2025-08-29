import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';
import { BaseService, RestService, SoapService, EnvironmentType } from '../types';

/**
 * Get service configuration from config file or environment
 * @param {EnvironmentType} environment - Optional environment to filter services
 * @returns {BaseService[]} - Array of service configurations
 */
export function getServiceConfig(environment?: EnvironmentType): BaseService[] {
  try {
    // Check if there's a config file
    const configPath = process.env.CONFIG_PATH || path.join(__dirname, 'services.json');
    
    let services: BaseService[] = [];
    
    if (fs.existsSync(configPath)) {
      logger.info(`Loading service configuration from ${configPath}`);
      const configData = fs.readFileSync(configPath, 'utf8');
      services = JSON.parse(configData);
    } else {
      // If no config file, return example configuration
      logger.warn('No configuration file found, using example configuration');
      services = getExampleConfig();
    }
    
    // Process environment variables and filter by environment if specified
    services = processEnvironmentVariables(services, environment);
    
    return services;
  } catch (error: any) {
    logger.error('Error loading service configuration:', error);
    throw new Error(`Failed to load service configuration: ${error.message}`);
  }
}

/**
 * Process environment variables in service configuration
 * @param {BaseService[]} services - Array of service configurations
 * @param {EnvironmentType} environment - Optional environment to filter services
 * @returns {BaseService[]} - Processed array of service configurations
 */
function processEnvironmentVariables(services: BaseService[], environment?: EnvironmentType): BaseService[] {
  const currentEnvironment = environment || (process.env.ENVIRONMENT as EnvironmentType) || 'SIT';
  
  // Filter services by environment and enabled status
  services = services.filter(service => {
    // Check if the service has environmentUrls and if the current environment is available
    const hasEnvironmentUrl = service.environmentUrls && Object.keys(service.environmentUrls).includes(currentEnvironment);
    
    return (
      // Include service if it has a URL for the current environment
      (hasEnvironmentUrl || 
      // Or if no specific environment is set for the service
      !service.environment || 
      // Or if the service's environment matches the current environment
      service.environment === currentEnvironment) &&
      // Filter by enabled status
      (service.enabled !== false) // Only filter out services explicitly set to false
    );
  });
  
  // Process environment variables for each service
  return services.map(service => {
    const processedService = { ...service };
    
    // 1. Check for environment-specific URL first
    if (service.environmentUrls && service.environmentUrls[currentEnvironment]) {
      const envUrlValue = service.environmentUrls[currentEnvironment];
      // Check if the value is an environment variable name and that variable exists
      if (process.env[envUrlValue]) {
        processedService.url = process.env[envUrlValue] as string;
      } else {
        // Use the value directly if it's not an environment variable or the variable doesn't exist
        processedService.url = envUrlValue;
      }

      if (service.path) {
        // Remove trailing slash from baseUrl if present
        if (processedService.url.endsWith('/')) {
          processedService.url = processedService.url.slice(0, -1);
        }
        
        // Remove leading slash from path if present
        let path = service.path;
        if (path.startsWith('/')) {
          path = path.slice(1);
        }
        
        processedService.url = `${processedService.url}/${path}`;
      } else if (processedService.url) {
        processedService.url = processedService.url;
      } else if (service.path) {
        processedService.url = service.path;
      }
    }
    // 2. Then check for environment variable for complete URL
    else if (service.urlEnvVar && process.env[service.urlEnvVar]) {
      processedService.url = process.env[service.urlEnvVar] as string;
    }
    // 3. Then check for baseUrl and path combination
    else if (service.baseUrl || service.path) {
      let baseUrl = service.baseUrl || '';
      
      // Check for baseUrl environment variable
      if (service.baseUrlEnvVar && process.env[service.baseUrlEnvVar]) {
        baseUrl = process.env[service.baseUrlEnvVar] as string;
      }
      
      // Combine baseUrl and path, ensuring proper formatting
      if (baseUrl && service.path) {
        // Remove trailing slash from baseUrl if present
        if (baseUrl.endsWith('/')) {
          baseUrl = baseUrl.slice(0, -1);
        }
        
        // Remove leading slash from path if present
        let path = service.path;
        if (path.startsWith('/')) {
          path = path.slice(1);
        }
        
        processedService.url = `${baseUrl}/${path}`;
      } else if (baseUrl) {
        processedService.url = baseUrl;
      } else if (service.path) {
        processedService.url = service.path;
      }
    }

    // Replace headers with environment variables if specified
    if (service.headerEnvVars) {
      processedService.headers = processedService.headers || {};
      
      Object.entries(service.headerEnvVars).forEach(([headerKey, envVarName]) => {
        // Check if the header key itself exists as an environment variable
        let finalHeaderKey = headerKey;
        if (process.env[headerKey]) {
          finalHeaderKey = process.env[headerKey] as string;
        }
        
        console.log({finalHeaderKey})
        // Check if the header key has environment-specific suffix (e.g., NAME_API_KEY_SIT)
        const envSpecificHeaderKey =  `NAME_API_KEY_${currentEnvironment}`;
        const envSpecificHeaderValue =  `API_KEY_${currentEnvironment}`;
        
        // Check if there's a direct environment-specific header in the service headers
        // For example: NAME_API_KEY_SIT or NAME_API_KEY_UAT directly in the headers object
        if (service.headers && service.headers[envSpecificHeaderKey]) {
          // Get the value of the environment-specific header
          const headerValue = service.headers[envSpecificHeaderKey];
          
          // If the header key is like NAME_API_KEY_SIT and the value is the actual API key to use
          if (headerKey.startsWith('NAME_')) {
            
            // Remove the original header and the environment-specific header
            delete processedService.headers![headerKey];
            delete processedService.headers![envSpecificHeaderKey];
            
            // Get the actual API key value from environment variables
            const envVarName = service.headerEnvVars?.[envSpecificHeaderKey] as string;
            const apiKeyValue = envVarName && process.env[envVarName] ? process.env[envVarName] : 'XXXX valor';

            // Add the header with the value from headerValue as the key and apiKeyValue as the value
            processedService.headers![finalHeaderKey] = apiKeyValue;
            
            console.log(`Using environment-specific header: ${headerValue} with value from ${envVarName} for ${currentEnvironment}`);
        
          } else {
            // For regular headers, just use the environment-specific value
            processedService.headers![envSpecificHeaderKey] = envSpecificHeaderValue;
          }
          
          return; // Skip the rest of this iteration
        } else if (headerKey.includes(envSpecificHeaderKey)) {
          // If the header key already includes the environment, use it directly
          finalHeaderKey = headerKey;
        } else if (service.headerEnvVars && service.headerEnvVars[envSpecificHeaderKey]) {
          // If there's an environment-specific header key in headerEnvVars, use its value
          const envSpecificVarName = service.headerEnvVars[envSpecificHeaderKey];
          if (typeof envSpecificVarName === 'string' && process.env[envSpecificVarName]) {
            processedService.headers![finalHeaderKey] = process.env[envSpecificVarName] as string;
            return; // Skip the rest of this iteration
          }
        }
        
        if (typeof envVarName === 'string') {
          // Check for environment-specific variable (e.g., API_KEY_SIT)
          const envSpecificVarName = `${envVarName}_${currentEnvironment}`;
          if (process.env[envSpecificVarName]) {
            processedService.headers![finalHeaderKey] = process.env[envSpecificVarName] as string;
          } else if (process.env[envVarName]) {
            // Fallback to the regular variable if environment-specific doesn't exist
            processedService.headers![finalHeaderKey] = process.env[envVarName] as string;
          }
        } else if (Array.isArray(envVarName)) {
          // Check for environment-specific variables first
          let found = false;
          for (const envVar of envVarName) {
            const envSpecificVarName = `${envVar}_${currentEnvironment}`;
            if (process.env[envSpecificVarName]) {
              processedService.headers![finalHeaderKey] = process.env[envSpecificVarName] as string;
              found = true;
              break;
            }
          }
          
          // If no environment-specific variable found, try the regular ones
          if (!found) {
            for (const envVar of envVarName) {
              if (process.env[envVar]) {
                processedService.headers![finalHeaderKey] = process.env[envVar] as string;
                break;
              }
            }
          }
        }
      });
    }

    console.log({headers:processedService.headers})
    console.log({headers2:processedService.headerEnvVars})

    
    return processedService;
  });
}

/**
 * Get example service configuration
 * @returns {BaseService[]} - Array of example service configurations
 */
export function getExampleConfig(): (RestService | SoapService)[] {
  return [
    {
      id: 'rest-example-1',
      name: 'Example REST API',
      type: 'REST' as const,
      // Ejemplo usando baseUrl y path separados
      baseUrl: 'https://jsonplaceholder.typicode.com',
      path: 'posts/1',
      baseUrlEnvVar: 'API_BASE_URL_EXAMPLE_1', // Variable de entorno para el dominio/URL base
      // URLs específicas por ambiente
      environmentUrls: {
        'DEV': 'https://dev-api.example.com/posts/1',
        'QA': 'https://qa-api.example.com/posts/1',
        'SIT': 'https://sit-api.example.com/posts/1',
        'UAT': 'https://uat-api.example.com/posts/1',
        'PROD': 'https://api.example.com/posts/1'
      },
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer default-token'
      },
      headerEnvVars: {
        'Authorization': 'API_AUTH_TOKEN' // Variable de entorno para el token
      },
      expectedStatus: 200,
      expectedContent: 'userId',
      environment: 'DEV' as EnvironmentType // Este servicio solo está disponible en DEV
    },
    {
      id: 'rest-example-2',
      name: 'Example REST API with Headers',
      type: 'REST' as const,
      // Ejemplo usando URL completa (para compatibilidad)
      url: 'https://jsonplaceholder.typicode.com/posts',
      urlEnvVar: 'API_URL_EXAMPLE_2', // Variable de entorno para la URL completa
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': 'default-api-key',
        'NAME-API-Key': 'default-name-api-key'
      },
      headerEnvVars: {
        'X-API-Key': 'API_KEY', // Variable de entorno para la API key
        'NAME-API-Key': ['NAME_API_KEY', 'API_KEY'] // Múltiples variables de entorno para el mismo header
      },
      body: {
        title: 'foo',
        body: 'bar',
        userId: 1
      },
      expectedStatus: 201
      // Sin environment, disponible en todos los ambientes
    },
    {
      id: 'soap-example-1',
      name: 'Example SOAP Service',
      type: 'SOAP' as const,
      // Ejemplo usando baseUrl y path separados con URLs específicas por ambiente
      baseUrl: 'http://webservices.oorsprong.org',
      path: 'websamples.countryinfo/CountryInfoService.wso?WSDL',
      baseUrlEnvVar: 'SOAP_BASE_URL_EXAMPLE', // Variable de entorno para el dominio/URL base
      environmentUrls: {
        'DEV': 'http://dev-webservices.example.org/websamples.countryinfo/CountryInfoService.wso?WSDL',
        'QA': 'http://qa-webservices.example.org/websamples.countryinfo/CountryInfoService.wso?WSDL',
        'PROD': 'http://webservices.example.org/websamples.countryinfo/CountryInfoService.wso?WSDL'
      },
      method: 'CountryName',
      args: {
        sCountryISOCode: 'US'
      },
      expectedContent: 'United States',
      environment: 'QA' as EnvironmentType // Este servicio solo está disponible en QA
    },
    {
      id: 'hdc-v3-consulsalesforce',
      name: 'HDC V3 ConsulSalesforce',
      type: 'REST' as const,
      // Ejemplo real usando la URL de HDC_V3_CONSULSALESFORCE_URL
      baseUrl: 'https://apigwsfclaro.claro.com.co:8070',
      path: 'HDC/V3.0/Rest/ConsulSalesforc',
      urlEnvVar: 'HDC_V3_CONSULSALESFORCE_URL', // Variable de entorno para la URL completa
      environmentUrls: {
        'DEV': 'https://dev-apigwsfclaro.claro.com.co:8070/HDC/V3.0/Rest/ConsulSalesforc',
        'QA': 'https://qa-apigwsfclaro.claro.com.co:8070/HDC/V3.0/Rest/ConsulSalesforc',
        'PROD': 'https://apigwsfclaro.claro.com.co:8070/HDC/V3.0/Rest/ConsulSalesforc'
      },
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'NAME-API-Key': 'ApkSitSfic'
      },
      headerEnvVars: {
        'NAME-API-Key': 'NAME_API_KEY'
      },
      expectedStatus: 200
    }
  ];
}

/**
 * Save service configuration to config file
 * @param {BaseService[]} services - Array of service configurations
 */
export function saveServiceConfig(services: BaseService[]): void {
  try {
    const configPath = process.env.CONFIG_PATH || path.join(__dirname, 'services.json');
    logger.info(`Saving service configuration to ${configPath}`);
    fs.writeFileSync(configPath, JSON.stringify(services, null, 2));
  } catch (error: any) {
    logger.error('Error saving service configuration:', error);
    throw new Error(`Failed to save service configuration: ${error.message}`);
  }
}