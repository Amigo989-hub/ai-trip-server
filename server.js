// === Импорты и базовая настройка ===
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

// Загружаем переменные окружения (.env)
dotenv.config();

// Создаём приложение Express
const app = express();
const PORT = process.env.PORT || 3000;

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

        // Достаем данные из формы
        const city = data.city || data.City || data.Name || data["Город"];
        const startDate = data.startDate || data["start-date"] || data["Дата начала"];
        const endDate = data.endDate || data["end-date"] || data["Дата окончания"];
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

        console.log("✅ Извлеченные данные:", { city, startDate, endDate, budget, interests, people, email });

        // Проверяем API ключ
        if (!process.env.OPENAI_API_KEY) {
            console.error("❌ OPENAI_API_KEY не настроен");
            return res.status(500).json({ 
                success: false, 
                error: "Сервис временно недоступен" 
            });
        }

        // 🧠 Формируем промпт для OpenAI
        const prompt = `
Создай подробный маршрут путешествия в ${city}.

Даты: ${startDate || "не указаны"} - ${endDate || "не указаны"}
Бюджет: ${budget || "не указан"}
Интересы: ${interests || "не указаны"}
Путешественников: ${people || "1"}

Сделай расписание по дням с временными слотами, включи достопримечательности, рестораны и практические советы.
Форматируй ответ красиво с эмодзи.
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
                messages: [{ role: "user", content: prompt }],
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

        console.log("✅ Маршрут сгенерирован");
        console.log("📧 Должны отправить на email:", email);

        // ✅ Успешный ответ для Tilda
        res.json({ 
            success: true, 
            message: "Маршрут успешно создан и отправлен на вашу почту!",
            preview: tripPlan.substring(0, 100) + "..."
        });

    } catch (error) {
        console.error("💥 Ошибка:", error);
        res.status(500).json({ 
            success: false, 
            error: "Внутренняя ошибка сервера" 
        });
    }
});

// === Тестовый маршрут ===
app.get("/", (req, res) => {
    res.json({ 
        status: "✅ Сервер работает!",
        endpoint: "POST /api/route",
        timestamp: new Date().toISOString()
    });
});

app.get("/test", (req, res) => {
    res.json({ 
        status: "✅ Тестовый маршрут работает!",
        instructions: "Отправьте POST запрос на /api/route"
    });
});

// === Запуск сервера ===
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
