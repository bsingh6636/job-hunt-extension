import { onMessage } from '@shared/messages';
import { mergeCapturedPosts } from '@shared/posts';
import { mergeCapturedWhatsApp } from '@shared/whatsapp';
import { log } from '@shared/utils/log';

/**
 * Background service worker: message router + orchestration. It owns every
 * write that can happen while the side panel is closed (LinkedIn and
 * WhatsApp post capture). The
 * side panel reads/writes storage directly for user-driven edits.
 */

chrome.runtime.onInstalled.addListener(() => {
  // Clicking the toolbar icon opens the side panel for the current tab.
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  log.info('installed');
});

onMessage({
  PING: () => ({ ok: true, where: 'background' }),
  POSTS_CAPTURED: ({ posts, pageUrl }) => mergeCapturedPosts(posts, pageUrl),
  WHATSAPP_CAPTURED: ({ posts }) => mergeCapturedWhatsApp(posts),
});
