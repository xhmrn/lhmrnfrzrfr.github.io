(() => {
  "use strict";
  document.getElementById("year").textContent = new Date().getFullYear();

  // Keep the original continuously rotating random quotes, with an offline fallback.
  const quotes = [
    { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { quote: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
    { quote: "You only live once, but if you do it right, once is enough.", author: "Mae West" },
    { quote: "You will face many defeats in life, but never let yourself be defeated.", author: "Maya Angelou" }
  ];
  const text = document.getElementById("quote-text");
  const author = document.getElementById("quote-author");
  const nextButton = document.querySelector(".quote-next");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let quoteIndex = -1;
  let generation = 0;
  let timer;
  let pendingRequest;
  let lastQuote = "";
  nextButton.hidden = false;

  function fallbackQuote() {
    // Select a different local quote each time, including while offline.
    quoteIndex = (quoteIndex + 1 + Math.floor(Math.random() * (quotes.length - 1))) % quotes.length;
    return quotes[quoteIndex];
  }

  async function loadQuote(signal) {
    try {
      const response = await fetch("https://dummyjson.com/quotes/random", { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Quote unavailable");
      const data = await response.json();
      if (typeof data.quote !== "string" || typeof data.author !== "string" || !data.quote.trim() || data.quote.length > 420 || data.author.length > 100 || data.quote === lastQuote) {
        throw new Error("Invalid or repeated quote");
      }
      return data;
    } catch {
      return fallbackQuote();
    }
  }

  function schedule(callback, delay, current) {
    timer = window.setTimeout(() => {
      if (current === generation && !document.hidden) callback();
    }, delay);
  }

  async function rotateQuote(manual = false) {
    const current = ++generation;
    clearTimeout(timer);
    if (pendingRequest) pendingRequest.abort();
    pendingRequest = new AbortController();
    const controller = pendingRequest;
    const timeout = window.setTimeout(() => controller.abort(), 4500);
    const quote = await loadQuote(controller.signal);
    clearTimeout(timeout);
    if (current !== generation || document.hidden) return;
    lastQuote = quote.quote;
    const fullText = "“" + quote.quote + "”";
    const characters = Array.from(fullText);
    author.textContent = quote.author;
    // Screen readers read a complete sentence instead of each typed letter.
    text.setAttribute("aria-label", fullText);
    text.innerHTML = '<span class="quote-measure" aria-hidden="true"></span><span class="quote-typed" aria-hidden="true"></span>';
    text.querySelector(".quote-measure").textContent = fullText;
    const visibleText = text.querySelector(".quote-typed");
    if (manual) document.getElementById("quote-announcement").textContent = fullText + " — " + quote.author;
    const holdTime = Math.max(5000, characters.length * 45);
    const erase = () => {
      if (reducedMotion.matches) {
        rotateQuote();
        return;
      }
      let length = characters.length;
      const tick = () => {
        visibleText.textContent = characters.slice(0, length--).join("");
        if (length >= 0) schedule(tick, 12, current);
        else schedule(() => rotateQuote(), 250, current);
      };
      tick();
    };
    if (reducedMotion.matches) {
      visibleText.textContent = fullText;
      schedule(erase, holdTime, current);
      return;
    }
    let length = 0;
    const type = () => {
      visibleText.textContent = characters.slice(0, ++length).join("");
      if (length < characters.length) schedule(type, 35, current);
      else schedule(erase, holdTime, current);
    };
    type();
  }
  nextButton.addEventListener("click", () => rotateQuote(true));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      ++generation;
      clearTimeout(timer);
      if (pendingRequest) pendingRequest.abort();
    } else rotateQuote();
  });
  rotateQuote();
})();
