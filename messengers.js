(function () {
    "use strict";

    const telegramChatUrl = "https://t.me/yajizn";
    const telegramChannelUrl = "https://t.me/yazhiznclinic";
    const maxUrl = "https://max.ru/+79037928003";

    function ready(callback) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, { once: true });
            return;
        }

        callback();
    }

    function createFooterBlock() {
        const block = document.createElement("div");
        block.className = "messenger-links";
        block.innerHTML = `
            <h3>Мессенджеры</h3>
            <a href="${telegramChatUrl}" target="_blank" rel="noopener">
                ${telegramIcon()}
                <span class="messenger-label">Запись в Telegram <span>@yajizn</span></span>
            </a>
            <a href="${maxUrl}" target="_blank" rel="noopener">
                ${maxIcon()}
                <span class="messenger-label">Запись в MAX <span>по номеру клиники</span></span>
            </a>
            <a href="${telegramChannelUrl}" target="_blank" rel="noopener">
                ${telegramIcon()}
                <span class="messenger-label">Telegram-канал <span>t.me/yazhiznclinic</span></span>
            </a>
            <p class="messenger-note">Канал в MAX добавим после запуска.</p>
        `;
        return block;
    }

    function addFooterMessengers() {
        document.querySelectorAll(".footer__grid").forEach((grid) => {
            if (grid.querySelector(".messenger-links")) return;
            grid.append(createFooterBlock());
        });
    }

    function createBookingChannels() {
        const box = document.createElement("div");
        box.className = "booking-channels";
        box.innerHTML = `
            <p class="booking-channels__title">Удобнее написать сразу?</p>
            <p class="booking-channels__text">Можно отправить заявку через форму или перейти в мессенджер. В Telegram пишите на @yajizn, в MAX - по мобильному номеру клиники.</p>
            <div class="booking-channel-actions">
                <a href="${telegramChatUrl}" target="_blank" rel="noopener">${telegramIcon()} Написать в Telegram</a>
                <a href="${maxUrl}" target="_blank" rel="noopener">${maxIcon()} Написать в MAX</a>
            </div>
        `;
        return box;
    }

    function telegramIcon() {
        return `
            <span class="messenger-icon messenger-icon--telegram" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                    <path fill="currentColor" d="M20.7 4.4c.4-.2.8.1.7.6l-2.5 14.2c-.1.7-.9.9-1.4.5l-4.1-3.1-2.2 2.1c-.3.3-.8.1-.8-.3l.4-3.5 6.5-6.1c.3-.3-.1-.7-.4-.5l-8.1 5.1-3.5-1.1c-.8-.2-.8-1.3 0-1.6l14.4-6.3Z"/>
                </svg>
            </span>
        `;
    }

    function maxIcon() {
        return `<span class="messenger-icon messenger-icon--max" aria-hidden="true">MAX</span>`;
    }

    function addBookingChannels() {
        document.querySelectorAll("#booking-form").forEach((form) => {
            if (form.querySelector(".booking-channels")) return;

            const privacy = form.querySelector(".privacy");
            const channels = createBookingChannels();
            if (privacy) {
                form.insertBefore(channels, privacy);
            } else {
                form.append(channels);
            }
        });
    }

    ready(() => {
        addFooterMessengers();
        addBookingChannels();
    });
})();
