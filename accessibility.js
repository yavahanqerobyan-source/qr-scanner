(function () {
    const storageKey = "yazhizn-accessibility";
    const root = document.documentElement;

    const defaults = {
        enabled: false,
        size: "large",
        theme: "white",
        spacing: "normal",
        images: "show",
        font: "sans"
    };

    let settings = readSettings();

    const query = new URLSearchParams(window.location.search);
    if (query.get("a11y") === "on") settings.enabled = true;
    if (query.get("a11y") === "off") settings.enabled = false;

    function readSettings() {
        try {
            const stored = window.localStorage.getItem(storageKey);
            return stored ? Object.assign({}, defaults, JSON.parse(stored)) : Object.assign({}, defaults);
        } catch (_error) {
            return Object.assign({}, defaults);
        }
    }

    function saveSettings() {
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(settings));
        } catch (_error) {
            return;
        }
    }

    function applySettings() {
        root.classList.toggle("a11y-on", settings.enabled);
        root.classList.toggle("a11y-size-normal", settings.enabled && settings.size === "normal");
        root.classList.toggle("a11y-size-large", settings.enabled && settings.size === "large");
        root.classList.toggle("a11y-size-xlarge", settings.enabled && settings.size === "xlarge");
        root.classList.toggle("a11y-theme-white", settings.theme === "white");
        root.classList.toggle("a11y-theme-black", settings.theme === "black");
        root.classList.toggle("a11y-theme-blue", settings.theme === "blue");
        root.classList.toggle("a11y-theme-beige", settings.theme === "beige");
        root.classList.toggle("a11y-spacing-wide", settings.enabled && settings.spacing === "wide");
        root.classList.toggle("a11y-images-hide", settings.enabled && settings.images === "hide");
        root.classList.toggle("a11y-font-serif", settings.enabled && settings.font === "serif");
        saveSettings();
        updateToolbarState();
    }

    function setSettings(patch) {
        settings = Object.assign({}, settings, patch);
        applySettings();
    }

    function button(label, patch, isActive) {
        const attrs = Object.entries(patch)
            .map(([key, value]) => `data-${key}="${String(value)}"`)
            .join(" ");
        return `<button class="a11y-option${isActive ? " is-active" : ""}" type="button" aria-pressed="${isActive}" ${attrs}>${label}</button>`;
    }

    function renderToolbar() {
        const toolbar = document.createElement("aside");
        toolbar.className = "a11y-toolbar";
        toolbar.setAttribute("aria-label", "Панель версии для слабовидящих");
        toolbar.innerHTML = `
            <button class="a11y-toggle" type="button" aria-expanded="false" title="Версия для слабовидящих">
                <span aria-hidden="true">A+</span>
                <span data-a11y-toggle-text>Версия для слабовидящих</span>
            </button>
            <button class="a11y-reset" type="button" title="Обычная версия" aria-label="Выключить версию для слабовидящих">Выкл</button>
            <div class="a11y-panel" role="region" aria-label="Настройки версии для слабовидящих">
                <div class="a11y-panel__header">
                    <div>
                        <h2>Версия для слабовидящих</h2>
                        <p>Настройки применяются ко всем страницам сайта.</p>
                    </div>
                    <button class="a11y-close" type="button" aria-label="Свернуть панель">×</button>
                </div>
                <div class="a11y-controls">
                    <div class="a11y-group" data-group="enabled">
                        <strong>Режим</strong>
                        <div class="a11y-options">
                            ${button("Включить", { enabled: "true" }, settings.enabled)}
                            ${button("Обычная версия", { enabled: "false" }, !settings.enabled)}
                        </div>
                    </div>
                    <div class="a11y-group" data-group="size">
                        <strong>Размер текста</strong>
                        <div class="a11y-options">
                            ${button("A", { size: "normal", enabled: "true" }, settings.size === "normal")}
                            ${button("A+", { size: "large", enabled: "true" }, settings.size === "large")}
                            ${button("A++", { size: "xlarge", enabled: "true" }, settings.size === "xlarge")}
                        </div>
                    </div>
                    <div class="a11y-group" data-group="theme">
                        <strong>Цветовая схема</strong>
                        <div class="a11y-options">
                            ${button("Белая", { theme: "white", enabled: "true" }, settings.theme === "white")}
                            ${button("Чёрная", { theme: "black", enabled: "true" }, settings.theme === "black")}
                            ${button("Синяя", { theme: "blue", enabled: "true" }, settings.theme === "blue")}
                            ${button("Бежевая", { theme: "beige", enabled: "true" }, settings.theme === "beige")}
                        </div>
                    </div>
                    <div class="a11y-group" data-group="spacing">
                        <strong>Интервалы</strong>
                        <div class="a11y-options">
                            ${button("Обычные", { spacing: "normal", enabled: "true" }, settings.spacing === "normal")}
                            ${button("Увеличенные", { spacing: "wide", enabled: "true" }, settings.spacing === "wide")}
                        </div>
                    </div>
                    <div class="a11y-group" data-group="images">
                        <strong>Изображения</strong>
                        <div class="a11y-options">
                            ${button("Показывать", { images: "show", enabled: "true" }, settings.images === "show")}
                            ${button("Скрыть", { images: "hide", enabled: "true" }, settings.images === "hide")}
                        </div>
                    </div>
                    <div class="a11y-group" data-group="font">
                        <strong>Шрифт</strong>
                        <div class="a11y-options">
                            ${button("Без засечек", { font: "sans", enabled: "true" }, settings.font === "sans")}
                            ${button("С засечками", { font: "serif", enabled: "true" }, settings.font === "serif")}
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(toolbar);

        toolbar.querySelector(".a11y-toggle").addEventListener("click", () => {
            toolbar.classList.add("is-open");
            toolbar.querySelector(".a11y-toggle").setAttribute("aria-expanded", "true");
            if (!settings.enabled) setSettings({ enabled: true });
        });

        toolbar.querySelector(".a11y-reset").addEventListener("click", () => {
            setSettings({ enabled: false });
            toolbar.classList.remove("is-open");
            toolbar.querySelector(".a11y-toggle").setAttribute("aria-expanded", "false");
        });

        toolbar.querySelector(".a11y-close").addEventListener("click", () => {
            toolbar.classList.remove("is-open");
            toolbar.querySelector(".a11y-toggle").setAttribute("aria-expanded", "false");
            toolbar.querySelector(".a11y-toggle").focus();
        });

        toolbar.addEventListener("click", (event) => {
            const target = event.target.closest(".a11y-option");
            if (!target) return;

            const patch = {};
            for (const key of ["enabled", "size", "theme", "spacing", "images", "font"]) {
                if (target.dataset[key] === undefined) continue;
                patch[key] = target.dataset[key] === "true" ? true : target.dataset[key] === "false" ? false : target.dataset[key];
            }

            setSettings(patch);
        });
    }

    function updateToolbarState() {
        const toolbar = document.querySelector(".a11y-toolbar");
        if (!toolbar) return;

        toolbar.classList.toggle("is-active-mode", settings.enabled);
        const toggleText = toolbar.querySelector("[data-a11y-toggle-text]");
        if (toggleText) {
            toggleText.textContent = settings.enabled ? "Настройки версии" : "Версия для слабовидящих";
        }

        toolbar.querySelectorAll(".a11y-option").forEach((control) => {
            let active = false;
            if (control.dataset.enabled !== undefined && Object.keys(control.dataset).length === 1) {
                active = String(settings.enabled) === control.dataset.enabled;
            }
            if (control.dataset.size) active = settings.size === control.dataset.size;
            if (control.dataset.theme) active = settings.theme === control.dataset.theme;
            if (control.dataset.spacing) active = settings.spacing === control.dataset.spacing;
            if (control.dataset.images) active = settings.images === control.dataset.images;
            if (control.dataset.font) active = settings.font === control.dataset.font;
            control.classList.toggle("is-active", active);
            control.setAttribute("aria-pressed", String(active));
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        renderToolbar();
        applySettings();
    });
})();
