
(function () {
    const scriptSrc = document.currentScript?.src || "";
    const baseUrl = scriptSrc.substring(0, scriptSrc.lastIndexOf("/") + 1);
    const gifUrl = baseUrl + "img/loader.gif";
    const gifSize = 120;
    const title = "three-player-controller";
    const fade = 600;

    /* Google Fonts */
    if (!document.querySelector('link[href*="Cinzel"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@900&display=swap";
        document.head.appendChild(link);
    }

    const style = document.createElement("style");
    style.id = "__loader-style__";
    style.textContent = `
        html { height: 100%; }

        #__loading-overlay__ {
            position: fixed;
            inset: 0;
            z-index: 99999;
            background: #ececec;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: opacity ${fade}ms cubic-bezier(0.4,0,0.2,1);
        }
        #__loading-overlay__.fade-out {
            opacity: 0;
            pointer-events: none;
        }
        .__ldr-content__ {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
            user-select: none;
        }
        .__ldr-gif__ {
            width: ${gifSize}px;
            height: ${gifSize}px;
            object-fit: contain;
            display: block;
        }
        .__ldr-title__ {
            font-family: "Cinzel", serif;
            font-size: clamp(1.4rem, 3.5vw, 2.2rem);
            font-weight: 900;
            letter-spacing: 0.06em;
            white-space: nowrap;
            color: #1a1a2e;
            text-align: center;
        }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "__loading-overlay__";
    overlay.innerHTML = `
    <div class="__ldr-content__">
        <img class="__ldr-gif__" src="${gifUrl}" alt="loading" />
        <div class="__ldr-title__">${title}</div>
    </div>`;

    document.documentElement.appendChild(overlay);

    /* Public API */
    window.hideLoader = function () {
        const el = document.getElementById("__loading-overlay__");
        if (!el) return;
        el.classList.add("fade-out");
        el.addEventListener("transitionend", () => {
            el.remove();
            document.getElementById("__loader-style__")?.remove();
        }, { once: true });
    };
})();