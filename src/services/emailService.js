import nodemailer from "nodemailer";
import { config } from "../config/index.js";
import logger from "../utils/logger.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Сервис для отправки email через различные провайдеры
 * Поддерживает: Gmail SMTP, SendGrid, Mailgun, общий SMTP
 */
class EmailService {
  constructor() {
    this.config = config.email;
    this.transporter = null;
    this.maxRetries = this.config.maxRetries;
    this.retryDelay = this.config.retryDelay;
    this.initializeTransporter();
  }

  /**
   * Инициализация транспортера в зависимости от провайдера
   */
  initializeTransporter() {
    try {
      switch (this.config.provider.toLowerCase()) {
        case "gmail":
        case "smtp":
          this.transporter = nodemailer.createTransport({
            host: this.config.smtp.host,
            port: this.config.smtp.port,
            secure: this.config.smtp.secure,
            auth: this.config.smtp.auth,
          });
          break;

        case "sendgrid":
          // SendGrid использует SMTP
          this.transporter = nodemailer.createTransport({
            host: "smtp.sendgrid.net",
            port: 587,
            secure: false,
            auth: {
              user: "apikey",
              pass: this.config.sendgrid.apiKey,
            },
          });
          break;

        default:
          logger.warn(`Unknown email provider: ${this.config.provider}, using SMTP`);
          this.transporter = nodemailer.createTransport({
            host: this.config.smtp.host,
            port: this.config.smtp.port,
            secure: this.config.smtp.secure,
            auth: this.config.smtp.auth,
          });
      }

      // Проверка соединения (асинхронно, не блокирует старт)
      this.verifyConnection().catch((err) => {
        logger.error("Email transporter verification failed", { error: err.message });
      });
    } catch (error) {
      logger.error("Email transporter initialization failed", { error: error.message });
    }
  }

  /**
   * Проверка соединения с почтовым сервером
   */
  async verifyConnection() {
    if (!this.transporter) {
      throw new Error("Email transporter not initialized");
    }

    try {
      await this.transporter.verify();
      logger.info("Email transporter verified successfully");
      return true;
    } catch (error) {
      logger.error("Email transporter verification failed", { error: error.message });
      throw error;
    }
  }

  /**
   * Загрузка HTML шаблона
   */
  loadTemplate(templateName, data = {}) {
    try {
      const templatePath = join(__dirname, "../templates", `${templateName}.html`);
      let html = readFileSync(templatePath, "utf-8");

      // Обработка специальных полей ПЕРЕД общей заменой
      // Для name: если есть имя, показываем приветствие, иначе просто "Привет!"
      if (data.name && data.name.trim()) {
        html = html.replace(/{{name}}/g, `Привет, ${data.name}!`);
      } else {
        html = html.replace(/{{name}}/g, "Привет!");
      }

      // Для dates: если есть даты, показываем их, иначе пусто
      if (data.dates && data.dates.trim() && data.dates !== "не указаны") {
        html = html.replace(/{{dates}}/g, `<div class="dates">📅 ${data.dates}</div>`);
      } else {
        html = html.replace(/{{dates}}/g, "");
      }

      // Замена остальных переменных в шаблоне
      Object.keys(data).forEach((key) => {
        // Пропускаем уже обработанные поля
        if (key === "name" || key === "dates") return;
        
        const regex = new RegExp(`{{${key}}}`, "g");
        const value = data[key] || "";
        html = html.replace(regex, value);
      });

      return html;
    } catch (error) {
      logger.error("Template loading error", {
        template: templateName,
        error: error.message,
      });
      // Возвращаем простой HTML шаблон как fallback
      return this.getSimpleTemplate(data);
    }
  }

  /**
   * Простой HTML шаблон (fallback)
   */
  getSimpleTemplate(data) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Маршрут поездки в ${data.city || "город"}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .route-content { background: white; padding: 20px; border-radius: 5px; margin-top: 20px; white-space: pre-wrap; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
    h1 { margin: 0; }
    h2 { color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🌍 Маршрут поездки в ${data.city || "город"}</h1>
    ${data.dates ? `<p>📅 ${data.dates}</p>` : ""}
  </div>
  <div class="content">
    ${data.name ? `<p>Привет, ${data.name}!</p>` : "<p>Привет!</p>"}
    <p>Ваш персональный маршрут готов! Вот детальный план поездки:</p>
    <div class="route-content">${data.route || "Маршрут не сгенерирован"}</div>
    <div class="footer">
      <p>С уважением,<br>AI Travel Planner</p>
      <p>Это автоматическое письмо, пожалуйста не отвечайте на него.</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Отправка email с маршрутом
   */
  async sendRouteEmail(emailData) {
    const {
      to,
      city,
      route,
      dates,
      name,
      retryCount = 0,
    } = emailData;

    if (!this.transporter) {
      throw new Error("Email transporter not initialized");
    }

    if (!to) {
      throw new Error("Email recipient not specified");
    }

    try {
      const htmlContent = this.loadTemplate("route", {
        city: city || "город",
        route: route || "Маршрут не сгенерирован",
        dates: dates || "",
        name: name || "",
      });

      const mailOptions = {
        from: `${this.config.fromName} <${this.config.from || this.config.smtp.auth?.user}>`,
        to,
        subject: `🌍 Ваш маршрут поездки в ${city || "город"}`,
        html: htmlContent,
        text: `Ваш маршрут поездки в ${city || "город"}\n\n${route || "Маршрут не сгенерирован"}`,
      };

      logger.info("Sending route email", {
        to,
        city,
        attempt: retryCount + 1,
      });

      const info = await this.transporter.sendMail(mailOptions);

      logger.info("Route email sent successfully", {
        to,
        messageId: info.messageId,
        response: info.response,
      });

      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
      };
    } catch (error) {
      logger.error("Email sending failed", {
        to,
        error: error.message,
        attempt: retryCount + 1,
      });

      // Retry для определенных ошибок
      if (retryCount < this.maxRetries) {
        const shouldRetry =
          error.code === "ECONNECTION" ||
          error.code === "ETIMEDOUT" ||
          error.code === "ESOCKET" ||
          error.responseCode >= 500;

        if (shouldRetry) {
          logger.info("Retrying email send", {
            to,
            attempt: retryCount + 1,
            delay: this.retryDelay * (retryCount + 1),
          });

          await this.delay(this.retryDelay * (retryCount + 1));

          return this.sendRouteEmail({
            ...emailData,
            retryCount: retryCount + 1,
          });
        }
      }

      throw error;
    }
  }

  /**
   * Отправка уведомления об ошибке
   */
  async sendErrorNotification(error, context = {}) {
    if (!this.config.from) {
      logger.warn("Cannot send error notification: EMAIL_FROM not configured");
      return;
    }

    try {
      const mailOptions = {
        from: `${this.config.fromName} <${this.config.from || this.config.smtp.auth?.user}>`,
        to: this.config.from, // Отправляем себе
        subject: "⚠️ Ошибка генерации маршрута",
        html: `
          <h2>Ошибка генерации маршрута</h2>
          <p><strong>Ошибка:</strong> ${error.message}</p>
          <pre>${error.stack || JSON.stringify(error, null, 2)}</pre>
          <h3>Контекст:</h3>
          <pre>${JSON.stringify(context, null, 2)}</pre>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      logger.info("Error notification sent");
    } catch (notifError) {
      logger.error("Failed to send error notification", {
        error: notifError.message,
      });
    }
  }

  /**
   * Задержка между попытками
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default new EmailService();

