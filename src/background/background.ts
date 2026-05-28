import { createClient } from '@supabase/supabase-js';
import type { Lead } from '../types';

const SUPABASE_URL = 'https://0ec90b57d6e95fcbda19832f.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJib2x0IiwicmVmIjoiMGVjOTBiNTdkNmU5NWZjYmRhMTk4MzJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4ODE1NzQsImV4cCI6MTc1ODg4MTU3NH0.9I8-U0x86Ak8t2DGaIk0HfvTSLsAyzdnz-Nw00mMkKw';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Forward messages from content script → popup and persist leads to Supabase
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (message.type) {
    case 'LEAD_FOUND': {
      const lead: Lead = message.payload;
      (async () => {
        const { error } = await supabase.from('leads').insert([{
          session_id: lead.session_id || null,
          business_name: lead.business_name,
          address: lead.address,
          phone: lead.phone,
          website: lead.website,
          google_maps_url: lead.google_maps_url,
          rating: lead.rating,
          review_count: lead.review_count,
          category: lead.category,
          hours: lead.hours,
          social_media: lead.social_media,
          extra_data: lead.extra_data,
        }]);
        if (error) console.error('[MLS] Supabase insert error:', error.message);
      })();
      // Broadcast to popup
      broadcastToPopup(message);
      sendResponse({ ok: true });
      break;
    }

    case 'SCRAPE_STATUS':
    case 'SCRAPE_COMPLETE':
    case 'SCRAPE_ERROR':
      broadcastToPopup(message);
      if (message.type === 'SCRAPE_COMPLETE' || message.type === 'SCRAPE_ERROR') {
        // Update session status
        const sessionId = message.payload?.sessionId || null;
        if (sessionId) {
          const status = message.type === 'SCRAPE_COMPLETE' ? 'completed' : 'error';
          const totalResults = message.payload?.totalLeads || 0;
          supabase.from('scrape_sessions').update({
            status,
            total_results: totalResults,
            completed_at: new Date().toISOString(),
          }).eq('id', sessionId).then(({ error }) => {
            if (error) console.error('[MLS] Session update error:', error.message);
          });
        }
      }
      sendResponse({ ok: true });
      break;

    case 'CREATE_SESSION': {
      const { keyword, location } = message.payload as { keyword: string; location: string };
      (async () => {
        const { data, error } = await supabase
          .from('scrape_sessions')
          .insert([{ keyword, location, status: 'running' }])
          .select()
          .maybeSingle();
        if (error) {
          sendResponse({ error: error.message });
        } else {
          sendResponse({ session: data });
        }
      })();
      return true; // async response
    }

    case 'INJECT_AND_START': {
      const { tabId: targetTabId, keyword, sessionId } = message.payload as {
        tabId: number;
        keyword: string;
        sessionId: string;
      };
      (async () => {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            files: ['content.js'],
          });
          await sleep(500);
          await chrome.tabs.sendMessage(targetTabId, {
            type: 'START_SCRAPE',
            payload: { keyword, sessionId },
          });
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({ error: String(err) });
        }
      })();
      return true;
    }

    case 'STOP_SCRAPE_TAB': {
      const tid = message.payload?.tabId as number;
      if (tid) {
        chrome.tabs.sendMessage(tid, { type: 'STOP_SCRAPE' });
      }
      sendResponse({ ok: true });
      break;
    }

    case 'GET_LEADS': {
      const sid = message.payload?.sessionId as string | undefined;
      (async () => {
        let query = supabase.from('leads').select('*').order('created_at', { ascending: false });
        if (sid) query = query.eq('session_id', sid);
        const { data, error } = await query;
        sendResponse({ leads: data || [], error: error?.message });
      })();
      return true;
    }

    case 'GET_SESSIONS': {
      (async () => {
        const { data, error } = await supabase
          .from('scrape_sessions')
          .select('*')
          .order('created_at', { ascending: false });
        sendResponse({ sessions: data || [], error: error?.message });
      })();
      return true;
    }

    case 'DELETE_SESSION': {
      const sid = message.payload?.sessionId as string;
      (async () => {
        const { error } = await supabase.from('scrape_sessions').delete().eq('id', sid);
        sendResponse({ ok: !error, error: error?.message });
      })();
      return true;
    }
  }

  if (tabId) void tabId; // suppress unused warning
  return true;
});

function broadcastToPopup(message: unknown): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // popup not open — ignore
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
