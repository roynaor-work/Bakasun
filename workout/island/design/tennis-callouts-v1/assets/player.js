"use strict";

window.createTennisPlayer = function createTennisPlayer(media, onState) {
  const { formats } = window.tennisCallouts.audio;
  let loadedFormat = null;
  let loadId = 0;
  let source = null;
  let objectUrl = null;
  let active = null;
  let frame = 0;

  function supports(format) {
    return Boolean(media.canPlayType(formats[format].mime));
  }

  function preferredFormat() {
    return supports("ogg") ? "ogg" : "mp3";
  }

  function finish(state) {
    if (!active) return;
    cancelAnimationFrame(frame);
    const { cue, format } = active;
    active = null;
    media.pause();
    onState({ state, cue, format });
  }

  function checkEnd() {
    if (!active) return;
    if (media.currentTime >= active.end || media.ended) {
      finish("ended");
    } else if (!media.paused) {
      frame = requestAnimationFrame(checkEnd);
    }
  }

  function prepare(format) {
    if (loadedFormat === format && !media.error) return;
    finish("stopped");
    loadedFormat = format;
    const id = ++loadId;
    source = null;
    if (objectUrl) {
      media.removeAttribute("src");
      media.load();
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    const { file } = formats[format];
    if (location.protocol === "file:") {
      source = file;
      return;
    }

    // Buffer the small local sprite once so seeks work even on HTTP servers without ranges.
    fetch(file, { mode: "same-origin" })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then(blob => {
        if (id !== loadId) return;
        objectUrl = source = URL.createObjectURL(blob);
        startWhenReady();
      })
      .catch(() => {
        if (id !== loadId) return;
        loadedFormat = null;
        finish("error");
      });
  }

  function startWhenReady() {
    const request = active;
    if (!request || request.started || !source) return;
    request.started = true;
    media.src = `${source}#t=${request.start.toFixed(3)},${request.end.toFixed(3)}`;
    media.currentTime = request.start;
    media.play().catch(() => {
      if (active === request) finish("error");
    });
  }

  media.addEventListener("playing", () => {
    if (!active?.started || media.paused) return;
    cancelAnimationFrame(frame);
    onState({ state: "playing", cue: active.cue, format: active.format });
    checkEnd();
  });

  media.addEventListener("timeupdate", () => {
    if (active?.started && media.currentTime >= active.end) finish("ended");
  });
  media.addEventListener("pause", () => {
    if (active?.started && media.paused && media.currentTime >= active.end - .02) finish("ended");
  });
  media.addEventListener("ended", () => finish("ended"));
  media.addEventListener("error", () => finish("error"));

  function play(cue, format = preferredFormat()) {
    finish("stopped");
    prepare(format);
    active = { cue, format, start: cue.startMs / 1000, end: cue.endMs / 1000, started: false };
    onState({ state: "loading", cue, format });
    startWhenReady();
  }

  return { prepare, play, stop: () => finish("stopped"), supports, preferredFormat };
};
