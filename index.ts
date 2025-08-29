import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { setupRoutes } from './src/routes';
import { logger } from './src/utils/logger';
import { EnvironmentType } from './src/types';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup routes
setupRoutes(app);

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info('Service monitor started');
});