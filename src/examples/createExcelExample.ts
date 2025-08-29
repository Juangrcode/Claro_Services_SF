import * as XLSX from 'xlsx';
import * as path from 'path';

/**
 * Script para crear un archivo Excel de ejemplo con datos de documentos
 */
function createExcelExample() {
  // Datos de ejemplo
  const data = [
    {
      tipoDocumento: '1',
      numDocumento: '1033798660',
      primerApellido: 'NAVARRO'
    },
    {
      tipoDocumento: '1',
      numDocumento: '1234567890',
      primerApellido: 'PEREZ'
    },
    {
      tipoDocumento: '2',
      numDocumento: '9876543210',
      primerApellido: 'RODRIGUEZ'
    }
  ];

  // Crear un nuevo libro de trabajo
  const workbook = XLSX.utils.book_new();
  
  // Convertir datos a formato de hoja de cálculo
  const worksheet = XLSX.utils.json_to_sheet(data);
  
  // Añadir la hoja al libro
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Documentos');
  
  // Ruta de salida
  const outputPath = path.resolve(__dirname, 'documentos.xlsx');
  
  // Escribir el archivo
  XLSX.writeFile(workbook, outputPath);
  
  console.log(`Archivo Excel de ejemplo creado en: ${outputPath}`);
}

// Ejecutar la función
createExcelExample();