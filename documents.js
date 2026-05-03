(function () {
    "use strict";

    const requisitesPdfName = "Реквизиты Мед Центр ЯЖизнь сайт (1).pdf";
    const licensePdfName = "ООО_ВС _ выпиская по лицензии (1).pdf";
    const requisitesPdfUrl = encodeURI(requisitesPdfName);
    const licensePdfUrl = encodeURI(licensePdfName);

    const requisites = [
        { label: "Полное наименование", value: "ООО «ВОССТАНОВЛЕНИЕ»" },
        { label: "Сокращённое наименование", value: "ООО «ВС»" },
        { label: "ИНН", value: "9722108070" },
        { label: "КПП", value: "772201001" },
        { label: "ОГРН", value: "1257700475603" },
        { label: "ОКПО", value: "85795171" },
        { label: "Расчётный счёт", value: "40702810038720025499" },
        { label: "Банк", value: "ПАО Сбербанк" },
        { label: "Корреспондентский счёт", value: "30101810400000000225" },
        { label: "БИК банка", value: "044525225" },
        { label: "ИНН банка", value: "7707083893" },
        { label: "КПП банка", value: "773643001" },
        { label: "Директор", value: "Арман Маргарита Римовна" },
        { label: "Email", value: "Yajizn@yandex.ru" },
        { label: "Телефон", value: "+7 903 792 80 03" },
        { label: "Городской телефон", value: "+7 495 792 80 03" },
        { label: "Адрес клиники", value: "Москва, Мичуринский проспект, 25к2" },
        { label: "ЭДО Контур.Диадок", value: "2BM-9722108070-772201001-202511261129245784388" }
    ];

    let requisitesModal;
    let licenseModal;
    let activeOverlay = null;
    let lastFocus = null;

    function ready(callback) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, { once: true });
            return;
        }

        callback();
    }

    function createElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function createModal(id, title, description) {
        const overlay = createElement("div", "doc-modal-overlay");
        overlay.id = id;
        overlay.setAttribute("aria-hidden", "true");

        const panel = createElement("div", "doc-modal");
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-modal", "true");
        panel.setAttribute("aria-labelledby", `${id}-title`);

        const header = createElement("div", "doc-modal__header");
        const titleWrap = createElement("div");
        const heading = createElement("h2", "", title);
        heading.id = `${id}-title`;
        const lead = createElement("p", "", description);
        const closeButton = createElement("button", "doc-modal__close", "×");
        closeButton.type = "button";
        closeButton.setAttribute("aria-label", "Закрыть окно");
        closeButton.addEventListener("click", () => closeDocModal());

        const body = createElement("div", "doc-modal__body");

        titleWrap.append(heading, lead);
        header.append(titleWrap, closeButton);
        panel.append(header, body);
        overlay.append(panel);
        document.body.append(overlay);

        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) closeDocModal();
        });

        return { overlay, panel, body, closeButton };
    }

    function buildRequisitesModal() {
        const modal = createModal(
            "requisites-modal",
            "Реквизиты клиники",
            "Выберите нужный пункт и скопируйте значение одним нажатием."
        );

        const grid = createElement("div", "doc-requisites");

        requisites.forEach((item) => {
            const card = createElement("div", "doc-requisite");
            const label = createElement("span", "", item.label);
            const value = createElement("strong", "", item.value);
            const copyButton = createElement("button", "doc-copy", "Скопировать");
            copyButton.type = "button";
            copyButton.addEventListener("click", () => copyText(item.value, copyButton));
            card.append(label, value, copyButton);
            grid.append(card);
        });

        const actions = createElement("div", "doc-actions");
        const copyAllButton = createElement("button", "", "Скопировать все реквизиты");
        copyAllButton.type = "button";
        copyAllButton.addEventListener("click", () => {
            const allText = requisites.map((item) => `${item.label}: ${item.value}`).join("\n");
            copyText(allText, copyAllButton);
        });

        const openPdf = createElement("a", "", "Открыть PDF");
        openPdf.href = requisitesPdfUrl;
        openPdf.target = "_blank";
        openPdf.rel = "noopener";

        actions.append(copyAllButton, openPdf);
        modal.body.append(grid, actions);

        return modal;
    }

    function buildLicenseModal() {
        const modal = createModal(
            "license-modal",
            "Лицензия клиники",
            "Документ открывается в исходном виде."
        );

        const frame = createElement("iframe", "doc-pdf-frame");
        frame.src = licensePdfUrl;
        frame.title = "Выписка по лицензии ООО ВС";

        const actions = createElement("div", "doc-actions");
        const openPdf = createElement("a", "", "Открыть в новой вкладке");
        openPdf.href = licensePdfUrl;
        openPdf.target = "_blank";
        openPdf.rel = "noopener";
        actions.append(openPdf);

        modal.body.append(frame, actions);
        return modal;
    }

    async function copyText(text, trigger) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                fallbackCopy(text);
            }

            showCopyState(trigger, "Скопировано");
        } catch (error) {
            try {
                fallbackCopy(text);
                showCopyState(trigger, "Скопировано");
            } catch (_fallbackError) {
                showCopyState(trigger, "Не скопировано");
            }
        }
    }

    function fallbackCopy(text) {
        const field = document.createElement("textarea");
        field.value = text;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.left = "-9999px";
        document.body.append(field);
        field.select();
        document.execCommand("copy");
        field.remove();
    }

    function showCopyState(trigger, text) {
        if (!trigger) return;
        const previous = trigger.textContent;
        trigger.textContent = text;
        window.setTimeout(() => {
            trigger.textContent = previous;
        }, 1600);
    }

    function openDocModal(modal) {
        if (!modal) return;
        if (activeOverlay && activeOverlay !== modal.overlay) closeDocModal(false);

        lastFocus = document.activeElement;
        activeOverlay = modal.overlay;
        modal.overlay.classList.add("is-open");
        modal.overlay.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");
        window.requestAnimationFrame(() => modal.closeButton.focus());
    }

    function closeDocModal(restoreFocus = true) {
        if (!activeOverlay) return;

        activeOverlay.classList.remove("is-open");
        activeOverlay.setAttribute("aria-hidden", "true");
        activeOverlay = null;

        if (!document.querySelector(".modal-overlay.is-open, .doc-modal-overlay.is-open")) {
            document.body.classList.remove("modal-open");
        }

        if (restoreFocus && lastFocus && typeof lastFocus.focus === "function") {
            lastFocus.focus();
        }
    }

    function getFocusableElements(container) {
        return Array.from(container.querySelectorAll(
            "a[href], button:not([disabled]), iframe, input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])"
        )).filter((element) => element.offsetParent !== null || element.tagName === "IFRAME");
    }

    function handleModalKeydown(event) {
        if (!activeOverlay) return;

        if (event.key === "Escape") {
            event.preventDefault();
            closeDocModal();
            return;
        }

        if (event.key !== "Tab") return;

        const focusable = getFocusableElements(activeOverlay);
        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function activateOnKeyboard(event, callback) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        callback();
    }

    function addFooterRequisitesLinks() {
        document.querySelectorAll(".footer h3").forEach((heading) => {
            if (heading.textContent.trim().toLowerCase() !== "информация") return;

            const group = heading.parentElement;
            if (!group || group.querySelector("[data-open-requisites]")) return;

            const trigger = createElement("button", "doc-trigger", "Реквизиты");
            trigger.type = "button";
            trigger.dataset.openRequisites = "true";
            trigger.addEventListener("click", () => openDocModal(requisitesModal));

            const routeLink = Array.from(group.querySelectorAll("a")).find((link) => /схема проезда/i.test(link.textContent));
            if (routeLink) {
                group.insertBefore(trigger, routeLink);
            } else {
                group.append(trigger);
            }
        });
    }

    function makeLicenseTextClickable() {
        document.querySelectorAll("p, span, small").forEach((element) => {
            const text = element.textContent.replace(/\s+/g, " ").trim();
            if (!/^Лицензия\s*№/i.test(text)) return;
            if (element.closest(".doc-modal")) return;
            if (element.dataset.licenseReady === "true") return;

            element.dataset.licenseReady = "true";
            element.classList.add("doc-license-trigger");
            element.setAttribute("role", "button");
            element.setAttribute("tabindex", "0");
            element.setAttribute("aria-label", "Открыть выписку по лицензии");
            element.addEventListener("click", () => openDocModal(licenseModal));
            element.addEventListener("keydown", (event) => activateOnKeyboard(event, () => openDocModal(licenseModal)));
        });
    }

    ready(() => {
        requisitesModal = buildRequisitesModal();
        licenseModal = buildLicenseModal();
        addFooterRequisitesLinks();
        makeLicenseTextClickable();
        document.addEventListener("keydown", handleModalKeydown);
    });
})();
