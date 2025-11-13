// === Импорты и базовые настройки ===
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// === Middleware ===
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
  console.log("BODY:", JSON.stringify(req.body, null, 2));
  console.log("========================\n");
  next();
});

// === Универсальный парсер данных из Tilda ===
const parseTildaData = (body) => {
  const result = {};
  if (body.fields && Array.isArray(body.fields)) {
    for (const field of body.fields) {
      result[field.name] = field.value;
    }
  } else {
    Object.assign(result, body);
  }
  return result;
};

// === Извлечение поля с возможными именами ===
const extractField = (data, names) => {
  for (const name of names) {
    if (data[name] && data[name].trim()) return data[name].trim();
  }
  return null;
};

// === Функция генерации промпта ===
const buildPrompt = (city, start, end, budget, interests, people) => `
Ты — профессиональный travel-планировщик.
Создай детальный маршрут поездки в ${city}.
📅 Даты: ${start || "не указаны"} - ${end || "не указаны"}
💰 Бюджет: ${budget || "не указан"}
🎯 Интересы: ${interests || "не указаны"}
👥 Путешественников: ${people || "1"}

Опиши каждый день с утра до вечера:
- что посетить, где поесть, что попробовать
- добавь советы по транспорту и атмосфере
- используй эмодзи и короткие абзацы
`;

// === Главный маршрут ===
app.post("/api/route", async (req, res) => {
  try {
    const data = parseTildaData(req.body);

    const city = extractField(data, ["city", "City", "Город", "destination"]);
    const email = extractField(data, ["email", "Email", "E-mail"]);
    const startDate = extractField(data, ["startDate", "start-date"]);
    const endDate = extractField(data, ["endDate", "end-date"]);
    const budget = extractField(data, ["budget", "Budget"]);
    const interests = extractField(data, ["interests", "Интересы"]);
    const people = extractField(data, ["people", "Persons", "Количество"]);

    // Минимальная валидация
    if (!city || !email) {
      console.warn("⚠️ Некорректные данные из формы:", { city, email });
      return res.status(200).json({
        success: true,
        message: "Заявка принята! Менеджер свяжется с вами для уточнения.",
      });
    }

    // ⚡ Мгновенный ответ Тильде (чтобы не словить timeout)
    res.status(200).json({
      success: true,
      message: "Маршрут генерируется. Проверьте почту в течение 5 минут!",
    });

    // === Асинхронная генерация маршрута ===
    console.log(`🧠 Генерация маршрута для ${city} (${email})...`);

    const prompt = buildPrompt(city, startDate, endDate, budget, interests, people);

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
        max_tokens: 1800,
      }),
    });

    if (!aiResponse.ok) {
      const err = await aiResponse.text();
      console.error("❌ Ошибка OpenAI:", err);
      return;
    }

    const result = await aiResponse.json();
    const plan = result.choices?.[0]?.message?.content || "Маршрут не удалось создать.";

    console.log("✅ Маршрут сгенерирован для:", city);
    console.log(plan.slice(0, 200) + "...");

    // 💌 TODO: Отправка письма с маршрутом пользователю
    // Здесь можно будет добавить Mailgun или Resend API

  } catch (err) {
    console.error("💥 Ошибка обработки запроса:", err);
  }
});

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
