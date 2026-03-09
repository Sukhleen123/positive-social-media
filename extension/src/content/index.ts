// Content script — runs on reddit.com
// Injected as IIFE (no native imports allowed in content scripts)

interface PostEntry {
  elementId: string;
  el: Element;
  text: string;
  subreddit?: string;
}

type OverlayState = 'pending' | 'sensitive' | 'safe' | 'revealed';

const elementState = new Map<string, OverlayState>();
const elementScores = new Map<string, number>();
const pendingBatch: PostEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let observer: MutationObserver | null = null;
let enabled = true;

// Selectors covering both Reddit UIs:
// - shreddit (web components, 2023+): shreddit-post / shreddit-comment
// - Old new-Reddit redesign (2018-2023): div[data-testid="post-container"]
const POST_SELECTOR = 'shreddit-post, div[data-testid="post-container"]';
const COMMENT_SELECTOR = 'shreddit-comment';
const ALL_SELECTOR = `${POST_SELECTOR}, ${COMMENT_SELECTOR}`;

// ---- DOM helpers ----

function getSubreddit(): string | undefined {
  const m = window.location.pathname.match(/^\/r\/([^/]+)/);
  return m?.[1];
}

function isPost(el: Element): boolean {
  return el.matches(POST_SELECTOR);
}

function isComment(el: Element): boolean {
  return el.matches(COMMENT_SELECTOR);
}

function getElementId(el: Element): string {
  // Shreddit posts/comments: thingid="t3_xxx" or thingid="t1_xxx"
  const thingId = el.getAttribute('thingid') || el.getAttribute('data-fullname');
  if (thingId) return 'psm-' + thingId;

  // Native id that looks like a Reddit fullname
  const nativeId = el.getAttribute('id');
  if (nativeId && /^t[1-6]_/.test(nativeId)) return 'psm-' + nativeId;

  // Old-redesign: the fullname id lives on an ancestor div (e.g. id="t3_1abc23")
  let ancestor = el.parentElement;
  while (ancestor && ancestor !== document.body) {
    const aid = ancestor.getAttribute('id');
    if (aid && /^t[1-6]_/.test(aid)) return 'psm-' + aid;
    ancestor = ancestor.parentElement;
  }

  // Stable positional fallback
  const parent = el.parentElement;
  const siblings = parent
    ? Array.from(parent.querySelectorAll(':scope > ' + el.tagName.toLowerCase()))
    : [];
  const idx = siblings.indexOf(el);
  return `psm-${el.tagName.toLowerCase()}-${idx >= 0 ? idx : Math.random().toString(36).slice(2)}`;
}

function getPostText(el: Element): string {
  // 1. Shreddit: post-title attribute is the most reliable (mirrors JSON `title`)
  const attrTitle = el.getAttribute('post-title');
  if (attrTitle?.trim()) return attrTitle.trim().slice(0, 500);

  // 2. Shreddit: title anchor with id="post-title-{shortId}" (confirmed in Reddit DOM)
  const titleAnchor = el.querySelector('a[id^="post-title-"]');
  if (titleAnchor?.textContent?.trim()) return titleAnchor.textContent.trim().slice(0, 500);

  // 3. Shreddit light-DOM slots
  const slotTitle =
    el.querySelector('a[slot="full-post-link"]') ||
    el.querySelector('[slot="title"]');
  if (slotTitle?.textContent?.trim()) return slotTitle.textContent.trim().slice(0, 500);

  // 3. Shreddit open shadow DOM
  const shadowRoot = (el as Element & { shadowRoot?: ShadowRoot }).shadowRoot;
  if (shadowRoot) {
    const shadowTitle =
      shadowRoot.querySelector('h1, h2, h3, [slot="title"], a[slot="full-post-link"]');
    if (shadowTitle?.textContent?.trim()) return shadowTitle.textContent.trim().slice(0, 500);
  }

  // 4. Old-redesign: h3 holds the post title
  const h3 = el.querySelector('h3');
  if (h3?.textContent?.trim()) return h3.textContent.trim().slice(0, 500);

  // 5. Text body (self-posts)
  const body =
    el.querySelector('div[slot="text-body"]') ||
    el.querySelector('[data-click-id="text"]');
  if (body?.textContent?.trim()) return body.textContent.trim().slice(0, 500);

  // 6. Last resort: full element text
  return (el.textContent?.trim() ?? '').slice(0, 500);
}

function getCommentText(el: Element): string {
  // Shreddit comment
  const slotBody = el.querySelector('div[slot="comment"]');
  if (slotBody?.textContent?.trim()) return slotBody.textContent.trim().slice(0, 500);

  // Old-redesign comment
  const oldBody = el.querySelector('[data-testid="comment"], .RichTextJSON-root');
  if (oldBody?.textContent?.trim()) return oldBody.textContent.trim().slice(0, 500);

  return (el.textContent?.trim() ?? '').slice(0, 500);
}

// ---- Overlay injection ----

function injectOverlay(el: Element, elementId: string) {
  if (el.closest('.psm-wrapper') || el.querySelector('.psm-overlay--pending')) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'psm-wrapper';
  wrapper.dataset.psmId = elementId;

  const overlay = document.createElement('div');
  overlay.className = 'psm-overlay--pending';
  overlay.dataset.psmOverlay = 'pending';

  el.parentNode?.insertBefore(wrapper, el);
  wrapper.appendChild(el);
  wrapper.appendChild(overlay);

  elementState.set(elementId, 'pending');
}

function scoreChipHtml(score: number, variant: 'safe' | 'sensitive' | 'revealed'): string {
  const label = score.toFixed(2);
  return `<span class="psm-score-chip psm-score-chip--${variant}" title="Relevance score">${label}</span>`;
}

function applyScore(elementId: string, isSensitive: boolean, score?: number) {
  const wrapper = document.querySelector(`.psm-wrapper[data-psm-id="${elementId}"]`);
  if (!wrapper) return;

  const overlay = wrapper.querySelector('[data-psm-overlay]') as HTMLElement | null;
  if (!overlay) return;

  if (score !== undefined) elementScores.set(elementId, score);
  const storedScore = elementScores.get(elementId);

  if (!isSensitive) {
    overlay.remove();
    elementState.set(elementId, 'safe');
    if (storedScore !== undefined) {
      const existing = wrapper.querySelector('.psm-score-chip');
      if (!existing) {
        // Try to inject chip into the action row in light DOM (left of overflow menu)
        const postEl = wrapper.firstElementChild;
        const actionRow = postEl?.querySelector(
          '[slot="post-action-row"], [slot="actionRow"], [slot="action-row"], [slot="credit-bar"]'
        );
        if (actionRow) {
          const chip = document.createElement('span');
          chip.className = 'psm-score-chip psm-score-chip--safe psm-score-chip--inline';
          chip.title = 'Relevance score';
          chip.textContent = storedScore.toFixed(2);
          actionRow.prepend(chip);
        } else {
          // Fallback: bottom-left of wrapper (avoids top-right overflow menu)
          wrapper.insertAdjacentHTML('beforeend', scoreChipHtml(storedScore, 'safe'));
        }
      }
    }
    return;
  }

  const content = wrapper.firstElementChild;
  if (content && content !== overlay) {
    content.classList.add('psm-blurred');
  }

  const scoreHtml = storedScore !== undefined ? scoreChipHtml(storedScore, 'sensitive') : '';
  overlay.className = 'psm-overlay--sensitive';
  overlay.dataset.psmOverlay = 'sensitive';
  overlay.innerHTML = `
    <span class="psm-label">Filtered content ${scoreHtml}</span>
    <button class="psm-btn psm-btn--reveal" data-psm-action="reveal" data-psm-id="${elementId}">Reveal</button>
    <button class="psm-btn psm-btn--unflag" data-psm-action="unflag" data-psm-id="${elementId}">Not sensitive</button>
  `;

  elementState.set(elementId, 'sensitive');
}

function revealElement(elementId: string) {
  const wrapper = document.querySelector(`.psm-wrapper[data-psm-id="${elementId}"]`);
  if (!wrapper) return;

  const overlay = wrapper.querySelector('[data-psm-overlay]') as HTMLElement | null;
  if (!overlay) return;

  const content = wrapper.firstElementChild;
  if (content && content !== overlay) {
    content.classList.remove('psm-blurred');
  }

  const revealScore = elementScores.get(elementId);
  const scoreHtml = revealScore !== undefined ? scoreChipHtml(revealScore, 'revealed') : '';
  overlay.className = 'psm-revealed-bar';
  overlay.dataset.psmOverlay = 'revealed';
  overlay.innerHTML = `
    <button class="psm-btn psm-btn--hide" data-psm-action="hide" data-psm-id="${elementId}">Hide again</button>
    <button class="psm-btn psm-btn--unflag-bar" data-psm-action="unflag" data-psm-id="${elementId}">Not sensitive</button>
    ${scoreHtml}
  `;

  elementState.set(elementId, 'revealed');
}

function hideElement(elementId: string) {
  const wrapper = document.querySelector(`.psm-wrapper[data-psm-id="${elementId}"]`);
  if (!wrapper) return;

  const bar = wrapper.querySelector('[data-psm-overlay]') as HTMLElement | null;
  if (!bar) return;

  const content = wrapper.firstElementChild;
  if (content && content !== bar) {
    content.classList.add('psm-blurred');
  }

  const hideScore = elementScores.get(elementId);
  const scoreHtml = hideScore !== undefined ? scoreChipHtml(hideScore, 'sensitive') : '';
  bar.className = 'psm-overlay--sensitive';
  bar.dataset.psmOverlay = 'sensitive';
  bar.innerHTML = `
    <span class="psm-label">Filtered content ${scoreHtml}</span>
    <button class="psm-btn psm-btn--reveal" data-psm-action="reveal" data-psm-id="${elementId}">Reveal</button>
    <button class="psm-btn psm-btn--unflag" data-psm-action="unflag" data-psm-id="${elementId}">Not sensitive</button>
  `;

  elementState.set(elementId, 'sensitive');
}

function unflagElement(elementId: string) {
  chrome.runtime.sendMessage({ type: 'SET_OVERRIDE', elementId, isSensitive: false });

  const wrapper = document.querySelector(`.psm-wrapper[data-psm-id="${elementId}"]`);
  if (!wrapper) return;

  const content = wrapper.firstElementChild as HTMLElement | null;
  if (content) {
    content.classList.remove('psm-blurred');
    wrapper.parentNode?.insertBefore(content, wrapper);
  }
  wrapper.remove();
  elementState.delete(elementId);
  elementScores.delete(elementId);
}

// ---- Batch processing ----

function processElement(el: Element) {
  if (!isPost(el) && !isComment(el)) return;

  const elementId = getElementId(el);

  // Skip already-processed elements
  if (elementState.has(elementId)) return;

  const text = isPost(el) ? getPostText(el) : getCommentText(el);
  if (!text) return;

  injectOverlay(el, elementId);
  console.log(`[PSM] queued ${elementId}: "${text.slice(0, 100)}"`);
  pendingBatch.push({ elementId, el, text, subreddit: getSubreddit() });

  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushBatch, 50);
}

async function flushBatch(retryCount = 0) {
  if (pendingBatch.length === 0) return;

  const batch = pendingBatch.splice(0, pendingBatch.length);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SCORE_BATCH',
      posts: batch.map((p) => ({
        elementId: p.elementId,
        text: p.text,
        subreddit: p.subreddit,
      })),
    });

    if (response?.pending) {
      // Model still loading — retry after 500ms
      if (retryCount < 10) {
        pendingBatch.push(...batch);
        setTimeout(() => flushBatch(retryCount + 1), 500);
      }
      return;
    }

    if (response?.results) {
      if (response.results.length === 0 && !response.pending) {
        console.log('[PSM] No trigger configured — all items marked safe');
        for (const p of batch) {
          const wrapper = document.querySelector(`.psm-wrapper[data-psm-id="${p.elementId}"]`);
          wrapper?.querySelector('[data-psm-overlay]')?.remove();
          elementState.set(p.elementId, 'safe');
        }
      } else {
        for (const result of response.results) {
          console.log(`[PSM] score ${result.elementId}: ${result.score?.toFixed(3)} → ${result.isSensitive ? 'SENSITIVE' : 'safe'}`);
          applyScore(result.elementId, result.isSensitive, result.score);
        }
      }
    }
  } catch (err) {
    console.error('[PSM] Score batch error:', err);
    if (retryCount === 0) {
      pendingBatch.push(...batch);
      setTimeout(() => flushBatch(1), 500);
    }
  }
}

// ---- Click delegation ----

document.body.addEventListener('click', (e) => {
  const target = (e.target as Element).closest('[data-psm-action]') as HTMLElement | null;
  if (!target) return;

  const action = target.dataset.psmAction;
  const elementId = target.dataset.psmId;
  if (!action || !elementId) return;

  e.preventDefault();
  e.stopPropagation();

  if (action === 'reveal') revealElement(elementId);
  else if (action === 'hide') hideElement(elementId);
  else if (action === 'unflag') unflagElement(elementId);
});

// ---- MutationObserver ----

function startObserver() {
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as Element;

        if (isPost(el) || isComment(el)) {
          processElement(el);
        }

        // Also scan descendants
        el.querySelectorAll(ALL_SELECTOR).forEach(processElement);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function stopObserver() {
  observer?.disconnect();
  observer = null;
}

function removeAllOverlays() {
  document.querySelectorAll('.psm-wrapper').forEach((wrapper) => {
    const content = wrapper.firstElementChild as HTMLElement | null;
    if (content) {
      content.classList.remove('psm-blurred');
      wrapper.parentNode?.insertBefore(content, wrapper);
    }
    wrapper.remove();
  });
  elementState.clear();
  elementScores.clear();
  pendingBatch.length = 0;
}

function reprocessAll() {
  document.querySelectorAll(ALL_SELECTOR).forEach(processElement);
}

// ---- Extension messages ----

chrome.runtime.onMessage.addListener((message) => {
  const msg = message as { type: string };

  if (msg.type === 'EXTENSION_DISABLED') {
    enabled = false;
    stopObserver();
    removeAllOverlays();
  } else if (msg.type === 'EXTENSION_ENABLED') {
    enabled = true;
    startObserver();
    reprocessAll();
  } else if (msg.type === 'SETTINGS_UPDATED') {
    removeAllOverlays();
    reprocessAll();
  }
});

// ---- Init ----

(async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (response?.enabled === false) return;
  } catch {
    // Background not ready — proceed anyway
  }

  startObserver();

  // Phase 1: retry every 500ms for up to 10 seconds (search pages load slowly via API)
  let initRetries = 0;
  function tryInitialProcess() {
    const found = document.querySelectorAll(ALL_SELECTOR);
    console.log(`[PSM] init scan: found ${found.length} elements`);
    if (found.length > 0) {
      found.forEach(processElement);
    } else if (initRetries < 20) {
      initRetries++;
      setTimeout(tryInitialProcess, 500);
    }
  }
  tryInitialProcess();

  // Phase 2: periodic re-scan for content loaded inside faceplate-partial shadow roots
  // or other async containers that MutationObserver on document.body cannot see.
  let periodicCount = 0;
  const periodicScan = setInterval(() => {
    reprocessAll();
    if (++periodicCount >= 15) clearInterval(periodicScan); // 15 × 2s = 30s
  }, 2000);

  // Phase 3: re-scan on Reddit SPA navigation (pushState / popstate)
  const origPushState = history.pushState.bind(history);
  history.pushState = (...args: Parameters<typeof history.pushState>) => {
    origPushState(...args);
    setTimeout(() => { removeAllOverlays(); reprocessAll(); }, 300);
  };
  window.addEventListener('popstate', () => {
    setTimeout(() => { removeAllOverlays(); reprocessAll(); }, 300);
  });
})();
