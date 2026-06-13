const CIRCLES_PER_LEVEL = 30;
const START_SIZE = 12;
const MAX_SIZE = 118;
const WARNING_SIZE = MAX_SIZE * 0.8;
const PROGRESS_KEY = "circleClickHighestUnlockedLevel";
const HIGH_SCORE_KEY = "circleClickHighScore";
const COMBO_WINDOW = 1100;
const CIRCLE_TYPES = {
  blue: {
    label: "Standard",
    points: 100,
    growthMultiplier: 1,
    movementSpeed: 18,
    motionType: "sometimesStraight",
  },
  red: {
    label: "Bombe",
    points: 160,
    growthMultiplier: 1.45,
    movementSpeed: 10,
    motionType: "rarelyStraight",
  },
  purple: {
    label: "Taenzer",
    points: 180,
    growthMultiplier: 0.68,
    movementSpeed: 68,
    motionType: "sine",
  },
  green: {
    label: "Wanderer",
    points: 130,
    growthMultiplier: 1,
    movementSpeed: 32,
    motionType: "crossField",
  },
  yellow: {
    label: "Fliege",
    points: 220,
    growthMultiplier: 0.5,
    movementSpeed: 86,
    motionType: "straight",
  },
  master: {
    label: "Master",
    points: 400,
    growthMultiplier: 0.42,
    movementSpeed: 172,
    motionType: "master",
  },
};

const playfield = document.querySelector("#playfield");
const overlay = document.querySelector("#overlay");
const message = document.querySelector("#message");
const levelPicker = document.querySelector("#levelPicker");
const startLevelSelect = document.querySelector("#startLevel");
const startButton = document.querySelector("#startButton");
const restartButton = document.querySelector("#restartButton");
const levelDisplay = document.querySelector("#level");
const clickedDisplay = document.querySelector("#clicked");
const remainingDisplay = document.querySelector("#remaining");
const scoreDisplay = document.querySelector("#score");
const highScoreDisplay = document.querySelector("#highScore");

let level = 1;
let clicked = 0;
let score = 0;
let highScore = loadHighScore();
let combo = 0;
let highestCombo = 0;
let lastHitTime = 0;
let circles = [];
let running = false;
let spawnTimer = null;
let animationFrame = null;
let previousTime = 0;
let highestUnlockedLevel = loadHighestUnlockedLevel();
let audioContext = null;

function getDifficulty() {
  return {
    spawnDelay: Math.max(530, 620 - (level - 1) * 6),
    growthRate: Math.min(24.8, 24 + (level - 1) * 0.05),
    movementMultiplier: Math.min(1.15, 1 + (level - 1) * 0.015),
  };
}

function getTypeWeights() {
  const progress = Math.min((level - 1) / 9, 1);
  const middleLevel = Math.min(Math.max((level - 2) / 4, 0), 1);
  const lateLevel = Math.min(Math.max((level - 4) / 6, 0), 1);
  const masterLevel = Math.min(Math.max((level - 8) / 6, 0), 1);

  return {
    blue: 0.78 - progress * 0.6,
    red: 0.08 + middleLevel * 0.14,
    green: 0.14 + middleLevel * 0.1 - lateLevel * 0.06,
    purple: lateLevel * 0.25,
    yellow: lateLevel * 0.23,
    master: masterLevel * 0.04,
  };
}

function updateDisplay() {
  levelDisplay.textContent = level;
  clickedDisplay.textContent = clicked;
  remainingDisplay.textContent = CIRCLES_PER_LEVEL - clicked;
  scoreDisplay.textContent = score;
  highScoreDisplay.textContent = highScore;
}

function loadHighestUnlockedLevel() {
  const savedLevel = Number.parseInt(localStorage.getItem(PROGRESS_KEY), 10);
  return Number.isInteger(savedLevel) && savedLevel > 0 ? savedLevel : 1;
}

function saveHighestUnlockedLevel() {
  localStorage.setItem(PROGRESS_KEY, String(highestUnlockedLevel));
}

function loadHighScore() {
  const savedScore = Number.parseInt(localStorage.getItem(HIGH_SCORE_KEY), 10);
  return Number.isInteger(savedScore) && savedScore > 0 ? savedScore : 0;
}

function saveHighScore() {
  localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
}

function updateLevelPicker(selectedLevel = highestUnlockedLevel) {
  startLevelSelect.replaceChildren();

  for (let availableLevel = 1; availableLevel <= highestUnlockedLevel; availableLevel += 1) {
    const option = document.createElement("option");
    option.value = availableLevel;
    option.textContent = `Level ${availableLevel}`;
    startLevelSelect.append(option);
  }

  startLevelSelect.value = String(Math.min(selectedLevel, highestUnlockedLevel));
}

function clearCircles() {
  circles.forEach((circle) => circle.element.remove());
  circles = [];
}

function stopGameLoop() {
  running = false;
  window.clearTimeout(spawnTimer);
  window.cancelAnimationFrame(animationFrame);
  spawnTimer = null;
  animationFrame = null;
}

function resetGame(startLevel = 1) {
  stopGameLoop();
  clearCircles();
  level = startLevel;
  clicked = 0;
  score = 0;
  combo = 0;
  highestCombo = 0;
  lastHitTime = 0;
  previousTime = 0;
  updateDisplay();
}

function startGame() {
  const selectedLevel = Number.parseInt(startLevelSelect.value, 10) || 1;
  resetGame(Math.min(selectedLevel, highestUnlockedLevel));
  overlay.classList.add("is-hidden");
  levelPicker.classList.add("is-hidden");
  startButton.classList.add("is-hidden");
  restartButton.classList.add("is-hidden");
  running = true;
  scheduleNextCircle(250);
  animationFrame = window.requestAnimationFrame(updateCircles);
}

function scheduleNextCircle(delay = getDifficulty().spawnDelay) {
  window.clearTimeout(spawnTimer);
  spawnTimer = window.setTimeout(() => {
    if (!running) {
      return;
    }

    createCircle();
    scheduleNextCircle();
  }, delay);
}

function createCircle(forcedTypeName) {
  const bounds = playfield.getBoundingClientRect();
  const safeMargin = MAX_SIZE / 2 + 4;
  const x = randomBetween(safeMargin, bounds.width - safeMargin);
  const y = randomBetween(safeMargin, bounds.height - safeMargin);
  const difficulty = getDifficulty();
  const typeName = forcedTypeName || chooseCircleType();
  const type = CIRCLE_TYPES[typeName];
  const motionType = chooseTypeMotion(type.motionType);
  const angle = getMovementAngle(motionType);
  const movementSpeed = type.movementSpeed * difficulty.movementMultiplier;
  const moves = motionType !== "still";
  const element = document.createElement("button");

  element.type = "button";
  element.className = `circle circle--${typeName}`;
  element.setAttribute("aria-label", `${type.label}-Kreis entfernen`);

  const circle = {
    element,
    typeName,
    x,
    y,
    size: START_SIZE,
    growthRate: difficulty.growthRate * type.growthMultiplier,
    motionType,
    motionTime: 0,
    movementSpeed,
    velocityX: moves ? Math.cos(angle) * movementSpeed : 0,
    velocityY: moves ? Math.sin(angle) * movementSpeed : 0,
    sineAmplitude: randomBetween(0.3, 0.5),
    sineFrequency: randomBetween(1.5, 2.1),
    masterPhase: "cruise",
    masterPhaseTime: 0,
    masterPhaseDuration: randomBetween(1.4, 2.2),
    masterHeading: angle,
    masterStartHeading: angle,
    masterTargetHeading: angle,
  };

  element.addEventListener("click", (event) => {
    event.stopPropagation();
    removeCircle(circle);
  });

  circles.push(circle);
  playfield.append(element);
  renderCircle(circle);
}

function removeCircle(circle) {
  if (!running) {
    return;
  }

  const index = circles.indexOf(circle);
  if (index === -1) {
    return;
  }

  circles.splice(index, 1);
  circle.element.remove();
  playHitSound();
  awardPoints(circle);
  clicked += 1;

  if (clicked >= CIRCLES_PER_LEVEL) {
    advanceLevel();
  } else {
    updateDisplay();
  }
}

function awardPoints(circle) {
  const hitTime = performance.now();
  combo = lastHitTime > 0 && hitTime - lastHitTime <= COMBO_WINDOW ? combo + 1 : 1;
  highestCombo = Math.max(highestCombo, combo);
  lastHitTime = hitTime;

  const typePoints = CIRCLE_TYPES[circle.typeName].points;
  const comboMultiplier = 1 + Math.min(combo - 1, 20) * 0.1;
  const riskMultiplier = circle.size >= WARNING_SIZE ? 1.5 : 1;
  const earnedPoints = Math.round(typePoints * comboMultiplier * riskMultiplier);

  score += earnedPoints;
  if (score > highScore) {
    highScore = score;
    saveHighScore();
  }
}

function playHitSound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    return;
  }

  audioContext ??= new AudioContext();
  const startTime = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(440, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(260, startTime + 0.075);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.035, startTime + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.08);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + 0.085);
}

function advanceLevel() {
  window.clearTimeout(spawnTimer);
  clearCircles();
  level += 1;
  if (level > highestUnlockedLevel) {
    highestUnlockedLevel = level;
    saveHighestUnlockedLevel();
    updateLevelPicker(level);
  }
  clicked = 0;
  updateDisplay();
  message.textContent = `Level ${level}! Die Kreise werden etwas schneller.`;
  levelPicker.classList.add("is-hidden");
  overlay.classList.remove("is-hidden");

  window.setTimeout(() => {
    if (!running) {
      return;
    }

    overlay.classList.add("is-hidden");
    scheduleNextCircle(300);
  }, 900);
}

function updateCircles(time) {
  if (!running) {
    return;
  }

  if (!previousTime) {
    previousTime = time;
  }

  const deltaSeconds = Math.min((time - previousTime) / 1000, 0.05);
  previousTime = time;
  const bounds = playfield.getBoundingClientRect();

  for (const circle of circles) {
    circle.size += circle.growthRate * deltaSeconds;

    if (circle.size >= MAX_SIZE) {
      endGame();
      return;
    }

    moveCircle(circle, deltaSeconds, bounds);
    renderCircle(circle);
  }

  animationFrame = window.requestAnimationFrame(updateCircles);
}

function moveCircle(circle, deltaSeconds, bounds) {
  if (circle.motionType === "still") {
    return;
  }

  circle.motionTime += deltaSeconds;

  if (circle.motionType === "master") {
    moveMasterCircle(circle, deltaSeconds, bounds);
    return;
  }

  moveTravelingCircle(circle, deltaSeconds, bounds);
}

function moveTravelingCircle(circle, deltaSeconds, bounds) {
  const radius = circle.size / 2;
  const speed = Math.hypot(circle.velocityX, circle.velocityY);
  const directionX = speed === 0 ? 0 : circle.velocityX / speed;
  const directionY = speed === 0 ? 0 : circle.velocityY / speed;
  let curve = 0;

  if (circle.motionType === "sine") {
    curve = Math.sin(circle.motionTime * circle.sineFrequency) * circle.sineAmplitude;
  }

  circle.x += (circle.velocityX - directionY * speed * curve) * deltaSeconds;
  circle.y += (circle.velocityY + directionX * speed * curve) * deltaSeconds;

  if (circle.x - radius <= 0 || circle.x + radius >= bounds.width) {
    circle.velocityX *= -1;
    circle.x = clamp(circle.x, radius, bounds.width - radius);
  }

  if (circle.y - radius <= 0 || circle.y + radius >= bounds.height) {
    circle.velocityY *= -1;
    circle.y = clamp(circle.y, radius, bounds.height - radius);
  }
}

function moveMasterCircle(circle, deltaSeconds, bounds) {
  circle.masterPhaseTime += deltaSeconds;
  updateMasterPhase(circle);

  const progress = clamp(circle.masterPhaseTime / circle.masterPhaseDuration, 0, 1);
  let speedFactor = 1;

  if (circle.masterPhase === "brake") {
    speedFactor = 1 - progress * 0.65;
  } else if (circle.masterPhase === "turn") {
    speedFactor = 0.35;
    circle.masterHeading = interpolateAngle(
      circle.masterStartHeading,
      circle.masterTargetHeading,
      smoothStep(progress)
    );
  } else if (circle.masterPhase === "accelerate") {
    speedFactor = 0.35 + progress * 0.65;
  }

  const gentleCurve = Math.sin(circle.motionTime * 2.2) * 0.12;
  const heading = circle.masterHeading + gentleCurve;
  circle.velocityX = Math.cos(heading) * circle.movementSpeed * speedFactor;
  circle.velocityY = Math.sin(heading) * circle.movementSpeed * speedFactor;
  moveMasterWithinBounds(circle, deltaSeconds, bounds);
}

function updateMasterPhase(circle) {
  if (circle.masterPhaseTime < circle.masterPhaseDuration) {
    return;
  }

  circle.masterPhaseTime = 0;

  if (circle.masterPhase === "cruise") {
    circle.masterPhase = "brake";
    circle.masterPhaseDuration = 0.38;
    circle.element.classList.add("circle--master-turning");
    return;
  }

  if (circle.masterPhase === "brake") {
    const turnDirection = Math.random() < 0.5 ? -1 : 1;
    const turnAmount = randomBetween(35, 65) * (Math.PI / 180) * turnDirection;
    circle.masterPhase = "turn";
    circle.masterPhaseDuration = 0.5;
    circle.masterStartHeading = circle.masterHeading;
    circle.masterTargetHeading = circle.masterHeading + turnAmount;
    return;
  }

  if (circle.masterPhase === "turn") {
    circle.masterHeading = circle.masterTargetHeading;
    circle.masterPhase = "accelerate";
    circle.masterPhaseDuration = 0.38;
    return;
  }

  circle.masterPhase = "cruise";
  circle.masterPhaseDuration = randomBetween(1.4, 2.2);
  circle.element.classList.remove("circle--master-turning");
}

function moveMasterWithinBounds(circle, deltaSeconds, bounds) {
  const radius = circle.size / 2;
  circle.x += circle.velocityX * deltaSeconds;
  circle.y += circle.velocityY * deltaSeconds;

  if (circle.x - radius <= 0 || circle.x + radius >= bounds.width) {
    circle.masterHeading = Math.PI - circle.masterHeading;
    circle.masterStartHeading = Math.PI - circle.masterStartHeading;
    circle.masterTargetHeading = Math.PI - circle.masterTargetHeading;
    circle.velocityX *= -1;
    circle.x = clamp(circle.x, radius, bounds.width - radius);
  }

  if (circle.y - radius <= 0 || circle.y + radius >= bounds.height) {
    circle.masterHeading = -circle.masterHeading;
    circle.masterStartHeading = -circle.masterStartHeading;
    circle.masterTargetHeading = -circle.masterTargetHeading;
    circle.velocityY *= -1;
    circle.y = clamp(circle.y, radius, bounds.height - radius);
  }
}

function interpolateAngle(start, end, amount) {
  return start + (end - start) * amount;
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function chooseCircleType() {
  const weights = getTypeWeights();
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * totalWeight;

  for (const [typeName, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll <= 0) {
      return typeName;
    }
  }

  return "blue";
}

function chooseTypeMotion(motionType) {
  if (motionType === "sometimesStraight") {
    return Math.random() < 0.4 ? "straight" : "still";
  }

  if (motionType === "rarelyStraight") {
    return Math.random() < 0.15 ? "straight" : "still";
  }

  return motionType;
}

function getMovementAngle(motionType) {
  if (motionType === "crossField") {
    const direction = Math.random() < 0.5 ? 0 : Math.PI;
    return direction + randomBetween(-0.28, 0.28);
  }

  return Math.random() * Math.PI * 2;
}

function renderCircle(circle) {
  circle.element.style.left = `${circle.x}px`;
  circle.element.style.top = `${circle.y}px`;
  circle.element.style.width = `${circle.size}px`;
  circle.element.style.height = `${circle.size}px`;
  circle.element.classList.toggle("circle--warning", circle.size >= WARNING_SIZE);
}

function endGame() {
  stopGameLoop();
  message.textContent =
    `Game Over! Du hast Level ${level} erreicht.\n` +
    `Finaler Score: ${score} | Bester Score: ${highScore} | Höchste Combo: ${highestCombo}`;
  updateLevelPicker(level);
  levelPicker.classList.remove("is-hidden");
  restartButton.classList.remove("is-hidden");
  overlay.classList.remove("is-hidden");
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);

updateLevelPicker();
updateDisplay();
