# Claro Services SF

Monitor de servicios REST y SOAP para Claro.

## Instalación

```bash
npm install
```

## Uso

### Iniciar el servicio

```bash
npm run build
npm start
```

### Modo desarrollo

```bash
npm run dev
```

## Funcionalidades

### Monitor de Servicios

Permite monitorear servicios REST y SOAP configurados en el archivo `src/config/services.json`.

### Procesamiento en Lote de Documentos

Esta funcionalidad permite procesar una lista de documentos desde un archivo Excel o JSON y consultar el servicio de Claro para verificar si devuelve información para cada documento.

#### Cómo usar el procesamiento en lote

1. Crear un archivo Excel o JSON con los datos de los documentos a consultar.

   Para crear un archivo Excel de ejemplo:

   ```bash
   npm run create-excel-example
   ```

   O utilizar el archivo JSON de ejemplo en `src/examples/documentos.json`.

2. Ejecutar el script de procesamiento en lote:

   ```bash
   npm run bulk-check
   ```

   Esto procesará el archivo de ejemplo y generará un archivo Excel con los resultados.

#### Estructura de los archivos de entrada

##### Archivo JSON

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

##### Archivo Excel

El archivo Excel debe tener una hoja con las columnas:
- `tipoDocumento`
- `numDocumento`
- `primerApellido`

Para más detalles sobre esta funcionalidad, consulta la [documentación específica](src/examples/README.md).