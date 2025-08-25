(() => {
  "use strict";

  const form = document.getElementById("kp-form");
  const statusBox = document.getElementById("formStatus");
  const submitBtn = document.getElementById("submitBtn");
  const endpoint = window.GAS_ENDPOINT;

  const MAX_FILE_MB = 20;
  const ACCEPT_EXT = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg"];

  const setStatus = (msg, type = "info") => {
    statusBox.textContent = msg || "";
    statusBox.style.color = type === "error" ? "var(--danger)" : "var(--muted)";
  };
  const setFieldError = (name, message) => {
    const err = document.querySelector(`.error[data-error-for="${name}"]`);
    if (err) err.textContent = message || "";
  };
  const clearErrors = () => {
    document.querySelectorAll(".error").forEach(e => (e.textContent = ""));
    setStatus("");
  };

  const validate = () => {
    let valid = true;

    const companyName = form.companyName.value.trim();
    if (!companyName) { setFieldError("companyName", "Укажите название компании"); valid = false; }

    const proposalTitle = form.proposalTitle.value.trim();
    if (!proposalTitle) { setFieldError("proposalTitle", "Укажите тему КП"); valid = false; }

    const amount = parseFloat(form.amount.value);
    if (!(amount >= 0)) { setFieldError("amount", "Введите сумму (0 и выше)"); valid = false; }

    const currency = form.currency.value;
    if (!currency) { setFieldError("currency", "Выберите валюту"); valid = false; }

    const date = form.proposalDate.value;
    if (!date) { setFieldError("proposalDate", "Укажите дату КП"); valid = false; }

    const email = form.email.value.trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setFieldError("email", "Некорректный email");
      valid = false;
    }

    const link = form.sourceLink.value.trim();
    if (link && !/^https?:\/\/.+/i.test(link)) {
      setFieldError("sourceLink", "Ссылка должна начинаться с http(s)://");
      valid = false;
    }

    const file = form.proposalFile.files?.[0];
    if (file) {
      const ext = "." + file.name.split(".").pop().toLowerCase();
      if (!ACCEPT_EXT.includes(ext)) {
        setFieldError("proposalFile", "Недопустимый тип файла");
        valid = false;
      }
      const sizeMb = file.size / (1024 * 1024);
      if (sizeMb > MAX_FILE_MB) {
        setFieldError("proposalFile", `Файл превышает ${MAX_FILE_MB} МБ`);
        valid = false;
      }
    }

    if (!form.consent.checked) {
      setFieldError("consent", "Требуется согласие");
      valid = false;
    }

    return valid;
  };

  const toFormData = () => {
    const fd = new FormData(form);
    fd.append("clientTimestamp", new Date().toISOString());
    return fd;
  };

  const setLoading = (loading) => {
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? "Отправка..." : "Отправить";
  };

  const fetchWithTimeout = (resource, options = {}) => {
    const { timeout = 60000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    return fetch(resource, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(id));
  };

  const explainNetworkError = (err) => {
    if (err.name === "AbortError") return "Превышено время ожидания ответа сервера.";
    if (err.message?.includes("Failed to fetch")) {
      return "Не удалось установить соединение. Повторите попытку позже.";
    }
    return err.message || "Неизвестная ошибка сети.";
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();

    if (!validate()) {
      setStatus("Проверьте поля формы — найдены ошибки.", "error");
      return;
    }
    if (!endpoint) {
      setStatus("Не настроен адрес приёма данных (GAS_ENDPOINT).", "error");
      return;
    }

    const data = toFormData();
    setLoading(true);
    setStatus("Отправка данных...");

    try {
      const res = await fetchWithTimeout(endpoint, {
        method: "POST",
        body: data,
      });

      const ct = res.headers.get("content-type") || "";
      const isJson = ct.includes("application/json");
      const payload = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        const msg = (isJson && payload?.message) ? payload.message : (typeof payload === "string" ? payload : "Ошибка сервера");
        throw new Error(msg);
      }

      if (isJson && payload?.success) {
        setStatus("Готово! Данные успешно отправлены.");
        form.reset();
      } else {
        setStatus("Ответ сервера получен, но формат неожиданный.", "error");
        console.warn("Unexpected response:", payload);
      }
    } catch (err) {
      console.error(err);
      setStatus(explainNetworkError(err), "error");
    } finally {
      setLoading(false);
    }
  });

  form.addEventListener("reset", () => {
    clearErrors();
    setStatus("");
  });
})();
