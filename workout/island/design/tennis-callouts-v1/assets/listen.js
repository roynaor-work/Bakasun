"use strict";

(() => {
  const { events, formats, totalBytes, maxBytes } = window.tennisCallouts.audio;
  const media = document.querySelector("#sprite");
  const tracks = document.querySelector("#tracks");
  const format = document.querySelector("#format");
  const status = document.querySelector("#playback-status");
  const stop = document.querySelector("#stop");
  const buttons = new Map();
  let selected = null;

  const player = window.createTennisPlayer(media, ({ state, cue }) => {
    if (state === "loading" || state === "playing") {
      selected = buttons.get(cue.id);
      selected.button.setAttribute("aria-pressed", "true");
      stop.disabled = false;
      status.textContent = state === "loading" ? "טוען…" : selected.description;
      return;
    }
    if (selected) selected.button.setAttribute("aria-pressed", "false");
    selected = null;
    stop.disabled = true;
    status.textContent = state === "error" ? "הניגון נכשל. בחרו פורמט אחר." : "בחרו קטע להאזנה";
  });

  for (const [key, display] of [["ogg", "Ogg / Opus"], ["mp3", "MP3"]]) {
    const option = new Option(display, key);
    option.disabled = !player.supports(key);
    format.add(option);
  }
  format.value = player.preferredFormat();
  player.prepare(format.value);
  format.addEventListener("change", () => player.prepare(format.value));
  stop.addEventListener("click", () => player.stop());

  const descriptions = { out: "מחוץ לקו", net: "פגיעה ברשת", good: "כדור חוקי", fault: "הגשה פסולה" };
  for (const [kind, event] of Object.entries(events)) {
    const row = document.createElement("section");
    row.className = "listen-row";
    row.dataset.kind = kind;
    row.setAttribute("aria-labelledby", `heading-${kind}`);
    row.innerHTML = `
      <header>
        <span class="track-kind" dir="ltr">${event.display}</span>
        <h2 id="heading-${kind}">${event.label}</h2>
        <p>${descriptions[kind]}</p>
      </header>
      <div class="takes"></div>`;
    const takes = row.querySelector(".takes");

    function add(cue, label, isCrowd) {
      const button = document.createElement("button");
      const duration = document.createElement("small");
      const description = event.label + " · " + label;
      button.type = "button";
      button.dataset.clip = cue.id;
      button.className = isCrowd ? "take crowd" : "take";
      button.setAttribute("aria-label", description);
      button.setAttribute("aria-pressed", "false");
      duration.dir = "ltr";
      duration.textContent = `${cue.durationMs} ms`;
      button.append(label, duration);
      button.addEventListener("click", () => {
        if (selected?.button === button) player.stop();
        else player.play(cue, format.value);
      });
      takes.append(button);
      buttons.set(cue.id, { button, description });
    }

    for (const [index, cue] of event.takes.entries()) add(cue, `${index + 1} · ${cue.label}`, false);
    add(event.crowd, "קהל בלבד", true);
    tracks.append(row);
  }

  const bytes = new Intl.NumberFormat("he");
  document.querySelector("#budget").textContent =
    `Ogg ו־MP3 יחד · ${bytes.format(totalBytes)} מתוך ${bytes.format(maxBytes)} בתים`;
  format.title = Object.values(formats).map(item => bytes.format(item.bytes) + " B").join(" + ");
})();
