import NodeCache from "node-cache";
import { config } from "../config/index.js";
import logger from "../utils/logger.js";
import crypto from "crypto";

/**
 * Сервис кэширования маршрутов
 * Использует memory cache для быстрого доступа к часто запрашиваемым маршрутам
 */
class CacheService {
  constructor() {
    this.enabled = config.cache.enabled;
    this.cache = this.enabled
      ? new NodeCache({
          stdTTL: config.cache.ttl, // Время жизни в секундах
          checkperiod: config.cache.checkPeriod, // Проверка устаревших ключей
          useClones: false, // Для лучшей производительности
        })
      : null;

    if (this.enabled) {
      logger.info("Cache service initialized", {
        ttl: config.cache.ttl,
        checkPeriod: config.cache.checkPeriod,
      });

      // Статистика кэша
      this.cache.on("set", (key, value) => {
        logger.debug("Cache set", { key });
      });

      this.cache.on("del", (key, value) => {
        logger.debug("Cache deleted", { key });
      });

      this.cache.on("expired", (key, value) => {
        logger.debug("Cache expired", { key });
      });
    } else {
      logger.info("Cache service disabled");
    }
  }

  /**
   * Генерация ключа кэша на основе параметров маршрута
   */
  generateKey(city, startDate, endDate, budget, interests, people) {
    const data = {
      city: city?.toLowerCase().trim(),
      startDate: startDate?.trim(),
      endDate: endDate?.trim(),
      budget: budget?.trim(),
      interests: interests?.toLowerCase().trim(),
      people: people?.trim(),
    };

    const hash = crypto
      .createHash("md5")
      .update(JSON.stringify(data))
      .digest("hex");

    return `route:${hash}`;
  }

  /**
   * Получение маршрута из кэша
   */
  get(city, startDate, endDate, budget, interests, people) {
    if (!this.enabled || !this.cache) {
      return null;
    }

    try {
      const key = this.generateKey(city, startDate, endDate, budget, interests, people);
      const cached = this.cache.get(key);

      if (cached) {
        logger.info("Cache hit", {
          key,
          city,
          dataLength: cached.route?.length || 0,
        });
        return cached;
      }

      logger.debug("Cache miss", { key, city });
      return null;
    } catch (error) {
      logger.error("Cache get error", { error: error.message, city });
      return null;
    }
  }

  /**
   * Сохранение маршрута в кэш
   */
  set(city, startDate, endDate, budget, interests, people, route, metadata = {}) {
    if (!this.enabled || !this.cache) {
      return false;
    }

    try {
      const key = this.generateKey(city, startDate, endDate, budget, interests, people);
      const value = {
        route,
        city,
        startDate,
        endDate,
        budget,
        interests,
        people,
        cachedAt: new Date().toISOString(),
        ...metadata,
      };

      const success = this.cache.set(key, value);

      if (success) {
        logger.info("Cache set", {
          key,
          city,
          routeLength: route?.length || 0,
        });
      }

      return success;
    } catch (error) {
      logger.error("Cache set error", { error: error.message, city });
      return false;
    }
  }

  /**
   * Удаление маршрута из кэша
   */
  delete(city, startDate, endDate, budget, interests, people) {
    if (!this.enabled || !this.cache) {
      return false;
    }

    try {
      const key = this.generateKey(city, startDate, endDate, budget, interests, people);
      const deleted = this.cache.del(key);

      if (deleted > 0) {
        logger.info("Cache deleted", { key, city });
      }

      return deleted > 0;
    } catch (error) {
      logger.error("Cache delete error", { error: error.message, city });
      return false;
    }
  }

  /**
   * Очистка всего кэша
   */
  clear() {
    if (!this.enabled || !this.cache) {
      return false;
    }

    try {
      this.cache.flushAll();
      logger.info("Cache cleared");
      return true;
    } catch (error) {
      logger.error("Cache clear error", { error: error.message });
      return false;
    }
  }

  /**
   * Получение статистики кэша
   */
  getStats() {
    if (!this.enabled || !this.cache) {
      return null;
    }

    try {
      const stats = this.cache.getStats();
      return {
        keys: stats.keys,
        hits: stats.hits,
        misses: stats.misses,
        ksize: stats.ksize,
        vsize: stats.vsize,
      };
    } catch (error) {
      logger.error("Cache stats error", { error: error.message });
      return null;
    }
  }
}

export default new CacheService();


