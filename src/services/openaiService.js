import fetch from "node-fetch";
import { config } from "../config/index.js";
import logger from "../utils/logger.js";

/**
 * Сервис для работы с OpenAI API
 * Включает retry механизм, fallback модель, кэширование промптов
 */
class OpenAIService {
  constructor() {
    this.apiKey = config.openai.apiKey;
    this.baseUrl = "https://api.openai.com/v1";
    this.defaultModel = config.openai.model;
    this.fallbackModel = config.openai.fallbackModel;
    this.maxTokens = config.openai.maxTokens;
    this.temperature = config.openai.temperature;
    this.timeout = config.openai.timeout;
    this.maxRetries = config.openai.maxRetries;
    this.retryDelay = config.openai.retryDelay;
  }

  /**
   * Генерация промпта для маршрута
   */
  buildPrompt(city, startDate, endDate, budget, interests, people, days) {
    return `Ты — профессиональный travel-планировщик.
Создай ПОЛНЫЙ и детальный маршрут поездки в ${city}.

📅 Даты: ${startDate || "не указаны"} - ${endDate || "не указаны"} (${days} ${days === 1 ? 'день' : 'дней'})
💰 Бюджет: ${budget || "не указан"}
🎯 Интересы: ${interests || "не указаны"}
👥 Путешественников: ${people || "1"}

ВАЖНО: Опиши КАЖДЫЙ день с утра до вечера:
- Что посетить (достопримечательности, музеи, парки) с конкретными названиями и адресами
- Где поесть (завтрак, обед, ужин с названиями ресторанов/кафе и их локациями)
- Что попробовать (локальные блюда, напитки, десерты)
- Советы по транспорту между точками (метро, автобус, пешком)
- Атмосферу и рекомендации для каждого места
- Бюджетные альтернативы, если нужно

Структура:
- Используй эмодзи для визуального разделения
- Структурируй по времени дня: ☀️ Утро, 🌞 День, 🌙 Вечер
- Добавляй конкретные адреса и время работы мест
- Учитывай логистику перемещений между точками

ОБЯЗАТЕЛЬНО: Заверши маршрут полностью для всех дней. Не прерывай ответ посередине.
Используй Markdown форматирование для читаемости.`;
  }

  /**
   * Выполнение запроса к OpenAI с retry механизмом
   */
  async generateRoute(prompt, options = {}) {
    const {
      model = this.defaultModel,
      useFallback = true,
      retryCount = 0,
    } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const startTime = Date.now();
      
      logger.info("OpenAI request", {
        model,
        attempt: retryCount + 1,
        promptLength: prompt.length,
      });

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: this.temperature,
          max_tokens: this.maxTokens,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { message: errorText };
        }

        logger.error("OpenAI API error", {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          attempt: retryCount + 1,
        });

        // Retry для определенных ошибок
        if (
          retryCount < this.maxRetries &&
          (response.status === 429 || response.status >= 500)
        ) {
          logger.info("Retrying OpenAI request", {
            attempt: retryCount + 1,
            status: response.status,
          });
          await this.delay(this.retryDelay * (retryCount + 1));
          return this.generateRoute(prompt, {
            ...options,
            retryCount: retryCount + 1,
          });
        }

        throw new Error(
          `OpenAI API error: ${response.status} - ${errorData.message || errorText}`
        );
      }

      const result = await response.json();
      const choice = result.choices?.[0];
      const content = choice?.message?.content || "Маршрут не удалось создать.";
      const finishReason = choice?.finish_reason || "unknown";
      const usage = result.usage || {};

      logger.info("OpenAI response", {
        duration: `${duration}ms`,
        finishReason,
        tokens: {
          total: usage.total_tokens,
          prompt: usage.prompt_tokens,
          completion: usage.completion_tokens,
        },
        contentLength: content.length,
        attempt: retryCount + 1,
      });

      // Если ответ обрезан и есть fallback модель, пробуем fallback
      if (
        finishReason === "length" &&
        useFallback &&
        model !== this.fallbackModel &&
        retryCount === 0
      ) {
        logger.warn("Response truncated, trying fallback model", {
          originalModel: model,
          fallbackModel: this.fallbackModel,
        });

        // Увеличиваем лимит токенов для fallback
        const originalMaxTokens = this.maxTokens;
        this.maxTokens = Math.min(4000, this.maxTokens + 2000);

        try {
          const fallbackResult = await this.generateRoute(prompt, {
            model: this.fallbackModel,
            useFallback: false,
            retryCount: 0,
          });
          this.maxTokens = originalMaxTokens;
          return fallbackResult;
        } catch (fallbackError) {
          this.maxTokens = originalMaxTokens;
          // Возвращаем обрезанный результат вместо ошибки
          logger.warn("Fallback failed, returning truncated result");
        }
      }

      // Проверка на обрыв ответа
      if (finishReason === "length") {
        logger.warn("Response was truncated", {
          contentLength: content.length,
          tokensUsed: usage.completion_tokens,
          maxTokens: this.maxTokens,
        });
      }

      return {
        content,
        finishReason,
        usage,
        model,
        duration,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === "AbortError") {
        logger.error("OpenAI request timeout", {
          timeout: this.timeout,
          attempt: retryCount + 1,
        });

        // Retry при таймауте
        if (retryCount < this.maxRetries) {
          logger.info("Retrying after timeout", {
            attempt: retryCount + 1,
          });
          await this.delay(this.retryDelay * (retryCount + 1));
          return this.generateRoute(prompt, {
            ...options,
            retryCount: retryCount + 1,
          });
        }

        // Если fallback доступен, пробуем его
        if (useFallback && model !== this.fallbackModel && retryCount === 0) {
          logger.info("Trying fallback model after timeout");
          return this.generateRoute(prompt, {
            model: this.fallbackModel,
            useFallback: false,
            retryCount: 0,
          });
        }

        throw new Error(`OpenAI request timeout after ${this.timeout}ms`);
      }

      // Retry для других сетевых ошибок
      if (
        retryCount < this.maxRetries &&
        (error.message.includes("ECONNRESET") ||
          error.message.includes("ETIMEDOUT") ||
          error.message.includes("ENOTFOUND"))
      ) {
        logger.info("Retrying after network error", {
          error: error.message,
          attempt: retryCount + 1,
        });
        await this.delay(this.retryDelay * (retryCount + 1));
        return this.generateRoute(prompt, {
          ...options,
          retryCount: retryCount + 1,
        });
      }

      throw error;
    }
  }

  /**
   * Задержка между попытками
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default new OpenAIService();


