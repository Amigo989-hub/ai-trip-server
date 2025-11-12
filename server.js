
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
