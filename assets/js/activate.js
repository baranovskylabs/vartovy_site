/* =====================================================================
 * Vartovy — клієнт сторінки активації / перевірки Pro-ключа.
 * Викликає Edge Functions Supabase. Жодних секретів тут — тільки
 * публічний anon key і URL функцій.
 * =================================================================== */

(function () {
  "use strict";

  // !!! Замінити на свої значення після деплою:
  const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
  const SUPABASE_ANON_KEY = "YOUR-ANON-KEY";

  const FN = (name) => `${SUPABASE_URL}/functions/v1/${name}`;

  const $ = (sel) => document.querySelector(sel);
  const form = $("#activate-form");
  if (!form) return;

  const out = $("#activate-result");
  const btn = $("#activate-submit");

  // Browser-based "device id" — стабільний у межах браузера+ОС.
  // Для desktop-клієнта використовуйте machine GUID. Тут — лише для
  // верифікації покупцем, що ключ робочий, через сайт.
  function browserDeviceId() {
    const KEY = "vartovy.web.deviceId";
    let v = localStorage.getItem(KEY);
    if (!v) {
      const buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      v = "web-" + Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(KEY, v);
    }
    return v;
  }

  function setStatus(kind, text) {
    out.className = "activate-result activate-result--" + kind;
    out.textContent = text;
    out.hidden = false;
  }

  const ERRORS = {
    license_not_found:        "Ключ не знайдено. Перевірте, що ви скопіювали його з листа повністю.",
    license_inactive:         "Ключ деактивовано або повернено. Зверніться до підтримки.",
    license_expired:          "Термін дії ключа завершився.",
    activation_limit_reached: "Досягнуто ліміту активацій. Деактивуйте ключ на старому пристрої.",
    payment_provider_failed:  "Платіжний провайдер відхилив активацію. Спробуйте пізніше або зверніться до підтримки.",
    lemon_activate_failed:    "Платіжний провайдер відхилив активацію. Спробуйте пізніше або зверніться до підтримки.",
    missing_fields:           "Заповніть усі поля.",
    bad_json:                 "Внутрішня помилка. Оновіть сторінку.",
    server_error:             "Тимчасова помилка сервера. Спробуйте за хвилину.",
  };

  // Якщо backend ще не підключено — попередимо користувача чесно,
  // не змушуючи його чекати timeout-у мережі.
  const BACKEND_NOT_CONFIGURED =
    SUPABASE_URL.includes("YOUR-PROJECT") || SUPABASE_ANON_KEY.includes("YOUR-");
  if (BACKEND_NOT_CONFIGURED) {
    setTimeout(function () {
      out.className = "activate-result activate-result--err";
      out.innerHTML =
        "<strong>Активація поки не доступна.</strong> Платіжна інтеграція " +
        "проходить верифікацію. Якщо ви придбали Pro — напишіть на " +
        '<a href="mailto:support@vartovy.app">support@vartovy.app</a>, ' +
        "і ми активуємо ключ вручну.";
      out.hidden = false;
      btn.disabled = true;
    }, 0);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    out.hidden = true;
    btn.disabled = true;
    btn.dataset.label = btn.dataset.label || btn.textContent;
    btn.textContent = "Перевірка...";

    const licenseKey = ($("#license-key").value || "").trim();
    const action = $("#action-type").value; // validate | activate

    try {
      const res = await fetch(FN(action), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "authorization": "Bearer " + SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          license_key: licenseKey,
          device_id:   browserDeviceId(),
          device_name: navigator.userAgent.slice(0, 80),
          platform:    "web",
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus("err", ERRORS[data.error] || `Помилка: ${data.error || res.status}`);
        return;
      }

      if (action === "validate") {
        if (data.valid) {
          setStatus("ok", "✓ Ключ дійсний. План: " + (data.plan || "pro").toUpperCase());
        } else {
          setStatus("err", "Ключ недійсний: " + (ERRORS[data.reason] || data.reason || "невідома причина"));
        }
      } else {
        setStatus(
          "ok",
          "✓ Активація успішна для " + (data.email || "вашого облікового запису") +
            ". Тепер запустіть Vartovy на цьому пристрої — Pro увімкнеться автоматично.",
        );
      }
    } catch (err) {
      console.error(err);
      setStatus("err", "Немає зв'язку із сервером. Перевірте інтернет і спробуйте знову.");
    } finally {
      btn.disabled = false;
      btn.textContent = btn.dataset.label;
    }
  });
})();
