import path from 'path';
import express, { Application, Request, Response } from 'express';
import { checkAllServices } from './services';
import { logger } from './utils/logger';
import { EnvironmentType } from './types';

export const setupRoutes = (app: Application): void => {
  // Serve static files
  app.use(express.static(path.join(__dirname, '..', 'src', 'public')));

  // Root endpoint - Serve HTML interface (Frontend)
  app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '..', 'src', 'public', 'index.html'));
  });

  // API endpoint - Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'Service monitor is running' });
  });
  
  // API endpoint - List available environments
  app.get('/api/environments', (req: Request, res: Response) => {
    const environments: EnvironmentType[] = ['DEV', 'QA', 'SIT', 'UAT', 'PROD'];
    const currentEnv = process.env.ENVIRONMENT as EnvironmentType || 'SIT';
    res.json({ 
      environments, 
      current: currentEnv 
    });
  });

  // Check all services
  app.get('/check-all', async (req: Request, res: Response) => {
    try {
      // Get environment from query parameter or use default from .env
      const environment = req.query.environment as EnvironmentType || req.query.env as EnvironmentType || undefined;
      
      // Get disabled services from query parameter
      let disabledServices: Record<string, boolean> = {};
      if (req.query.disabledServices) {
        try {
          disabledServices = JSON.parse(req.query.disabledServices as string);
        } catch (parseError) {
          logger.warn('Error parsing disabledServices from query parameter:', parseError);
        }
      }
      
      const results = await checkAllServices(null, environment, disabledServices);
      res.json(results);
    } catch (error) {
      logger.error('Error checking all services:', error);
      res.status(500).json({ error: 'Failed to check services' });
    }
  });

  // Check specific service by ID
  app.get('/check/:serviceId', async (req: Request, res: Response) => {
    try {
      const { serviceId } = req.params;
      // Get environment from query parameter or use default from .env
      const environment = req.query.environment as EnvironmentType || req.query.env as EnvironmentType || undefined;
      
      // Get disabled services from query parameter
      let disabledServices: Record<string, boolean> = {};
      if (req.query.disabledServices) {
        try {
          disabledServices = JSON.parse(req.query.disabledServices as string);
        } catch (parseError) {
          logger.warn('Error parsing disabledServices from query parameter:', parseError);
        }
      }
      
      const results = await checkAllServices(serviceId, environment, disabledServices);
      res.json(results);
    } catch (error) {
      logger.error(`Error checking service ${req.params.serviceId}:`, error);
      res.status(500).json({ error: 'Failed to check service' });
    }
  });
};