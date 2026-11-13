/**
 * Synthetic WhatsApp Web markup built from the hooks in
 * src/content/whatsapp/selectors.ts (hashed class names, #main, data-id,
 * data-pre-plain-text, span.selectable-text, emoji as <img alt>). It proves
 * the parser works against those hooks, not that WhatsApp still uses them.
 * All names, numbers and addresses are fake.
 */

export const GROUP_ID = '120363000000000001@g.us';
export const OTHER_GROUP_ID = '120363000000000002@g.us';

export interface FixtureMessage {
  id: string;
  /** "2:48 pm, 13/11/2026" */
  stamp: string;
  sender?: string;
  /** "919800000001@c.us" or "123456789@lid". */
  participant?: string;
  html: string;
  out?: boolean;
  forwarded?: boolean;
  readMore?: boolean;
  quotedHtml?: string;
  chatId?: string;
}

export function message(m: FixtureMessage): string {
  const chatId = m.chatId ?? GROUP_ID;
  const dataId = m.out ? `true_${chatId}_${m.id}` : `false_${chatId}_${m.id}_${m.participant ?? '919800000001@c.us'}`;
  const time = m.stamp.split(',')[0];
  return `
  <div role="row"><div data-id="${dataId}" class="_amjv _aotl">
    <div class="_amk4"><div class="_amk6">
      ${m.forwarded ? '<div class="_ahy4"><span data-icon="forward-refreshed"></span><span>Forwarded</span></div>' : ''}
      ${m.out ? '' : `<div class="_ahx_"><span aria-label="${m.sender ?? ''}:" dir="auto">${m.sender ?? ''}</span></div>`}
      <div class="copyable-text" data-pre-plain-text="[${m.stamp}] ${m.sender ?? 'You'}: ">
        ${m.quotedHtml ? `<div aria-label="Quoted message" role="button"><span dir="auto" class="quoted-mention _ao3e">${m.quotedHtml}</span></div>` : ''}
        <div class="_akbu"><span dir="ltr" class="_ao3e selectable-text copyable-text"><span>${m.html}</span></span>${
          m.readMore ? '<div role="button" class="read-more-button">Read more</div>' : ''
        }</div>
      </div>
      <div class="_amk7"><span dir="auto" class="x1rg5ohu">${time}</span></div>
    </div></div>
  </div></div>`;
}

/** "~ A added ~ B": a data-id but no copyable text. */
export const systemNotice = (id: string) =>
  `<div role="row"><div data-id="false_${GROUP_ID}_${id}_919800000009@c.us" class="_amjw"><span dir="auto">~ Someone added ~ Someone else</span></div></div>`;

export const dateDivider = (label: string) => `<div role="row"><div class="_amjy"><span dir="auto">${label}</span></div></div>`;

export function chatPage(rows: string[], title = 'MERN Jobs India'): string {
  return `
  <div id="app">
    <div id="side"><div id="pane-side"><div role="listitem"><span dir="auto" title="Some Other Group">Some Other Group</span></div></div></div>
    <div id="main">
      <header>
        <div role="button"><div><span dir="auto" class="_ao3e">${title}</span></div>
        <div><span title="~ A, ~ B, ~ C, You" class="_ao3e">~ A, ~ B, ~ C, You</span></div></div>
      </header>
      <div class="copyable-area"><div tabindex="0" data-tab="8" class="_ajyl"><div role="application" class="_ajyp">${rows.join('')}</div></div></div>
    </div>
  </div>`;
}

const img = (emoji: string) => `<img alt="${emoji}" draggable="false" class="emoji" src="data:image/gif;base64,R0lGOD">`;

/** A junior Node.js post, emoji drawn as images, <br> line breaks. */
export const JOB_NODE = [
  'Frontend &amp; Backend Developer (Node.js)',
  `${img('📍')} Location: Surat, Gujarat`,
  `${img('💼')} Experience: 2 Years (Junior Level)`,
  `${img('💰')} Salary: Up to ₹35,000/month`,
  'Required Skills: Node.js, React',
  `${img('📩')} Interested candidates can share their updated CV at:`,
  '<a href="mailto:hiring@example.com" class="_ao3e selectable-text copyable-text">hiring@example.com</a>',
  `${img('📞')} 98765 43210`,
].join('<br>');

/** A senior Angular post, line breaks as newline characters. */
export const JOB_ANGULAR = [
  '🔥 *HIRING NOW – SENIOR FULL STACK DEVELOPER (ANGULAR + NODE.JS)*',
  '💼 Experience: 6 to 7 Years',
  '📍 Location: Remote',
  '📩 Share Your Updated CV: jobs@example.org',
].join('\n');

/** First part of a long post as WhatsApp shows it before "Read more" (over 300 letters, so its id is already final). */
export const JOB_ARCHITECT_SHORT = [
  '🚨 URGENT HIRING | CLOUD DATA &amp; AI SOLUTION ARCHITECT 🚨',
  'We are looking for an experienced Cloud Data &amp; AI Solution Architect to join our team for a full-time (FTE) opportunity.',
  'Position: Cloud Data &amp; AI Solution Architect',
  'Experience: 8+ Years',
  'CTC: ₹30 LPA – ₹40 LPA',
  'Location: Bengaluru, Work Mode: Work From Office',
  'Key Responsibilities: Design and develop cloud-native data and AI architectures. Review and guide development teams on architectural patterns. Lead, mentor, and g…',
].join('\n');
export const JOB_ARCHITECT_REST =
  'uide engineers.\nApply: <a href="https://careers.example.com/apply/42" target="_blank">https://careers.example.com/apply/42</a>';

export const CHIT_CHAT = `Good morning everyone, have a great day ahead! ${img('🙏')}`;
export const REFERRAL_ASK = 'Does anyone have a referral at Example Corp? Please DM me, thanks a lot';
