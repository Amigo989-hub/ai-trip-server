import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// 💡 Главный маршрут для Tilda webhook
app.post("/api/route", async (req, res) => {
  try {
    let body = req.body;

    // 🧩 Если Tilda прислала fields[], конвертируем его в обычный объект
    if (body.fields && Array.isArray(body.fields)) {
      const mapped = {};
      body.fields.forEach(f => {
        mapped[f.name.trim()] = f.value;
      });
      body = mapped;
    }

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
