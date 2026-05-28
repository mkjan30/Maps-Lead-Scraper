import type { Lead, ScrapeState, ContentMessage } from '../types';

let scrapeState: ScrapeState = {
  status: 'idle',
  keyword: '',
  leadsFound: 0,
  currentPage: 1,
  sessionId: null,
  errorMessage: null,
};

let abortController: AbortController | null = null;

// ── Selectors (Google Maps DOM) ────────────────────────────────────────────────

const SEL = {
  resultsList: '[role="feed"]',
  resultItem: '[role="feed"] > div[jsaction]',
  loadingSpinner: '[class*="loading"]',
  placeCard: '.m6QErb',
  businessName: 'h1.DUwDvf, h1[class*="fontHeadlineLarge"]',
  address: '[data-item-id="address"] .fontBodyMedium, button[data-item-id="address"]',
  phone: '[data-item-id^="phone:tel:"] .fontBodyMedium, button[data-item-id^="phone:tel:"]',
  website: 'a[data-item-id="authority"]',
  category: '.DkEaL, button.DkEaL',
  rating: '.F7nice > span[aria-hidden="true"]',
  reviewCount: '.F7nice > span[aria-label*="review"]',
  hours: '.t39EBf .fontBodyMedium, [data-hide-tooltip-on-mouse-move] .fontBodyMedium',
  socialLinks: 'a[href*="facebook.com"], a[href*="instagram.com"], a[href*="twitter.com"], a[href*="linkedin.com"], a[href*="youtube.com"], a[href*="tiktok.com"], a[href*="pinterest.com"], a[href*="x.com"]',
  nextPageButton: 'button[aria-label="Next page"]',
  backButton: 'button[aria-label="Back"]',
  scrollContainer: '[role="feed"]',
};

// ── Utilities ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitFor(selector: string, timeout = 8000): Promise<Element | null> {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) { resolve(el); return; }

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) {
        observer.disconnect();
        resolve(found);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
  });
}

function getText(el: Element | null, selector: string): string {
  if (!el) return '';
  const found = el.querySelector(selector);
  return found ? (found as HTMLElement).innerText?.trim() || found.textContent?.trim() || '' : '';
}

function getAttr(el: Element | null, selector: string, attr: string): string {
  if (!el) return '';
  const found = el.querySelector(selector);
  return found ? (found as HTMLElement).getAttribute(attr)?.trim() || '' : '';
}

function extractSocialLinks(container: Element): string[] {
  const links: string[] = [];
  const anchors = container.querySelectorAll(SEL.socialLinks);
  anchors.forEach((a) => {
    const href = (a as HTMLAnchorElement).href;
    if (href && !links.includes(href)) links.push(href);
  });
  return links;
}

// ── Extract data from the currently-open detail panel ─────────────────────────

function extractDetailPanelData(): Partial<Lead> {
  const panel = document.querySelector('.m6QErb[data-pid], .TIHn2, .bJzME');
  const root = panel || document.body;

  const businessName =
    (document.querySelector('h1.DUwDvf') as HTMLElement)?.innerText?.trim() ||
    (document.querySelector('h1[class*="fontHeadlineLarge"]') as HTMLElement)?.innerText?.trim() ||
    '';

  const addressBtn = document.querySelector('button[data-item-id="address"]');
  const address =
    (addressBtn as HTMLElement)?.innerText?.trim() ||
    getText(root as Element, '[data-item-id="address"] .fontBodyMedium') ||
    '';

  // Phone - look for tel: data-item-id
  const phoneEl = document.querySelector('[data-item-id^="phone:tel:"]');
  const phone =
    (phoneEl as HTMLElement)?.innerText?.trim() ||
    phoneEl?.getAttribute('data-item-id')?.replace('phone:tel:', '') ||
    '';

  const websiteEl = document.querySelector('a[data-item-id="authority"]') as HTMLAnchorElement | null;
  const website = websiteEl?.href || websiteEl?.innerText?.trim() || '';

  const rating =
    (document.querySelector('.F7nice > span[aria-hidden="true"]') as HTMLElement)?.innerText?.trim() || '';

  const reviewEl = document.querySelector('.F7nice > span[aria-label]');
  const reviewCount =
    reviewEl?.getAttribute('aria-label')?.replace(/[^0-9,]/g, '').trim() ||
    (reviewEl as HTMLElement)?.innerText?.trim() ||
    '';

  const category =
    (document.querySelector('button.DkEaL') as HTMLElement)?.innerText?.trim() ||
    (document.querySelector('.DkEaL') as HTMLElement)?.innerText?.trim() ||
    '';

  // Hours - look for the operating hours section
  const hoursEl = document.querySelector('[data-hide-tooltip-on-mouse-move]') ||
    document.querySelector('.t39EBf');
  const hours = (hoursEl as HTMLElement)?.innerText?.split('\n')[0]?.trim() || '';

  const googleMapsUrl = window.location.href;

  const socialMedia = extractSocialLinks(document.body);

  // Extra fields
  const extra_data: Record<string, string> = {};

  const plusCode = document.querySelector('[data-item-id="oloc"] .fontBodyMedium');
  if (plusCode) extra_data['plus_code'] = (plusCode as HTMLElement).innerText?.trim();

  const priceLevel = document.querySelector('.mgr77e');
  if (priceLevel) extra_data['price_level'] = (priceLevel as HTMLElement).innerText?.trim();

  return {
    business_name: businessName,
    address,
    phone,
    website,
    google_maps_url: googleMapsUrl,
    rating,
    review_count: reviewCount,
    category,
    hours,
    social_media: socialMedia,
    extra_data,
  };
}

// ── Scroll the results feed to load all items ──────────────────────────────────

async function scrollFeedToBottom(signal: AbortSignal): Promise<void> {
  const feed = document.querySelector(SEL.resultsList);
  if (!feed) return;

  let lastHeight = 0;
  let staleCount = 0;

  while (!signal.aborted) {
    feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
    await sleep(1500);

    if (signal.aborted) break;

    const currentHeight = feed.scrollHeight;
    if (currentHeight === lastHeight) {
      staleCount++;
      if (staleCount >= 3) break;
    } else {
      staleCount = 0;
    }
    lastHeight = currentHeight;
  }
}

// ── Click a result item and wait for detail panel ─────────────────────────────

async function openResultItem(item: Element, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;

  (item as HTMLElement).click();
  await sleep(2000);

  if (signal.aborted) return false;

  // Wait for h1 to appear (detail panel loaded)
  const h1 = await waitFor('h1.DUwDvf, h1[class*="fontHeadlineLarge"]', 6000);
  return h1 !== null;
}

// ── Navigate back to results list ─────────────────────────────────────────────

async function navigateBack(): Promise<void> {
  const back = document.querySelector(SEL.backButton) as HTMLElement | null;
  if (back) {
    back.click();
    await sleep(1500);
  } else {
    history.back();
    await sleep(2000);
  }
}

// ── Main scrape loop ───────────────────────────────────────────────────────────

async function runScrape(signal: AbortSignal): Promise<void> {
  try {
    // Wait for the results feed to appear
    sendStatus('running', 0, 'Waiting for Google Maps results...');
    const feed = await waitFor(SEL.resultsList, 15000);
    if (!feed || signal.aborted) {
      if (!signal.aborted) sendError('No results list found. Make sure you have searched for a keyword on Google Maps.');
      return;
    }

    let pageNum = 1;
    let totalLeads = 0;

    while (!signal.aborted) {
      sendStatus('running', totalLeads, `Page ${pageNum}: scrolling to load all results...`);

      // Scroll the current page's feed to load all lazy items
      await scrollFeedToBottom(signal);
      if (signal.aborted) break;

      // Gather all result items now visible
      const items = Array.from(document.querySelectorAll(SEL.resultItem)).filter(
        (el) => el.querySelector('a[href*="/maps/place/"]') !== null
      );

      sendStatus('running', totalLeads, `Page ${pageNum}: found ${items.length} results, extracting...`);

      for (let i = 0; i < items.length; i++) {
        if (signal.aborted) break;

        const opened = await openResultItem(items[i], signal);
        if (!opened || signal.aborted) {
          await navigateBack();
          continue;
        }

        await sleep(800); // extra settle time for social links / extra fields

        const data = extractDetailPanelData();
        totalLeads++;

        chrome.runtime.sendMessage({
          type: 'LEAD_FOUND',
          payload: { ...data, session_id: scrapeState.sessionId },
        });

        sendStatus('running', totalLeads, `Page ${pageNum}: scraped ${i + 1}/${items.length}`);

        await navigateBack();
        await sleep(600);
      }

      if (signal.aborted) break;

      // Try to go to next page
      const nextBtn = document.querySelector(SEL.nextPageButton) as HTMLElement | null;
      if (!nextBtn || nextBtn.getAttribute('disabled') !== null) {
        break; // no more pages
      }

      nextBtn.click();
      pageNum++;
      scrapeState.currentPage = pageNum;
      await sleep(2500);

      // Wait for the feed to reload
      await waitFor(SEL.resultsList, 10000);
      await sleep(1000);
    }

    if (!signal.aborted) {
      chrome.runtime.sendMessage({ type: 'SCRAPE_COMPLETE', payload: { totalLeads } });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sendError(msg);
  }
}

// ── Messaging helpers ──────────────────────────────────────────────────────────

function sendStatus(status: string, leadsFound: number, message?: string): void {
  chrome.runtime.sendMessage({
    type: 'SCRAPE_STATUS',
    payload: { status, leadsFound, message },
  });
}

function sendError(message: string): void {
  chrome.runtime.sendMessage({ type: 'SCRAPE_ERROR', payload: { message } });
}

// ── Message listener ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
  switch (message.type) {
    case 'START_SCRAPE': {
      const payload = message.payload as { keyword: string; sessionId: string };
      scrapeState = {
        status: 'running',
        keyword: payload.keyword,
        leadsFound: 0,
        currentPage: 1,
        sessionId: payload.sessionId,
        errorMessage: null,
      };
      abortController = new AbortController();
      runScrape(abortController.signal);
      sendResponse({ ok: true });
      break;
    }

    case 'STOP_SCRAPE': {
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
      scrapeState.status = 'idle';
      sendResponse({ ok: true });
      break;
    }

    case 'GET_STATUS': {
      sendResponse({ state: scrapeState });
      break;
    }
  }
  return true;
});
