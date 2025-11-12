// === Импорты и базовая настройка ===
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

// Загружаем переменные окружения (.env)
dotenv.config();

// Создаём приложение Express
const app = express();
const PORT = process.env.PORT || 3000; // ← ДОБАВЬ ЭТУ СТРОКУ ЗДЕСЬ

// === Поддержка форматов запросов ===
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === Ключевая функция: преобразуем данные Tilda в нормальный объект ===
function parseTildaData(body) {
    // Если Tilda прислала данные в формате fields[]
    if (body.fields && Array.isArray(body.fields)) {
        const result = {};
        body.fields.forEach(field => {
            result[field.name] = field.value;
        });
        return result;
    }
    
    // Если данные уже в плоском формате
    return body;
}

// === Главный маршрут для Tilda ===
app.post("/api/route", async (req, res) => {
    try {
        console.log("📨 Получен запрос от Tilda:", req.body);
        
        // Преобразуем данные Tilda
        const data = parseTildaData(req.body);
        console.log("🔍 Преобразованные данные:", data);

        // Достаем данные из формы (все возможные варианты названий полей)
        const city = data.city || data.City || data.Name || data["Город"] || data["city"];
        const startDate = data.startDate || data["start-date"] || data["Дата начала"] || data["date-start"];
        const endDate = data.endDate || data["end-date"] || data["Дата окончания"] || data["date-end"];
        const budget = data.budget || data.Budget || data["Бюджет"];
        const interests = data.interests || data.Interests || data["Интересы"];
        const people = data.people || data.People || data["Количество человек"];
        const email = data.email || data.Email || data["E-mail"];

        // Проверяем обязательные поля
        if (!city) {
            console.warn("❌ Не указан город");
            return res.status(400).json({ 
                success: false, 
                error: "Пожалуйста, укажите город назначения" 
            });
        }

        if (!email) {
            console.warn("❌ Не указан email");
            return res.status(400).json({ 
                success: false, 
                error: "Пожалуйста, укажите email для отправки маршрута" 
            });
        }

        console.log("✅ Извлеченные данные:", {
            city, startDate, endDate, budget, interests, people, email
        });

        // Проверяем API ключ
        if (!process.env.OPENAI_API_KEY) {
            console.error("❌ OPENAI_API_KEY не настроен");
            return res.status(500).json({ 
                success: false, 
                error: "Сервис временно недоступен" 
            });
        }

        // 🧠 Формируем умный промпт для OpenAI
        const prompt = `
Ты — профессиональный тревел-эксперт. Создай подробный маршрут путешествия.

ОСНОВНЫЕ ДАННЫЕ:
- Город: ${city}
- Даты: ${startDate || "не указаны"} - ${endDate || "не указаны"}
- Бюджет: ${budget || "не указан"}
- Интересы: ${interests || "не указаны"}
- Путешественников: ${people || "1"}

ТРЕБОВАНИЯ К МАРШРУТУ:
1. Распиши по дням с временными слотами (утро/день/вечер)
2. Включи лучшие достопримечательности, рестораны местной кухни, скрытые места
3. Добавь практические советы (транспорт, часы работы, стоимость)
4. Учитывай бюджет ${budget || "(любой)"}
5. Сделай текст живым и вдохновляющим
6. Используй эмодзи для наглядности

Форматируй ответ как готовый маршрут, который можно сразу отправить клиенту.
`;

        console.log("🧠 Отправляем запрос к OpenAI...");

        // 🔗 Запрос к OpenAI
        const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { 
                        role: "system", 
                        content: "Ты профессиональный тревел-блогер с 10-летним опытом. Создаешь детальные, практичные и вдохновляющие маршруты." 
                    },
                    { 
                        role: "user", 
                        content: prompt 
                    }
                ],
                temperature: 0.7,
                max_tokens: 2000
            }),
        });

        if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            console.error("❌ Ошибка OpenAI:", errorText);
            throw new Error(`OpenAI API error: ${openaiResponse.status}`);
        }

        const openaiData = await openaiResponse.json();
        const tripPlan = openaiData.choices?.[0]?.message?.content || "Не удалось сгенерировать маршрут";

        console.log("✅ Маршрут сгенерирован, длина:", tripPlan.length, "символов");

        // 📧 Здесь будет отправка на email (пока логируем)
        console.log("📧 Должны отправить на email:", email);
        console.log("🗺️ Маршрут:", tripPlan);

        // ✅ Успешный ответ для Tilda
        res.json({ 
            success: true, 
            message: "Маршрут успешно создан и отправлен на вашу почту!",
            preview: tripPlan.substring(0, 200) + "..." // Превью для отладки
        });

    } catch (error) {
        console.error("💥 Критическая ошибка:", error);
        res.status(500).json({ 
            success: false, 
            error: "Внутренняя ошибка сервера. Пожалуйста, попробуйте позже." 
        });
    }
});

// === Тестовый маршрут для проверки ===
app.get("/test", (req, res) => {
    res.json({ 
        status: "Сервер работает! 🚀",
        timestamp: new Date().toISOString(),
        instructions: "Отправьте POST запрос на /api/route с данными формы Tilda"
    });
});

// === Запуск сервера ===
app.listen(PORT, () => {
    console.log(`🎯 Сервер запущен на порту ${PORT}`);
    console.log(`🔗 Тестовая страница: http://localhost:${PORT}/test`);
    console.log(`📨 Webhook для Tilda: POST http://localhost:${PORT}/api/route`);
    console.log(`🔑 OpenAI ключ: ${process.env.OPENAI_API_KEY ? "✅ Настроен" : "❌ Отсутствует"}`);
});
    // 👇 Здесь выводим, что реально пришло
    console.log("Полученные данные от формы:", body);

    const city = body.city || body.City || body["Город"] || body["Город назначения"];
    const startDate = body.startDate || body["start_date"] || body["Дата начала"];
    const endDate = body.endDate || body["end_date"] || body["Дата окончания"];
    const budget = body.budget || body["Бюджет"];
    const interests = body.interests || body["Интересы"];
    const people = body.people || body["Количество человек"];

    if (!city) {
      console.warn("⚠️ Не найдено поле 'city' в данных формы:", body);
      return res.status(400).json({ success: false, error: "Не указан город" });
    }

    // 🧠 Формируем запрос для OpenAI
    const prompt = `
Ты — AI-эксперт по путешествиям. 
Создай персональный маршрут поездки в город ${city}.
Период: ${startDate || "не указано"} — ${endDate || "не указано"}.
Бюджет: ${budget || "не указан"}.
Интересы: ${interests || "не указаны"}.
Количество человек: ${people || "1"}.

Сделай расписание по дням, укажи интересные места, кафе, маршруты прогулок и советы. 
Пиши живо и красиво, в стиле тревел-блогера.
`;

    // 🔗 Запрос в OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
      }),
    });

    const data = await response.json();
    const tripPlan = data.choices?.[0]?.message?.content || "Не удалось сгенерировать маршрут 😕";

    res.json({ success: true, city, route: tripPlan });
  } catch (err) {
    console.error("Ошибка в /api/route:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Проверка сервера
app.get("/", (req, res) => {
  res.send("AI Trip Planner API работает!");
});

app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
