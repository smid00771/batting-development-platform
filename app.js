import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function clean(v: unknown) {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

function canonicalKey(v: string) {
  return clean(v)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ')
    .replace(/\bincorporated\b|\binc\.?\b|\bltd\.?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

function safeUrl(raw: string) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported URL');
  const host = url.hostname.toLowerCase();
  const blocked =
    host === 'localhost' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local') ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (blocked) throw new Error('Blocked URL');
  url.hash = '';
  return url;
}

const ignoredHosts = [
  'facebook.com','instagram.com','x.com','twitter.com','linkedin.com','youtube.com','wikipedia.org',
  'tripadvisor.com','yelp.com','yellowpages.com','google.com','bing.com','tiktok.com','reddit.com','pinterest.com',
  'playsport.com','cricconnect.com','findglocal.com'
];

function isIgnoredHost(host: string) {
  const h = host.toLowerCase().replace(/^www\./, '');
  return ignoredHosts.some(x => h === x || h.endsWith('.' + x));
}

function decodeHtml(s: string) {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#64;|&#x40;/gi, '@')
    .replace(/&#46;|&#x2e;/gi, '.');
}

function htmlToText(html: string) {
  return decodeHtml(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function innerTextWithAlt(html: string) {
  const alts = [...html.matchAll(/\b(?:alt|title)=["']([^"']+)["']/gi)].map(m => decodeHtml(m[1]));
  const text = decodeHtml(html.replace(/<[^>]+>/g, ' '));
  return clean([text, ...alts].join(' '));
}

async function fetchHtml(rawUrl: string, maxBytes = 700_000) {
  let url = safeUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    for (let hop = 0; hop < 5; hop++) {
      const response = await fetch(url.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'BattingDevelopmentPlatform/1.1 market-discovery',
          'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.2',
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error(`Redirect ${response.status} without location`);
        url = safeUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('text/html')) throw new Error('Not HTML');
      const html = (await response.text()).slice(0, maxBytes);
      return { html, finalUrl: url };
    }
    throw new Error('Too many redirects');
  } finally {
    clearTimeout(timer);
  }
}

function titleFromHtml(html: string, fallback = '') {
  const h1 = decodeHtml(html.match(/<h1\b[^>]*>([\s\S]{0,300}?)<\/h1>/i)?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const title = decodeHtml(html.match(/<title\b[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  let name = h1 || title || fallback;
  name = name.replace(/\s+[|–—-]\s+(home|official website|homepage|welcome).*$/i, '')
             .replace(/\s+[|–—-]\s+.*$/i, '')
             .trim();
  return name || fallback;
}

function allAnchors(html: string, base: URL) {
  const out: { url: string; text: string; external: boolean; context: string }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const u = safeUrl(new URL(m[1], base).toString());
      const text = innerTextWithAlt(m[2]);
      const idx = m.index || 0;
      const around = htmlToText(html.slice(Math.max(0, idx - 800), Math.min(html.length, idx + m[0].length + 800)));
      out.push({ url: u.toString(), text, external: u.origin !== base.origin, context: around });
    } catch { /* malformed or blocked */ }
  }
  return out;
}

function contactLinkScore(link: { url: string; text: string }) {
  const hay = `${link.text} ${link.url}`.toLowerCase();
  let score = 0;
  if (/secretar|committee|official|executive|board/.test(hay)) score += 8;
  if (/contact|get-in-touch/.test(hay)) score += 7;
  if (/about|club-info|who-we-are/.test(hay)) score += 4;
  if (/privacy|terms|shop|fixture|result|news|gallery/.test(hay)) score -= 6;
  return score;
}

function clubDirectoryLinkScore(link: { url: string; text: string }) {
  const hay = `${link.text} ${link.url}`.toLowerCase();
  let score = 0;
  if (/our[-\s]?clubs|member[-\s]?clubs|affiliated[-\s]?clubs|club[-\s]?directory|find[-\s]?a[-\s]?club/.test(hay)) score += 18;
  if (/\bclubs?\b/.test(hay)) score += 9;
  if (/premier|suburban|women|junior|senior/.test(hay)) score += 3;
  if (/contact|privacy|terms|fixture|result|news|gallery|shop|sponsor/.test(hay)) score -= 7;
  return score;
}

function normaliseEmail(raw: string) {
  return raw.trim().replace(/^mailto:/i, '').split('?')[0].toLowerCase();
}

function plausibleEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return false;
  if (/example\.|test\.|noreply|no-reply|donotreply|wordpress|sentry|cloudflare/i.test(email)) return false;
  if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(email)) return false;
  return true;
}

function roleFromContext(context: string) {
  const c = context.toLowerCase();
  if (/secretar/.test(c)) return { role: 'Club Secretary', score: 35 };
  if (/president/.test(c)) return { role: 'Club President', score: 23 };
  if (/chair(man|person)?/.test(c)) return { role: 'Club Chair', score: 20 };
  if (/admin(istrator)?|club manager/.test(c)) return { role: 'Club Administrator', score: 17 };
  if (/treasurer/.test(c)) return { role: 'Club Treasurer', score: 12 };
  if (/contact|enquir|info@/.test(c)) return { role: 'General club contact', score: 8 };
  return { role: 'Public club contact', score: 3 };
}

function extractEmails(html: string, sourceUrl: string) {
  const text = htmlToText(html)
    .replace(/\s+\[at\]\s+|\s+\(at\)\s+/gi, '@')
    .replace(/\s+\[dot\]\s+|\s+\(dot\)\s+/gi, '.');
  const candidates = new Map<string, { email: string; role: string; score: number; source_url: string }>();

  for (const m of html.matchAll(/mailto:([^"'?#\s<>]+)/gi)) {
    const email = normaliseEmail(m[1]);
    if (!plausibleEmail(email)) continue;
    const idx = text.toLowerCase().indexOf(email.toLowerCase());
    const ctx = idx >= 0 ? text.slice(Math.max(0, idx - 240), idx + email.length + 240) : text.slice(0, 480);
    const r = roleFromContext(ctx);
    candidates.set(email, { email, role: r.role, score: r.score + 8, source_url: sourceUrl });
  }
  for (const m of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    const email = normaliseEmail(m[0]);
    if (!plausibleEmail(email)) continue;
    const idx = m.index || 0;
    const ctx = text.slice(Math.max(0, idx - 240), idx + email.length + 240);
    const r = roleFromContext(ctx);
    const current = candidates.get(email);
    if (!current || r.score > current.score) candidates.set(email, { email, role: r.role, score: r.score, source_url: sourceUrl });
  }
  return [...candidates.values()].sort((a, b) => b.score - a.score);
}

async function braveSearch(apiKey: string, query: string, country = 'AU', count = 20) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('country', country);
  url.searchParams.set('search_lang', 'en');
  url.searchParams.set('ui_lang', country === 'AU' ? 'en-AU' : 'en-US');
  url.searchParams.set('count', String(Math.max(1, Math.min(20, count))));
  url.searchParams.set('safesearch', 'moderate');
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': apiKey },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Brave Search returned ${response.status}: ${body.slice(0, 180)}`);
  }
  return await response.json();
}

function associationish(name: string) {
  const n = clean(name);
  return /cricket/i.test(n) && /(association|council|league|district|zone|premier|shires|competition)/i.test(n);
}

function associationAcronym(name: string) {
  const words = clean(name).split(/\s+/).filter(w => !/^(and|of|the|inc|incorporated)$/i.test(w));
  return words.map(w => w[0] || '').join('').toUpperCase();
}

function obviousNonClubName(raw: string, associationName = '') {
  const n = clean(raw).toLowerCase();
  if (!n) return true;
  const assoc = clean(associationName).toLowerCase();
  if (assoc && (n === assoc || canonicalKey(n) === canonicalKey(assoc))) return true;
  if (/^(home|about|about us|contact|contact us|resources?|documents?|links?|news|policies|fixtures?|results?|ladders?|registration|shop|gallery|committee|sponsors?|partners?|play cricket|get in touch|learn more|read more|click here|image|affiliates?|club history|history|mens?|men's|womens?|women's|juniors?|seniors?|premier grade|suburban districts?|our competitions|our clubs|member clubs|find your local club)( cricket club)?$/i.test(n)) return true;
  if (/\b(cricket australia|cricket nsw|cricket new south wales|new south wales cricket|country cricket nsw|playhq|mycricket)\b/i.test(n)) return true;
  if (/\b(association|council|league|zone|competition|umpires?|scorers?)\b/i.test(n)) return true;
  if (/^(cricket|cricket club|club|clubs)$/i.test(n)) return true;
  if (/^(affiliates?|club history|mens?|womens?|women's|premier|suburban|junior|senior)\s+cricket club$/i.test(n)) return true;
  return false;
}

function clubishName(raw: string, context = '', associationName = '') {
  let n = clean(raw)
    .replace(/^(about|welcome to|home of)\s+/i, '')
    .replace(/\b(open|visit|website|more info|learn more|read more|click here)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  if (!n || n.length < 2 || n.length > 90 || obviousNonClubName(n, associationName)) return '';

  const clubContext = /our clubs|member clubs|affiliated clubs|premier grade clubs|women'?s clubs|suburban districts clubs|club directory|clubs playing|member club/i.test(context);
  const explicitClub = /\bcricket\s+club\b|\bdistrict\s+cricket\b|(?:^|[\s(])(?:cc|dcc)(?:$|[\s)])/i.test(n);

  // A generic occurrence of the word "cricket" is not enough. That was the source
  // of false clubs such as "Cricket Australia" and menu labels near an Our Clubs block.
  if (!explicitClub && !clubContext) return '';

  if (!/\bcricket\b/i.test(n) && clubContext) n = `${n} Cricket Club`;
  if (obviousNonClubName(n, associationName)) return '';
  return clean(n);
}

function cleanAssociationSearchTitle(title: string) {
  return clean(title)
    .replace(/\s+[|–—-]\s+.*$/,'')
    .replace(/\s+\|\s+.*$/,'')
    .replace(/\s+-\s+Home$/i,'')
    .trim();
}


function explicitClubSectionHtml(html: string) {
  // Find a genuine content heading for the club directory, not a footer/menu occurrence.
  // NDCA is a good example: "Our Clubs" -> "Fixtures and Results".
  const headingRe = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const headings: { start: number; end: number; level: number; text: string }[] = [];
  for (const m of html.matchAll(headingRe)) {
    const text = htmlToText(m[2] || '');
    headings.push({ start: m.index || 0, end: (m.index || 0) + m[0].length, level: Number(m[1]), text });
  }

  const startHeading = headings.find(h =>
    /^(our clubs|member clubs|affiliated clubs|club directory|find your local club)$/i.test(clean(h.text))
  );
  if (!startHeading) return '';

  // End at the next clearly unrelated major content heading. This keeps footer/menu links,
  // sponsors and generic site navigation out of the authoritative membership segment.
  const endHeading = headings.find(h =>
    h.start > startHeading.start &&
    /^(fixtures? and results?|fixtures?|results?|ladders?|registration|partners?|sponsors?|contact us|contact|news|resources?)$/i.test(clean(h.text))
  );

  const hardEnd = endHeading ? endHeading.start : Math.min(html.length, startHeading.start + 180_000);
  const section = html.slice(startHeading.start, hardEnd);
  const sectionText = htmlToText(section);

  // A single "Our Clubs" heading in a footer is not enough. Require another club-directory signal.
  const strongSignals = [
    /click on a club.?s logo/i,
    /premier grade clubs/i,
    /women'?s clubs/i,
    /suburban districts clubs/i,
    /member clubs/i,
    /affiliated clubs/i,
  ].filter(r => r.test(sectionText)).length;
  return strongSignals >= 1 ? section : '';
}

function cleanLogoLabel(raw: string) {
  return clean(raw)
    .replace(/\b(official\s+)?logo\b/gi, ' ')
    .replace(/\bclub\s+logo\b/gi, ' ')
    .replace(/\bnew\s+logo\b/gi, ' ')
    .replace(/\bimage\b/gi, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function imageFilenameLabel(innerHtml: string) {
  const m = innerHtml.match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
  if (!m) return '';
  try {
    const u = new URL(decodeHtml(m[1]), 'https://placeholder.invalid/');
    const base = decodeURIComponent(u.pathname.split('/').pop() || '')
      .replace(/\.(png|jpe?g|webp|gif|svg)$/i, '')
      .replace(/[-_]\d{2,4}x\d{2,4}$/i, '')
      .replace(/\b(logo|crest|badge|transparent|primary|secondary|hr|final|new|image|cropped)\b/gi, ' ')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return base;
  } catch { return ''; }
}

function forbiddenClubTarget(host: string, pathname = '') {
  const h = host.toLowerCase().replace(/^www\./, '');
  if (isIgnoredHost(h)) return true;
  if (/^(cricket\.com\.au|cricketnsw\.com\.au|playhq\.com|play\.cricket\.com\.au)$/.test(h)) return true;
  if (/\.(png|jpe?g|webp|gif|svg|pdf|docx?|xlsx?|zip)$/i.test(pathname)) return true;
  return false;
}

function genericRegistryOrDirectoryUrl(rawUrl: string) {
  try {
    const u = safeUrl(rawUrl);
    const h = u.hostname.toLowerCase().replace(/^www\./,'');
    const path = u.pathname.replace(/\/+$/,'') || '/';
    if (h === 'play.cricket.com.au' && path === '/') return true;
    if (h === 'playhq.com' || h === 'www.playhq.com') return true;
    if (h === 'cricket.com.au' || h === 'www.cricket.com.au') return true;
    return false;
  } catch { return true; }
}

function obviousForeignContext(text: string) {
  const t = clean(text).toLowerCase();
  const australian = /\baustralia\b|\bnew south wales\b|\bnsw\b|\bnewcastle\b|\blake macquarie\b|\bhunter\b/.test(t);
  if (australian) return false;
  return /\bcanada\b|\bontario\b|\btoronto\s*(?:&|and)\s*district\b|\bengland\b|\bunited kingdom\b|\buk\b|\bnew zealand\b|\bsouth africa\b|\bindia\b|\bpakistan\b|\bsri lanka\b/.test(t);
}

function obviousForeignHostForAustralia(host: string) {
  const h = host.toLowerCase().replace(/^www\./,'');
  return /\.(ca|co\.uk|org\.uk|uk|co\.nz|nz|co\.za|za|in|pk|lk)$/.test(h);
}

function pageLooksForeignForAustralianAdapter(html: string, finalUrl = '') {
  let host = '';
  try { host = new URL(finalUrl).hostname; } catch { /* ignore */ }
  if (host && obviousForeignHostForAustralia(host)) return true;
  const sample = `${headTitle(html)} ${htmlToText(html).slice(0,9000)}`;
  return obviousForeignContext(sample);
}

function usableLogoLabel(raw: string, associationName: string) {
  const n = cleanLogoLabel(raw);
  if (!n || n.length < 2 || n.length > 80) return '';
  if (obviousNonClubName(n, associationName)) return '';
  if (/^(welcome|welcome to|your cricket,? your way|club news(?: & | and )events|acknowledgement of country|be pythonic|membership|partners?|seniors?|juniors?)$/i.test(n)) return '';
  if (/^(slide|image|photo|banner|home)\b/i.test(n)) return '';
  return n;
}

function extractExternalUrlsFromSection(section: string, pageUrl: string, associationOrigin: string) {
  const base = safeUrl(pageUrl);
  const found = new Map<string, { url: string; evidence: string }>();

  const add = (raw: string, evidence: string) => {
    try {
      const decoded = decodeHtml(raw).replace(/\\\//g, '/').replace(/&quot;/gi, '"');
      const u = safeUrl(new URL(decoded, base).toString());
      if (u.origin === associationOrigin) return;
      if (forbiddenClubTarget(u.hostname, u.pathname)) return;
      const origin = u.origin + '/';
      if (!found.has(origin)) found.set(origin, { url: origin, evidence });
    } catch { /* ignore */ }
  };

  // Standard anchors.
  for (const m of section.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) add(m[1], 'href');

  // Elementor/slider widgets often store links in data-settings JSON rather than the visible anchor.
  for (const m of section.matchAll(/https?:\\?\/\\?\/[^"'<>\\\s]+/gi)) add(m[0], 'embedded_url');

  return [...found.values()];
}

function clubGroupHeadingAt(section: string, index: number) {
  const before = section.slice(0, Math.max(0,index));
  const headings: string[] = [];
  for (const m of before.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)) {
    const text = clean(htmlToText(m[1] || ''));
    if (text) headings.push(text);
  }
  const acceptable = headings.filter(h =>
    /(?:clubs?|teams?)$/i.test(h) &&
    !/^(our clubs|member clubs|affiliated clubs|club directory)$/i.test(h)
  );
  const chosen = acceptable.at(-1) || headings.filter(h => /^(member clubs|affiliated clubs|club directory)$/i.test(h)).at(-1) || '';
  return clean(chosen);
}

function sectionCategory(sectionName: string) {
  const s = clean(sectionName).toLowerCase();
  if (/premier|first grade|1st grade|top grade|championship|division\s*1|division one/.test(s)) return 'competitive_senior';
  if (/women|men|senior|open grade|grade clubs?/.test(s)) return 'general_senior';
  if (/suburban|social|recreational|community|casual/.test(s)) return 'social_recreational';
  if (/junior|youth|under\s*\d|u\d{2}/.test(s)) return 'junior_only';
  if (/veteran|masters?/.test(s)) return 'veterans_only';
  return 'unknown';
}

function qualificationFromSections(sections: string[]) {
  const cleanSections = [...new Set((sections || []).map(clean).filter(Boolean))];
  const cats = [...new Set(cleanSections.map(sectionCategory))];
  const joined = cleanSections.join(' · ');
  if (cats.includes('competitive_senior')) return {
    club_type:'competitive_senior', outreach_fit:'strong',
    reason: joined ? `Official cricket source lists the club under ${joined}.` : 'Official source indicates competitive senior cricket.'
  };
  if (cats.includes('general_senior')) return {
    club_type:'general_senior', outreach_fit:'possible',
    reason: joined ? `Official cricket source lists the club under ${joined}.` : 'Official source indicates senior cricket.'
  };
  if (cats.includes('social_recreational')) return {
    club_type:'social_recreational', outreach_fit:'low',
    reason: joined ? `Official cricket source lists the club under ${joined}.` : 'Official source indicates social or recreational cricket.'
  };
  if (cats.includes('junior_only')) return {
    club_type:'junior_only', outreach_fit:'low',
    reason: joined ? `Official cricket source lists the club under ${joined}.` : 'Official source currently indicates junior cricket only.'
  };
  if (cats.includes('veterans_only')) return {
    club_type:'veterans_only', outreach_fit:'low',
    reason: joined ? `Official cricket source lists the club under ${joined}.` : 'Official source currently indicates veterans cricket only.'
  };
  return { club_type:'unknown', outreach_fit:'review', reason: joined ? `Mapped from official section: ${joined}.` : 'Club type needs review.' };
}

function normaliseResolvedClubName(raw: string) {
  let n = clean(raw)
    .replace(/^(about(?: us)?|welcome to|home(?: of)?|club profile)\s*[:|–—-]?\s*/i,'')
    .replace(/\bcricket\s+club\s+cricket\s+club\b/gi,'Cricket Club')
    .replace(/\bdistrict\s+cricket\s+club\s+cricket\s+club\b/gi,'District Cricket Club')
    .replace(/\s+/g,' ')
    .trim();
  // Remove duplicated adjacent trailing words produced by page-title + logo combinations.
  n = n.replace(/\b(Cricket Club)(?:\s+\1)+$/i,'$1');
  // Search-result headlines sometimes append article copy directly after the real club name.
  // Keep the identity and discard obvious descriptive headline text.
  n = n.replace(/^(.*?\bCricket Club)\s+(?:creating|welcomes?|announces?|registrations?|registration|news|fixtures?|results?|homepage|official website|juniors?|seniors?|season|pathway|celebrates?)\b.*$/i,'$1');
  return clean(n);
}

function candidateWebsiteHost(candidate: any) {
  try { return new URL(clean(candidate.website_url)).hostname.toLowerCase().replace(/^www\./,''); }
  catch { return ''; }
}

function mergeCandidateEvidence(a: any, b: any) {
  if (!a) return b;
  if (!b) return a;
  const sections = [...new Set([...(a.source_sections || []), ...(b.source_sections || [])].map(clean).filter(Boolean))];
  const categories = [...new Set([...(a.source_categories || []), ...(b.source_categories || [])].map(clean).filter(Boolean))];
  const chooseB = (!clean(a.website_url) && clean(b.website_url)) ||
    (normaliseResolvedClubName(b.name || '').length > 0 && normaliseResolvedClubName(a.name || '').length === 0);
  const base = chooseB ? { ...a, ...b } : { ...b, ...a };
  base.source_sections = sections;
  base.source_categories = categories;
  base.metadata = { ...(a.metadata || {}), ...(b.metadata || {}), source_sections: sections, source_categories: categories };
  return base;
}

function extractAustralianRegistryEvidenceFromHtml(html: string) {
  const decoded = decodeHtml(html).replace(/\\\//g,'/');
  const match = decoded.match(/https?:\/\/(?:www\.)?playhq\.com\/cricket-australia\/org\/([a-z0-9-]+)\/([a-z0-9-]+)/i);
  if (match) {
    return {
      registry_provider:'PlayHQ / Cricket Australia',
      registry_url:`https://www.playhq.com/cricket-australia/org/${match[1]}/${match[2]}`,
      registry_external_id:match[2]
    };
  }
  return null;
}

function extractOfficialClubLogoLinks(html: string, pageUrl: string, associationOrigin: string, associationName: string) {
  const section = explicitClubSectionHtml(html);
  if (!section) return [] as any[];
  const base = safeUrl(pageUrl);
  const out = new Map<string, any>();

  // True logo -> club links are ideal evidence. Preserve the source subgroup heading
  // (e.g. Premier Grade Clubs / Women's Clubs / Suburban Districts Clubs).
  for (const m of section.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const inner = m[2] || '';
    if (!/<img\b/i.test(inner)) continue;
    try {
      const target = safeUrl(new URL(decodeHtml(m[1]), base).toString());
      if (target.origin === associationOrigin || forbiddenClubTarget(target.hostname, target.pathname)) continue;

      const sectionName = clubGroupHeadingAt(section, m.index || 0);
      if (!sectionName) continue;
      const category = sectionCategory(sectionName);
      const altOrTitle = cleanLogoLabel(innerTextWithAlt(inner));
      const fileLabel = cleanLogoLabel(imageFilenameLabel(inner));
      const label = usableLogoLabel(altOrTitle, associationName) || usableLogoLabel(fileLabel, associationName);
      const origin = target.origin + '/';
      const incoming = {
        name_hint: label,
        website_url: origin,
        source_url: pageUrl,
        source_label: 'Official association club-logo directory',
        source_sections:[sectionName],
        source_categories:[category],
        metadata: {
          discovery_method: 'official_logo_link',
          authoritative_membership: true,
          raw_label: label,
          target_evidence: 'image_anchor',
          source_sections:[sectionName],
          source_categories:[category]
        },
      };
      out.set(origin, mergeCandidateEvidence(out.get(origin), incoming));
    } catch { /* skip malformed link */ }
  }

  // Completeness pass: some sliders expose a logo but hide its destination link in JavaScript.
  // The logo itself is still valid membership evidence, but we only accept images that sit under
  // an explicit club subgroup heading. We resolve the website later from the logo identity.
  const knownHints = new Set([...out.values()].map((x:any)=>canonicalKey(x.name_hint || '')).filter(Boolean));
  for (const m of section.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0] || '';
    const sectionName = clubGroupHeadingAt(section, m.index || 0);
    if (!sectionName) continue;
    const category = sectionCategory(sectionName);
    const alt = cleanLogoLabel(tag.match(/\balt=["']([^"']+)["']/i)?.[1] || tag.match(/\btitle=["']([^"']+)["']/i)?.[1] || '');
    const file = cleanLogoLabel(imageFilenameLabel(tag));
    const label = usableLogoLabel(alt, associationName) || usableLogoLabel(file, associationName);
    const hintKey = canonicalKey(label);
    if (!label || !hintKey || knownHints.has(hintKey)) continue;
    knownHints.add(hintKey);
    const key=`hint:${hintKey}`;
    out.set(key, {
      name_hint: label,
      website_url: '',
      source_url: pageUrl,
      source_label: 'Official association club-logo directory',
      source_sections:[sectionName],
      source_categories:[category],
      metadata: {
        discovery_method: 'official_logo_image_only',
        authoritative_membership: true,
        target_evidence: 'club_section_image',
        source_sections:[sectionName],
        source_categories:[category]
      },
    });
  }

  return [...out.values()];
}

function headTitle(html: string) {
  return clean(decodeHtml(html.match(/<title\b[^>]*>([\s\S]{0,500}?)<\/title>/i)?.[1] || '').replace(/<[^>]+>/g,' '));
}

function metaContent(html: string, key: RegExp) {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!key.test(tag)) continue;
    const c = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1] || '';
    if (c) return clean(decodeHtml(c));
  }
  return '';
}

function headingTexts(html: string) {
  const out: string[] = [];
  for (const m of html.matchAll(/<h[1-3]\b[^>]*>([\s\S]{0,500}?)<\/h[1-3]>/gi)) {
    const t = clean(decodeHtml(m[1]).replace(/<[^>]+>/g,' '));
    if (t) out.push(t);
    if (out.length >= 10) break;
  }
  return out;
}

function genericSitePhrase(raw: string) {
  const n = clean(raw).toLowerCase().replace(/[.!]+$/,'');
  if (!n) return true;
  return /^(home|welcome|welcome to|your cricket,? your way|club news(?: & | and )events|acknowledgement of country|be pythonic|news|events|about us|our club|our story|membership|partners?|seniors?|juniors?|contact us|play cricket)$/i.test(n);
}

function explicitClubIdentity(raw: string, associationName: string) {
  const original = clean(raw);
  if (!original) return '';

  // Page titles often look like "Home - Newcastle City Cricket Club" or
  // "Club News & Events | Newcastle City Cricket Club". Evaluate each title segment
  // independently instead of accidentally treating the page title as the club name.
  const variants = [
    original,
    ...original.split(/\s+[|–—-]\s+/).map(x => clean(x)),
  ];

  const strongIdentity = (value: string) =>
    /\bcricket\s+club\b/i.test(value) ||
    /\bdistrict\s+cricket\s+club\b/i.test(value) ||
    /\b(?:c\.?c\.?|d\.?c\.?c\.?)\b/i.test(value) ||
    /^cricket\s+[A-Z][A-Za-z0-9 '&.-]+$/i.test(value);

  const candidates = variants
    .map(v => clean(v).replace(/^(home|welcome to|about(?: us)?|our club)\s*[-:|]?\s*/i,'').trim())
    .filter(v => v && v.length >= 3 && v.length <= 120)
    .filter(v => !genericSitePhrase(v) && !obviousNonClubName(v, associationName))
    .filter(strongIdentity)
    .sort((a,b) => {
      // Prefer the concise segment that actually names the club.
      const aExplicit = /\bcricket\s+club\b|\bdistrict\s+cricket\s+club\b/i.test(a) ? 1 : 0;
      const bExplicit = /\bcricket\s+club\b|\bdistrict\s+cricket\s+club\b/i.test(b) ? 1 : 0;
      return bExplicit - aExplicit || a.length - b.length;
    });

  return candidates[0] || '';
}

function clubIdentityCandidatesFromHtml(html: string, associationName: string) {
  const raw = [
    metaContent(html, /\bproperty=["']og:site_name["']/i),
    metaContent(html, /\bname=["']application-name["']/i),
    headTitle(html),
    ...headingTexts(html),
  ].filter(Boolean);

  const scored: { name: string; score: number; source: string }[] = [];
  raw.forEach((r, i) => {
    const name = explicitClubIdentity(r, associationName);
    if (!name) return;
    let score = 0;
    if (/\bcricket\s+club\b/i.test(name)) score += 30;
    if (/\bdistrict\s+cricket\s+club\b/i.test(name)) score += 10;
    if (/\b(?:cc|dcc)\b/i.test(name)) score += 8;
    if (/^cricket\s+/i.test(name)) score += 12;
    // Metadata/title is generally safer than an arbitrary page heading.
    if (i <= 2) score += 10;
    scored.push({ name, score, source: i === 0 ? 'og_site_name' : i === 1 ? 'application_name' : i === 2 ? 'title' : 'heading' });
  });
  return scored.sort((a,b)=>b.score-a.score);
}

async function resolveClubIdentityByHostSearch(apiKey: string, websiteUrl: string, associationName: string) {
  let host = '';
  try { host = new URL(websiteUrl).hostname.replace(/^www\./,''); } catch { return null; }
  const queries = [`site:${host} "cricket club"`, `site:${host} cricket`];
  for (const q of queries) {
    try {
      const data = await braveSearch(apiKey, q, 'AU', 10);
      for (const r of data?.web?.results || []) {
        let sameHost = false;
        try { sameHost = new URL(clean(r.url)).hostname.replace(/^www\./,'') === host; } catch { /* ignore */ }
        if (!sameHost) continue;
        const name = explicitClubIdentity(cleanAssociationSearchTitle(clean(r.title)), associationName);
        if (name) return { name, source: 'host_search', evidence: clean(r.url) };
      }
    } catch { /* try next query */ }
  }
  return null;
}

async function resolveAuthoritativeImageHint(apiKey: string, candidate: any, associationName: string) {
  const hint = usableLogoLabel(candidate.name_hint || '', associationName);
  if (!hint) return null;

  // Membership has already been proven by the official association directory. Search is
  // only allowed to resolve that known member's own site. Ambiguous names such as Toronto
  // must not jump continents merely because a foreign club has stronger SEO.
  const queries = [
    `\"${hint}\" \"${associationName}\"`,
    `\"${hint}\" cricket NSW Australia`,
  ];
  const scored: any[] = [];
  const associationTokens = canonicalKey(associationName).split('-').filter(x=>x.length > 3);
  const hintTokens = canonicalKey(hint).split('-').filter(x=>x.length > 2);

  for (const q of queries) {
    try {
      const data = await braveSearch(apiKey, q, 'AU', 10);
      for (const r of data?.web?.results || []) {
        const rawUrl = clean(r.url); if (!rawUrl) continue;
        let u: URL;
        try { u = safeUrl(rawUrl); } catch { continue; }
        if (forbiddenClubTarget(u.hostname, u.pathname) || genericRegistryOrDirectoryUrl(rawUrl)) continue;

        const title = cleanAssociationSearchTitle(clean(r.title));
        const description = clean(r.description);
        const hay = `${title} ${description} ${u.hostname}`.toLowerCase();
        if (obviousForeignHostForAustralia(u.hostname) || obviousForeignContext(hay)) continue;

        const explicit = explicitClubIdentity(title, associationName);
        let score = hintTokens.filter(t=>hay.includes(t)).length * 6;
        score += associationTokens.filter(t=>hay.includes(t)).length * 2;
        if (/\bnsw\b|new south wales|newcastle|lake macquarie|australia/i.test(hay)) score += 9;
        if (/cricket/i.test(hay)) score += 4;
        if (/club|\bcc\b|\bdcc\b/i.test(hay)) score += 2;
        if (explicit) score += 12;
        if (/news|article|directory|results|fixtures/i.test(hay)) score -= 4;
        scored.push({ score, url: u.origin + '/', rawUrl, title, explicit });
      }
    } catch { /* continue */ }
  }

  scored.sort((a,b)=>b.score-a.score);
  const best = scored.find(x=>x.score >= 15);
  if (!best) {
    const direct = explicitClubIdentity(hint, associationName);
    if (!direct && genericSitePhrase(hint)) return null;
    return {
      ...candidate,
      name: direct || hint,
      website_url: '',
      metadata: {
        ...(candidate.metadata || {}),
        resolved_identity_source: 'association_logo_label_unresolved',
        needs_website_review: true,
        clear_existing_website: true
      }
    };
  }

  return {
    ...candidate,
    name: best.explicit || explicitClubIdentity(hint, associationName) || hint,
    website_url: best.url,
    metadata: {
      ...(candidate.metadata || {}),
      resolved_identity_source: best.explicit ? 'authoritative_logo_host_search' : 'association_logo_label',
      resolved_identity_evidence: best.rawUrl,
      resolved_search_title: best.title,
      website_verified_for_au: true
    }
  };
}

async function resolveOfficialLogoCandidate(candidate: any, associationName: string, apiKey: string) {
  if (!clean(candidate.website_url)) {
    const resolved = await resolveAuthoritativeImageHint(apiKey, candidate, associationName);
    if (!resolved) return null;
    return { ...resolved, name: normaliseResolvedClubName(resolved.name || '') };
  }

  let html = '';
  let fetchedUrl = candidate.website_url;
  try {
    const fetched = await fetchHtml(candidate.website_url, 500_000);
    html = fetched.html;
    fetchedUrl = fetched.finalUrl.toString();
  } catch { /* search/label fallback below */ }

  const registry = html ? extractAustralianRegistryEvidenceFromHtml(html) : null;

  // A link can be syntactically valid yet still be the wrong club (e.g. Toronto, Canada)
  // or a generic registry landing page. In that case, discard it and resolve from the
  // authoritative logo identity instead.
  if (genericRegistryOrDirectoryUrl(candidate.website_url) || (html && pageLooksForeignForAustralianAdapter(html, fetchedUrl))) {
    const resolved = await resolveAuthoritativeImageHint(apiKey, { ...candidate, website_url: '' }, associationName);
    if (resolved) {
      resolved.metadata = { ...(resolved.metadata || {}), rejected_original_website: candidate.website_url, clear_existing_website: !clean(resolved.website_url) };
      return { ...resolved, name: normaliseResolvedClubName(resolved.name || '') };
    }
    const fallbackName = explicitClubIdentity(candidate.name_hint || '', associationName) || usableLogoLabel(candidate.name_hint || '', associationName);
    if (!fallbackName) return null;
    return {
      ...candidate,
      name: normaliseResolvedClubName(fallbackName),
      website_url: '',
      metadata: { ...(candidate.metadata || {}), rejected_original_website: candidate.website_url, clear_existing_website: true, needs_website_review: true }
    };
  }

  if (html) {
    const identities = clubIdentityCandidatesFromHtml(html, associationName);
    if (identities.length) {
      const best = identities[0];
      return {
        ...candidate,
        ...registry,
        name: normaliseResolvedClubName(best.name),
        website_url: new URL(fetchedUrl).origin + '/',
        metadata: {
          ...(candidate.metadata || {}),
          resolved_identity_source: best.source,
          resolved_identity_score: best.score,
          resolved_home_title: headTitle(html),
          ...(registry ? { registry_evidence:'club_website_playhq_link' } : {})
        }
      };
    }
  }

  // A logo label from an explicit association club section is useful membership evidence,
  // but only use it as a name if it is meaningful — never a generic page slogan.
  const label = usableLogoLabel(candidate.name_hint || '', associationName);
  if (label) {
    const explicit = explicitClubIdentity(label, associationName);
    if (explicit) {
      return {
        ...candidate,
        ...registry,
        name: normaliseResolvedClubName(explicit),
        metadata: {
          ...(candidate.metadata || {}),
          resolved_identity_source: 'association_logo_label',
          ...(registry ? { registry_evidence:'club_website_playhq_link' } : {})
        }
      };
    }
  }

  // If the club homepage uses a generic H1/title, resolve its identity by the already-authoritative
  // destination domain. Search helps name the member; it does NOT decide membership.
  const searched = await resolveClubIdentityByHostSearch(apiKey, candidate.website_url, associationName);
  if (searched?.name) {
    return {
      ...candidate,
      ...registry,
      name: normaliseResolvedClubName(searched.name),
      metadata: {
        ...(candidate.metadata || {}),
        resolved_identity_source: searched.source,
        resolved_identity_evidence: searched.evidence,
        unresolved_logo_label: label || candidate.name_hint || '',
        ...(registry ? { registry_evidence:'club_website_playhq_link' } : {})
      }
    };
  }

  // Last resort: only preserve a clean label from the association logo itself. Do not invent
  // "Cricket Club" from generic destination-page text.
  if (label && !genericSitePhrase(label)) {
    return {
      ...candidate,
      ...registry,
      name: normaliseResolvedClubName(label),
      metadata: {
        ...(candidate.metadata || {}),
        resolved_identity_source: 'association_logo_label_unexpanded',
        needs_name_review: true,
        ...(registry ? { registry_evidence:'club_website_playhq_link' } : {})
      }
    };
  }

  return null;
}

async function unlinkStaleAssociationMembers(service: any, association: any, keepClubIds: string[]) {
  const keep = new Set(keepClubIds);
  const { data: links } = await service.from('market_club_associations').select('club_id').eq('association_id', association.id);
  const ids = (links || []).map((x: any) => x.club_id);
  if (!ids.length) return 0;
  const { data: clubs } = await service.from('market_clubs').select('id,sales_prospect_id').in('id', ids);
  let removed = 0;
  for (const c of clubs || []) {
    if (keep.has(c.id) || c.sales_prospect_id) continue;
    await service.from('market_club_associations').delete().eq('association_id', association.id).eq('club_id', c.id);
    removed++;
    const { count } = await service.from('market_club_associations').select('club_id', { count: 'exact', head: true }).eq('club_id', c.id);
    if ((count || 0) === 0) await service.from('market_clubs').delete().eq('id', c.id);
  }
  return removed;
}


function parseAllAssociationListItems(html: string) {
  const items: string[] = [];
  for (const m of html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const name = innerTextWithAlt(m[1]);
    if (associationish(name) && !/owned or managed competitions|competitions managed on behalf/i.test(name)) items.push(name);
  }
  return [...new Set(items)];
}

function parseOfficialListItems(html: string, startMarker: string, endMarker: string) {
  const lower = html.toLowerCase();
  const start = lower.indexOf(startMarker.toLowerCase());
  if (start < 0) return [] as string[];
  const end = lower.indexOf(endMarker.toLowerCase(), start + startMarker.length);
  const segment = html.slice(start, end > start ? end : Math.min(html.length, start + 120_000));
  const items: string[] = [];
  for (const m of segment.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const name = innerTextWithAlt(m[1]);
    if (associationish(name)) items.push(name);
  }
  return [...new Set(items)];
}

async function analyseClubPage(rawUrl: string, fallbackName: string) {
  let root: URL;
  try { const u = safeUrl(rawUrl); root = new URL(u.origin + '/'); } catch { return null; }
  if (isIgnoredHost(root.hostname)) return null;

  let homeHtml = '';
  let finalHome = root;
  try {
    const fetched = await fetchHtml(root.toString());
    homeHtml = fetched.html;
    finalHome = new URL(fetched.finalUrl.origin + '/');
  } catch {
    try {
      const fetched = await fetchHtml(rawUrl);
      homeHtml = fetched.html;
      finalHome = new URL(fetched.finalUrl.origin + '/');
    } catch { return null; }
  }

  const pages: { url: string; html: string }[] = [{ url: finalHome.toString(), html: homeHtml }];
  try {
    const resultUrl = safeUrl(rawUrl);
    if (resultUrl.origin === finalHome.origin && resultUrl.pathname !== '/') {
      const fetched = await fetchHtml(resultUrl.toString(), 450_000);
      pages.push({ url: fetched.finalUrl.toString(), html: fetched.html });
    }
  } catch { /* continue */ }

  const links = allAnchors(homeHtml, finalHome)
    .filter(x => !x.external)
    .map(x => ({ ...x, score: contactLinkScore(x) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const seen = new Set(pages.map(p => p.url));
  for (const link of links) {
    if (pages.length >= 5) break;
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    try {
      const fetched = await fetchHtml(link.url, 450_000);
      pages.push({ url: fetched.finalUrl.toString(), html: fetched.html });
    } catch { /* continue */ }
  }

  let best: { email: string; role: string; score: number; source_url: string } | null = null;
  for (const page of pages) {
    const email = extractEmails(page.html, page.url)[0];
    if (email && (!best || email.score > best.score)) best = email;
  }
  const resolvedName = normaliseResolvedClubName(titleFromHtml(homeHtml, fallbackName));
  const registry = extractAustralianRegistryEvidenceFromHtml(homeHtml);
  return {
    name: /cricket/i.test(resolvedName) ? resolvedName : normaliseResolvedClubName(fallbackName),
    website_url: finalHome.toString(),
    contact_email: best?.email || '',
    contact_role: best?.role || '',
    contact_source_url: best?.source_url || '',
    registry_provider: registry?.registry_provider || '',
    registry_url: registry?.registry_url || '',
    registry_external_id: registry?.registry_external_id || '',
  };
}

async function resolveWebsiteBySearch(apiKey: string, name: string, region = 'NSW', kind: 'association'|'club' = 'association') {
  const queries = kind === 'association'
    ? [`\"${name}\" cricket official website`, `\"${name}\" clubs cricket NSW`]
    : [`\"${name}\" ${region} Australia official cricket club`, `\"${name}\" ${region} secretary contact cricket Australia`];

  const scored: { url: string; title: string; description: string; score: number }[] = [];
  const nameTokens = canonicalKey(name).split('-').filter(x => x.length > 2);

  for (const q of queries) {
    const data = await braveSearch(apiKey, q, 'AU', 10);
    for (const r of data?.web?.results || []) {
      const raw = clean(r.url); if (!raw) continue;
      try {
        const u = safeUrl(raw);
        if (isIgnoredHost(u.hostname)) continue;
        if (kind === 'club' && (forbiddenClubTarget(u.hostname, u.pathname) || genericRegistryOrDirectoryUrl(raw))) continue;

        const title = clean(r.title), description = clean(r.description);
        const hay = `${title} ${description} ${u.hostname}`.toLowerCase();
        if (kind === 'club' && (obviousForeignHostForAustralia(u.hostname) || obviousForeignContext(hay))) continue;

        let score = 0;
        score += nameTokens.filter(t => hay.includes(t)).length * 5;
        if (/cricket/i.test(hay)) score += 5;
        if (kind === 'association' && /(association|council|league|district|premier)/i.test(hay)) score += 3;
        if (kind === 'club' && /club|\bcc\b|\bdcc\b/i.test(hay)) score += 3;
        if (kind === 'club' && /\bnsw\b|new south wales|newcastle|lake macquarie|australia/i.test(hay)) score += 8;
        if (/playhq\.com|play\.cricket\.com\.au|cricketnsw\.com\.au|facebook|instagram/i.test(u.hostname)) score -= 8;
        if (/wikipedia|news|article|results|fixtures|directory/i.test(hay)) score -= 3;
        scored.push({ url: raw, title, description, score });
      } catch { /* ignore */ }
    }
  }

  scored.sort((a,b)=>b.score-a.score);
  if (kind === 'club') return scored.find(x=>x.score >= 13) || null;
  return scored[0] || null;
}

async function upsertAssociation(service: any, row: any) {
  const { data: existing } = await service.from('market_associations')
    .select('*').eq('country_code', row.country_code).eq('region_code', row.region_code).eq('canonical_key', row.canonical_key).maybeSingle();
  if (existing) {
    const patch: any = { updated_at: new Date().toISOString() };
    for (const k of ['name','source_url','source_label','source_type','confidence']) if (row[k]) patch[k] = row[k];
    if (row.website_url) patch.website_url = row.website_url;
    if (row.status) patch.status = row.status;
    if (row.metadata) patch.metadata = { ...(existing.metadata || {}), ...row.metadata };
    const { data, error } = await service.from('market_associations').update(patch).eq('id', existing.id).select('*').single();
    if (error) throw error;
    return { record: data, inserted: false };
  }
  const { data, error } = await service.from('market_associations').insert(row).select('*').single();
  if (error) throw error;
  return { record: data, inserted: true };
}

async function upsertClub(service: any, association: any, candidate: any) {
  const name = normaliseResolvedClubName(clean(candidate.name)); if (!name) return null;
  const key = canonicalKey(name); if (!key) return null;
  const website = clean(candidate.website_url);

  let existing: any = null;
  const { data: byName } = await service.from('market_clubs')
    .select('*').eq('country_code', association.country_code).eq('region_code', association.region_code).eq('canonical_key', key).maybeSingle();
  existing = byName || null;

  // A club website is a stronger identity signal than a slightly different scraped name.
  // This prevents records such as "Cardiff Boolaroo DCC" and a verbose page-title variant
  // from becoming two clubs when both resolve to the same official domain.
  if (!existing && website) {
    const noSlash = website.replace(/\/+$/,'');
    const { data: byWebsite } = await service.from('market_clubs')
      .select('*')
      .eq('country_code', association.country_code)
      .eq('region_code', association.region_code)
      .in('website_url', [website, noSlash, noSlash + '/'])
      .limit(1);
    existing = (byWebsite || [])[0] || null;
  }

  const initialSections = [...new Set((candidate.source_sections || candidate.metadata?.source_sections || []).map(clean).filter(Boolean))];
  const initialCategories = [...new Set((candidate.source_categories || candidate.metadata?.source_categories || initialSections.map(sectionCategory)).map(clean).filter(Boolean))];
  const initialQ = qualificationFromSections(initialSections);
  let club = existing;

  if (existing) {
    const patch: any = { updated_at: new Date().toISOString() };
    // Current authoritative mapping wins over stale discovery. This lets rescans repair a
    // previously selected generic Play Cricket URL or a wrong-country namesake.
    if (website) patch.website_url = website;
    else if (candidate.metadata?.clear_existing_website) patch.website_url = '';
    if (candidate.source_url) patch.source_url = candidate.source_url;
    if (candidate.source_label) patch.source_label = candidate.source_label;
    if (candidate.metadata) patch.metadata = { ...(existing.metadata || {}), ...candidate.metadata };
    if (candidate.registry_provider) patch.registry_provider = candidate.registry_provider;
    if (candidate.registry_url) patch.registry_url = candidate.registry_url;
    if (candidate.registry_external_id) patch.registry_external_id = candidate.registry_external_id;
    if (candidate.registry_provider || candidate.registry_url) patch.registry_verified_at = new Date().toISOString();
    // Keep a human qualification override intact. Otherwise the source evidence may refresh it.
    if (!existing.qualification_override) {
      patch.club_type = initialQ.club_type;
      patch.outreach_fit = initialQ.outreach_fit;
      patch.qualification_reason = initialQ.reason;
    }
    const { data, error } = await service.from('market_clubs').update(patch).eq('id', existing.id).select('*').single();
    if (error) throw error; club = data;
  } else {
    const { data, error } = await service.from('market_clubs').insert({
      country_code: association.country_code, country_name: association.country_name,
      region_code: association.region_code, region_name: association.region_name,
      name, canonical_key: key, locality: candidate.locality || '', website_url: website,
      source_url: candidate.source_url || association.website_url || association.source_url || '',
      source_label: candidate.source_label || association.name,
      confidence: website ? 'website' : 'source_only',
      status: website ? 'website_found' : 'discovered',
      club_type: initialQ.club_type,
      outreach_fit: initialQ.outreach_fit,
      qualification_reason: initialQ.reason,
      registry_provider: candidate.registry_provider || '',
      registry_url: candidate.registry_url || '',
      registry_external_id: candidate.registry_external_id || '',
      registry_verified_at: (candidate.registry_provider || candidate.registry_url) ? new Date().toISOString() : null,
      metadata: candidate.metadata || {},
    }).select('*').single();
    if (error) throw error; club = data;
  }

  const { data: existingLink } = await service.from('market_club_associations')
    .select('*').eq('club_id', club.id).eq('association_id', association.id).maybeSingle();
  const mergedSections = [...new Set([
    ...((existingLink?.source_sections || []) as string[]),
    ...initialSections,
  ].map(clean).filter(Boolean))];
  const mergedCategories = [...new Set([
    ...((existingLink?.source_categories || []) as string[]),
    ...initialCategories,
    ...mergedSections.map(sectionCategory),
  ].map(clean).filter(Boolean))];

  await service.from('market_club_associations').upsert({
    club_id: club.id, association_id: association.id,
    source_url: candidate.source_url || association.website_url || association.source_url || '',
    source_sections: mergedSections,
    source_categories: mergedCategories,
    metadata: { ...(existingLink?.metadata || {}), ...(candidate.metadata || {}) },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'club_id,association_id' });

  // Recalculate from all source sections once the link evidence is merged.
  if (!club.qualification_override) {
    const q = qualificationFromSections(mergedSections);
    if (q.club_type !== club.club_type || q.outreach_fit !== club.outreach_fit || q.reason !== club.qualification_reason) {
      const { data: refreshed } = await service.from('market_clubs').update({
        club_type:q.club_type,
        outreach_fit:q.outreach_fit,
        qualification_reason:q.reason,
        updated_at:new Date().toISOString(),
      }).eq('id',club.id).select('*').single();
      if (refreshed) club = refreshed;
    }
  }
  return club;
}

async function refreshAssociationCounts(service: any, associationId: string) {
  const { data: links } = await service.from('market_club_associations').select('club_id').eq('association_id', associationId);
  const ids = (links || []).map((x: any) => x.club_id);
  let contacts = 0;
  if (ids.length) {
    const { data: clubs } = await service.from('market_clubs').select('id,contact_email').in('id', ids);
    contacts = (clubs || []).filter((x: any) => !!clean(x.contact_email)).length;
  }
  await service.from('market_associations').update({
    club_count: ids.length, contact_count: contacts, updated_at: new Date().toISOString(),
  }).eq('id', associationId);
  return { clubs: ids.length, contacts };
}

async function startScan(service: any, userId: string, countryCode: string, regionCode: string, scopeType: string, scopeId: string | null, scopeName: string) {
  const { data } = await service.from('market_scan_runs').insert({
    country_code: countryCode, region_code: regionCode, scope_type: scopeType,
    scope_id: scopeId, scope_name: scopeName, status: 'running', started_by: userId,
  }).select('id').single();
  return data?.id || null;
}

async function finishScan(service: any, scanId: string | null, status: 'complete'|'failed', discovered = 0, updated = 0, details: any = {}) {
  if (!scanId) return;
  await service.from('market_scan_runs').update({
    status, discovered_count: discovered, updated_count: updated, details,
    finished_at: new Date().toISOString(),
  }).eq('id', scanId);
}

const NSW_PRIMARY_SOURCE = 'https://www.cricketnsw.com.au/code-of-conduct';
const NSW_COUNTRY_SOURCE = 'https://www.countrycricketnsw.com.au/';
const NSW_CONTACTS_SOURCE = 'https://www.countrycricketnsw.com.au/_files/ugd/89fe11_dcfdf714734e46549fdd7eb869bace89.pdf';

const NSW_ADDITIONAL_SEEDS = [
  { name: 'Country Cricket New South Wales', source_url: 'https://www.cricketnsw.com.au/senior-community-cricket', source_label: 'Cricket NSW — Senior Community Cricket' },
  { name: 'Sydney Cricket Association', source_url: 'https://www.cricketnsw.com.au/senior-community-cricket', source_label: 'Cricket NSW — Senior Community Cricket' },
  { name: 'Veterans Cricket NSW', source_url: 'https://www.cricketnsw.com.au/senior-community-cricket', source_label: 'Cricket NSW — Senior Community Cricket' },
  { name: 'Newcastle District Cricket Association', source_url: NSW_CONTACTS_SOURCE, source_label: 'Country Cricket NSW — Country Cricket Contacts 2025/26' },
  { name: 'Central Coast Cricket Association', source_url: NSW_CONTACTS_SOURCE, source_label: 'Country Cricket NSW — Country Cricket Contacts 2025/26' },
  { name: 'Hunter Valley Cricket Council', source_url: NSW_CONTACTS_SOURCE, source_label: 'Country Cricket NSW — Country Cricket Contacts 2025/26' },
  { name: 'Northern Inland Cricket Council', source_url: NSW_CONTACTS_SOURCE, source_label: 'Country Cricket NSW — Country Cricket Contacts 2025/26' },
  { name: 'Far North Coast Cricket Council', source_url: NSW_CONTACTS_SOURCE, source_label: 'Country Cricket NSW — Country Cricket Contacts 2025/26' },
  { name: 'North Coast Cricket Council', source_url: NSW_CONTACTS_SOURCE, source_label: 'Country Cricket NSW — Country Cricket Contacts 2025/26' },
  { name: 'Mid North Coast Cricket Council', source_url: NSW_CONTACTS_SOURCE, source_label: 'Country Cricket NSW — Country Cricket Contacts 2025/26' },
];

// Country Cricket NSW's current 2025/26 contact handbook publishes the country
// zone/council/association hierarchy. The first adapter carries that official
// hierarchy as seed names so a state scan is broad immediately; websites and
// club contacts are still resolved live. The source URL is retained on every row.
const NSW_COUNTRY_ASSOCIATION_SEEDS = [
  'Cessnock District Cricket Association','Dungog District Cricket Association','Maitland District Cricket Association',
  'Muswellbrook District Cricket Association','Singleton District Cricket Association','Upper Hunter Cricket Association',
  'Armidale District Cricket Association','Barwon Cricket Association','Bingara Cricket Association','Boggabri Cricket Association',
  'Coonabarabran Cricket Association','Glen Innes Cricket Association','Gunnedah Cricket Association','Inverell Cricket Association',
  'Manilla Cricket Association','Moree Cricket Association','Narrabri District Cricket Association','Peel Valley Cricket Association',
  'Pilliga Cricket Association','Quirindi Cricket Association','Tamworth District Cricket Association','Tenterfield Cricket Association','Walcha Cricket Association',
  'Cricket Illawarra','South Coast Cricket Association',
  'Newcastle Junior Cricket Association','Newcastle City and Suburban Cricket Association','Newcastle Suburban Districts Cricket',
  'Ballina District Cricket Association','Casino Cricket Association','Kyogle Cricket Association','Lismore District Cricket Association','Tweed District Cricket Association',
  'Clarence River Cricket Association','Coffs Harbour District Cricket Association','Lower Clarence Cricket Association','Nambucca Valley Cricket Association',
  'Gloucester Cricket Association','Hastings River District Cricket Association','Macleay Valley Cricket Association','Manning River District Cricket Association',
  'Murrumbidgee Cricket Council','Griffith District Cricket Association','Hillston Cricket Association','Lake Cargelligo Cricket Association',
  'Leeton District Cricket Association','West Wyalong Cricket Association','Ardlethan Barellan Cricket Association',
  'Northern Riverina Cricket Council','Cootamundra District Cricket Association','Gundagai Cricket Association','South West Slopes Cricket Association',
  'Temora District Cricket Association','Tumut District Cricket Association','Cricket Wagga Wagga','Yass District Cricket Association','Young District Cricket Association',
  'Cricket Albury Wodonga Country','Albury Wodonga SCA','Cricket Albury Wodonga','Brocklesby Cricket Association','Holbrook Cricket Association',
  'Hume Rutherglen Cricket Association','Tumbarumba Cricket Association','Southern Riverina Cricket Council','Barooga Masters Cricket Association',
  'Campaspe Cricket Association','Deniliquin Cricket Association','Murray Valley Cricket Association',
  'Crookwell District Cricket Association','Far South Coast Cricket Association','Goulburn District Cricket Association','Highlands District Cricket Association',
  'Monaro Cricket Association','Shoalhaven District Cricket Association',
  'Lachlan Cricket Council','Condobolin District Cricket Association','Cowra District Cricket Association','Forbes District Cricket Association',
  'Parkes District Cricket Association','Peak Hill Cricket Association','Macquarie Valley Cricket Council','Bourke Cricket Association','Cobar Cricket Association',
  'Dubbo District Cricket Association','Gilgandra District Cricket Association','Narromine District Cricket Association','Nyngan Cricket Association',
  'Walgett Cricket Association','Wellington District Cricket Association','Central West Cricket Council','Bathurst District Cricket Association',
  'Blue Mountains Cricket Association','Gulgong District Cricket Association','Lithgow District Cricket Association','Molong Cricket Association',
  'Mudgee District Cricket Association','Orange District Cricket Association','Barrier Cricket League'
];


async function scanNSWRegion(service: any, apiKey: string, userId: string) {
  const scanId = await startScan(service, userId, 'AU', 'NSW', 'region', null, 'New South Wales');
  try {
    const fetched = await fetchHtml(NSW_PRIMARY_SOURCE);
    const officialNames = [...new Set([
      ...parseOfficialListItems(fetched.html, 'CNSW partner association competitions:', 'Sydney Cricket Association owned competitions:'),
      ...parseAllAssociationListItems(fetched.html),
    ])];
    const scaNames = parseOfficialListItems(fetched.html, 'Sydney Cricket Association owned competitions:', 'The Code of Conduct procedures');
    const seeds: any[] = [
      ...officialNames.map(name => ({ name, source_url: NSW_PRIMARY_SOURCE, source_label: 'Cricket NSW — partner association competitions', source_type: 'official_directory' })),
      ...scaNames.map(name => ({ name: `Sydney Cricket Association — ${name}`, source_url: NSW_PRIMARY_SOURCE, source_label: 'Cricket NSW — SCA competitions', source_type: 'official_directory' })),
      ...NSW_ADDITIONAL_SEEDS.map(x => ({ ...x, source_type: 'official_directory' })),
      ...NSW_COUNTRY_ASSOCIATION_SEEDS.map(name => ({
        name, source_url: NSW_CONTACTS_SOURCE,
        source_label: 'Country Cricket NSW — Country Cricket Contacts 2025/26',
        source_type: 'official_directory'
      })),
    ];

    // One state-level Brave supplement catches associations omitted from the current
    // governance list without forcing a human to search town-by-town.
    const supplementQueries = [
      'NSW cricket district association clubs official',
      'New South Wales cricket association council league clubs',
    ];
    for (const q of supplementQueries) {
      try {
        const data = await braveSearch(apiKey, q, 'AU', 20);
        for (const r of data?.web?.results || []) {
          const title = cleanAssociationSearchTitle(clean(r.title));
          if (!associationish(title)) continue;
          let website_url = '';
          try {
            const u = safeUrl(clean(r.url));
            if (!isIgnoredHost(u.hostname) && !/cricketnsw\.com\.au|wikipedia|facebook|instagram/i.test(u.hostname)) website_url = u.origin + '/';
          } catch { /* ignore */ }
          seeds.push({
            name: title, website_url, source_url: clean(r.url), source_label: 'Brave Search supplement',
            source_type: 'search_supplement', confidence: 'medium',
          });
        }
      } catch { /* official source remains authoritative if supplement fails */ }
    }

    let inserted = 0, updated = 0;
    const dedup = new Map<string, any>();
    for (const s of seeds) {
      const key = canonicalKey(s.name); if (!key) continue;
      if (!dedup.has(key) || s.source_type === 'official_directory') dedup.set(key, s);
    }
    for (const s of dedup.values()) {
      const { inserted: wasInserted } = await upsertAssociation(service, {
        country_code: 'AU', country_name: 'Australia', region_code: 'NSW', region_name: 'New South Wales',
        name: clean(s.name), canonical_key: canonicalKey(s.name), website_url: s.website_url || '',
        source_url: s.source_url || NSW_PRIMARY_SOURCE, source_label: s.source_label || 'Cricket NSW',
        source_type: s.source_type || 'official_directory', confidence: s.confidence || 'official_source',
        status: s.website_url ? 'website_found' : 'discovered', last_verified_at: new Date().toISOString(),
        metadata: { adapter: 'AU_NSW_v1' },
      });
      wasInserted ? inserted++ : updated++;
    }
    await finishScan(service, scanId, 'complete', inserted, updated, {
      official_source: NSW_PRIMARY_SOURCE, official_associations: officialNames.length,
      supplemental_seed_count: dedup.size - officialNames.length,
    });
    return { associations_discovered: dedup.size, inserted, updated, official_source: NSW_PRIMARY_SOURCE };
  } catch (err) {
    await finishScan(service, scanId, 'failed', 0, 0, { error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

async function resolveAssociationWebsite(service: any, apiKey: string, association: any) {
  if (association.website_url) return association.website_url;
  const result = await resolveWebsiteBySearch(apiKey, association.name, association.region_code, 'association');
  if (!result) return '';
  let website = '';
  try { website = new URL(result.url).origin + '/'; } catch { return ''; }
  await service.from('market_associations').update({
    website_url: website, status: 'website_found', updated_at: new Date().toISOString(),
    metadata: { ...(association.metadata || {}), website_search_title: result.title, website_search_result: result.url },
  }).eq('id', association.id);
  return website;
}

function expectedClubCountFromPages(pages: { url: string; html: string }[]) {
  let best = 0;
  for (const p of pages) {
    const text = htmlToText(p.html);
    for (const m of text.matchAll(/\b(over|more than|approximately|around|about)?\s*(\d{1,3})\s+(?:member\s+)?clubs\b/gi)) {
      let n = Number(m[2] || 0);
      if (/over|more than/i.test(m[1] || '')) n += 1;
      if (n > best && n < 300) best = n;
    }
  }
  return best;
}

function extractClubCandidatesFromPage(html: string, pageUrl: string, associationOrigin: string, associationName: string) {
  const base = safeUrl(pageUrl);
  const map = new Map<string, any>();

  for (const link of allAnchors(html, base)) {
    const name = clubishName(link.text, link.context, associationName); if (!name) continue;
    let website = '';
    try {
      const u = safeUrl(link.url);
      if (u.origin !== associationOrigin && !isIgnoredHost(u.hostname) && !/cricketnsw\.com\.au|cricket\.com\.au|playhq\.com/i.test(u.hostname)) website = u.origin + '/';
      else if (/\/clubs?\//i.test(u.pathname)) website = u.toString();
    } catch { /* ignore */ }
    const key = canonicalKey(name);
    if (!key) continue;
    const current = map.get(key);
    if (!current || (!current.website_url && website)) map.set(key, {
      name, website_url: website, source_url: pageUrl, source_label: 'Association club directory',
      metadata: { discovered_from_anchor: link.text, discovery_method: 'association_link' },
    });
  }

  // Some association sites render their member-club carousels as images with little or
  // no useful anchor text. Read image alt/title labels only when the nearby markup is
  // clearly inside a club-directory context.
  for (const m of html.matchAll(/<img\b[^>]*(?:alt|title)=["']([^"']+)["'][^>]*>/gi)) {
    const idx = m.index || 0;
    const around = htmlToText(html.slice(Math.max(0, idx - 1200), Math.min(html.length, idx + m[0].length + 1200)));
    if (!/our clubs|member clubs|affiliated clubs|premier grade clubs|women'?s clubs|suburban districts clubs|club directory/i.test(around)) continue;
    const name = clubishName(decodeHtml(m[1]), around, associationName); if (!name) continue;
    const key = canonicalKey(name); if (!key || map.has(key)) continue;
    map.set(key, {
      name, website_url: '', source_url: pageUrl, source_label: 'Association club directory',
      metadata: { discovered_from_image_label: decodeHtml(m[1]), discovery_method: 'association_image' },
    });
  }
  return [...map.values()];
}

async function cleanupClearlyBadAssociationClubs(service: any, association: any) {
  const { data: links } = await service.from('market_club_associations').select('club_id').eq('association_id', association.id);
  const ids = (links || []).map((x: any) => x.club_id);
  if (!ids.length) return 0;
  const { data: clubs } = await service.from('market_clubs').select('id,name,sales_prospect_id').in('id', ids);
  const bad = (clubs || []).filter((c: any) => obviousNonClubName(c.name, association.name));
  for (const c of bad) {
    await service.from('market_club_associations').delete().eq('association_id', association.id).eq('club_id', c.id);
    const { count } = await service.from('market_club_associations').select('club_id', { count: 'exact', head: true }).eq('club_id', c.id);
    if ((count || 0) === 0 && !c.sales_prospect_id) await service.from('market_clubs').delete().eq('id', c.id);
  }
  return bad.length;
}

async function scanAssociation(service: any, apiKey: string, userId: string, associationId: string) {
  const { data: association, error } = await service.from('market_associations').select('*').eq('id', associationId).single();
  if (error || !association) throw new Error(error?.message || 'Association not found');
  const scanId = await startScan(service, userId, association.country_code, association.region_code, 'association', association.id, association.name);
  try {
    const website = await resolveAssociationWebsite(service, apiKey, association);
    const freshAssociation = { ...association, website_url: website || association.website_url };
    const pages: { url: string; html: string }[] = [];
    let associationOrigin = '';
    if (freshAssociation.website_url) {
      try {
        const fetched = await fetchHtml(freshAssociation.website_url);
        associationOrigin = fetched.finalUrl.origin;
        pages.push({ url: fetched.finalUrl.toString(), html: fetched.html });

        const links = allAnchors(fetched.html, fetched.finalUrl)
          .filter(x => !x.external)
          .map(x => ({ ...x, score: clubDirectoryLinkScore(x) }))
          .filter(x => x.score > 0)
          .sort((a,b)=>b.score-a.score);
        const seen = new Set<string>([fetched.finalUrl.toString()]);
        for (const l of links) {
          if (pages.length >= 6) break;
          if (seen.has(l.url)) continue;
          seen.add(l.url);
          try {
            const p = await fetchHtml(l.url, 600_000);
            pages.push({ url: p.finalUrl.toString(), html: p.html });
          } catch { /* continue */ }
        }
      } catch { /* leave for source-specific review */ }
    }

    // Primary rule: an official association site is the authority for membership.
    // Prefer logo/image links in an explicit Our Clubs / Member Clubs section. These
    // give us both membership evidence and the club's own website in one step.
    const rawLogoByWebsite = new Map<string, any>();
    for (const p of pages) {
      for (const c of extractOfficialClubLogoLinks(p.html, p.url, associationOrigin, association.name)) {
        const membershipKey = c.website_url || `hint:${canonicalKey(c.name_hint || '')}`;
        if (!membershipKey) continue;
        rawLogoByWebsite.set(membershipKey, mergeCandidateEvidence(rawLogoByWebsite.get(membershipKey), c));
      }
    }

    const logoResolved = (await Promise.all([...rawLogoByWebsite.values()].slice(0, 80).map(c => resolveOfficialLogoCandidate(c, association.name, apiKey))))
      .filter(Boolean) as any[];

    // Website/domain identity wins over small differences in scraped club names. This also
    // merges a club listed in both Premier and Women's sections into one market club while
    // preserving both source sections as evidence.
    const candidates = new Map<string, any>();
    for (const raw of logoResolved) {
      const c = { ...raw, name: normaliseResolvedClubName(raw.name || '') };
      if (!c.name || obviousNonClubName(c.name, association.name)) continue;
      const host = candidateWebsiteHost(c);
      const key = host ? `host:${host}` : `name:${canonicalKey(c.name)}`;
      if (!key || key === 'name:') continue;
      candidates.set(key, mergeCandidateEvidence(candidates.get(key), c));
    }

    // If the association does not expose linked club logos, fall back to strict text
    // extraction from its own directory pages. We do NOT auto-insert Brave search-result
    // titles as members: search is for resolving websites, not proving affiliation.
    if (candidates.size === 0) {
      for (const p of pages) {
        for (const c of extractClubCandidatesFromPage(p.html, p.url, associationOrigin, association.name)) {
          if (c.metadata?.discovery_method !== 'association_link') continue;
          if (obviousNonClubName(c.name, association.name)) continue;
          const cleaned = { ...c, name: normaliseResolvedClubName(c.name || '') };
          const host = candidateWebsiteHost(cleaned);
          const key = host ? `host:${host}` : `name:${canonicalKey(cleaned.name)}`;
          if (key && key !== 'name:') candidates.set(key, mergeCandidateEvidence(candidates.get(key), cleaned));
        }
      }
    }

    const keepIds: string[] = [];
    let insertedOrLinked = 0;
    for (const c of candidates.values()) {
      const club = await upsertClub(service, freshAssociation, c);
      if (club) { keepIds.push(club.id); insertedOrLinked++; }
    }

    // When we successfully read an authoritative logo directory, make this association's
    // membership match it. This removes junk created by older heuristic scans while
    // preserving anything already promoted to a Prospect.
    let staleRemoved = 0;
    if (logoResolved.length > 0) staleRemoved = await unlinkStaleAssociationMembers(service, freshAssociation, keepIds);
    else await cleanupClearlyBadAssociationClubs(service, freshAssociation);

    const counts = await refreshAssociationCounts(service, association.id);
    const expectedCount = expectedClubCountFromPages(pages);
    const coverage = expectedCount ? Math.min(1, counts.clubs / expectedCount) : null;
    await service.from('market_associations').update({
      status: counts.clubs ? (expectedCount && counts.clubs < expectedCount ? 'needs_review' : 'clubs_found') : (freshAssociation.website_url ? 'website_found' : 'needs_review'),
      last_scanned_at: new Date().toISOString(), last_verified_at: new Date().toISOString(),
      metadata: {
        ...(freshAssociation.metadata || {}),
        mapping_method: logoResolved.length ? 'official_logo_links' : 'official_directory_text',
        expected_club_count_hint: expectedCount || null,
        mapped_club_count: counts.clubs,
        coverage_ratio: coverage,
      },
    }).eq('id', association.id);
    await finishScan(service, scanId, 'complete', insertedOrLinked, counts.clubs, {
      website: freshAssociation.website_url,
      pages_checked: pages.length,
      contacts: counts.contacts,
      expected_club_count_hint: expectedCount,
      official_logo_links_found: logoResolved.length,
      stale_memberships_removed: staleRemoved,
      mapping_method: logoResolved.length ? 'official_logo_links' : 'official_directory_text',
    });
    return {
      association_id: association.id,
      association_name: association.name,
      website_url: freshAssociation.website_url,
      clubs_found: counts.clubs,
      contacts_found: counts.contacts,
      expected_club_count_hint: expectedCount,
      official_logo_links_found: logoResolved.length,
      stale_memberships_removed: staleRemoved,
      mapping_method: logoResolved.length ? 'official_logo_links' : 'official_directory_text',
    };
  } catch (err) {
    await finishScan(service, scanId, 'failed', 0, 0, { error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

async function enrichAssociationClubs(service: any, apiKey: string, userId: string, associationId: string, limit = 6) {
  const { data: association, error } = await service.from('market_associations').select('*').eq('id', associationId).single();
  if (error || !association) throw new Error(error?.message || 'Association not found');
  const scanId = await startScan(service, userId, association.country_code, association.region_code, 'contacts', association.id, association.name);
  try {
    const { data: links } = await service.from('market_club_associations').select('club_id').eq('association_id', associationId);
    const ids = (links || []).map((x: any) => x.club_id);
    if (!ids.length) {
      await finishScan(service, scanId, 'complete', 0, 0, { remaining: 0 });
      return { processed: 0, contacts_found: 0, remaining: 0 };
    }
    const { data: clubs } = await service.from('market_clubs').select('*').in('id', ids).eq('contact_email','').order('updated_at',{ascending:true}).limit(Math.max(1,Math.min(8,limit)));
    let processed = 0, contactsFound = 0;
    for (const club of clubs || []) {
      processed++;
      let targetUrl = clean(club.website_url);
      if (!targetUrl) {
        try {
          const found = await resolveWebsiteBySearch(apiKey, club.name, association.region_code, 'club');
          if (found) targetUrl = found.url;
        } catch { /* leave for a future pass */ }
      }
      if (!targetUrl) {
        await service.from('market_clubs').update({ status: 'needs_review', updated_at: new Date().toISOString() }).eq('id', club.id);
        continue;
      }
      const analysed = await analyseClubPage(targetUrl, club.name);
      if (!analysed) {
        await service.from('market_clubs').update({ website_url: targetUrl, status: 'needs_review', updated_at: new Date().toISOString() }).eq('id', club.id);
        continue;
      }
      const hasContact = !!clean(analysed.contact_email);
      await service.from('market_clubs').update({
        // Contact enrichment must not rename a club from an arbitrary page title. The
        // authoritative association/registry identity established during mapping wins.
        website_url: analysed.website_url || targetUrl,
        contact_role: analysed.contact_role || club.contact_role || '',
        contact_email: analysed.contact_email || club.contact_email || '',
        contact_source_url: analysed.contact_source_url || club.contact_source_url || '',
        registry_provider: analysed.registry_provider || club.registry_provider || '',
        registry_url: analysed.registry_url || club.registry_url || '',
        registry_external_id: analysed.registry_external_id || club.registry_external_id || '',
        registry_verified_at: analysed.registry_provider ? new Date().toISOString() : club.registry_verified_at,
        confidence: hasContact ? (analysed.contact_role === 'Club Secretary' ? 'high' : 'contact') : 'website',
        status: hasContact ? 'contact_found' : 'website_found',
        last_verified_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', club.id);
      if (hasContact) contactsFound++;
    }
    const counts = await refreshAssociationCounts(service, association.id);
    const { count: remaining } = await service.from('market_clubs').select('id',{count:'exact',head:true}).in('id',ids).eq('contact_email','');
    await service.from('market_associations').update({
      status: counts.clubs && (remaining || 0) === 0 ? 'enriched' : 'clubs_found',
      last_verified_at: new Date().toISOString(),
    }).eq('id', association.id);
    await finishScan(service, scanId, 'complete', processed, contactsFound, { remaining: remaining || 0 });
    return { processed, contacts_found: contactsFound, remaining: remaining || 0, total_contacts: counts.contacts, total_clubs: counts.clubs };
  } catch (err) {
    await finishScan(service, scanId, 'failed', 0, 0, { error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Authentication required' }, 401);
    const { data: role } = await userClient.rpc('get_my_platform_role');
    if (!['owner', 'commercial_admin', 'support_admin'].includes(String(role || ''))) {
      return json({ error: 'Platform prospecting access required' }, 403);
    }

    const apiKey = Deno.env.get('BRAVE_SEARCH_API_KEY') || '';
    const body = await req.json().catch(() => ({}));
    const action = clean(body.action) || 'status';
    if (action === 'status') return json({ provider: 'brave', configured: !!apiKey, adapters: ['AU:NSW'], version: '0.8.3.1' });
    if (!apiKey) return json({ error: 'BRAVE_SEARCH_API_KEY is not configured in Supabase Edge Function Secrets.' }, 503);

    const service = createClient(supabaseUrl, serviceKey);

    if (action === 'scan_region') {
      const countryCode = clean(body.country_code || 'AU').toUpperCase();
      const regionCode = clean(body.region_code || 'NSW').toUpperCase();
      if (countryCode !== 'AU' || regionCode !== 'NSW') return json({ error: 'The first Market Discovery adapter currently supports Australia / New South Wales.' }, 400);
      return json({ ok: true, ...(await scanNSWRegion(service, apiKey, user.id)) });
    }

    if (action === 'scan_association') {
      const associationId = clean(body.association_id);
      if (!associationId) return json({ error: 'association_id is required' }, 400);
      return json({ ok: true, ...(await scanAssociation(service, apiKey, user.id, associationId)) });
    }

    if (action === 'enrich_clubs') {
      const associationId = clean(body.association_id);
      if (!associationId) return json({ error: 'association_id is required' }, 400);
      return json({ ok: true, ...(await enrichAssociationClubs(service, apiKey, user.id, associationId, Number(body.limit || 6))) });
    }

    return json({ error: 'Unknown discovery action' }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message || 'Market discovery failed.' }, 400);
  }
});
