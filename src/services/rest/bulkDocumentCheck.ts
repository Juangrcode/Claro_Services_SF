import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import * as dotenv from 'dotenv';
import { logger } from '../../utils/logger';

// Cargar variables de entorno
dotenv.config();

interface DocumentData {
  tipoDocumento: string;
  numDocumento: string;
  primerApellido: string;
}

interface DocumentCheckResult extends DocumentData {
  status: 'success' | 'failed';
  hasInformation: boolean;
  details: string;
  timestamp: string;
  responseTime?: number;
  statusCode?: number;
  responseData?: any;
}

interface DocumentCheckSummary {
  total: number;
  successful: number;
  failed: number;
  withInformation: number;
  withoutInformation: number;
  averageResponseTime: number;
  statusCodeDistribution: Record<number, number>;
  errorMessages: string[];
}

/**
 * Procesa un archivo Excel o JSON con datos de documentos y consulta el servicio de Claro
 * @param {string} filePath - Ruta al archivo Excel o JSON
 * @param {string} fileType - Tipo de archivo ('excel' o 'json')
 * @returns {Promise<DocumentCheckResult[]>} - Resultados de las consultas
 */
export async function processBulkDocumentCheck(
  filePath: string,
  fileType: 'excel' | 'json',
  customHeaders?: Record<string, string>
): Promise<DocumentCheckResult[]> {
  try {
    logger.info(`Procesando archivo ${filePath} de tipo ${fileType}`);
    
    // Cargar datos desde el archivo
    const documents = await loadDocumentsFromFile(filePath, fileType);
    logger.info(`Se cargaron ${documents.length} documentos para procesar`);
    
    const results: DocumentCheckResult[] = [];
    
    // Procesar cada documento
    for (const doc of documents) {
      try {
        logger.info(`Consultando documento: ${doc.tipoDocumento}-${doc.numDocumento}`);
        
        const startTime = Date.now();
        const response = await checkDocument(doc, customHeaders);
        const responseTime = Date.now() - startTime;
        
        // Verificar si la respuesta contiene información
        const hasInformation = checkIfResponseHasInformation(response.data);
        
        results.push({
          ...doc,
          status: 'success',
          hasInformation,
          details: hasInformation ? 'Se encontró información' : 'No se encontró información',
          timestamp: new Date().toISOString(),
          responseTime,
          statusCode: response.status,
          responseData: response.data
        });
        
        logger.info(`Documento ${doc.numDocumento} procesado: ${hasInformation ? 'Con información' : 'Sin información'}`);
      } catch (error: any) {
        logger.error(`Error al consultar documento ${doc.numDocumento}:`, error.message);
        
        results.push({
          ...doc,
          status: 'failed',
          hasInformation: false,
          details: `Error: ${error.message}`,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Generar y mostrar resumen
    const summary = generateDocumentCheckSummary(results);
    console.log('\n===== RESUMEN DE CONSULTAS =====');
    console.log(`Total de documentos procesados: ${summary.total}`);
    console.log(`Consultas exitosas: ${summary.successful} (${Math.round(summary.successful/summary.total*100)}%)`);
    console.log(`Consultas fallidas: ${summary.failed} (${Math.round(summary.failed/summary.total*100)}%)`);
    console.log(`Documentos con información: ${summary.withInformation} (${Math.round(summary.withInformation/summary.total*100)}%)`);
    console.log(`Documentos sin información: ${summary.withoutInformation} (${Math.round(summary.withoutInformation/summary.total*100)}%)`);
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
    logger.error('Error en processBulkDocumentCheck:', error.message);
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
        tipoDocumento: row.tipoDocumento?.toString() || '',
        numDocumento: row.numDocumento?.toString() || '',
        primerApellido: row.primerApellido?.toString() || ''
      })).filter(doc => doc.tipoDocumento && doc.numDocumento && doc.primerApellido);
    } else {
      // Leer archivo JSON
      const fileContent = await fs.promises.readFile(filePath, 'utf8');
      const data = JSON.parse(fileContent);
      
      if (Array.isArray(data)) {
        // Validar y transformar datos
        return data.map((item: any) => ({
          tipoDocumento: item.tipoDocumento?.toString() || '',
          numDocumento: item.numDocumento?.toString() || '',
          primerApellido: item.primerApellido?.toString() || ''
        })).filter(doc => doc.tipoDocumento && doc.numDocumento && doc.primerApellido);
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
 * Consulta el servicio de Claro para un documento específico
 * @param {DocumentData} doc - Datos del documento a consultar
 * @param {Record<string, string>} [customHeaders] - Headers personalizados opcionales
 * @returns {Promise<any>} - Respuesta del servicio
 */
async function checkDocument(doc: DocumentData, customHeaders?: Record<string, string>): Promise<any> {
  const { tipoDocumento, numDocumento, primerApellido } = doc;
  
  // Construir URL con parámetros
  const environment = process.env.ENVIRONMENT || 'UAT';
  const baseUrl = environment === 'SIT' ? 
    process.env.SF_URL_SIT : 
    process.env.SF_URL_UAT;
  
  const url = `${baseUrl}/Reconocer/V1.0/Rest/getInformacion`;
  
  console.log(`Consultando URL: ${url}`);
  
  const params = {
    transactionId: 'string',
    system: 'string',
    requestDate: new Date().toISOString(),
    tipoDocumento,
    numDocumento,
    usuarioConsulta: 'ECM4644E',
    primerApellido,
    target: 'string',
    user: 'string',
    password: 'string',
    ipApplication: 'string',
    traceabilityId: 'string'
  };
  
  console.log(`Parámetros de consulta:`, JSON.stringify(params, null, 2));
  
  // Configurar headers desde variables de entorno y headers personalizados
  const headers: Record<string, string> = {...(customHeaders || {})};
  
  if (process.env.NAME_API_KEY && process.env.API_KEY) {
    headers[process.env.NAME_API_KEY] = process.env.API_KEY;
    console.log(`Usando header de autenticación: ${process.env.NAME_API_KEY}`);
  } else {
    console.log('ADVERTENCIA: No se encontraron variables de entorno para los headers de autenticación');
  }
  
  console.log('Headers configurados:', JSON.stringify(headers, null, 2));
  
  // Realizar la consulta
  const startTime = Date.now();
  const response = await axios({
    url,
    method: 'GET',
    params,
    headers,
    timeout: 30000,
    validateStatus: () => true // No lanzar error por códigos de estado
  });
  
  const responseTime = Date.now() - startTime;
  console.log(`Respuesta recibida en ${responseTime}ms con status: ${response.status}`);
  console.log(`Datos de respuesta:`, JSON.stringify(response.data, null, 2));
  
  return response;
}

/**
 * Verifica si la respuesta contiene información relevante
 * @param {any} responseData - Datos de la respuesta
 * @returns {boolean} - True si contiene información, false en caso contrario
 */
function checkIfResponseHasInformation(responseData: any): boolean {
  // Implementar lógica para verificar si la respuesta contiene información
  // Esta implementación dependerá de la estructura de la respuesta del servicio
  
  console.log('Analizando respuesta para determinar si contiene información...');
  
  // Ejemplo básico: verificar si la respuesta no está vacía y no contiene errores
  if (!responseData) {
    console.log('La respuesta es nula o indefinida');
    return false;
  }
  
  // Si la respuesta tiene un campo de error o está vacía
  if (responseData.error || 
      (typeof responseData === 'object' && Object.keys(responseData).length === 0)) {
    console.log('La respuesta contiene un error o está vacía');
    return false;
  }
  
  // Si la respuesta tiene datos en algún campo específico (ajustar según la estructura real)
  if (responseData.data || responseData.cliente || responseData.informacion) {
    console.log('La respuesta contiene información en campos específicos');
    return true;
  }
  
  // Por defecto, si hay algún contenido, asumimos que hay información
  const hasContent = Object.keys(responseData).length > 0;
  console.log(`La respuesta ${hasContent ? 'contiene' : 'no contiene'} información`);
  return hasContent;
}

/**
 * Guarda los resultados en un archivo Excel
 * @param {DocumentCheckResult[]} results - Resultados de las consultas
 * @param {string} outputPath - Ruta donde guardar el archivo de resultados
 * @returns {Promise<string>} - Ruta del archivo generado
 */
/**
 * Genera un resumen estadístico de los resultados de las consultas
 * @param {DocumentCheckResult[]} results - Resultados de las consultas
 * @returns {DocumentCheckSummary} - Resumen estadístico
 */
export function generateDocumentCheckSummary(results: DocumentCheckResult[]): DocumentCheckSummary {
  const summary: DocumentCheckSummary = {
    total: results.length,
    successful: 0,
    failed: 0,
    withInformation: 0,
    withoutInformation: 0,
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
 * @param {DocumentCheckResult[]} results - Resultados de las consultas
 * @param {string} outputPath - Ruta donde guardar el archivo de resultados
 * @returns {Promise<string>} - Ruta del archivo generado
 */
export async function saveResultsToExcel(
  results: DocumentCheckResult[],
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