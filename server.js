// === Импорты и базовые настройки ===
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import querystring from "querystring";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// === Fallback для text/plain (до других парсеров) ===
app.use((req, res, next) => {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("text/plain")) {
    let data = "";
    req.on("data", chunk => {
      data += chunk.toString();
    });
    req.on("end", () => {
      try {
        // Пробуем распарсить как JSON
        req.body = JSON.parse(data);
        console.log("📝 text/plain обработан как JSON");
      } catch (e) {
        // Если не JSON, парсим как URL-encoded
        req.body = querystring.parse(data);
        console.log("📝 text/plain обработан как URL-encoded");
      }
      next();
    });
  } else {
    next();
  }
});

// === Middleware для парсинга тела запроса ===
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// === CORS ===
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// === Логирование ===
app.use((req, res, next) => {
  console.log("\n=== 📨 ЗАПРОС ОТ TILDA ===");
  console.log("⏰", new Date().toISOString());
  console.log("➡️", req.method, req.url);
  console.log("📋 Content-Type:", req.headers["content-type"] || "не указан");
  console.log("📦 BODY (raw):", JSON.stringify(req.body, null, 2));
  console.log("========================\n");
  next();
});

// === Универсальный парсер данных из Tilda ===
const parseTildaData = (body) => {
  const result = {};
  
  if (!body || typeof body !== 'object') {
    console.warn("⚠️ body пустой или не объект:", body);
    return result;
  }
  
  // Формат Tilda: fields[0][name]=city&fields[0][value]=Paris
  // Express с extended:true может парсить это по-разному:
  // 1. Как плоский объект: { "fields[0][name]": "city", "fields[0][value]": "Paris" }
  // 2. Как вложенный объект: { fields: [{ name: "city", value: "Paris" }] }
  
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
    
    console.log("🔍 Парсинг Tilda формата (плоский):", { 
      fieldKeys: fieldKeys.length, 
      parsed: result,
      sampleKeys: fieldKeys.slice(0, 3)
    });
  } 
  // Проверяем вложенный формат: { fields: { "0": { name: "...", value: "..." } } }
  else if (body.fields) {
    if (Array.isArray(body.fields)) {
      // Формат: { fields: [{ name: "...", value: "..." }] }
      for (const field of body.fields) {
        if (field && field.name && field.value !== undefined && field.value !== null) {
          result[field.name] = String(field.value).trim();
        }
      }
      console.log("🔍 Парсинг массива fields:", result);
    } else if (typeof body.fields === 'object') {
      // Формат: { fields: { "0": { name: "...", value: "..." } } }
      for (const index in body.fields) {
        const field = body.fields[index];
        if (field && field.name && field.value !== undefined && field.value !== null) {
          result[field.name] = String(field.value).trim();
        }
      }
      console.log("🔍 Парсинг объекта fields:", result);
    }
  } 
  // Прямой формат: { city: "Paris", email: "..." }
  else {
    // Исключаем служебные поля
    const ignoreKeys = ['pageid', 'formid', 'pageurl', 'formname', 't', 'referer'];
    for (const key in body) {
      if (!ignoreKeys.includes(key) && body[key] !== undefined && body[key] !== null) {
        result[key] = String(body[key]).trim();
      }
    }
    console.log("🔍 Парсинг прямого объекта:", result);
  }
  
  return result;
};

// === Извлечение поля с возможными именами ===
const extractField = (data, names) => {
  if (!data || typeof data !== 'object') return null;
  for (const name of names) {
    const value = data[name];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return null;
};

// === Функция генерации промпта ===
const buildPrompt = (city, start, end, budget, interests, people) => {
  return `Ты — профессиональный travel-консьерж уровня luxury, создающий индивидуальные путешествия под ключ. 
Твоя задача — не просто описать маршрут, а продать мечту о путешествии, чтобы клиент захотел его реализовать прямо сейчас.

Создай максимально подробный, вдохновляющий и продающий маршрут поездки в ${city}.

📅 Даты поездки: ${start || "не указаны"} — ${end || "не указаны"}
💰 Уровень бюджета: ${budget || "не указан"}
🎯 Интересы: ${interests || "не указаны"}
👥 Путешественников: ${people || "1"}

## Формат ответа:

Структурируй ответ с эмодзи и чёткими подзаголовками. Используй живой, визуальный стиль и сторителлинг.  
Добавь лёгкую эмоциональность, чтобы человек "видел" и "чувствовал" своё путешествие.  
Каждое место должно быть подано как открытие, с лёгкой ноткой эксклюзивности.

---

### 1. Общее описание ✈️  
– Опиши атмосферу города как travel-блогер, но с подачей luxury-консьержа.  
– Сформируй эмоциональный “хук” — почему это направление идеально именно под клиента.  
– Заверши абзацем в стиле travel-бренда: «Это путешествие — не просто поездка, а инвестиция в эмоции.»

---

### 2. Проживание 🏨  
– Подбери 2–3 варианта под бюджет (бутик, отель, апартаменты).  
– Укажи район, ссылку (примерную), цену за ночь.  
– Добавь короткое описание атмосферы (“винтажный шарм”, “вид на старый город”).  
– Для каждого варианта добавь кнопку-приглашение в стиле:  
  👉 **[Узнать больше](примерная_ссылка)**

---

### 3. Ежедневный план 📅  
Для каждого дня оформи как вдохновляющий travel-гид:
- Утро ☕ — что вдохновит начать день (с видом, завтраком, прогулкой).  
- День 🌇 — активности, достопримечательности, уникальные маршруты.  
- Вечер 🌃 — рестораны, бары, мероприятия, виды на закат.  

Каждое место сопровождай коротким описанием, почему стоит посетить.  
Добавляй кнопку:  
👉 **[Узнать больше о месте](примерная_ссылка)**

---

### 4. Местная кухня 🍽️  
– Выдели 2–3 блюда и кафе.  
– Опиши атмосферу (уютное, богемное, street food и т.п.)  
– Добавь ссылки или названия заведений с кнопками:  
  👉 **[Подробнее о кафе](примерная_ссылка)**

---

### 5. Советы путешественнику 🧳  
– Как перемещаться, где экономить, где не стоит.  
– Добавь инсайдерские советы (“местные берут кофе тут”, “лучшее время посетить — до 10:00”).  
– Если есть опасности или нюансы — пиши мягко, но честно.

---

### 6. Примерный бюджет 💸  
– Разбей по категориям: проживание, питание, развлечения, транспорт.  
– Приведи расчёт за день и за всю поездку.  
– Заверши советом по оптимизации бюджета (“берите city-pass”, “заказывайте заранее”).

---

### 7. Заключение 💬  
– Закончь вдохновляющим CTA, чтобы клиент захотел заказать этот маршрут.

---

### 8. Детализация по кнопкам 🔗  
– Для каждого места, кафе, отеля или активности вставь ссылку об этом месте,  
  чтобы пользователь мог “кликнуть” и увидеть подробности (название, адрес, история, советы, лайфхаки).  
– Добавь краткий превью-текст (1–2 предложения) для таких ссылок, чтобы выглядело как описание карточки.

---

### 💎 Тон:
– Дружелюбный, уверенный, экспертный.  
– Пиши в стиле современного travel-бренда (Atlas Obscura, Conde Nast Traveler, Discover Carls).  
– Добавляй лёгкий storytelling, эмоции, атмосферу, визуальные детали (“аромат кофе”, “звук улицы”).  
– Сделай, чтобы читатель почувствовал: *«Да, я хочу туда прямо сейчас.»*`;
};

// === Подсчет дней поездки ===
const calculateDays = (startDate, endDate) => {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1; // +1 чтобы включить оба дня
  } catch (e) {
    return 1;
  }
};

// === Главный маршрут ===
app.post("/api/route", async (req, res) => {
  // ⚡ Сразу устанавливаем флаг, что ответ отправлен
  let responseSent = false;
  
  const sendResponse = (success, message, plan = null) => {
    if (responseSent) return;
    responseSent = true;
    const response = { success, message };
    if (plan) {
      response.plan = plan;
    }
    res.status(200).json(response);
  };

  try {
    console.log("📥 Начало обработки запроса...");
    
    // Быстрый парсинг данных
    const data = parseTildaData(req.body || {});
    console.log("📊 Распарсенные данные:", data);

    // Быстрое извлечение полей
    const city = extractField(data, ["city", "City", "Город", "destination", "город", "CITY"]);
    const email = extractField(data, ["email", "Email", "E-mail", "e-mail", "EMAIL"]);
    const startDate = extractField(data, ["startDate", "start-date", "start_date", "StartDate", "дата_начала"]);
    const endDate = extractField(data, ["endDate", "end-date", "end_date", "EndDate", "дата_окончания"]);
    const budget = extractField(data, ["budget", "Budget", "бюджет", "BUDGET"]);
    const interests = extractField(data, ["interests", "Интересы", "interests", "INTERESTS"]);
    const people = extractField(data, ["people", "Persons", "Количество", "количество", "person", "PEOPLE"]);

    console.log("🔍 Извлеченные поля:", { city, email, startDate, endDate, budget, interests, people });

    // ⚡ ВСЕГДА отправляем ответ быстро для Tilda (до любых длительных операций)
    // Минимальная валидация - но всегда отвечаем успехом для Tilda
    if (!city || !email) {
      console.warn("⚠️ Некорректные данные из формы:", { city, email, allData: data });
      sendResponse(true, "Заявка принята! Менеджер свяжется с вами для уточнения.");
      return;
    }

    // ⚡ Мгновенный ответ Тильде (чтобы не словить timeout)
    sendResponse(true, "Маршрут генерируется. Проверьте почту в течение 5 минут!");

    // === Асинхронная генерация маршрута (не блокирует ответ) ===
    (async () => {
      const MAX_RETRIES = 2;
      let retryCount = 0;
      let success = false;

      while (retryCount <= MAX_RETRIES && !success) {
        try {
          if (retryCount > 0) {
            console.log(`🔄 Повторная попытка ${retryCount}/${MAX_RETRIES} для ${city} (${email})...`);
            // Небольшая задержка перед повтором
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            console.log(`🧠 Генерация маршрута для ${city} (${email})...`);
          }

          const prompt = buildPrompt(city, startDate, endDate, budget, interests, people);

          // Увеличиваем таймаут до 90 секунд (OpenAI иногда работает медленнее)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 секунд

          const startTime = Date.now();
          const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 4000, // Увеличено для полных маршрутов
          }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          const duration = Date.now() - startTime;
          console.log(`⏱️ OpenAI ответил за ${duration}ms (попытка ${retryCount + 1})`);

          if (!aiResponse.ok) {
            const err = await aiResponse.text();
            console.error(`❌ Ошибка OpenAI (попытка ${retryCount + 1}):`, err);
            retryCount++;
            continue;
          }

          const result = await aiResponse.json();
          const choice = result.choices?.[0];
          const plan = choice?.message?.content || "Маршрут не удалось создать.";
          const finishReason = choice?.finish_reason || "unknown";
          const usage = result.usage || {};

          console.log("✅ Маршрут сгенерирован для:", city);
          console.log(`📊 Статистика: ${finishReason === "stop" ? "✅ Завершен полностью" : finishReason === "length" ? "⚠️ ОБРЕЗАН по лимиту токенов!" : finishReason}`);
          console.log(`📈 Токены: использовано ${usage.total_tokens || "N/A"} из ${usage.total_tokens || "N/A"} (промпт: ${usage.prompt_tokens || "N/A"}, ответ: ${usage.completion_tokens || "N/A"})`);
          console.log(`📝 Длина ответа: ${plan.length} символов`);
          console.log("📄 Первые 300 символов:", plan.slice(0, 300) + "...");
          console.log("📄 Последние 200 символов:", "..." + plan.slice(-200));
          
          // Проверка на обрыв ответа
          if (finishReason === "length") {
            console.warn("⚠️ ВНИМАНИЕ: Ответ был обрезан из-за лимита токенов!");
            console.warn("💡 Решение: увеличить max_tokens или упростить промпт");
          }

          console.log("✅ МАРШРУТ УСПЕШНО СГЕНЕРИРОВАН");

          // Отправка email через Resend API
          try {
            const emailHtml = buildEmailTemplate(city, plan);
            await sendEmailViaResend(
              email,
              `Ваш персональный маршрут в ${city} 🌍`,
              emailHtml
            );
          } catch (resendError) {
            console.error("💥 Ошибка отправки email через Resend (не критично):", resendError.message);
            // Не прерываем выполнение - ошибка уже залогирована
          }
          
          success = true;
        } catch (asyncErr) {
          // Ошибки в асинхронной части не влияют на ответ Tilda
          if (asyncErr.name === 'AbortError') {
            const timeoutSeconds = 90;
            console.error(`⏱️ Таймаут при запросе к OpenAI (${timeoutSeconds} сек, попытка ${retryCount + 1}/${MAX_RETRIES + 1})`);
            console.error(`⚠️ ВНИМАНИЕ: Маршрут НЕ будет отправлен пользователю ${email} - запрос прерван по таймауту`);
            
            retryCount++;
            if (retryCount > MAX_RETRIES) {
              console.error(`💥 Все попытки исчерпаны. Маршрут для ${city} (${email}) НЕ сгенерирован.`);
            }
          } else {
            console.error(`💥 Ошибка в асинхронной обработке (попытка ${retryCount + 1}):`, asyncErr.message || asyncErr);
            retryCount++;
            if (retryCount > MAX_RETRIES) {
              console.error(`💥 Все попытки исчерпаны. Маршрут для ${city} (${email}) НЕ сгенерирован.`);
            }
          }
        }
      }

      if (!success) {
        console.error(`❌ ИТОГО: Не удалось сгенерировать маршрут для ${city} (${email}) после ${MAX_RETRIES + 1} попыток`);
        // TODO: Можно добавить уведомление админу или запись в базу для последующей обработки
      }
    })();

  } catch (err) {
    console.error("💥 Ошибка обработки запроса:", err);
    // Даже при ошибке отвечаем успехом для Tilda
    if (!responseSent) {
      sendResponse(true, "Заявка принята! Мы обработаем её в ближайшее время.");
    }
  }
});

// === Функция построения HTML-шаблона письма ===
const buildEmailTemplate = (city, plan) => {
  // Преобразуем текст маршрута в HTML с правильным форматированием
  let formattedPlan = plan
    // Сначала обрабатываем заголовки (должно быть до замены \n на <br>)
    .replace(/### (.*?)(\n|$)/g, '<h3 style="margin-top: 28px; margin-bottom: 16px; color: #2c3e50; font-size: 20px; font-weight: 600; padding-top: 8px; border-top: 2px solid #f0f0f0;">$1</h3>')
    .replace(/## (.*?)(\n|$)/g, '<h2 style="margin-top: 32px; margin-bottom: 16px; color: #1a1a1a; font-size: 24px; font-weight: 700; padding-bottom: 8px; border-bottom: 2px solid #e0e0e0;">$1</h2>')
    // Эмодзи и форматирование списков
    .replace(/– /g, '<span style="color: #667eea; margin-right: 8px;">•</span> ')
    .replace(/^(\d+\.\s)/gm, '<span style="color: #667eea; font-weight: 600; margin-right: 8px;">$1</span>')
    // Жирный текст (обрабатываем первым, чтобы не конфликтовал с курсивом)
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #1a1a1a; font-weight: 600;">$1</strong>')
    // Курсив (обрабатываем после жирного, чтобы избежать конфликтов)
    .replace(/([^*]|^)\*([^*]+?)\*([^*]|$)/g, '$1<em style="color: #555555; font-style: italic;">$2</em>$3')
    // Параграфы с отступами
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      // Пропускаем пустые строки (будут обработаны отдельно)
      if (!trimmed) return '<p style="margin: 8px 0;"></p>';
      // Если это уже заголовок, возвращаем как есть
      if (trimmed.startsWith('<h2') || trimmed.startsWith('<h3')) return trimmed;
      // Обычный текст с отступом
      return `<p style="margin: 12px 0; line-height: 1.8; color: #333333;">${trimmed}</p>`;
    })
    .join('');

  return `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ваш маршрут в ${city}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); max-width: 600px; margin: 0 auto;">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                🌍 Ваш маршрут в ${city}
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <div style="color: #333333; font-size: 16px; line-height: 1.8;">
                ${formattedPlan}
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px 40px 40px; text-align: center; border-top: 1px solid #e0e0e0; background-color: #fafafa; border-radius: 0 0 12px 12px;">
              <p style="margin: 0 0 12px 0; color: #666666; font-size: 16px; font-style: italic;">
                С любовью, команда Airravel ✈️
              </p>
              <p style="margin: 0; color: #999999; font-size: 14px;">
                <a href="https://airravel.com" style="color: #667eea; text-decoration: none; font-weight: 500;">airravel.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
};

// === Функция отправки email через Resend API ===
const sendEmailViaResend = async (email, subject, htmlContent) => {
  if (!process.env.RESEND_API_KEY) {
    console.warn("⚠️ RESEND_API_KEY не настроен, пропускаем отправку email через Resend");
    return;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "AI Trip Planner <info@airravel.com>",
        to: [email],
        subject: subject,
        html: htmlContent,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Ошибка отправки email через Resend:", {
        status: response.status,
        error: errorText,
      });
      return;
    }

    const result = await response.json();
    console.log("✅ Email отправлен через Resend:", { email, id: result.id });
  } catch (err) {
    console.error("💥 Ошибка при отправке email через Resend:", err.message);
    // Не пробрасываем ошибку дальше - просто логируем
  }
};

// === Тестовые маршруты ===
app.get("/", (req, res) =>
  res.json({ status: "OK", endpoint: "/api/route", time: new Date().toISOString() })
);
app.get("/health", (req, res) =>
  res.json({ status: "healthy", uptime: process.uptime(), time: new Date().toISOString() })
);

// === Запуск ===
app.listen(PORT, "0.0.0.0", () => {
  console.log(`
🚀 AI Trip Planner READY
📍 PORT: ${PORT}
🔑 OpenAI: ${process.env.OPENAI_API_KEY ? "✅ Loaded" : "❌ Missing"}
🕒 Started: ${new Date().toISOString()}
`);
});
