const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const calculatorContainer = document.getElementById('calculator-container');
const calcDisplay = document.getElementById('calc-display');
const calcButtons = document.querySelectorAll('.calc-btn');
let calcExpression = '';
let calculatorMode = false;
let chatData = [];
let currentUtterance = null;

// Load chat.json
fetch('chat.json')
  .then(res => res.json())
  .then(data => chatData = data);

// Slang and typo maps
const slangMap = {
  "h r u": "how are you", "hru": "how are you", "wbu": "what about you",
  "hbu": "how about you", "idk": "i don't know", "brb": "be right back",
  "g2g": "got to go", "gtg": "got to go", "sup": "what's up", "u": "you",
  "r": "are", "im": "i'm", "omg": "oh my god", "wya": "where are you at",
  "lmk": "let me know", "wud": "what would you do"
};

const typoMap = {
  "waether": "weather", "wether": "weather", "tempreature": "temperature",
  "wheather": "weather", "flipp a coin": "flip a coin", "calcuator": "calculator",
  "calculater": "calculator"
};

function normalizeSlang(input) {
  const compressed = input.toLowerCase().replace(/\s+/g, '');
  if (slangMap[compressed]) return slangMap[compressed];

  return input.toLowerCase()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(word => slangMap[word] || typoMap[word] || word)
    .join(' ');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Fuzzy match
function similarity(a, b) {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  const longerLen = longer.length;
  if (longerLen === 0) return 1.0;
  return (longerLen - editDistance(longer, shorter)) / longerLen;
}

function editDistance(a, b) {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

function findBestMatch(msg) {
  msg = normalizeSlang(msg.trim().toLowerCase()).replace(/\s+/g, '');
  let best = null, bestScore = 0;

  for (const entry of chatData) {
    const entryNorm = normalizeSlang(entry.prompt.toLowerCase()).replace(/\s+/g, '');
    const sim = similarity(entryNorm, msg);
    if (sim > bestScore && sim > 0.5) {
      bestScore = sim;
      best = entry;
    }
  }
  return best;
}

// Audio button
function createAudioButton(text) {
  const btn = document.createElement('button');
  btn.className = 'audio-btn';
  btn.title = 'Play audio';
  btn.innerHTML = '';
  btn.onclick = () => {
    if (currentUtterance) speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.voice = speechSynthesis.getVoices().find(v =>
      v.name.includes("Daniel") || v.name.includes("Male")
    );
    currentUtterance = utterance;
    speechSynthesis.speak(utterance);
  };
  return btn;
}

// Add chat message
function addMessage(text, sender) {
  const msg = document.createElement('div');
  msg.classList.add('message', sender);
  const span = document.createElement('span');
  span.innerText = text;
  msg.appendChild(span);

  if (sender === 'bot') {
    const speakBtn = createAudioButton(text);
    speakBtn.style.marginLeft = '10px';
    speakBtn.classList.add('bot-audio-button');
    msg.appendChild(speakBtn);
  }

  chatContainer.appendChild(msg);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Bot response logic
async function getBotResponse(message) {
  const lower = normalizeSlang(message.toLowerCase().trim());

  if (lower === 'calculator') {
    calculatorContainer.classList.remove('hidden');
    calculatorMode = true;
    addMessage("Bot: Here's your calculator.", 'bot');
    return;
  }

  if (calculatorMode && lower !== 'exit') {
    addMessage("Bot: Please use the calculator above. Type 'Exit' to close it.", 'bot');
    return;
  }

  if (lower === 'exit') {
    calculatorContainer.classList.add('hidden');
    calculatorMode = false;
    calcExpression = '';
    calcDisplay.textContent = '0';
    addMessage("Bot: Calculator closed.", 'bot');
    return;
  }

  if (lower.includes('flip a coin') || lower.includes('flip coin')) {
    const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
    addMessage(`Bot: You flipped ${result}`, 'bot');
    return;
  }

  if (lower.includes('roll a dice') || lower.includes('roll a die')) {
    const result = Math.floor(Math.random() * 6) + 1;
    addMessage(`Bot: You rolled a ${result}`, 'bot');
    return;
  }

  if (lower.includes('weather') || lower.includes('temperature')) {
    addMessage("Bot: Getting your local weather...", 'bot');
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude, longitude } = pos.coords;
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`);
      const data = await res.json();
      const temp = data.current.temperature_2m;
      addMessage(`Bot: The temperature in your area is ${temp}°C`, 'bot');
    }, () => {
      addMessage("Bot: Couldn't access your location.", 'bot');
    });
    return;
  }

  const found = findBestMatch(lower);
  if (found) {
    addMessage(`Bot: ${found.response}`, 'bot');
    return;
  }

  try {
    let mathExp = message.match(/[-+*/()\d\s.]+/g);
    if (mathExp) {
      mathExp = mathExp.join('').trim();
      if (/^[\d\s.+\-*/()]+$/.test(mathExp)) {
        const result = eval(mathExp);
        addMessage(`Bot: The answer is ${result}`, 'bot');
        return;
      }
    }
  } catch {}

  addMessage("Bot: I don't understand that.", 'bot');
}

// Handle send
function handleSend() {
  const msg = userInput.value.trim();
  if (!msg) return;
  addMessage(`You: ${msg}`, 'user');
  userInput.value = '';
  getBotResponse(msg);
}

sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleSend();
});

document.getElementById('newChatBtn').addEventListener('click', () => {
  chatContainer.innerHTML = '';
  addMessage("Bot: Hello! How can I help you?", 'bot');
});

// Calculator logic
calcButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const val = btn.textContent;

    if (val === 'C') {
      calcExpression = '';
    } else if (val === '=') {
      try {
        calcExpression = eval(calcExpression).toString();
      } catch {
        calcExpression = 'Error';
      }
    } else if (val === 'Exit') {
      calculatorContainer.classList.add('hidden');
      calculatorMode = false;
      calcExpression = '';
    } else {
      if (calcExpression === 'Error') calcExpression = '';
      calcExpression += val;
    }

    calcDisplay.textContent = calcExpression || '0';
  });
});

// Calculator keyboard support
document.addEventListener('keydown', e => {
  if (!calculatorMode) return;
  const key = e.key;
  if (/[0-9+\-*/().]/.test(key)) {
    if (calcExpression === 'Error') calcExpression = '';
    calcExpression += key;
  } else if (key === 'Enter') {
    try {
      calcExpression = eval(calcExpression).toString();
    } catch {
      calcExpression = 'Error';
    }
  } else if (key === 'Backspace') {
    calcExpression = calcExpression.slice(0, -1);
  }
  calcDisplay.textContent = calcExpression || '0';
});
