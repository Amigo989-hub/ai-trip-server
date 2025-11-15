import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import querystring from "querystring";
import { config } from "./src/config/index.js";
import logger from "./src/utils/logger.js";
import { requestLogger } from "./src/middleware/requestLogger.js";
import { errorHandler, notFoundHandler } from "./src/middleware/errorHandler.js";
import routeHandler from "./src/routes/routeHandler.js";
import cacheService from "./src/services/cacheService.js";

const app = express();
const PORT = config.server.port;
const HOST = config.server.host;

// === Trust Proxy (для правильной работы за reverse proxy) ===
if (config.security.trustProxy) {
  app.set("trust proxy", 1);
}

// === Security Headers ===
app.use(
  helmet({
    contentSecurityPolicy: false, // Отключаем для API
    crossOriginEmbedderPolicy: false,
  })
);

// === Compression ===
app.use(compression());

// === CORS ===
app.use(
  cors({
    origin: config.security.corsOrigin,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// === Rate Limiting ===
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    success: false,
    error: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn("Rate limit exceeded", {
      ip: req.ip,
      url: req.url,
    });
    res.status(429).json({
      success: false,
      error: "Too many requests, please try again later.",
    });
  },
});

app.use("/api/", limiter);

// === Fallback для text/plain (до других парсеров) ===
app.use((req, res, next) => {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("text/plain")) {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk.toString();
    });
    req.on("end", () => {
      try {
        // Пробуем распарсить как JSON
        req.body = JSON.parse(data);
        logger.debug("text/plain parsed as JSON");
      } catch (e) {
        // Если не JSON, парсим как URL-encoded
        req.body = querystring.parse(data);
        logger.debug("text/plain parsed as URL-encoded");
      }
      next();
    });
  } else {
    next();
  }
});

// === Body Parsing ===
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// === Request Logging ===
app.use(requestLogger);

// === Health Check ===
app.get("/health", (req, res) => {
  const uptime = process.uptime();
  const memory = process.memoryUsage();
  const cacheStats = cacheService.getStats();

  res.json({
    status: "healthy",
    uptime: `${Math.floor(uptime)}s`,
    timestamp: new Date().toISOString(),
    memory: {
      rss: `${Math.round(memory.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
    },
    cache: cacheStats,
    environment: config.server.env,
  });
});

// === Root ===
app.get("/", (req, res) => {
  res.json({
    status: "OK",
    service: "AI Travel Route Generator",
    version: "2.0.0",
    endpoint: "/api/route",
    health: "/health",
    timestamp: new Date().toISOString(),
  });
});

// === API Routes ===
app.use("/", routeHandler);

// === 404 Handler ===
app.use(notFoundHandler);

// === Error Handler ===
app.use(errorHandler);

// === Graceful Shutdown ===
const server = app.listen(PORT, HOST, () => {
  logger.info("Server started", {
    port: PORT,
    host: HOST,
    environment: config.server.env,
    openai: config.openai.apiKey ? "configured" : "missing",
    email: config.email.from || config.email.smtp.auth?.user ? "configured" : "missing",
    cache: config.cache.enabled ? "enabled" : "disabled",
  });

  console.log(`
╔══════════════════════════════════════════════╗
║     🚀 AI Travel Planner READY               ║
╠══════════════════════════════════════════════╣
║  📍 Port:        ${PORT.toString().padEnd(31)}║
║  🌍 Host:        ${HOST.padEnd(31)}║
║  🔧 Environment: ${config.server.env.padEnd(31)}║
║  🔑 OpenAI:      ${(config.openai.apiKey ? "✅ Configured" : "❌ Missing").padEnd(31)}║
║  📧 Email:       ${((config.email.from || config.email.smtp.auth?.user) ? "✅ Configured" : "⚠️  Not configured").padEnd(31)}║
║  💾 Cache:       ${(config.cache.enabled ? "✅ Enabled" : "❌ Disabled").padEnd(31)}║
║  🕒 Started:     ${new Date().toISOString().padEnd(31)}║
╚══════════════════════════════════════════════╝
  `);
});

// === Graceful Shutdown Handler ===
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);

  server.close(() => {
    logger.info("HTTP server closed");

    // Очистка кэша
    if (cacheService.enabled) {
      cacheService.clear();
    }

    logger.info("Graceful shutdown completed");
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// === Unhandled Errors ===
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", {
    error: error.message,
    stack: error.stack,
  });
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection", {
    reason: reason?.message || reason,
    promise: promise.toString(),
  });
});

export default app;
