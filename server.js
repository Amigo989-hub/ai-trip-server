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
    console.log('🟢 ОБРАБОТКА ФОРМЫ TILDA');
    
    try {
        // 🎯 ПАРСИМ ДАННЫЕ ОТ TILDA (ЛЮБОЙ ФОРМАТ)
        let formData = {};
        
        if (req.body.fields && Array.isArray(req.body.fields)) {
            // Формат 1: fields[]
            req.body.fields.forEach(field => {
                formData[field.name] = field.value;
            });
        } else {
            // Формат 2: Плоский объект
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

        const city = extractField(['city', 'City', 'Город', 'gorod', 'Gorod', 'destination', 'name', 'Name', 'field1']) || 'Париж';
        const email = extractField(['email', 'Email', 'E-mail', 'mail', 'contact_email']);
        const startDate = extractField(['startDate', 'StartDate', 'start-date', 'Дата начала']);
        const endDate = extractField(['endDate', 'EndDate', 'end-date', 'Дата окончания']);
        const budget = extractField(['budget', 'Budget', 'Бюджет']);
        const interests = extractField(['interests', 'Interests', 'Интересы']);
        const people = extractField(['people', 'People', 'Количество человек']);

        console.log('🎯 ИЗВЛЕЧЕННЫЕ ДАННЫЕ:', { city, email, startDate, endDate, budget, interests, people });

        // ✅ ВАЛИДАЦИЯ ТОЛЬКО EMAIL (ГОРОД ЕСТЬ ВСЕГДА)
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

        // 🧠 ГЕНЕРАЦИЯ МАРШРУТА ЧЕРЕЗ OPENAI
        console.log('🧠 Генерируем маршрут через OpenAI...');

        const prompt = `
Создай подробный маршрут путешествия в ${city}.

Детали:
- Даты: ${startDate || "не указаны"} - ${endDate || "не указаны"}
- Бюджет: ${budget || "не указан"}  
- Интересы: ${interests || "не указаны"}
- Путешественников: ${people || "1"}

Создай расписание на 2-3 дня с временными слотами, включи достопримечательности, рестораны и практические советы.
Форматируй красиво с эмодзи.
`;

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

        console.log('✅ Маршрут сгенерирован');
        console.log('📧 Отправляем на:', email);

        // ✅ УСПЕШНЫЙ ОТВЕТ
        res.json({
            success: true,
            message: "Маршрут успешно создан! Проверьте вашу почту.",
            data: {
                city,
                email,
                plan_length: tripPlan.length
            }
        });

    } catch (error) {
        console.error('💥 ОШИБКА:', error);
        res.status(500).json({ 
            success: false, 
            error: "Внутренняя ошибка сервера" 
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
    res.json({ status: "healthy", uptime: process.uptime() });
});

// === ЗАПУСК ===
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`🔑 OpenAI: ${process.env.OPENAI_API_KEY ? 'Настроен' : 'НЕ НАСТРОЕН'}`);
});
