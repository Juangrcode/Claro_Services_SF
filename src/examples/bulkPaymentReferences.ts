import path from 'path';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import axios from 'axios';
import * as dotenv from 'dotenv';
import { logger } from '../utils/logger';

// Cargar variables de entorno
dotenv.config();

interface DocumentData {
  identificationType: string;
  identificationNumber: string;
}

interface PaymentReferenceResult extends DocumentData {
  status: 'success' | 'failed';
  hasInformation: boolean;
  hasDebt: boolean;
  details: string;
  timestamp: string;
  responseTime?: number;
  statusCode?: number;
  responseData?: any;
  debtResponseData?: any;
}

interface PaymentReferenceSummary {
  total: number;
  successful: number;
  failed: number;
  withInformation: number;
  withoutInformation: number;
  withDebt: number;
  withoutDebt: number;
  averageResponseTime: number;
  statusCodeDistribution: Record<number, number>;
  errorMessages: string[];
}

/**
 * Procesa un archivo Excel o JSON con datos de documentos y consulta el servicio de PaymentReferencesMgmt
 * @param {string} filePath - Ruta al archivo Excel o JSON
 * @param {string} fileType - Tipo de archivo ('excel' o 'json')
 * @returns {Promise<PaymentReferenceResult[]>} - Resultados de las consultas
 */
export async function processBulkPaymentReferences(
  filePath: string,
  fileType: 'excel' | 'json',
  customHeaders?: Record<string, string>
): Promise<PaymentReferenceResult[]> {
  try {
    logger.info(`Procesando archivo ${filePath} de tipo ${fileType}`);
    
    // Cargar datos desde el archivo
    const documents = await loadDocumentsFromFile(filePath, fileType);
    logger.info(`Se cargaron ${documents.length} documentos para procesar`);
    
    const results: PaymentReferenceResult[] = [];
    
    // Procesar cada documento
    for (const doc of documents) {
      try {
        logger.info(`Consultando documento: ${doc.identificationType}-${doc.identificationNumber}`);
        
        // Consultar servicio de referencias de pago
        const startTime = Date.now();
        const response = await checkPaymentReferences(doc, customHeaders);
        const responseTime = Date.now() - startTime;
        
        // Verificar si la respuesta contiene información
        const hasInformation = checkIfResponseHasInformation(response.data);
        
        // Consultar servicio de deuda
        let hasDebt = false;
        let debtResponse = null;
        
        try {
          debtResponse = await checkCustomerDebt(doc);
          hasDebt = checkIfCustomerHasDebt(debtResponse);
          logger.info(`Documento ${doc.identificationNumber} tiene deuda: ${hasDebt ? 'Sí' : 'No'}`);
        } catch (debtError: any) {
          logger.error(`Error al consultar deuda para documento ${doc.identificationNumber}:`, debtError.message);
          // Si falla la consulta de deuda, continuamos con el proceso
        }
        
        // Determinar el detalle según ambas consultas
        let details = '';
        if (!hasInformation && !hasDebt) {
          details = 'No se encontró información y no tiene deuda';
        } else if (!hasInformation && hasDebt) {
          details = 'No se encontró información pero tiene deuda';
        } else if (hasInformation && !hasDebt) {
          details = 'Se encontró información pero no tiene deuda';
        } else {
          details = 'Se encontró información y tiene deuda';
        }
        
        results.push({
          ...doc,
          status: 'success',
          hasInformation,
          hasDebt,
          details,
          timestamp: new Date().toISOString(),
          responseTime,
          statusCode: response.status,
          responseData: response.data,
          debtResponseData: debtResponse?.data
        });
        
        logger.info(`Documento ${doc.identificationNumber} procesado: ${details}`);
      } catch (error: any) {
        logger.error(`Error al consultar documento ${doc.identificationNumber}:`, error.message);
        
        results.push({
          ...doc,
          status: 'failed',
          hasInformation: false,
          hasDebt: false,
          details: `Error: ${error.message}`,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Generar y mostrar resumen
    const summary = generatePaymentReferenceSummary(results);
    console.log('\n===== RESUMEN DE CONSULTAS =====');
    console.log(`Total de documentos procesados: ${summary.total}`);
    console.log(`Consultas exitosas: ${summary.successful} (${Math.round(summary.successful/summary.total*100)}%)`);
    console.log(`Consultas fallidas: ${summary.failed} (${Math.round(summary.failed/summary.total*100)}%)`);
    console.log(`Documentos con información: ${summary.withInformation} (${Math.round(summary.withInformation/summary.total*100)}%)`);
    console.log(`Documentos sin información: ${summary.withoutInformation} (${Math.round(summary.withoutInformation/summary.total*100)}%)`);
    console.log(`Documentos con deuda: ${summary.withDebt} (${Math.round(summary.withDebt/summary.total*100)}%)`);
    console.log(`Documentos sin deuda: ${summary.withoutDebt} (${Math.round(summary.withoutDebt/summary.total*100)}%)`);
    console.log(`Tiempo promedio de respuesta: ${summary.averageResponseTime.toFixed(2)}ms`);
    
    console.log('\nDistribución de códigos de estado:');
    Object.entries(summary.statusCodeDistribution).forEach(([code, count]) => {
      console.log(`  - Código ${code}: ${count} documentos`);
    });
    
    if (summary.errorMessages.length > 0) {
      console.log('\nMensajes de error encontrados:');
      summary.errorMessages.forEach((msg, index) => {
        console.log(`  ${index + 1}. ${msg}`);
      });
    }
    console.log('================================\n');
    
    return results;
  } catch (error: any) {
    logger.error('Error en processBulkPaymentReferences:', error.message);
    throw error;
  }
}

/**
 * Carga documentos desde un archivo Excel o JSON
 * @param {string} filePath - Ruta al archivo
 * @param {string} fileType - Tipo de archivo ('excel' o 'json')
 * @returns {Promise<DocumentData[]>} - Array de datos de documentos
 */
async function loadDocumentsFromFile(
  filePath: string,
  fileType: 'excel' | 'json'
): Promise<DocumentData[]> {
  console.log(`Cargando documentos desde archivo ${filePath} de tipo ${fileType}...`);
  try {
    if (fileType === 'excel') {
      // Leer archivo Excel
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      // Validar y transformar datos
      return data.map((row: any) => ({
        // Mapear tipoDocumento a identificationType (convertir a string)
        identificationType: row.tipoDocumento ? mapTipoDocumento(row.tipoDocumento) : '',
        // Mapear numDocumento a identificationNumber (convertir a string)
        identificationNumber: row.numDocumento ? row.numDocumento.toString() : ''
      })).filter(doc => doc.identificationType && doc.identificationNumber);
    } else {
      // Leer archivo JSON
      const fileContent = await fs.promises.readFile(filePath, 'utf8');
      const data = JSON.parse(fileContent);
      
      if (Array.isArray(data)) {
        // Validar y transformar datos
        return data.map((item: any) => ({
          // Intentar usar identificationType o tipoDocumento
          identificationType: item.identificationType?.toString() || 
                             (item.tipoDocumento ? mapTipoDocumento(item.tipoDocumento) : ''),
          // Intentar usar identificationNumber o numDocumento
          identificationNumber: item.identificationNumber?.toString() || 
                               (item.numDocumento ? item.numDocumento.toString() : '')
        })).filter(doc => doc.identificationType && doc.identificationNumber);
      } else {
        throw new Error('El archivo JSON no contiene un array de documentos');
      }
    }
  } catch (error: any) {
    logger.error(`Error al cargar documentos desde archivo ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Mapea el código numérico del tipo de documento a su representación en texto
 * @param {number|string} tipoDocumento - Código del tipo de documento
 * @returns {string} - Representación en texto del tipo de documento
 */
function mapTipoDocumento(tipoDocumento: number | string): string {
  // Convertir a número si es string
  const tipo = typeof tipoDocumento === 'string' ? parseInt(tipoDocumento, 10) : tipoDocumento;
  
  // Mapear según los códigos
  switch (tipo) {
    case 1:
      return 'CC'; // Cédula de ciudadanía
    case 2:
      return 'CE'; // Cédula de extranjería
    case 3:
      return 'TI'; // Tarjeta de identidad
    case 4:
      return 'RC'; // Registro civil
    case 5:
      return 'PA'; // Pasaporte
    case 6:
      return 'NIT'; // NIT
    default:
      console.log(`Tipo de documento desconocido: ${tipoDocumento}, usando 'CC' por defecto`);
      return 'CC'; // Valor por defecto
  }
}

/**
 * Consulta el servicio de PaymentReferencesMgmt para un documento específico
 * @param {DocumentData} doc - Datos del documento a consultar
 * @param {Record<string, string>} [customHeaders] - Headers personalizados opcionales
 * @returns {Promise<any>} - Respuesta del servicio
 */
async function checkPaymentReferences(doc: DocumentData, customHeaders?: Record<string, string>): Promise<any> {
  const { identificationType, identificationNumber } = doc;
  
  // Construir URL con parámetros
  const environment = process.env.ENVIRONMENT || 'UAT';
  const baseUrl = environment === 'SIT' ? 
    process.env.SF_URL_SIT : 
    process.env.SF_URL_UAT;
  
  const url = `${baseUrl}/PaymentReferencesMgmt/v1.0`;
  
  console.log(`Consultando URL: ${url}`);
  
  // Construir el cuerpo XML de la solicitud SOAP
  const xmlBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v2="http://www.ericsson.com/esb/data/generico/CommonTypes/v2/" xmlns:v1="http://www.ericsson.com/esb/message/paymentReferencesMgtm/getPaymentReferencesRequest/v1.0">
    <soapenv:Header>
       <v2:headerRequest>
          <v2:idApplication>SALESFORCE</v2:idApplication>
          <v2:startDate>${new Date().toISOString()}</v2:startDate>
          <v2:channel>CAV</v2:channel>
       </v2:headerRequest>
    </soapenv:Header>
    <soapenv:Body>
       <v1:GetPaymentReferencesRequest>
          <identificationType>1</identificationType>
          <identificationNumber>${identificationNumber}</identificationNumber>
       </v1:GetPaymentReferencesRequest>
    </soapenv:Body>
 </soapenv:Envelope>`;
  
  console.log(`XML Body:`, xmlBody);
  
  // Configurar headers desde variables de entorno y headers personalizados
  const headers: Record<string, string> = {
    'Content-Type': 'application/xml',
    'SOAPAction': 'GetPaymentReferences',
    ...customHeaders || {}
  };
  
  if (process.env.NAME_API_KEY && process.env.API_KEY) {
    headers[process.env.NAME_API_KEY] = process.env.API_KEY;
    console.log(`Usando header de autenticación: ${process.env.NAME_API_KEY}`);
  } else {
    console.log('ADVERTENCIA: No se encontraron variables de entorno para los headers de autenticación');
  }
  
  console.log('Headers configurados:', JSON.stringify(headers, null, 2));
  
  // Realizar la consulta SOAP
  const startTime = Date.now();
  const response = await axios({
    url,
    method: 'POST',
    data: xmlBody,
    headers,
    timeout: 30000,
    validateStatus: () => true // No lanzar error por códigos de estado
  });
  
  const responseTime = Date.now() - startTime;
  console.log(`Respuesta recibida en ${responseTime}ms con status: ${response.status}`);
  console.log(`Datos de respuesta:`, response.data);
  
  return response;
}

/**
 * Consulta el servicio REST para verificar si un cliente tiene deuda
 * @param {DocumentData} doc - Datos del documento a consultar
 * @returns {Promise<any>} - Respuesta del servicio
 */
async function checkCustomerDebt(doc: DocumentData): Promise<any> {
  try {
    const { identificationType, identificationNumber } = doc;
    
    // Mapear el tipo de documento al formato numérico requerido por el servicio REST
    const documentType = mapIdentificationTypeToNumber(identificationType);
    
    // Construir URL con parámetros
    const environment = process.env.ENVIRONMENT || 'UAT';
    const baseUrl = environment === 'SIT' ? 
      process.env.SF_URL_SIT : 
      process.env.SF_URL_UAT;
  
    const url = `${baseUrl}/MS/CUS/CustomerBill/RSCuAcBalInfoBalance/V1/Validate?documentNumber=${identificationNumber}&documentType=${documentType}&valor=0`;
    
    console.log(`Consultando servicio de deuda URL: ${url}`);
    
    // Configurar headers
    const headers: Record<string, string> = {};
    
    if (process.env.NAME_API_KEY && process.env.API_KEY) {
      headers[process.env.NAME_API_KEY] = process.env.API_KEY;
      console.log(`Usando header de autenticación: ${process.env.NAME_API_KEY}`);
    } else {
      console.log('ADVERTENCIA: No se encontraron variables de entorno para los headers de autenticación');
    }
    
    // Realizar la consulta REST
    const startTime = Date.now();
    const response = await axios({
      url,
      method: 'GET',
      data: '',
      headers,
      timeout: 30000,
      validateStatus: () => true // No lanzar error por códigos de estado
    });
    
    const responseTime = Date.now() - startTime;
    console.log(`Respuesta de servicio de deuda recibida en ${responseTime}ms con status: ${response.status}`);
    console.log(`Datos de respuesta de deuda:`, response.data);
    
    return response;
  } catch (error: any) {
    console.error(`Error al consultar servicio de deuda:`, error.message);
    throw error;
  }
}

/**
 * Mapea el tipo de documento de texto a su representación numérica
 * @param {string} identificationType - Tipo de documento en formato texto (CC, CE, etc.)
 * @returns {number} - Tipo de documento en formato numérico
 */
function mapIdentificationTypeToNumber(identificationType: string): number {
  switch (identificationType.toUpperCase()) {
    case 'CC':
      return 1; // Cédula de ciudadanía
    case 'CE':
      return 2; // Cédula de extranjería
    case 'TI':
      return 3; // Tarjeta de identidad
    case 'RC':
      return 4; // Registro civil
    case 'PA':
      return 5; // Pasaporte
    case 'NIT':
      return 6; // NIT
    default:
      console.log(`Tipo de documento desconocido: ${identificationType}, usando 1 (CC) por defecto`);
      return 1; // Valor por defecto
  }
}

/**
 * Verifica si la respuesta contiene información relevante
 * @param {any} responseData - Datos de la respuesta
 * @returns {boolean} - True si contiene información, false en caso contrario
 */
function checkIfResponseHasInformation(responseData: any): boolean {
  // Implementar lógica para verificar si la respuesta contiene información
  // Esta implementación dependerá de la estructura de la respuesta del servicio SOAP
  
  console.log('Analizando respuesta para determinar si contiene información...');
  
  // Ejemplo básico: verificar si la respuesta no está vacía y no contiene errores
  if (!responseData) {
    console.log('La respuesta es nula o indefinida');
    return false;
  }
  
  // Verificar si la respuesta contiene un error SOAP
  if (typeof responseData === 'string') {
    if (responseData.includes('Fault') || responseData.includes('fault') || responseData.includes('Error') || responseData.includes('error')) {
      console.log('La respuesta SOAP contiene un error');
      return false;
    }
    
    // Verificar si la respuesta contiene la etiqueta GetPaymentReferencesResponse
    if (responseData.includes('Data not found') || responseData.includes('FS_ESB_99')) {
      console.log('La respuesta indica que no se encontraron datos (Data not found)');
      return false;
    }
    if (responseData.includes('GetPaymentReferencesResponse')) {
      console.log('La respuesta contiene información de referencias de pago');
      return true;
    }
  }
  
  // Por defecto, si hay algún contenido, asumimos que hay información
  const hasContent = responseData && (typeof responseData === 'string' ? responseData.length > 0 : Object.keys(responseData).length > 0);
  console.log(`La respuesta ${hasContent ? 'contiene' : 'no contiene'} información`);
  return hasContent;
}

/**
 * Verifica si el cliente tiene deuda según la respuesta del servicio REST
 * @param {any} responseData - Datos de la respuesta
 * @returns {boolean} - True si tiene deuda, false en caso contrario
 */
function checkIfCustomerHasDebt(responseData: any): boolean {
  // Verificar si la respuesta es válida
  if (!responseData) {
    console.log('La respuesta de deuda es nula o indefinida');
    return false;
  }
  
  try {
    // Verificar si la respuesta tiene el formato esperado
    if (responseData.data && typeof responseData.data.hasDebt === 'boolean') {
      return responseData.data.hasDebt;
    }
    
    // Si la respuesta no tiene el formato esperado, verificar si hay deudas en la lista
    if (responseData.data && Array.isArray(responseData.data.debtList) && responseData.data.debtList.length > 0) {
      return true;
    }
    
    console.log('El cliente no tiene deuda según la respuesta');
    return false;
  } catch (error) {
    console.error('Error al verificar si el cliente tiene deuda:', error);
    return false;
  }
}

/**
 * Genera un resumen de los resultados de las consultas
 * @param {PaymentReferenceResult[]} results - Resultados de las consultas
 * @returns {PaymentReferenceSummary} - Resumen de los resultados
 */
export function generatePaymentReferenceSummary(results: PaymentReferenceResult[]): PaymentReferenceSummary {
  const summary: PaymentReferenceSummary = {
    total: results.length,
    successful: 0,
    failed: 0,
    withInformation: 0,
    withoutInformation: 0,
    withDebt: 0,
    withoutDebt: 0,
    averageResponseTime: 0,
    statusCodeDistribution: {},
    errorMessages: []
  };
  
  let totalResponseTime = 0;
  const uniqueErrors = new Set<string>();
  
  // Procesar cada resultado
  results.forEach(result => {
    // Contar éxitos y fallos
    if (result.status === 'success') {
      summary.successful++;
      
      // Contar documentos con/sin información
      if (result.hasInformation) {
        summary.withInformation++;
      } else {
        summary.withoutInformation++;
      }
      
      // Contar documentos con/sin deuda
      if (result.hasDebt) {
        summary.withDebt++;
      } else {
        summary.withoutDebt++;
      }
      
      // Acumular tiempo de respuesta
      if (result.responseTime) {
        totalResponseTime += result.responseTime;
      }
      
      // Contar códigos de estado
      if (result.statusCode) {
        summary.statusCodeDistribution[result.statusCode] = 
          (summary.statusCodeDistribution[result.statusCode] || 0) + 1;
      }
    } else {
      summary.failed++;
      
      // Recopilar mensajes de error únicos
      if (result.details && result.details.startsWith('Error:')) {
        uniqueErrors.add(result.details);
      }
    }
  });
  
  // Calcular tiempo promedio de respuesta
  summary.averageResponseTime = summary.successful > 0 ? 
    totalResponseTime / summary.successful : 0;
  
  // Convertir errores únicos a array
  summary.errorMessages = Array.from(uniqueErrors);
  
  return summary;
}

/**
 * Guarda los resultados en un archivo Excel
 * @param {PaymentReferenceResult[]} results - Resultados de las consultas
 * @param {string} outputPath - Ruta donde guardar el archivo de resultados
 * @returns {Promise<string>} - Ruta del archivo generado
 */
export async function saveResultsToExcel(
  results: PaymentReferenceResult[],
  outputPath: string
): Promise<string> {
  try {
    // Crear un nuevo libro de trabajo
    const workbook = XLSX.utils.book_new();
    
    // Convertir resultados a formato de hoja de cálculo
    const worksheet = XLSX.utils.json_to_sheet(results);
    
    // Añadir la hoja al libro
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultados');
    
    // Escribir el archivo
    XLSX.writeFile(workbook, outputPath);
    
    logger.info(`Resultados guardados en ${outputPath}`);
    return outputPath;
  } catch (error: any) {
    logger.error(`Error al guardar resultados en Excel:`, error.message);
    throw error;
  }
}

/**
 * Script de ejemplo para procesar documentos en lote
 */
async function runBulkPaymentReferences() {
  try {
    // Cargar variables de entorno
    dotenv.config();
    
    // Ruta al archivo de documentos (Excel)
    const excelFilePath = path.resolve(__dirname, 'documentos.xlsx');
    
    console.log('Iniciando procesamiento de documentos en lote desde Excel...');
    
    // Headers personalizados (opcional)
    const customHeaders: Record<string, string> = {
      'Content-Type': 'application/xml',
      'Accept': 'application/xml'
    };
    
    // Si hay variables de entorno para los headers, se usarán automáticamente
    // junto con estos headers personalizados
    
    // Procesar documentos desde archivo Excel
    const results = await processBulkPaymentReferences(excelFilePath, 'excel', customHeaders);
    
    console.log(`Se procesaron ${results.length} documentos`);
    
    // Mostrar qué documentos se consultaron
    console.log('\nDocumentos consultados:');
    results.forEach(result => {
      console.log(`- Tipo: ${result.identificationType}, Número: ${result.identificationNumber}`);
    });
    
    // Mostrar resultados en consola
    console.log('Resultados:');
    results.forEach(result => {
      console.log(`- Documento: ${result.identificationType}-${result.identificationNumber}`);
      console.log(`  Estado: ${result.status}, Tiene información: ${result.hasInformation ? 'Sí' : 'No'}, Tiene mora: ${result.hasDebt ? 'Sí' : 'No'}`);
      console.log(`  Detalles: ${result.details}`);
      console.log('---');
    });
    
    // Guardar resultados en Excel
    const outputPath = path.resolve(__dirname, 'resultados-payment-references.xlsx');
    await saveResultsToExcel(results, outputPath);
    
    console.log(`Resultados guardados en: ${outputPath}`);
    
    // Mostrar resumen después de guardar los resultados
    console.log('\n===== RESUMEN FINAL DE CONSULTAS =====');
    const summary = generatePaymentReferenceSummary(results);
    console.log(`Total de documentos procesados: ${summary.total}`);
    console.log(`Consultas exitosas: ${summary.successful} (${Math.round(summary.successful/summary.total*100)}%)`);
    console.log(`Consultas fallidas: ${summary.failed} (${Math.round(summary.failed/summary.total*100)}%)`);
    console.log(`Documentos con información: ${summary.withInformation} (${Math.round(summary.withInformation/summary.total*100)}%)`);
    console.log(`Documentos sin información: ${summary.withoutInformation} (${Math.round(summary.withoutInformation/summary.total*100)}%)`);
    console.log(`Documentos con deuda: ${summary.withDebt} (${Math.round(summary.withDebt/summary.total*100)}%)`);
    console.log(`Documentos sin deuda: ${summary.withoutDebt} (${Math.round(summary.withoutDebt/summary.total*100)}%)`);
    console.log(`Tiempo promedio de respuesta: ${summary.averageResponseTime.toFixed(2)}ms`);
    
    console.log('\nDistribución de códigos de estado:');
    Object.entries(summary.statusCodeDistribution).forEach(([code, count]) => {
      console.log(`  - Código ${code}: ${count} documentos`);
    });
    
    if (summary.errorMessages.length > 0) {
      console.log('\nMensajes de error encontrados:');
      summary.errorMessages.forEach((msg, index) => {
        console.log(`  ${index + 1}. ${msg}`);
      });
    }
    console.log('================================');
  } catch (error: any) {
    console.error('Error al ejecutar el procesamiento en lote:', error.message);
  }
}

// Ejecutar el script si se llama directamente
if (require.main === module) {
  runBulkPaymentReferences();
}