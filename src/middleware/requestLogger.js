import { logRequest } from "../utils/logger.js";

/**
 * Middleware для логирования HTTP запросов
 */
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Логирование после завершения ответа
  res.on("finish", () => {
    const responseTime = Date.now() - startTime;
    logRequest(req, res, responseTime);
  });

  next();
};


