// server.js
require("dotenv").config();

const express = require("express");
const path = require("path");
const multer = require("multer");
const morgan = require("morgan");
const axios = require("axios");
const FormData = require("form-data");

const app = express();
const PORT = process.env.PORT || 3000;
const GAS_ENDPOINT = process.env.GAS_ENDPOINT; // Укажите в .env или переменных окружения

if (!GAS_ENDPOINT) {
  console.warn("ВНИМАНИЕ: Переменная GAS_ENDPOINT не задана. Задайте URL Apps Script Web App (/exec) в .env");
}

// Логи запросов
app.use(morgan("combined"));

// Статика
app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  maxAge: "1h",
}));

// Health-check
app.get("/health", (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// Настройка multer (файл в память)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // до 25 МБ
});

// Прокси-эндпойнт: принимает форму и форвардит в GAS
app.post("/api/kp", upload.single("proposalFile"), async (req, res) => {
  try {
    if (!GAS_ENDPOINT) {
      return res.status(500).json({ success: false, message: "GAS_ENDPOINT не настроен на сервере" });
    }

    const fd = new FormData();

    // Текстовые поля
    for (const [k, v] of Object.entries(req.body || {})) {
      fd.append(k, v);
    }

    // Добавим временную метку клиента на сервере, если фронт не прислал
    if (!("clientTimestamp" in (req.body || {}))) {
      fd.append("clientTimestamp", new Date().toISOString());
    }

    // Файл (если есть)
    if (req.file) {
      fd.append("proposalFile", req.file.buffer, {
        filename: req.file.originalname || "file",
        contentType: req.file.mimetype || "application/octet-stream",
      });
    }

    // Отправляем в GAS
    const resp = await axios.post(GAS_ENDPOINT, fd, {
      headers: fd.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 60000, // 60 сек
      validateStatus: () => true, // сами обработаем статусы
    });

    // Пробрасываем ответ как есть
    res.status(resp.status).json(
      typeof resp.data === "object" ? resp.data : { success: resp.status < 400, data: resp.data }
    );
  } catch (err) {
    console.error("Proxy error:", err?.response?.status || "", err?.message);
    const status = err?.response?.status || 500;
    res.status(status).json({
      success: false,
      message: err?.response?.data?.message || err.message || "Proxy error",
    });
  }
});

// Single Page (если нужно): отдаём index.html для неизвестных путей, кроме /api/*
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
