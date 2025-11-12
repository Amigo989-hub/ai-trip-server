// === Импорты и базовая настройка ===
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

// Загружаем переменные окружения (.env)
dotenv.config();

// Создаём приложение Express
const app = express();
const PORT = process.env.PORT || 3000;

// === Middleware ===
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, API-Key');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Логирование всех запросов
app.use((req, res, next) => {
    console.log('=== 📨 ВХОДЯЩИЙ ЗАПРОС ===');
    console.log('⏰', new Date().toISOString());
    console.log('🔹 Method:', req.method);
    console.log('🔹 URL:', req.url);
    console.log('🔹 IP:', req.ip);
    console.log('🔹 User-Agent:', req.get('User-Agent'));
    console.log('🔹 Body:', JSON.stringify(req.body, null, 2));
    console.log('========================');
    next();
});

// === Главный маршрут для Tilda ===
app.post("/api/route", async (req, res) => {
    console.log('🟢 === НАЧАЛО ОБРАБОТКИ ФОРМЫ TILDA ===');
    
    try {
        // 🔍 Получаем и логируем данные
        const rawBody = req.body;
        console.log('📦 Сырые данные от Tilda:', JSON.stringify(rawBody, null, 2));

        // 🎯 Извлекаем данные из разных форматов Tilda
        let formData = {};
        
        // Формат 1: Плоский объект
        if (rawBody && typeof rawBody === 'object' && !rawBody.fields) {
            formData = { ...rawBody };
        }
        // Формат 2: Массив fields[]
        else if (rawBody.fields && Array.isArray(rawBody.fields)) {
            rawBody.fields.forEach(field => {
                formData[field.name] = field.value;
            });
        }
        
        console.log('🔧 Обработанные данные формы:', formData);

        // 🎯 Извлекаем конкретные поля
        const city = formData.city || formData.City || formData['Город'];
        const email = formData.email || formData.Email || formData['E-mail'];
        const startDate = formData.startDate || formData['start-date'];
        const endDate = formData.endDate || formData['end-date'];
        const budget = formData.budget || formData.Budget;
        const interests = formData.interests || formData.Interests;
        const people = formData.people || formData.People;

        console.log('🎯 Извлеченные значения:', {
            city, email, startDate, endDate, budget, interests, people
        });

        // ✅ Валидация обязательных полей
        if (!city) {
            console.warn('❌ Не указан город');
            return res.status(400).json({
                success: false,
                error: "Пожалуйста, укажите город назначения"
            });
        }

        if (!email) {
            console.warn('❌ Не указан email');
            return res.status(400).json({
                success: false,
                error: "Пожалуйста, укажите email для отправки маршрута"
            });
        }

        // 🔑 Проверка API ключа OpenAI
        if (!process.env.OPENAI_API_KEY) {
            console.error('❌ OPENAI_API_KEY не настроен в переменных окружения');
            return res.status(500).json({
                success: false,
                error: "Сервис временно недоступен. Технические работы."
            });
        }

        console.log('✅ Все проверки пройдены, генерируем маршрут через OpenAI...');

        // 🧠 Формируем промпт для OpenAI
        const prompt = `
Создай подробный персонализированный маршрут путешествия в ${city}.

Детали поездки:
- Даты: ${startDate || "не указаны"} - ${endDate || "не указаны"}
- Бюджет: ${budget || "не указан"}  
- Интересы: ${interests || "не указаны"}
- Количество путешественников: ${people || "1"}

Требования к маршруту:
1. Создай расписание на 2-3 дня с четкими временными слотами
2. Включи лучшие достопримечательности, рестораны и развлечения
3. Учитывай указанные интересы и бюджет
4. Добавь практические советы по транспорту и логистике
5. Сделай ответ живым и engaging, с эмодзи где уместно
6. Форматируй красиво, но без Markdown разметки

Создай уникальный, персонализированный маршрут который запомнится!
`;

        console.log('🧠 Отправляем запрос к OpenAI...');

        // 🔗 Запрос к OpenAI
        const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.8,
                max_tokens: 2000
            }),
            timeout: 30000
        });

        if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            console.error('❌ Ошибка OpenAI:', errorText);
            
            // Детализируем ошибку для пользователя
            let userMessage = "Ошибка генерации маршрута";
            if (openaiResponse.status === 429) {
                userMessage = "Сервис перегружен, попробуйте позже";
            } else if (openaiResponse.status === 401) {
                userMessage = "Проблема с сервисом, мы уже работаем над исправлением";
            }
            
            return res.status(500).json({
                success: false,
                error: userMessage
            });
        }

        const openaiData = await openaiResponse.json();
        const tripPlan = openaiData.choices?.[0]?.message?.content || "Не удалось сгенерировать маршрут";

        console.log('✅ Маршрут успешно сгенерирован через OpenAI');
        console.log('📧 Email для отправки:', email);
        console.log('📝 Длина маршрута:', tripPlan.length, 'символов');

        // ✅ УСПЕШНЫЙ ОТВЕТ ДЛЯ TILDA
        console.log('🎉 УСПЕХ: Форма обработана, отправляем ответ Tilda');
        
        res.json({
            success: true,
            message: "Персональный маршрут успешно создан! Проверьте вашу почту в ближайшее время.",
            data: {
                city,
                email,
                plan_generated: true,
                preview: tripPlan.substring(0, 200) + '...'
            }
        });

    } catch (error) {
        console.error('💥 КРИТИЧЕСКАЯ ОШИБКА:', error);
        
        res.status(500).json({
            success: false,
            error: "Внутренняя ошибка сервера. Мы уже работаем над исправлением."
        });
    }
});

// === Тестовые маршруты ===
app.get("/", (req, res) => {
    res.json({
        status: "✅ Сервер работает",
        service: "AI Trip Planner",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

app.get("/health", (req, res) => {
    res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Обработка несуществующих маршрутов
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "Маршрут не найден"
    });
});

// === Запуск сервера ===
app.listen(PORT, '0.0.0.0', () => {
    console.log(`  
🚀 === AI TRIP PLANNER SERVER ===
📍 Порт: ${PORT}
⏰ Время: ${new Date().toISOString()}
🔑 OpenAI: ${process.env.OPENAI_API_KEY ? 'Настроен' : 'ТРЕБУЕТСЯ НАСТРОЙКА'}
🌐 URL: https://ai-trip-server.onrender.com
================================
    `);
});
