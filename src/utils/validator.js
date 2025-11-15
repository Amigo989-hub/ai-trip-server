import Joi from "joi";
import logger from "./logger.js";

/**
 * Схема валидации данных формы
 */
export const formDataSchema = Joi.object({
  city: Joi.string().min(2).max(100).required()
    .messages({
      "string.empty": "Город не может быть пустым",
      "string.min": "Название города слишком короткое",
      "any.required": "Пожалуйста, укажите город назначения"
    }),
  
  email: Joi.string().email().required()
    .messages({
      "string.email": "Некорректный email адрес",
      "any.required": "Email обязателен для отправки маршрута"
    }),
  
  startDate: Joi.string().allow("", null).optional(),
  
  endDate: Joi.string().allow("", null).optional(),
  
  budget: Joi.string().allow("", null).max(500).optional(),
  
  interests: Joi.string().allow("", null).max(1000).optional(),
  
  people: Joi.string().pattern(/^\d+$/).default("1")
    .messages({
      "string.pattern.base": "Количество человек должно быть числом"
    }),
  
  name: Joi.string().allow("", null).max(200).optional(),
  
  phone: Joi.string().allow("", null).max(50).optional(),
  
  notes: Joi.string().allow("", null).max(2000).optional(),
});

/**
 * Валидация данных формы
 */
export const validateFormData = (data) => {
  const { error, value } = formDataSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });
  
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join("."),
      message: detail.message,
    }));
    
    logger.warn("Validation failed", { errors, data });
    
    return {
      isValid: false,
      errors,
      data: null,
    };
  }
  
  return {
    isValid: true,
    errors: [],
    data: value,
  };
};

/**
 * Проверка дат
 */
export const validateDates = (startDate, endDate) => {
  if (!startDate || !endDate) {
    return { isValid: true }; // Даты необязательны
  }
  
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return {
        isValid: false,
        error: "Некорректный формат дат",
      };
    }
    
    if (start > end) {
      return {
        isValid: false,
        error: "Дата начала должна быть раньше даты окончания",
      };
    }
    
    // Проверка на будущие даты (можно отключить для тестов)
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (end < now) {
      logger.warn("End date is in the past", { startDate, endDate });
    }
    
    return {
      isValid: true,
      start,
      end,
      days: Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1,
    };
  } catch (err) {
    logger.error("Date validation error", { error: err, startDate, endDate });
    return {
      isValid: false,
      error: "Ошибка при обработке дат",
    };
  }
};

/**
 * Подсчет дней поездки
 */
export const calculateDays = (startDate, endDate) => {
  if (!startDate || !endDate) return 1;
  
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1; // +1 чтобы включить оба дня
  } catch (e) {
    logger.error("Calculate days error", { error: e, startDate, endDate });
    return 1;
  }
};


