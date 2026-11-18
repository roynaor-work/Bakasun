"use strict";

(() => {
  const { audio: { events }, visuals } = window.tennisCallouts;
  const scene = document.querySelector(".scene");
  const status = document.querySelector("#court-status");
  const sound = document.querySelector("#sound");
  const soundStatus = document.querySelector("#sound-status");
  const ball = document.querySelector("#ball");
  const shadow = document.querySelector("#ball-shadow");
  const trace = document.querySelector("#trace");
  const mark = document.querySelector("#mark");
  const flash = document.querySelector("#flash");
  const sign = document.querySelector("#call-sign");
  const signImage = sign.querySelector("img");
  const signText = sign.querySelector("span");
  const buttons = document.querySelectorAll(".scenarios button");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const nextTake = { out: 0, net: 0, good: 0, fault: 0 };
  const player = window.createTennisPlayer(document.querySelector("#sprite"), ({ state }) => {
    if (state === "error") {
      soundStatus.textContent = "הצליל לא נטען. אפשר לנסות בדף ההאזנה.";
      soundStatus.hidden = false;
    }
  });
  player.prepare(player.preferredFormat());

  const origin = { x: 214, ground: 345, height: 29 };
  // Each leg is [milliseconds, destination X, destination ground Y, end height, arc height].
  // The first leg ends at the call, including at net height for NET.
  const scenarios = {
    out: {
      landed: "מחוץ למגרש · הכדור ממשיך לקפוץ", settled: "מחוץ למגרש · הכדור נעצר אחרי הגלגול",
      legs: [[630, 445, 187, 0, 69], [300, 483, 176, 0, 20], [170, 501, 171, 0, 6], [420, 520, 166, 0, 0]],
    },
    net: {
      landed: "פגיעה ברשת · הכדור נופל בצד המגיש", settled: "פגיעה ברשת · הכדור התגלגל לצד המגיש",
      legs: [[417, 314, 229, 13, 22], [178, 322, 242, 0, 0], [144, 330, 251, 0, 5], [430, 346, 260, 0, 0]],
    },
    good: {
      landed: "הכדור נגע בקו · בפנים", settled: "נגיעה בקו · ההגשה טובה",
      legs: [[593, 263, 198, 0, 61], [326, 279, 179, 0, 24], [190, 291, 168, 0, 8], [340, 301, 159, 0, 0]],
    },
    fault: {
      landed: "מחוץ לריבוע ההגשה · הכדור ממשיך", settled: "מחוץ לריבוע · הכדור נעצר אחרי הגלגול",
      legs: [[604, 235, 184, 0, 69], [282, 240, 172, 0, 18], [143, 242, 164, 0, 5], [355, 245, 155, 0, 0]],
    },
  };
  const scenes = Object.fromEntries(Object.entries(scenarios).map(([kind, scenario]) => {
    let time = 0;
    let from = origin;
    const legs = scenario.legs.map(([duration, x, ground, height, arc], index) => {
      const to = { x, ground, height };
      const leg = { from, to, duration, arc, start: time, roll: index === scenario.legs.length - 1 };
      from = to;
      time += duration;
      return leg;
    });
    return [kind, { ...scenario, legs, impact: legs[0].duration, duration: time }];
  }));

  let animation = 0;
  let signKind = null;

  function sample(scenario, time) {
    const leg = scenario.legs.find(candidate => time < candidate.start + candidate.duration)
      ?? scenario.legs.at(-1);
    const fraction = Math.min(1, (time - leg.start) / leg.duration);
    const distance = leg.roll ? 1 - (1 - fraction) ** 2 : fraction;
    const x = leg.from.x + (leg.to.x - leg.from.x) * distance;
    const ground = leg.from.ground + (leg.to.ground - leg.from.ground) * distance;
    const height = leg.from.height + (leg.to.height - leg.from.height) * fraction
      + 4 * leg.arc * fraction * (1 - fraction);
    return { x, ground, height };
  }

  function paintBall({ x, ground, height }) {
    const depth = Math.max(0, (ground - 155) / 190);
    ball.setAttribute("transform", `translate(${x} ${ground - height}) scale(${.67 + .33 * depth})`);
    shadow.setAttribute("cx", x);
    shadow.setAttribute("cy", ground + 1);
    shadow.setAttribute("opacity", Math.max(.12, .39 - height * .0035));
  }

  function paintTrace(scenario, elapsed) {
    const steps = Math.ceil(elapsed / 32);
    const points = [];
    for (let index = 0; index <= steps; index++) {
      const state = sample(scenario, elapsed * index / Math.max(steps, 1));
      points.push(`${state.x.toFixed(1)} ${(state.ground - state.height).toFixed(1)}`);
    }
    trace.setAttribute("d", "M" + points.join("L"));
  }

  function showSign(kind, enter = false) {
    signKind = kind;
    sign.hidden = kind !== "out" && kind !== "net";
    if (sign.hidden) return;
    const style = document.querySelector('input[name="style"]:checked').value;
    const design = visuals.styles[style];
    sign.dataset.style = style;
    signImage.src = design.signs[kind].svg.file;
    signText.textContent = events[kind].display;
    sign.style.setProperty("--text-x", design.textAnchor[0] * 100 + "%");
    sign.style.setProperty("--text-y", design.textAnchor[1] * 100 + "%");
    sign.style.setProperty("--sign-ink", design.labelColors[kind]);
    sign.classList.toggle("entering", enter);
  }

  function showImpact(kind, scenario) {
    const { x, ground, height } = scenario.legs[0].to;
    mark.setAttribute("transform", `translate(${x} ${ground - height})`);
    mark.removeAttribute("hidden");
    if (kind === "good") {
      const [anchorX, anchorY] = visuals.lineFlash.center;
      const size = Number(flash.getAttribute("width"));
      flash.setAttribute("x", x - size * anchorX);
      flash.setAttribute("y", ground - size * anchorY);
      flash.removeAttribute("hidden");
    }
    showSign(kind, true);
  }

  function serve(kind) {
    const scenario = scenes[kind];
    cancelAnimationFrame(animation);
    player.stop();
    soundStatus.hidden = true;
    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(button.dataset.kind === kind));
    }
    scene.dataset.kind = kind;
    scene.dataset.phase = "flight";
    paintBall(origin);
    trace.removeAttribute("d");
    mark.setAttribute("hidden", "");
    flash.setAttribute("hidden", "");
    showSign(null);
    status.textContent = "הכדור באוויר";
    const beginning = performance.now();
    const reduced = reducedMotion.matches;
    const impactTime = reduced ? 120 : scenario.impact;
    const finishTime = reduced ? 460 : scenario.duration;
    let called = false;

    function update(now) {
      const elapsed = Math.min(now - beginning, finishTime);
      const position = reduced
        ? (elapsed < impactTime ? 0 : scenario.duration)
        : elapsed;
      paintBall(sample(scenario, position));
      paintTrace(scenario, position);

      if (!called && elapsed >= impactTime) {
        called = true;
        scene.dataset.phase = "impact";
        status.textContent = scenario.landed;
        showImpact(kind, scenario);
        if (sound.checked) {
          const { takes } = events[kind];
          player.play(takes[nextTake[kind]]);
          nextTake[kind] = (nextTake[kind] + 1) % takes.length;
        }
      }
      if (kind === "good" && called) {
        const age = elapsed - impactTime;
        const opacity = reduced ? .60 : Math.max(0, 1 - age / visuals.lineFlash.durationMs);
        flash.setAttribute("opacity", opacity);
        if (age >= visuals.lineFlash.durationMs) flash.setAttribute("hidden", "");
      }

      if (elapsed < finishTime) {
        animation = requestAnimationFrame(update);
      } else {
        scene.dataset.phase = "settled";
        status.textContent = scenario.settled;
      }
    }
    animation = requestAnimationFrame(update);
  }

  for (const button of buttons) {
    button.addEventListener("click", () => serve(button.dataset.kind));
  }
  document.querySelector(".style-picker").addEventListener("change", () => showSign(signKind));
  sound.addEventListener("change", () => {
    if (!sound.checked) player.stop();
    soundStatus.hidden = true;
  });

  // An initial still shows where an OUT call is placed before any audio plays.
  scene.dataset.kind = "out";
  paintBall(sample(scenes.out, scenes.out.duration));
  paintTrace(scenes.out, scenes.out.duration);
  const { x, ground } = scenes.out.legs[0].to;
  mark.setAttribute("transform", `translate(${x} ${ground})`);
  mark.removeAttribute("hidden");
  showSign("out");
})();
