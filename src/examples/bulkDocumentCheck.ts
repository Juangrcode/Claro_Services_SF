import path from 'path';
import { processBulkDocumentCheck, saveResultsToExcel, generateDocumentCheckSummary } from '../services/rest/bulkDocumentCheck';
import { logger } from '../utils/logger';
import * as dotenv from 'dotenv';

/**
 * Script de ejemplo para procesar documentos en lote
 */
async function runBulkDocumentCheck() {
  try {
    // Cargar variables de entorno
    dotenv.config();
    
    // Ruta al archivo de documentos (JSON de prueba)
    const jsonFilePath = path.resolve(__dirname, 'documentos-test.json');
    
    console.log('Iniciando procesamiento de documentos en lote desde JSON...');
    
    // Headers personalizados (opcional)
    const customHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    // Si hay variables de entorno para los headers, se usarán automáticamente
    // junto con estos headers personalizados
    
    // Procesar documentos desde archivo JSON
    const results = await processBulkDocumentCheck(jsonFilePath, 'json', customHeaders);
    
    console.log(`Se procesaron ${results.length} documentos`);
    
    // Mostrar qué documentos se consultaron
    console.log('\nDocumentos consultados:');
    results.forEach(result => {
      console.log(`- Tipo: ${result.tipoDocumento}, Número: ${result.numDocumento}`);
    });
    
    // Mostrar resultados en consola
    console.log('Resultados:');
    results.forEach(result => {
      console.log(`- Documento: ${result.tipoDocumento}-${result.numDocumento} (${result.primerApellido})`);
      console.log(`  Estado: ${result.status}, Tiene información: ${result.hasInformation ? 'Sí' : 'No'}`);
      console.log(`  Detalles: ${result.details}`);
      console.log('---');
    });
    
    // Guardar resultados en Excel
    const outputPath = path.resolve(__dirname, 'resultados.xlsx');
    await saveResultsToExcel(results, outputPath);
    
    console.log(`Resultados guardados en: ${outputPath}`);
    
    // Mostrar resumen después de guardar los resultados
    console.log('\n===== RESUMEN FINAL DE CONSULTAS =====');
    const summary = generateDocumentCheckSummary(results);
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
    console.log('================================');
  } catch (error: any) {
    console.error('Error al ejecutar el procesamiento en lote:', error.message);
  }
}

// Ejecutar el script
runBulkDocumentCheck();