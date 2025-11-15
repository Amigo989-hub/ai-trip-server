import logger from "../utils/logger.js";
import { config } from "../config/index.js";

/**
 * Middleware для обработки ошибок
 */
export const errorHandler = (err, req, res, next) => {
  logger.error("Request error", {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    ip: req.ip,
  });

  // Определяем статус код
  const statusCode = err.statusCode || err.status || 500;

  // Формируем ответ
  const response = {
    success: false,
    error: err.message || "Internal server error",
  };

  // В development режиме добавляем stack trace
  if (config.server.env === "development") {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * Middleware для обработки 404
 */
export const notFoundHandler = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};


