(() => {
  'use strict';

  const credentialsForm = document.querySelector('#credentials-form');
  const codeForm = document.querySelector('#code-form');
  const message = document.querySelector('#login-message');
  const lead = document.querySelector('#login-lead');
  const timer = document.querySelector('#code-timer');
  const codeInputs = Array.from(document.querySelectorAll('[data-code-inputs] input'));
  let challengeId = '';
  let timerId = 0;

  const setMessage = (text, success = false) => {
    message.textContent = text;
    message.classList.toggle('is-success', success);
  };

  const setBusy = (form, busy) => {
    form.querySelectorAll('button, input').forEach((control) => { control.disabled = busy; });
  };

  const api = async (url, payload) => {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Не удалось выполнить запрос.');
    return data;
  };

  const startTimer = (seconds) => {
    window.clearInterval(timerId);
    let remaining = seconds;
    const render = () => {
      const minutes = Math.floor(remaining / 60);
      timer.textContent = `${minutes}:${String(remaining % 60).padStart(2, '0')}`;
      if (remaining <= 0) {
        window.clearInterval(timerId);
        setMessage('Срок действия кода истёк. Введите данные заново.');
        codeForm.querySelector('button[type="submit"]').disabled = true;
      }
      remaining -= 1;
    };
    render();
    timerId = window.setInterval(render, 1000);
  };

  credentialsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage('');
    if (!credentialsForm.reportValidity()) return;
    setBusy(credentialsForm, true);
    try {
      const data = await api('/api/auth/request-code', {
        email: credentialsForm.elements.email.value,
        password: credentialsForm.elements.password.value,
      });
      challengeId = data.challengeId;
      credentialsForm.elements.password.value = '';
      credentialsForm.hidden = true;
      codeForm.hidden = false;
      lead.textContent = 'Я отправила шестизначный код на разрешённую почту. Введите его, чтобы открыть панель.';
      setMessage('Письмо с кодом отправлено.', true);
      startTimer(Number(data.expiresIn) || 600);
      codeInputs[0].focus();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(credentialsForm, false);
    }
  });

  codeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = codeInputs.map((input) => input.value).join('');
    if (!/^\d{6}$/.test(code)) {
      setMessage('Введите все шесть цифр из письма.');
      return;
    }
    setMessage('');
    setBusy(codeForm, true);
    try {
      await api('/api/auth/verify-code', { challengeId, code });
      setMessage('Вход подтверждён. Открываю панель…', true);
      window.clearInterval(timerId);
      window.location.replace('/admin.html');
    } catch (error) {
      setMessage(error.message);
      codeInputs.forEach((input) => { input.value = ''; });
      codeInputs[0].focus();
    } finally {
      setBusy(codeForm, false);
    }
  });

  codeInputs.forEach((input, index) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(-1);
      if (input.value && codeInputs[index + 1]) codeInputs[index + 1].focus();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace' && !input.value && codeInputs[index - 1]) codeInputs[index - 1].focus();
    });
    input.addEventListener('paste', (event) => {
      const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
      if (!digits) return;
      event.preventDefault();
      codeInputs.forEach((field, fieldIndex) => { field.value = digits[fieldIndex] || ''; });
      codeInputs[Math.min(digits.length, 6) - 1].focus();
    });
  });

  document.querySelector('[data-toggle-password]').addEventListener('click', (event) => {
    const button = event.currentTarget;
    const input = credentialsForm.elements.password;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    button.setAttribute('aria-label', showing ? 'Показать пароль' : 'Скрыть пароль');
  });

  document.querySelector('[data-change-account]').addEventListener('click', () => {
    window.clearInterval(timerId);
    challengeId = '';
    codeInputs.forEach((input) => { input.value = ''; });
    codeForm.hidden = true;
    credentialsForm.hidden = false;
    codeForm.querySelector('button[type="submit"]').disabled = false;
    lead.textContent = 'Сначала подтвердите пароль. Затем я отправлю одноразовый код на разрешённую почту.';
    setMessage('');
    credentialsForm.elements.email.focus();
  });
})();
