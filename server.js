import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Основной маршрут API
app.post("/api/route", async (req, res) => {
  try {
    const { city, startDate, endDate, budget, interests, email } = req.body;

    // Пример запроса к OpenTripMap
    const placesRes = await fetch(
      `https://api.opentripmap.com/0.1/en/places/radius?radius=10000&lon=2.3522&lat=48.8566&kinds=${encodeURIComponent(interests)}&limit=5&apikey=${process.env.OPENTRIPMAP_KEY}`
    );
    const placesData = await placesRes.json();
    const placeNames = placesData.features.map(p => p.properties.name).join(", ");

    // Пример запроса к OpenAI
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Ты умный планировщик маршрутов путешествий." },
          { role: "user", content: `Составь подробный маршрут по городу ${city}, даты ${startDate}–${endDate}, бюджет ${budget}, интересы: ${interests}. Вот места: ${placeNames}.` }
        ],
      }),
    });

    const aiData = await aiRes.json();
    const routeText = aiData.choices?.[0]?.message?.content || "Не удалось сгенерировать маршрут.";

    res.json({ success: true, route: routeText });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(3000, () => console.log("✅ Server running on port 3000"));
