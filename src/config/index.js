import dotenv from "dotenv";

dotenv.config();

export const config = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || "development",
    host: process.env.HOST || "0.0.0.0",
  },
  
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    fallbackModel: process.env.OPENAI_FALLBACK_MODEL || "gpt-3.5-turbo",
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || "4000"),
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || "0.7"),
    timeout: parseInt(process.env.OPENAI_TIMEOUT || "90000"),
    maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || "2"),
    retryDelay: parseInt(process.env.OPENAI_RETRY_DELAY || "2000"),
  },

  email: {
    provider: process.env.EMAIL_PROVIDER || "gmail", // gmail, sendgrid, mailgun, smtp
    from: process.env.EMAIL_FROM,
    fromName: process.env.EMAIL_FROM_NAME || "AI Travel Planner",
    
    // Gmail SMTP
    smtp: {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    },
    
    // SendGrid
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY,
    },
    
    // Mailgun
    mailgun: {
      apiKey: process.env.MAILGUN_API_KEY,
      domain: process.env.MAILGUN_DOMAIN,
    },
    
    maxRetries: parseInt(process.env.EMAIL_MAX_RETRIES || "3"),
    retryDelay: parseInt(process.env.EMAIL_RETRY_DELAY || "5000"),
  },

  cache: {
    enabled: process.env.CACHE_ENABLED !== "false",
    ttl: parseInt(process.env.CACHE_TTL || "3600"), // 1 hour in seconds
    checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD || "600"), // 10 minutes
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || "100"), // 100 requests per window
  },

  security: {
    corsOrigin: process.env.CORS_ORIGIN || "*",
    trustProxy: process.env.TRUST_PROXY === "true",
  },
};

// Валидация критических настроек
const validateConfig = () => {
  const errors = [];
  
  if (!config.openai.apiKey) {
    errors.push("OPENAI_API_KEY is required");
  }
  
  if (!config.email.from && !config.email.smtp.auth?.user) {
    errors.push("EMAIL_FROM or SMTP_USER is required");
  }
  
  if (errors.length > 0 && config.server.env === "production") {
    throw new Error(`Configuration errors: ${errors.join(", ")}`);
  }
  
  if (errors.length > 0) {
    console.warn("⚠️ Configuration warnings:", errors.join(", "));
  }
};

validateConfig();

export default config;


