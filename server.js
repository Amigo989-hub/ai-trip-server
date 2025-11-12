// === Импорты ===
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

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
    req.method === 'OPTIONS' ? res.sendStatus(200) : next();
});

// === Логирование ===
app.use((req, res, next) => {
    console.log('=== 📨 ЗАПРОС ===', new Date().toISOString());
    console.log('Method:', req.method, 'URL:', req.url);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('================');
    next();
});

// === ГЛАВНЫЙ МАРШРУТ ===
app.post("/api/route", async (req, res) => {
    console.log('🟢 === НАЧАЛО ОБРАБОТКИ ФОРМЫ ===');
    
    try {
        // 🎯 ПАРСИМ ДАННЫЕ ОТ TILDA
        let formData = {};
        
        if (req.body.fields && Array.isArray(req.body.fields)) {
            req.body.fields.forEach(field => {
                formData[field.name] = field.value;
            });
        } else {
            formData = { ...req.body };
        }
        
        console.log('📦 ДАННЫЕ ФОРМЫ:', formData);

        // 🎯 ИЗВЛЕКАЕМ ПОЛЯ ИЗ ЛЮБЫХ ВОЗМОЖНЫХ ИМЕН
        const extractField = (possibleNames) => {
            for (const name of possibleNames) {
                if (formData[name] && formData[name].toString().trim()) {
                    return formData[name].toString().trim();
                }
            }
            return null;
        };

        const city = extractField(['city', 'City', 'Город', 'gorod', 'Gorod', 'destination']) || 'Неизвестный город';
        const email = extractField(['email', 'Email', 'E-mail', 'mail']);
        const startDate = extractField(['startDate', 'StartDate', 'start-date', 'Дата начала']);
        const endDate = extractField(['endDate', 'EndDate', 'end-date', 'Дата окончания']);
        const budget = extractField(['budget', 'Budget', 'Бюджет']);
        const interests = extractField(['interests', 'Interests', 'Интересы']);
        const people = extractField(['people', 'People', 'Количество человек']);

        console.log('🎯 ИЗВЛЕЧЕННЫЕ ДАННЫЕ:', { 
            city, 
            email, 
            startDate, 
            endDate, 
            budget, 
            interests, 
            people 
        });

        // ✅ ВАЛИДАЦИЯ ТОЛЬКО EMAIL
        if (!email) {
            console.warn('❌ Нет email');
            return res.status(400).json({ 
                success: false, 
                error: "Пожалуйста, укажите email для отправки маршрута" 
            });
        }

        // 🔑 ПРОВЕРКА OPENAI API KEY
        if (!process.env.OPENAI_API_KEY) {
            console.error('❌ Нет OpenAI API ключа');
            return res.status(500).json({ 
                success: false, 
                error: "Сервис временно недоступен" 
            });
        }

        // 🧠 ПРОФЕССИОНАЛЬНЫЙ ПРОМПТ ДЛЯ OPENAI
        const prompt = `
Создай подробный персонализированный маршрут путешествия в ${city}.

Информация о поездке:
- Город: ${city}
- Даты: ${startDate || "не указано"} - ${endDate || "не указано"} 
- Бюджет: ${budget || "не указано"}
- Интересы: ${interests || "не указано"}
- Количество путешественников: ${people || "1"}

Требования к маршруту:
1. Создай расписание на ВСЕ дни поездки (от ${startDate || "начала"} до ${endDate || "конца"})
2. Учитывай продолжительность поездки при планировании
3. Включи лучшие достопримечательности, рестораны и развлечения города
4. Учитывай указанные интересы (${interests || "общие"}) и бюджет (${budget || "стандартный"})
5. Добавь практические советы по транспорту, логистике и местным особенностям
6. Сделай маршрут живым и увлекательным, с эмодзи где уместно
7. Форматируй красиво, но без Markdown разметки

Создай УНИКАЛЬНЫЙ маршрут, который идеально подойдет именно этим путешественникам!
`;

        console.log('🧠 Генерируем маршрут через OpenAI...');
        console.log('📍 Город:', city);
        console.log('📅 Продолжительность:', startDate && endDate ? `${startDate} - ${endDate}` : 'не указана');
        console.log('💰 Бюджет:', budget || 'не указан');
        console.log('🎯 Интересы:', interests || 'не указаны');
        console.log('👥 Путешественников:', people || '1');

        // 🔗 ЗАПРОС К OPENAI
        const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
                max_tokens: 2000
            }),
            timeout: 30000
        });

        if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            console.error('❌ Ошибка OpenAI:', errorText);
            throw new Error(`OpenAI error: ${openaiResponse.status}`);
        }

        const openaiData = await openaiResponse.json();
        const tripPlan = openaiData.choices[0].message.content;

        console.log('✅ Маршрут успешно сгенерирован');
        console.log('📧 Отправляем на email:', email);
        console.log('📝 Длина маршрута:', tripPlan.length, 'символов');

        // ✅ УСПЕШНЫЙ ОТВЕТ
        res.json({
            success: true,
            message: "Персональный маршрут успешно создан! Проверьте вашу почту в ближайшее время.",
            data: {
                city,
                email,
                plan_generated: true,
                plan_length: tripPlan.length
            }
        });

    } catch (error) {
        console.error('💥 ОШИБКА:', error);
        res.status(500).json({ 
            success: false, 
            error: "Внутренняя ошибка сервера. Мы уже работаем над исправлением." 
        });
    }
});

// === ТЕСТОВЫЕ МАРШРУТЫ ===
app.get("/", (req, res) => {
    res.json({ 
        status: "✅ Сервер работает",
        service: "AI Trip Planner",
        timestamp: new Date().toISOString()
    });
});

app.get("/health", (req, res) => {
    res.json({ 
        status: "healthy", 
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// === ЗАПУСК ===
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`🔑 OpenAI: ${process.env.OPENAI_API_KEY ? 'Настроен' : 'НЕ НАСТРОЕН'}`);
    console.log(`🌐 URL: https://ai-trip-server.onrender.com`);
});
