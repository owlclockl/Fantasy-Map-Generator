// About tab: credits, links and the supporters list
// Enhanced with modern UI and i18n (Russian)
import { alertDialog } from "@/components/dialog/dialog-helpers";
import { i18n } from "@/services/i18n";
import { ensureEl } from "@/utils/nodeUtils";

function buildAboutTemplate(): string {
  const lang = i18n.getLanguage();
  const isRu = lang === "ru";

  const intro = isRu
    ? `
  <div class="aboutActions" style="display:flex; gap:8px; margin-bottom:16px">
    <button
      id="startTourButton"
      onclick="window.Services.UiTour.start()"
      data-tip="Пройдите интерактивный тур по генератору"
      style="flex:1; background:linear-gradient(135deg, #6366f1, #8b5cf6); color:white; border:none; border-radius:10px; padding:10px; font-weight:600"
    >
      🎯 Интерактивный тур
    </button>
    <button
      id="getAppButton"
      onclick="window.Services.AppOffer.open()"
      data-tip="Установите генератор на компьютер"
      style="flex:1; background:white; border:1.5px solid #e5e7eb; border-radius:10px; padding:10px; font-weight:600"
    >
      💻 Десктоп приложение
    </button>
  </div>
  <div style="background:linear-gradient(135deg, #f3f4f6, #e5e7eb); border-radius:12px; padding:16px; margin-bottom:16px">
    <h3 style="margin:0 0 8px 0; font-family:var(--font-display, sans-serif); font-weight:700; color:#111827">🗺️ Генератор фэнтези-карт</h3>
    <p style="margin:0; font-size:0.9em; line-height:1.5; color:#374151">
      <a href="https://github.com/Azgaar/Fantasy-Map-Generator" target="_blank" style="color:#6366f1; font-weight:600">Fantasy Map Generator</a> — это
      <a href="https://github.com/Azgaar/Fantasy-Map-Generator/blob/master/LICENSE" target="_blank" style="color:#6366f1">open source</a>
      инструмент от Azgaar и команды. Вы можете использовать карты как есть, редактировать их или даже создавать новые с нуля.
    </p>
  </div>
  `
    : `
  <div class="aboutActions" style="display:flex; gap:8px; margin-bottom:16px">
    <button
      id="startTourButton"
      onclick="window.Services.UiTour.start()"
      data-tip="Take an interactive tour of the map generator"
      style="flex:1; background:linear-gradient(135deg, #6366f1, #8b5cf6); color:white; border:none; border-radius:10px; padding:10px; font-weight:600"
    >
      🎯 Interactive Tour
    </button>
    <button
      id="getAppButton"
      onclick="window.Services.AppOffer.open()"
      data-tip="Install the Generator on your computer"
      style="flex:1; background:white; border:1.5px solid #e5e7eb; border-radius:10px; padding:10px; font-weight:600"
    >
      💻 Desktop App
    </button>
  </div>
  <div style="background:linear-gradient(135deg, #f3f4f6, #e5e7eb); border-radius:12px; padding:16px; margin-bottom:16px">
    <h3 style="margin:0 0 8px 0; font-family:var(--font-display, sans-serif); font-weight:700; color:#111827">🗺️ Fantasy Map Generator</h3>
    <p style="margin:0; font-size:0.9em; line-height:1.5; color:#374151">
      <a href="https://github.com/Azgaar/Fantasy-Map-Generator" target="_blank" style="color:#6366f1; font-weight:600">Fantasy Map Generator</a> is an
      <a href="https://github.com/Azgaar/Fantasy-Map-Generator/blob/master/LICENSE" target="_blank" style="color:#6366f1">open source</a>
      tool by Azgaar and Team. You may use maps as they are, edit them or even create a new map from scratch.
    </p>
  </div>
  `;

  const improvements = `
  <div style="background:linear-gradient(135deg, #667eea, #764ba2); border-radius:12px; padding:12px; margin:16px 0; text-align:center">
    <div style="color:white; font-weight:600; margin-bottom:8px">${isRu ? "⚡ Улучшения в этой версии:" : "⚡ Enhancements in this version:"}</div>
    <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap; font-size:0.8em">
      <span style="background:rgba(255,255,255,0.2); padding:4px 8px; border-radius:20px; color:white">🎨 Modern UI</span>
      <span style="background:rgba(255,255,255,0.2); padding:4px 8px; border-radius:20px; color:white">🇷🇺 ${isRu ? "Русский язык" : "Russian Language"}</span>
      <span style="background:rgba(255,255,255,0.2); padding:4px 8px; border-radius:20px; color:white">⚡ ${isRu ? "Многопоточность" : "Multithreading"}</span>
    </div>
  </div>
  `;

  const links = isRu
    ? `
  <p style="font-size:0.9em; line-height:1.5">
    Присоединяйтесь к нашему <a href="https://discordapp.com/invite/X7E84HU" target="_blank" style="color:#6366f1; font-weight:600">Discord серверу</a> и
    <a href="https://www.reddit.com/r/FantasyMapGenerator/" target="_blank" style="color:#6366f1; font-weight:600">сообществу Reddit</a>, чтобы задавать вопросы, получать помощь и делиться картами.
    Созданные карты можно использовать бесплатно, даже в коммерческих целях.
  </p>
  <p style="font-size:0.9em; line-height:1.5">
    Проект активно развивается. Создатель и главный разработчик: Azgaar. Чтобы отслеживать прогресс, смотрите
    <a href="https://trello.com/b/7x832DG4/fantasy-map-generator" target="_blank" style="color:#6366f1">доску разработки</a>. Для старых версий смотрите
    <a href="https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Changelog" target="_blank" style="color:#6366f1">список изменений</a>.
    Сообщайте о багах <a href="https://github.com/Azgaar/Fantasy-Map-Generator/issues" target="_blank" style="color:#6366f1">здесь</a>.
    Вы также можете связаться напрямую по <a href="mailto:azgaar.fmg@yandex.by" target="_blank" style="color:#6366f1">email</a>.
  </p>
  `
    : `
  <p style="font-size:0.9em; line-height:1.5">
    Join our <a href="https://discordapp.com/invite/X7E84HU" target="_blank" style="color:#6366f1; font-weight:600">Discord server</a> and
    <a href="https://www.reddit.com/r/FantasyMapGenerator/" target="_blank" style="color:#6366f1; font-weight:600">Reddit community</a> to ask
    questions, get help and share maps. The created maps can be used for free, even for commercial purposes.
  </p>
  <p style="font-size:0.9em; line-height:1.5">
    The project is under active development. Creator and main maintainer: Azgaar. To track the development
    progress see the
    <a href="https://trello.com/b/7x832DG4/fantasy-map-generator" target="_blank" style="color:#6366f1">devboard</a>. For older
    versions see the
    <a href="https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Changelog" target="_blank" style="color:#6366f1">changelog</a>.
    Please report bugs
    <a href="https://github.com/Azgaar/Fantasy-Map-Generator/issues" target="_blank" style="color:#6366f1">here</a>. You can also
    contact me directly via <a href="mailto:azgaar.fmg@yandex.by" target="_blank" style="color:#6366f1">email</a>.
  </p>
  `;

  return intro + links + improvements;
}

function getStaticAboutContent(): string {
  return /* html */ `
  <div
    style="
      background-color: #e85b46;
      padding: 0.4em;
      width: max-content;
      margin: 0.6em auto 0 auto;
      border: 1px solid #943838;
      border-radius:10px;
    "
  >
    <a
      href="https://www.patreon.com/azgaar"
      target="_blank"
      style="color: white; text-decoration: none; font-family: sans-serif"
    >
      <div>
        <div style="width: 0.8em; display: inline-block; padding: 0 0.2em; fill: white">
          <svg viewBox="0 0 569 546">
            <circle cx="362.589996" cy="204.589996" data-fill="1" id="Oval" r="204.589996" />
            <rect data-fill="2" height="545.799988" id="Rectangle" width="100" x="0" y="0" />
          </svg>
        </div>
        SUPPORT ON PATREON
      </div>
    </a>
  </div>
  <p style="font-size:0.9em">
    Special thanks to
    <a data-tip="Click to see list of supporters" onclick="showSupporters()" style="color:#6366f1; font-weight:600">all supporters</a> on Patreon!
  </p>
  <div style="display: flex; justify-content: center; padding: 0.4em; font-family: cursive">
    <a href="https://u24.gov.ua/" style="width: 80%" data-tip="Support Ukraine" target="_blank">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200">
        <rect width="100%" height="100%" fill="#005bbb"></rect>
        <rect y="50%" width="100%" height="50%" fill="#ffd500"></rect>
        <text x="50%" text-anchor="middle" font-size="6em" y="32%" fill="#f5f5f5">Support Ukraine</text>
        <text x="50%" text-anchor="middle" font-size="4em" y="78%" fill="#005bdd">u24.gov.ua</text>
      </svg>
    </a>
  </div>
  <div style="text-align: left">
    <p>Check out our other projects:</p>
    <div>• <a href="https://azgaar.github.io/Armoria" target="_blank" style="color:#6366f1">Armoria</a>: a tool for creating coats of arms</div>
    <div>• <a href="https://deorum.vercel.app" target="_blank" style="color:#6366f1">Deorum</a>: gallery of fantasy characters</div>
  </div>
  <div style="text-align: left; margin-top: 0.5em">
    Chinese localization: <a href="https://www.8desk.top" target="_blank" style="color:#6366f1">8desk.top</a>
  </div>
  <ul class="share-buttons">
    <li>
      <a
        href="https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fazgaar.github.io%2FFantasy-Map-Generator%2F&quote="
        data-tip="Share on Facebook"
        target="_blank"
        ><img alt="Share on Facebook" src="images/Facebook.png" loading="lazy"
      /></a>
    </li>
    <li>
      <a
        href="https://twitter.com/intent/tweet?source=https%3A%2F%2Fazgaar.github.io%2FFantasy-Map-Generator&text=%23FantasyMapGenerator%0A%0Ahttps%3A//azgaar.github.io/Fantasy-Map-Generator"
        target="_blank"
        data-tip="Tweet"
        ><img alt="Tweet" src="images/Twitter.png" loading="lazy"
      /></a>
    </li>
    <li>
      <a
        href="http://pinterest.com/pin/create/button/?url=https%3A%2F%2Fazgaar.github.io%2FFantasy-Map-Generator"
        target="_blank"
        data-tip="Pin it"
        ><img alt="Pin it" src="images/Pinterest.png" loading="lazy"
      /></a>
    </li>
    <li>
      <a
        href="http://www.reddit.com/submit?url=https%3A%2F%2Fazgaar.github.io%2FFantasy-Map-Generator"
        target="_blank"
        data-tip="Submit to Reddit"
        ><img alt="Submit to Reddit" src="images/Reddit.png" loading="lazy"
      /></a>
    </li>
    <li>
      <a href="https://discord.gg/X7E84HU" target="_blank" data-tip="Join Discord server"
        ><img alt="Join Discord server" src="images/Discord.png" loading="lazy"
      /></a>
    </li>
  </ul>
`;
}

const TEMPLATE = buildAboutTemplate() + getStaticAboutContent();

ensureEl("aboutContent").innerHTML = TEMPLATE;

if (typeof window !== "undefined") {
  window.addEventListener("language:changed", () => {
    const container = document.getElementById("aboutContent");
    if (container) {
      const scrollPos = container.scrollTop;
      container.innerHTML = buildAboutTemplate() + getStaticAboutContent();
      container.scrollTop = scrollPos;
    }
  });
}

/** The list of Patreon supporters, updated by hand with each release */
function showSupporters(): void {
  const columns = window.innerWidth < 800 ? 2 : 5;
  const names = window.Supporters.split("\n").sort();
  alertDialog({
    title: "Patreon Supporters",
    width: "min-width",
    message: /* html */ `<ul style="column-count: ${columns}; column-gap: 2em">${names
      .map(name => `<li>${name}</li>`)
      .join("")}</ul>`
  });
}

// Legacy seam: the credits block wires the dialog with an inline onclick
declare global {
  interface Window {
    showSupporters: typeof showSupporters;
  }
}
window.showSupporters = showSupporters;
