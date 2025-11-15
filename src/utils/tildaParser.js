import logger from "./logger.js";

/**
 * Универсальный парсер данных из Tilda Forms
 * Поддерживает разные форматы:
 * 1. Плоский: fields[0][name]=city&fields[0][value]=Paris
 * 2. Вложенный массив: { fields: [{ name: "...", value: "..." }] }
 * 3. Вложенный объект: { fields: { "0": { name: "...", value: "..." } } }
 * 4. Прямой: { city: "Paris", email: "..." }
 */
export const parseTildaData = (body) => {
  const result = {};
  
  if (!body || typeof body !== 'object') {
    logger.warn("Tilda parser: body пустой или не объект", { body });
    return result;
  }
  
  // Проверяем плоский формат с квадратными скобками
  const fieldKeys = Object.keys(body).filter(key => 
    typeof key === 'string' && key.startsWith("fields[")
  );
  
  if (fieldKeys.length > 0) {
    // Группируем поля по индексу
    const fieldsMap = {};
    for (const key of fieldKeys) {
      const match = key.match(/fields\[(\d+)\]\[(name|value)\]/);
      if (match) {
        const index = match[1];
        const type = match[2];
        if (!fieldsMap[index]) {
          fieldsMap[index] = {};
        }
        fieldsMap[index][type] = body[key];
      }
    }
    
    // Преобразуем в объект result
    for (const index in fieldsMap) {
      const field = fieldsMap[index];
      if (field.name && field.value !== undefined && field.value !== null) {
        result[field.name] = String(field.value).trim();
      }
    }
    
    logger.debug("Tilda parser: плоский формат", { 
      fieldKeys: fieldKeys.length, 
      parsed: result 
    });
  } 
  // Проверяем вложенный формат
  else if (body.fields) {
    if (Array.isArray(body.fields)) {
      // Формат: { fields: [{ name: "...", value: "..." }] }
      for (const field of body.fields) {
        if (field && field.name && field.value !== undefined && field.value !== null) {
          result[field.name] = String(field.value).trim();
        }
      }
      logger.debug("Tilda parser: массив fields", { parsed: result });
    } else if (typeof body.fields === 'object') {
      // Формат: { fields: { "0": { name: "...", value: "..." } } }
      for (const index in body.fields) {
        const field = body.fields[index];
        if (field && field.name && field.value !== undefined && field.value !== null) {
          result[field.name] = String(field.value).trim();
        }
      }
      logger.debug("Tilda parser: объект fields", { parsed: result });
    }
  } 
  // Прямой формат
  else {
    // Исключаем служебные поля Tilda
    const ignoreKeys = ['pageid', 'formid', 'pageurl', 'formname', 't', 'referer'];
    for (const key in body) {
      if (!ignoreKeys.includes(key) && body[key] !== undefined && body[key] !== null) {
        result[key] = String(body[key]).trim();
      }
    }
    logger.debug("Tilda parser: прямой объект", { parsed: result });
  }
  
  return result;
};

/**
 * Извлечение поля с возможными именами (case-insensitive)
 */
export const extractField = (data, names) => {
  if (!data || typeof data !== 'object') return null;
  
  for (const name of names) {
    const value = data[name];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  
  // Попытка case-insensitive поиска
  const lowerNames = names.map(n => n.toLowerCase());
  for (const key in data) {
    if (lowerNames.includes(key.toLowerCase())) {
      const value = data[key];
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
  }
  
  return null;
};

/**
 * Нормализация данных формы
 */
export const normalizeFormData = (parsedData) => {
  return {
    city: extractField(parsedData, [
      "city", "City", "Город", "destination", "город", "CITY", 
      "destination_city", "destinationCity", "town"
    ]),
    email: extractField(parsedData, [
      "email", "Email", "E-mail", "e-mail", "EMAIL", 
      "email_address", "emailAddress"
    ]),
    startDate: extractField(parsedData, [
      "startDate", "start-date", "start_date", "StartDate", 
      "дата_начала", "start", "arrival"
    ]),
    endDate: extractField(parsedData, [
      "endDate", "end-date", "end_date", "EndDate", 
      "дата_окончания", "end", "departure"
    ]),
    budget: extractField(parsedData, [
      "budget", "Budget", "бюджет", "BUDGET", 
      "total_budget", "totalBudget"
    ]),
    interests: extractField(parsedData, [
      "interests", "Интересы", "INTERESTS", 
      "preferences", "interests_text"
    ]),
    people: extractField(parsedData, [
      "people", "Persons", "Количество", "количество", 
      "person", "PEOPLE", "travelers", "guests", "persons"
    ]) || "1",
    // Дополнительные поля
    name: extractField(parsedData, ["name", "Name", "имя", "full_name", "fullName"]),
    phone: extractField(parsedData, ["phone", "Phone", "телефон", "phone_number", "phoneNumber"]),
    notes: extractField(parsedData, ["notes", "Notes", "комментарий", "comment", "message"]),
  };
};


