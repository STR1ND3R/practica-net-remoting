import winston from 'winston';
import { config } from './config.js';

const { createLogger, format, transports } = winston;
const { combine, timestamp, printf, colorize, errors } = format;

// Custom format for log messages
const logFormat = printf(({ level, message, timestamp, service, ...metadata }) => {
  let msg = `${timestamp} [${service || 'APP'}] ${level}: ${message}`;
  
  // Add metadata if present
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  
  return msg;
});

// Create logger instance
export const createServiceLogger = (serviceName) => {
  return createLogger({
    level: config.logLevel,
    format: combine(
      errors({ stack: true }),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      logFormat
    ),
    defaultMeta: { service: serviceName },
    transports: [
      new transports.Console({
        format: combine(
          colorize(),
          logFormat
        )
      }),
      new transports.File({ 
        filename: `logs/${serviceName}-error.log`, 
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      }),
      new transports.File({ 
        filename: `logs/${serviceName}.log`,
        maxsize: 5242880, // 5MB
        maxFiles: 5
      })
    ]
  });
};

export default createServiceLogger;

