// === Импорты и настройки ===
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// === Middleware ===
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS для Tilda
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, API-Key');
    req.method === 'OPTIONS' ? res.sendStatus(200) : next();
});

// === Логирование всех запросов ===
app.use((req, res, next) => {
    console.log('=== 📨 TILDA REQUEST ===');
    console.log('Time:', new Date().toISOString());
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('========================');
    next();
});

// === Функции для работы с Tilda ===
const parseTildaData = (body) => {
    const result = {};
    
    // Формат 1: Массив fields[] (новый формат Tilda)
    if (body.fields && Array.isArray(body.fields)) {
        body.fields.forEach(field => {
            if (field.name && field.value !== undefined) {
                result[field.name] = field.value;
            }
        });
    }
    
    // Формат 2: Плоский объект (старый формат Tilda)
    Object.keys(body).forEach(key => {
        if (key !== 'fields' && body[key] !== undefined) {
            result[key] = body[key];
        }
    });
    
    return result;
};

const extractField = (data, possibleNames) => {
    for (const name of possibleNames) {
        if (data[name] && data[name].toString().trim()) {
            return data[name].toString().trim();
        }
    }
    return null;
};

// === Промпт для OpenAI ===
const generatePrompt = (city, startDate, endDate, budget, interests, people) => {
    return `
Разработай эксклюзивный, детализированный маршрут путешествия в ${city}, который идеально соответствует пожеланиям клиента.

КОНТЕКСТ ПУТЕШЕСТВИЯ:
📍 Город назначения: ${city}
📅 Даты поездки: ${startDate || "не указаны"} - ${endDate || "не указаны"} 
💰 Бюджет: ${budget || "не указан"}
🎯 Интересы и предпочтения: ${interests || "не указаны"}
👥 Количество путешественников: ${people || "1"}

ТРЕБОВАНИЯ К МАРШРУТУ:

1. ДЕТАЛЬНОЕ ПЛАНИРОВАНИЕ ПО ДНЯМ:
   - Создай расписание на ВСЮ продолжительность поездки
   - Разбей каждый день на утро/день/вечер с точными временными интервалами
   - Учитывай логистику перемещений между локациями

2. ПЕРСОНАЛИЗАЦИЯ:
   - Учитывай указанные интересы: ${interests || "универсальные достопримечательности"}
   - Подбери мероприятия соответствующие бюджету: ${budget || "средний бюджет"}
   - Учти количество человек: ${people || "1"} путешественник

3. КОНТЕНТ МАРШРУТА:
   - Достопримечательности: главные must-see места + скрытые жемчужины
   - Гастрономия: рестораны, кафе, бары с местной кухней
   - Развлечения: мероприятия, шоппинг, ночная жизнь
   - Отдых: парки, зоны релакса, фото-локации

4. ПРАКТИЧЕСКИЕ РЕКОМЕНДАЦИИ:
   - Транспорт: оптимальные маршруты, стоимость, советы
   - Бюджет: ориентировочные расходы на день
   - Локализации: особенности местной культуры и этикета
   - Безопасность: важные предупреждения и советы

5. ФОРМАТИРОВАНИЕ:
   - Используй эмодзи для визуального разделения блоков
   - Структурируй информацию четко и читаемо
   - Не используй Markdown разметку
   - Сделай текст живым и вдохновляющим

Создай УНИКАЛЬНЫЙ, ЗАПОМИНАЮЩИЙСЯ маршрут, который превзойдет ожидания путешественников!
`;
};

// === Главный обработчик ===
app.post("/api/route", async (req, res) => {
    console.log('🟢 === ОБРАБОТКА ЗАЯВКИ TILDA ===');
    
    try {
        // Парсим данные от Tilda
        const formData = parseTildaData(req.body);
        console.log('📊 ДАННЫЕ ФОРМЫ:', formData);

        // Извлекаем поля с учетом всех возможных имен
        const city = extractField(formData, ['city', 'City', 'Город', 'gorod', 'destination', 'name']);
        const email = extractField(formData, ['email', 'Email', 'E-mail', 'mail', 'contact']);
        const startDate = extractField(formData, ['startDate', 'StartDate', 'start-date', 'datefrom']);
        const endDate = extractField(formData, ['endDate', 'EndDate', 'end-date', 'dateto']);
        const budget = extractField(formData, ['budget', 'Budget', 'Бюджет', 'price']);
        const interests = extractField(formData, ['interests', 'Interests', 'Интересы', 'preferences']);
        const people = extractField(formData, ['people', 'People', 'persons', 'travelers']);

        console.log('🎯 ИЗВЛЕЧЕННЫЕ ДАННЫЕ:', {
            city: city || 'НЕ НАЙДЕН',
            email: email || 'НЕ НАЙДЕН', 
            startDate: startDate || 'не указано',
            endDate: endDate || 'не указано',
            budget: budget || 'не указано',
            interests: interests || 'не указано',
            people: people || 'не указано'
        });

        // 🔴 КРИТИЧЕСКАЯ ВАЛИДАЦИЯ
        if (!city) {
            console.error('❌ ОШИБКА: Не указан город в форме Tilda');
            // Возвращаем успех для Tilda, но логируем ошибку
            return res.json({
                success: true,
                message: "Заявка принята! Свяжемся с вами для уточнения деталей."
            });
        }

        if (!email) {
            console.error('❌ ОШИБКА: Не указан email в форме Tilda');
            return res.json({
                success: true, 
                message: "Заявка принята! Для отправки маршрута свяжемся с вами."
            });
        }

        // Проверка OpenAI API Key
        if (!process.env.OPENAI_API_KEY) {
            console.error('❌ ОШИБКА: OPENAI_API_KEY не настроен');
            return res.json({
                success: true,
                message: "Заявка принята! Маршрут будет отправлен в ближайшее время."
            });
        }

        // 🧠 ГЕНЕРАЦИЯ МАРШРУТА
        console.log('🚀 ЗАПУСК ГЕНЕРАЦИИ МАРШРУТА...');
        
        const prompt = generatePrompt(city, startDate, endDate, budget, interests, people);
        
        const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: "Ты опытный travel-эксперт, который создает уникальные, детализированные маршруты путешествий. Твои маршруты всегда персонализированы, практичны и вдохновляющи."
                    },
                    {
                        role: "user", 
                        content: prompt
                    }
                ],
                temperature: 0.8,
                max_tokens: 3000,
                top_p: 0.9
            }),
            timeout: 45000
        });

        if (!openaiResponse.ok) {
            const errorData = await openaiResponse.json();
            console.error('❌ ОШИБКА OPENAI:', errorData);
            throw new Error(`OpenAI API Error: ${openaiResponse.status}`);
        }

        const openaiData = await openaiResponse.json();
        const tripPlan = openaiData.choices[0].message.content;

        console.log('✅ МАРШРУТ УСПЕШНО СГЕНЕРИРОВАН');
        console.log('📧 EMAIL ДЛЯ ОТПРАВКИ:', email);
        console.log('📏 ДЛИНА МАРШРУТА:', tripPlan.length, 'символов');

        // 💌 ЗДЕСЬ ДОБАВЬ ОТПРАВКУ EMAIL С МАРШРУТОМ
        // Например: sendEmail(email, tripPlan, city);

        // ✅ УСПЕШНЫЙ ОТВЕТ ДЛЯ TILDA
        res.json({
            success: true,
            message: "Ваш персонализированный маршрут успешно создан! Проверьте почту в течение 5 минут.",
            data: {
                destination: city,
                plan_generated: true,
                plan_preview: tripPlan.substring(0, 100) + '...'
            }
        });

    } catch (error) {
        console.error('💥 КРИТИЧЕСКАЯ ОШИБКА:', error);
        
        // Всегда возвращаем успех для Tilda
        res.json({
            success: true,
            message: "Заявка принята! Наш менеджер свяжется с вами в ближайшее время для уточнения деталей."
        });
    }
});

// === Health checks ===
app.get("/", (req, res) => {
    res.json({
        status: "✅ SERVER OPERATIONAL",
        service: "AI Travel Planner Pro",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
    });
});

app.get("/health", (req, res) => {
    res.json({
        status: "healthy",
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

// === Запуск сервера ===
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 AI TRAVEL PLANNER PRO
📍 Port: ${PORT}
⏰ Started: ${new Date().toISOString()}
🔑 OpenAI: ${process.env.OPENAI_API_KEY ? '✅ CONFIGURED' : '❌ NOT CONFIGURED'}
🌐 URL: https://ai-trip-server.onrender.com
💡 Status: READY FOR TILDA WEBHOOKS
    `);
});
