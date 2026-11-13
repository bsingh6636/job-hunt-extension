import { beforeEach, describe, expect, it } from 'vitest';
import { diagnoseWhatsApp } from '../src/content/whatsapp/diagnose';
import { runWhatsAppExtraction, type ChatSession } from '../src/content/whatsapp/extract';
import { expandReadMore, loadOlder } from '../src/content/whatsapp/page';
import {
  detectDayFirst,
  findMessageElements,
  parseDataId,
  parseMessage,
  parsePrePlainText,
  participantPhone,
  readChat,
  whatsappContentId,
} from '../src/content/whatsapp/parse';
import { DEFAULT_SETTINGS, type WhatsAppExtractOptions, type WhatsAppPost } from '../src/shared/types';
import { experienceLabel, fitsExperience, isJobPost, parseExperience } from '../src/shared/utils/jobtext';
import { extractPhones, formatPhone, whatsappLink } from '../src/shared/utils/phone';
import { mergeWhatsAppPost } from '../src/shared/whatsapp';
import {
  CHIT_CHAT,
  GROUP_ID,
  JOB_ANGULAR,
  JOB_ARCHITECT_REST,
  JOB_ARCHITECT_SHORT,
  JOB_NODE,
  OTHER_GROUP_ID,
  REFERRAL_ASK,
  chatPage,
  dateDivider,
  message,
  systemNotice,
} from './fixtures/whatsapp-chat';

const ctx = { chat: 'MERN Jobs India', dayFirst: true, capturedAt: '2026-11-14T10:00:00.000Z' };
const textOf = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent ?? '';
};

/** Read more replaces the truncated text with the full text, like WhatsApp does. */
function wireReadMore() {
  document.querySelectorAll<HTMLElement>('.read-more-button').forEach((button) => {
    button.addEventListener('click', () => {
      const span = button.parentElement!.querySelector('span.selectable-text > span')!;
      span.innerHTML = JOB_ARCHITECT_SHORT.replace(/g…$/, 'g') + JOB_ARCHITECT_REST;
      button.remove();
    });
  });
}

/** Oldest first, as WhatsApp renders them. */
const standardChat = () =>
  chatPage([
    dateDivider('12/11/2026'),
    message({ id: 'M1', stamp: '9:00 am, 12/11/2026', sender: '+91 98000 00011', participant: '919800000011@c.us', html: JOB_ANGULAR }),
    systemNotice('M2'),
    message({ id: 'M3', stamp: '9:05 am, 12/11/2026', sender: 'Asha', html: REFERRAL_ASK }),
    dateDivider('Today'),
    message({ id: 'M4', stamp: '11:54 am, 13/11/2026', sender: 'Ravi HR', participant: '123456789012@lid', html: JOB_ARCHITECT_SHORT, readMore: true, forwarded: true }),
    message({ id: 'M5', stamp: '1:00 pm, 13/11/2026', sender: 'Me', html: JOB_NODE, out: true }),
    message({ id: 'M6', stamp: '2:00 pm, 13/11/2026', sender: 'Bob', html: CHIT_CHAT }),
    message({ id: 'M7', stamp: '2:48 pm, 13/11/2026', sender: '+91 98000 00001', html: JOB_NODE }),
  ]);

describe('WhatsApp message ids and stamps', () => {
  it('splits a data-id into chat, message and sender', () => {
    expect(parseDataId(`false_${GROUP_ID}_3EB0AB12_919800000001@c.us`)).toEqual({
      fromMe: false,
      chatId: GROUP_ID,
      messageId: '3EB0AB12',
      participant: '919800000001@c.us',
    });
    expect(parseDataId(`true_${GROUP_ID}_3EB0AB13`)).toEqual({ fromMe: true, chatId: GROUP_ID, messageId: '3EB0AB13' });
    expect(parseDataId('row-12')).toBeNull();
    expect(participantPhone('919800000001@c.us')).toBe('+919800000001');
    expect(participantPhone('123456789012@lid')).toBeUndefined();
  });

  it('reads time, date and sender from data-pre-plain-text', () => {
    expect(parsePrePlainText('[2:48 pm, 13/11/2026] +91 98000 00001: ')).toEqual({
      at: new Date(2026, 10, 13, 14, 48),
      sender: '+91 98000 00001',
    });
    // Month first is detected from a day above 12, whatever the locale says.
    expect(parsePrePlainText('[14:48, 11/13/2026] Jane: ', true)?.at).toEqual(new Date(2026, 10, 13, 14, 48));
    // Ambiguous dates follow the locale; a colon inside the name stays in the name.
    expect(parsePrePlainText('[10:05 am, 03/04/2026] A: B: ', true)).toEqual({ at: new Date(2026, 3, 3, 10, 5), sender: 'A: B' });
    expect(parsePrePlainText('[10:05 am, 03/04/2026] A: ', false)?.at).toEqual(new Date(2026, 2, 4, 10, 5));
    expect(parsePrePlainText('[12:30 am, 01/02/26] X: ')?.at).toEqual(new Date(2026, 1, 1, 0, 30));
    expect(parsePrePlainText('[2026-11-13 09:15] Y: ')?.at).toEqual(new Date(2026, 10, 13, 9, 15));
    expect(parsePrePlainText('[yesterday] Z: ')).toEqual({ sender: 'Z' });
    expect(parsePrePlainText('no stamp')).toBeNull();
  });

  it('detects the date order from the stamps on the page', () => {
    document.body.innerHTML = chatPage([message({ id: 'A', stamp: '9:00 am, 04/05/2026', html: 'x' }), message({ id: 'B', stamp: '9:00 am, 11/25/2026', html: 'y' })]);
    expect(detectDayFirst(findMessageElements(), true)).toBe(false);
    document.body.innerHTML = chatPage([message({ id: 'A', stamp: '9:00 am, 04/05/2026', html: 'x' })]);
    expect(detectDayFirst(findMessageElements(), false)).toBe(false);
    expect(detectDayFirst(findMessageElements(), true)).toBe(true);
  });
});

describe('WhatsApp chat parsing', () => {
  beforeEach(() => {
    document.body.innerHTML = standardChat();
  });

  it('finds one element per message inside #main, never the chat list', () => {
    expect(findMessageElements().map((el) => parseDataId(el.getAttribute('data-id'))?.messageId)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7']);
    expect(readChat()).toEqual({ name: 'MERN Jobs India', id: GROUP_ID });
    document.body.innerHTML = '<div id="app"><div id="side"></div></div>';
    expect(findMessageElements()).toEqual([]);
    expect(readChat()).toEqual({ name: null });
  });

  it('parses a job post: text with emoji and line breaks, contacts, experience, sender, time', () => {
    const post = parseMessage(findMessageElements()[6]!, ctx)!;
    expect(post.text).toBe(
      [
        'Frontend & Backend Developer (Node.js)',
        '📍 Location: Surat, Gujarat',
        '💼 Experience: 2 Years (Junior Level)',
        '💰 Salary: Up to ₹35,000/month',
        'Required Skills: Node.js, React',
        '📩 Interested candidates can share their updated CV at:',
        'hiring@example.com',
        '📞 98765 43210',
      ].join('\n'),
    );
    expect(post.emails).toEqual(['hiring@example.com']);
    expect(post.phones).toEqual(['+919876543210']);
    expect(post.experience).toEqual({ min: 2, max: 2 });
    expect(post.chat).toBe('MERN Jobs India');
    expect(post.sender).toEqual({ name: '+91 98000 00001', phone: '+919800000001' });
    expect(post.postedAt).toBe(new Date(2026, 10, 13, 14, 48).toISOString());
    expect(post.sightings).toEqual([
      {
        messageId: `false_${GROUP_ID}_M7_919800000001@c.us`,
        chat: 'MERN Jobs India',
        chatId: GROUP_ID,
        sender: '+91 98000 00001',
        senderPhone: '+919800000001',
        postedAt: post.postedAt,
      },
    ]);
    expect(post.id).toMatch(/^wa:[0-9a-z]+$/);
    expect(post.status).toBe('new');
  });

  it('skips your own messages and system notices', () => {
    const [, notice, , , own] = findMessageElements();
    expect(parseMessage(notice!, ctx)).toBeNull();
    expect(parseMessage(own!, ctx)).toBeNull();
  });

  it('keeps a LID sender without a phone, and marks forwarded messages', () => {
    const post = parseMessage(findMessageElements()[3]!, ctx)!;
    expect(post.sender).toEqual({ name: 'Ravi HR' });
    expect(post.sightings[0]!.forwarded).toBe(true);
    expect(post.experience).toEqual({ min: 8 });
  });

  it('takes the reply, not the quoted message, as the body', () => {
    document.body.innerHTML = chatPage([
      message({ id: 'Q1', stamp: '9:00 am, 13/11/2026', html: 'Is this still open? Please share the JD', quotedHtml: 'Hiring React developers, mail jobs@example.org' }),
    ]);
    const post = parseMessage(findMessageElements()[0]!, ctx)!;
    expect(post.text).toBe('Is this still open? Please share the JD');
    expect(post.emails).toEqual([]);
  });

  it('gives the same text the same id in any group, and keeps it after "Read more"', async () => {
    document.body.innerHTML = chatPage([
      message({ id: 'X1', stamp: '9:00 am, 13/11/2026', html: JOB_ANGULAR }),
      message({ id: 'X2', stamp: '9:30 am, 13/11/2026', html: JOB_ANGULAR, chatId: OTHER_GROUP_ID }),
    ]);
    const [a, b] = findMessageElements().map((el) => parseMessage(el, ctx)!);
    expect(a!.id).toBe(b!.id);
    expect(whatsappContentId('Hello  World!')).toBe(whatsappContentId('hello world'));

    document.body.innerHTML = standardChat();
    wireReadMore();
    const before = parseMessage(findMessageElements()[3]!, ctx)!;
    expect(before.text.endsWith('Lead, mentor, and g…')).toBe(true);
    expect(await expandReadMore()).toEqual([`false_${GROUP_ID}_M4_123456789012@lid`]);
    expect(await expandReadMore()).toEqual([]); // clicked once only
    const after = parseMessage(findMessageElements()[3]!, ctx)!;
    expect(after.text).toContain('Lead, mentor, and guide engineers.');
    expect(after.text).not.toMatch(/read more/i);
    expect(after.links).toEqual(['https://careers.example.com/apply/42']);
    expect(after.id).toBe(before.id);
  });
});

describe('WhatsApp job-post heuristics', () => {
  it('tells job posts from chat', () => {
    expect(isJobPost(textOf(JOB_NODE))).toBe(true);
    expect(isJobPost(JOB_ANGULAR)).toBe(true);
    expect(isJobPost(textOf(JOB_ARCHITECT_SHORT))).toBe(true);
    expect(isJobPost('Need React developer, 2 yrs exp, Pune. DM 9876543210')).toBe(true);
    expect(isJobPost(textOf(CHIT_CHAT))).toBe(false);
    expect(isJobPost(REFERRAL_ASK)).toBe(false);
    expect(isJobPost('ok thanks')).toBe(false);
  });

  it('reads the experience a post asks for', () => {
    expect(parseExperience('Experience: 8+ Years')).toEqual({ min: 8 });
    expect(parseExperience('💼 Experience: 2 Years (Junior Level)')).toEqual({ min: 2, max: 2 });
    expect(parseExperience('*Experience:* 6 to 7 Years')).toEqual({ min: 6, max: 7 });
    expect(parseExperience('Experience: 6 to 10 Years')).toEqual({ min: 6, max: 10 });
    expect(parseExperience('Exp: 2-4 yrs')).toEqual({ min: 2, max: 4 });
    expect(parseExperience('Exp - 3')).toEqual({ min: 3, max: 3 });
    expect(parseExperience('Minimum experience of 3 years in Node')).toEqual({ min: 3, max: 3 });
    expect(parseExperience('React dev 1-3 years, Node dev 5+ years')).toEqual({ min: 1 });
    expect(parseExperience('Freshers can apply')).toEqual({ min: 0, max: 0 });
    expect(parseExperience('Duration: 12 months contract')).toBeUndefined();
    expect(parseExperience('Experience: 18 months')).toBeUndefined();
    expect(parseExperience('Experience with Node.js 18 and React')).toBeUndefined();
    expect(parseExperience('CTC: ₹30 LPA – ₹40 LPA, founded 2015')).toBeUndefined();

    expect(experienceLabel({ min: 6, max: 7 })).toBe('6-7 yrs');
    expect(experienceLabel({ min: 8 })).toBe('8+ yrs');
    expect(experienceLabel({ min: 2, max: 2 })).toBe('2 yrs');
    expect(experienceLabel({ min: 0, max: 0 })).toBe('fresher');
    expect(fitsExperience({ min: 2, max: 4 }, 2)).toBe(true);
    expect(fitsExperience({ min: 6 }, 2)).toBe(false);
    expect(fitsExperience(undefined, 2)).toBe(true);
  });

  it('finds phone numbers, not dates, salaries, ids or links', () => {
    expect(extractPhones('📞 9876543210')).toEqual(['+919876543210']);
    expect(extractPhones('Call +91 98765 43210 or 080-4567 8901, +91-98765-43210 again')).toEqual(['+919876543210', '+918045678901']);
    expect(extractPhones('+1 (804) 555-0142')).toEqual(['+18045550142']);
    expect(extractPhones('98765 43210 91234 56789')).toEqual(['+919876543210', '+919123456789']);
    expect(extractPhones('CTC 6,00,000 - 9,00,000 on 13/11/2026, ref 1700000000000, 2026-11-13')).toEqual([]);
    expect(extractPhones('Apply https://example.com/jobs/9876543210 or a9876543210@example.com')).toEqual([]);
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    expect(whatsappLink('+919876543210')).toBe('https://wa.me/919876543210');
  });
});

describe('WhatsApp post merging', () => {
  const post = ({ messageId, chat, at, ...over }: Partial<WhatsAppPost> & { messageId: string; chat: string; at: string }): WhatsAppPost => ({
    id: 'wa:1',
    text: 'Hiring Node.js developer, 2 years, mail jobs@example.org',
    emails: ['jobs@example.org'],
    phones: [],
    links: [],
    chat,
    sender: { name: 'Ravi' },
    postedAt: at,
    sightings: [{ messageId, chat, sender: 'Ravi', postedAt: at }],
    capturedAt: '2026-11-14T10:00:00.000Z',
    lastSeenAt: '2026-11-14T10:00:00.000Z',
    matchedKeywords: [],
    excludedBy: [],
    status: 'new',
    ...over,
  });

  it('one row per text: sightings from every group, earliest first; status and notes kept', () => {
    const stored = { ...post({ messageId: 'm2', chat: 'Group B', at: '2026-11-13T09:00:00.000Z' }), status: 'contacted' as const, notes: 'mailed' };
    const incoming = post({
      messageId: 'm1',
      chat: 'Group A',
      at: '2026-11-12T09:00:00.000Z',
      text: 'Hiring Node.js developer, 2 years, mail jobs@example.org. Call 9876543210',
      phones: ['+919876543210'],
      lastSeenAt: '2026-11-15T10:00:00.000Z',
    });
    const merged = mergeWhatsAppPost(stored, incoming);
    expect(merged.sightings.map((s) => s.chat)).toEqual(['Group A', 'Group B']);
    expect(merged.chat).toBe('Group A');
    expect(merged.postedAt).toBe('2026-11-12T09:00:00.000Z');
    expect(merged.text).toContain('Call 9876543210');
    expect(merged.phones).toEqual(['+919876543210']);
    expect(merged.status).toBe('contacted');
    expect(merged.notes).toBe('mailed');
    expect(merged.capturedAt).toBe('2026-11-14T10:00:00.000Z');
    expect(merged.lastSeenAt).toBe('2026-11-15T10:00:00.000Z');
    // Seeing the same message again adds nothing.
    expect(mergeWhatsAppPost(merged, incoming).sightings).toHaveLength(2);
  });
});

const options: WhatsAppExtractOptions = { ...DEFAULT_SETTINGS.whatsapp, maxPosts: 2, moreBatch: 2, pauseMinMs: 0, pauseMaxMs: 0, scrollDelayMs: 20 };

function harness(older: string[][] = []) {
  const session: ChatSession = { chat: '', sent: new Map() };
  const batches: WhatsAppPost[][] = [];
  const messages: string[] = [];
  let loads = 0;
  const deps = {
    session,
    shouldStop: () => false,
    now: () => new Date(2026, 10, 14, 10, 0),
    send: async (posts: WhatsAppPost[]) => {
      batches.push(posts);
      return posts.length;
    },
    report: async (p: { message: string }) => {
      messages.push(p.message);
    },
    // Each scroll up prepends the next batch of older messages, until none are left.
    loadOlder: async () => {
      const next = older[loads++];
      if (!next) return false;
      document.querySelector('[role="application"]')!.insertAdjacentHTML('afterbegin', next.join(''));
      return true;
    },
  };
  const ids = () => batches.flat().map((p) => p.sightings[0]!.messageId.split('_')[2]);
  return { deps, batches, messages, ids };
}

describe('WhatsApp extraction loop', () => {
  beforeEach(() => {
    document.body.innerHTML = standardChat();
    wireReadMore();
  });

  it('Extract captures the newest job posts only, expanded, skipping chat, own and system messages', async () => {
    const h = harness();
    await runWhatsAppExtraction(options, 'fresh', h.deps);
    expect(h.ids()).toEqual(['M7', 'M4']);
    expect(h.batches.flat()[1]!.text).toContain('guide engineers');
    expect(h.messages.at(-1)).toMatch(/^Captured 2 of 2 job posts \(\d+ messages read, back to .+\)\. Press More for the next 2\.$/);
  });

  it('More walks back through older messages, then stops when nothing older loads', async () => {
    const h = harness([
      [message({ id: 'O1', stamp: '6:00 pm, 10/11/2026', html: JOB_NODE.replace('Surat', 'Pune') })],
    ]);
    await runWhatsAppExtraction(options, 'fresh', h.deps);
    await runWhatsAppExtraction(options, 'more', h.deps);
    expect(h.ids()).toEqual(['M7', 'M4', 'M1', 'O1']);
    await runWhatsAppExtraction(options, 'more', h.deps);
    expect(h.ids()).toHaveLength(4);
    expect(h.messages.at(-1)).toMatch(/^Captured 0 of 2 job posts\. No older messages loaded/);
  });

  it('stops at messages older than the day limit', async () => {
    const h = harness([[message({ id: 'OLD', stamp: '9:00 am, 01/09/2026', html: JOB_ANGULAR.replace('Remote', 'Pune') })]]);
    await runWhatsAppExtraction({ ...options, maxPosts: 10, maxAgeDays: 30 }, 'fresh', h.deps);
    expect(h.ids()).toEqual(['M7', 'M4', 'M1']);
    expect(h.messages.at(-1)).toMatch(/^Captured 3 job posts\. Reached messages older than 30 days/);
  });

  it('stores every text message when the job filter is off', async () => {
    const h = harness();
    await runWhatsAppExtraction({ ...options, maxPosts: 10, onlyJobPosts: false, scroll: false }, 'fresh', h.deps);
    expect(h.ids()).toEqual(['M7', 'M6', 'M4', 'M3', 'M1']);
  });

  it('starts over when another chat is open, and says so when no chat is open', async () => {
    const h = harness();
    await runWhatsAppExtraction(options, 'fresh', h.deps);
    document.body.innerHTML = chatPage([message({ id: 'N1', stamp: '9:00 am, 13/11/2026', html: JOB_ANGULAR, chatId: OTHER_GROUP_ID })], 'Other Jobs');
    await runWhatsAppExtraction(options, 'more', h.deps);
    expect(h.ids()).toEqual(['M7', 'M4', 'N1']);
    expect(h.batches.at(-1)![0]!.chat).toBe('Other Jobs');

    document.body.innerHTML = '<div id="app"></div>';
    await runWhatsAppExtraction(options, 'fresh', h.deps);
    expect(h.messages.at(-1)).toMatch(/^No messages found/);
  });
});

describe('WhatsApp page actions and diagnose', () => {
  it('loadOlder clicks "get older messages" and reports when older messages appear', async () => {
    document.body.innerHTML = standardChat();
    const list = document.querySelector('[role="application"]')!;
    list.insertAdjacentHTML('afterbegin', '<div role="row"><div role="button" class="_x">Click here to get older messages from your phone.</div></div>');
    const button = list.querySelector<HTMLElement>('[role="button"]')!;
    button.addEventListener('click', () => {
      button.remove(); // the phone sent its history; WhatsApp drops the button
      list.insertAdjacentHTML('afterbegin', message({ id: 'P0', stamp: '9:00 am, 01/11/2026', html: 'older' }));
    });
    expect(await loadOlder(500)).toBe(true);
    expect(await loadOlder(250)).toBe(false);
  });

  it('diagnose describes the structure without names, numbers or text', () => {
    document.body.innerHTML = standardChat();
    const report = diagnoseWhatsApp();
    expect(report.found).toEqual({ main: true, header: true, chatTitleMasked: 'XXXX Xxxx Xxxxx', chatKind: 'group' });
    expect(report.counts.messages).toBe(7);
    expect(report.counts.incoming).toBe(6);
    expect(report.counts.prePlainText).toBe(6);
    expect(report.counts.readMoreToggles).toBe(1);
    expect(report.parsed.jobPosts).toBe(3);
    expect(report.dataIdFormats).toContain('false_9@g.us_X_9@c.us');
    expect(report.prePlainFormats).toEqual(expect.arrayContaining(['[9:99 pm, 99/99/9999] <sender>: ', '[99:99 am, 99/99/9999] <sender>: ']));
    expect(report.messageOutline.length).toBeGreaterThan(5);
    const json = JSON.stringify(report);
    for (const secret of ['MERN', 'Surat', 'hiring@example.com', '98765', '98000', 'Ravi', '919800000001', '3EB0', 'M7']) {
      expect(json).not.toContain(secret);
    }
  });
});
