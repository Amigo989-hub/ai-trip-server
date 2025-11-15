import { Router } from "express";
import { parseTildaData, normalizeFormData } from "../utils/tildaParser.js";
import { validateFormData, calculateDays, validateDates } from "../utils/validator.js";
import openaiService from "../services/openaiService.js";
import emailService from "../services/emailService.js";
import cacheService from "../services/cacheService.js";
import logger from "../utils/logger.js";

const router = Router();

/**
 * POST /api/route - Генерация маршрута
 */
router.post("/api/route", async (req, res) => {
  let responseSent = false;

  const sendResponse = (success, message) => {
    if (responseSent) return;
    responseSent = true;
    res.status(200).json({ success, message });
  };

  try {
    logger.info("Route generation request received");

    // Парсинг данных от Tilda
    const parsedData = parseTildaData(req.body || {});
    logger.debug("Parsed Tilda data", { parsedData });

    // Нормализация данных
    const normalizedData = normalizeFormData(parsedData);
    logger.debug("Normalized form data", { normalizedData });

    // Валидация данных
    const validation = validateFormData(normalizedData);

    if (!validation.isValid) {
      logger.warn("Validation failed", {
        errors: validation.errors,
        data: normalizedData,
      });

      // Всегда отвечаем успехом для Tilda, но логируем ошибки
      sendResponse(
        true,
        "Заявка принята! Менеджер свяжется с вами для уточнения деталей."
      );
      return;
    }

    const { data: formData } = validation;
    const { city, email, startDate, endDate, budget, interests, people, name } =
      formData;

    // Валидация дат
    const dateValidation = validateDates(startDate, endDate);
    if (!dateValidation.isValid && startDate && endDate) {
      logger.warn("Date validation failed", {
        error: dateValidation.error,
        startDate,
        endDate,
      });
    }

    const days = calculateDays(startDate, endDate);
    const dates = startDate && endDate ? `${startDate} - ${endDate}` : "не указаны";

    // Проверка кэша
    const cachedRoute = cacheService.get(
      city,
      startDate,
      endDate,
      budget,
      interests,
      people
    );

    if (cachedRoute) {
      logger.info("Using cached route", { city, email });

      // Отправляем ответ Tilda
      sendResponse(
        true,
        "Маршрут генерируется. Проверьте почту в течение 5 минут!"
      );

      // Отправляем email асинхронно
      (async () => {
        try {
          await emailService.sendRouteEmail({
            to: email,
            city,
            route: cachedRoute.route,
            dates,
            name,
          });

          logger.info("Cached route email sent", { city, email });
        } catch (emailError) {
          logger.error("Failed to send cached route email", {
            error: emailError.message,
            city,
            email,
          });
        }
      })();

      return;
    }

    // ⚡ Быстрый ответ Tilda (до генерации маршрута)
    sendResponse(
      true,
      "Маршрут генерируется. Проверьте почту в течение 5 минут!"
    );

    // === Асинхронная генерация маршрута ===
    (async () => {
      try {
        logger.info("Starting route generation", { city, email, days });

        // Создание промпта
        const prompt = openaiService.buildPrompt(
          city,
          startDate,
          endDate,
          budget,
          interests,
          people,
          days
        );

        // Генерация маршрута через OpenAI
        const aiResult = await openaiService.generateRoute(prompt);

        if (!aiResult || !aiResult.content) {
          throw new Error("OpenAI returned empty response");
        }

        const route = aiResult.content;

        logger.info("Route generated successfully", {
          city,
          email,
          routeLength: route.length,
          finishReason: aiResult.finishReason,
          tokens: aiResult.usage?.total_tokens,
          model: aiResult.model,
        });

        // Сохранение в кэш
        cacheService.set(
          city,
          startDate,
          endDate,
          budget,
          interests,
          people,
          route,
          {
            model: aiResult.model,
            tokens: aiResult.usage?.total_tokens,
            finishReason: aiResult.finishReason,
          }
        );

        // Отправка email с маршрутом
        await emailService.sendRouteEmail({
          to: email,
          city,
          route,
          dates,
          name,
        });

        logger.info("Route email sent successfully", { city, email });
      } catch (error) {
        logger.error("Route generation failed", {
          error: error.message,
          stack: error.stack,
          city,
          email,
        });

        // Отправка уведомления об ошибке (если настроено)
        const { config } = await import("../config/index.js");
        if (config.email.from || config.email.smtp.auth?.user) {
          emailService.sendErrorNotification(error, {
            city,
            email,
            startDate,
            endDate,
          }).catch(notifError => {
            logger.error("Failed to send error notification", {
              error: notifError.message,
            });
          });
        }
      }
    })();
  } catch (err) {
    logger.error("Route handler error", {
      error: err.message,
      stack: err.stack,
    });

    // Даже при ошибке отвечаем успехом для Tilda
    if (!responseSent) {
      sendResponse(
        true,
        "Заявка принята! Мы обработаем её в ближайшее время."
      );
    }
  }
});

export default router;

