# Procesamiento en Lote de Documentos

Esta funcionalidad permite procesar una lista de documentos desde un archivo Excel o JSON y consultar el servicio de Claro para verificar si devuelve información para cada documento.

## Estructura de los archivos de entrada

### Archivo JSON

El archivo JSON debe contener un array de objetos con la siguiente estructura:

```json
[
  {
    "tipoDocumento": "1",
    "numDocumento": "1033798660",
    "primerApellido": "NAVARRO"
  },
  {
    "tipoDocumento": "1",
    "numDocumento": "1234567890",
    "primerApellido": "PEREZ"
  }
]
```

### Archivo Excel

El archivo Excel debe tener una hoja con las siguientes columnas:

- `tipoDocumento`: Tipo de documento (string)
- `numDocumento`: Número de documento (string)
- `primerApellido`: Primer apellido (string)

## Cómo usar la funcionalidad

### Desde la línea de comandos

1. Instalar las dependencias:

```bash
npm install
```

2. Ejecutar el script de ejemplo:

```bash
npm run bulk-check
```

Esto procesará el archivo de ejemplo `documentos.json` y generará un archivo Excel con los resultados.

### Desde código

```typescript
import { processBulkDocumentCheck, saveResultsToExcel } from '../services/rest/bulkDocumentCheck';
import path from 'path';

// Procesar documentos desde un archivo JSON
const jsonFilePath = path.resolve(__dirname, 'documentos.json');
const results = await processBulkDocumentCheck(jsonFilePath, 'json');

// O procesar desde un archivo Excel
// const excelFilePath = path.resolve(__dirname, 'documentos.xlsx');
// const results = await processBulkDocumentCheck(excelFilePath, 'excel');

// Guardar resultados en Excel
const outputPath = path.resolve(__dirname, 'resultados.xlsx');
await saveResultsToExcel(results, outputPath);
```

## Estructura de los resultados

La función `processBulkDocumentCheck` devuelve un array de objetos con la siguiente estructura:

```typescript
interface DocumentCheckResult {
  tipoDocumento: string;
  numDocumento: string;
  primerApellido: string;
  status: 'success' | 'failed';
  hasInformation: boolean;
  details: string;
  timestamp: string;
}
```

Donde:

- `tipoDocumento`, `numDocumento`, `primerApellido`: Datos del documento consultado
- `status`: Estado de la consulta ('success' o 'failed')
- `hasInformation`: Indica si se encontró información para el documento
- `details`: Detalles adicionales sobre la consulta
- `timestamp`: Fecha y hora de la consulta

## Archivo de resultados

La función `saveResultsToExcel` guarda los resultados en un archivo Excel con todas las columnas mencionadas anteriormente.