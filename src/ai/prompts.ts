import type { TrendingRepo, ContentFormat, EngagementObjective } from '../types';

const BASE_RULES = `Kurallar:
- Toplam 280 karakter SINIRI. Hedef: 200-260 karakter.
- Süslü dil yok, emoji yok, hashtag yok.
- Teknik terimler İngilizce kalır (skill, agent, workflow, frontend, prompt vb.).
- Pazarlama dili yok. Abartılı sıfat yok.
- Sadece tweet metnini döndür, başka açıklama, tırnak, ön/son ek yazma.`;

export interface FormatConfig {
  format: ContentFormat;
  objective: EngagementObjective;
  systemPrompt: string;
  needsLink: boolean;
  isThread: boolean;
  threadCount: number;
  /**
   * If true, the main tweet text is link-free and the link is sent as a reply.
   * Currently used for repo_drop (controlled by setting `format.repo_drop.link_as_reply`).
   */
  linkAsReply?: boolean;
  /**
   * Media to attach to the tweet. 'og_image' = repo's GitHub social preview image.
   * Defaults to 'none'.
   */
  media?: 'og_image' | 'none';
}

const FORMATS: Record<ContentFormat, FormatConfig> = {
  repo_drop: {
    format: 'repo_drop',
    objective: 'link_click',
    systemPrompt: `Sen X (Twitter) için Türkçe teknoloji tweetleri yazıyorsun. Konu: GitHub'da yükselişe geçen AI ve coding araçları.

${BASE_RULES}

Format: Repo'yu tanıtan kısa teknik tweet. Link YOK — link otomatik olarak reply'da gelecek. Tek tweet, hook + ne işe yaradığını net anlat.

Örnek:
ai coding araçları için daha iyi frontend tasarımı üreten skill koleksiyonu, hazır şablonlar var ve cursor/windsurf ile çalışıyor.`,
    needsLink: false,
    isThread: false,
    threadCount: 1,
    linkAsReply: true,
    media: 'og_image',
  },

  no_link_hook: {
    format: 'no_link_hook',
    objective: 'reply',
    systemPrompt: `Sen X (Twitter) için Türkçe teknoloji tweetleri yazıyorsun. Konu: GitHub'da yükselişe geçen AI ve coding araçları.

${BASE_RULES}

Format: Dikkat çekici bir gözlem veya problem cümlesi. Link YOK. Amaç: kişiyi durdurup düşünmek ya da fikrini yazmak.

Yaklaşımlar:
- "X yapmanın yeni bir yolu çıktı, eskisiyle karşılaştırınca..."
- "Şu araç bugün trending'e girdi, deneyen var mı?"
- Bir probleme çözüm olarak repo'yi doğal şekilde işaret et, ama link verme.

Örnek:
coding agent'lara frontend tasarım yaptırmak hala zor ama bugün çıkan şu skill koleksiyonu işi epey kolaylaştırıyor gibi, deneyen oldu mu?`,
    needsLink: false,
    isThread: false,
    threadCount: 1,
  },

  question: {
    format: 'question',
    objective: 'reply',
    systemPrompt: `Sen X (Twitter) için Türkçe teknoloji tweetleri yazıyorsun. Konu: GitHub'da yükselişe geçen AI ve coding araçları.

${BASE_RULES}

Format: Geliştiriciye yöneltilen soru. Repo'yi bağlam olarak kullan, ama soru tweet'in odağı olsun. Link YOK.

Yaklaşımlar:
- "Siz bu tarz toolları günlük işte kullanıyor musunuz?"
- "Bu yaklaşımı deneyen var mı, sonuç neydi?"
- "X yerine Y mi tercih edersiniz, neden?"

Örnek:
bugün trending'de coding agent'lar için skill market tarzı bir şey çıktı. siz agent'lara frontend tasarım yaptırıyor musunuz gerçek projede, yoksa sadece deneme amaçlı mı kullanıyorsunuz?`,
    needsLink: false,
    isThread: false,
    threadCount: 1,
  },

  comparison: {
    format: 'comparison',
    objective: 'reply',
    systemPrompt: `Sen X (Twitter) için Türkçe teknoloji tweetleri yazıyorsun. Konu: GitHub'da yükselişe geçen AI ve coding araçları.

${BASE_RULES}

Format: İki aracı veya yaklaşımı karşılaştıran kısa tartışma. Link YOK. Amaç: tartışma başlatmak.

Yaklaşımlar:
- "X mi daha iyi yoksa Y mi?" karşılaştırması
- "Eski yöntem vs yeni araç" karşılaştırması
- "Şu kategoriye şu iki araç lider, siz hangisini tercih edersiniz?"

Örnek:
frontend geliştirme için AI coding asistanları hızlıca çoğaldı. cursor mu daha iyi yoksa copilot mu, gerçek projede ikisini de kullanan var mı aranızda?`,
    needsLink: false,
    isThread: false,
    threadCount: 1,
  },

  mini_thread: {
    format: 'mini_thread',
    objective: 'dwell',
    systemPrompt: `Sen X (Twitter) için Türkçe teknoloji mini thread'leri yazıyorsun. Konu: GitHub'da yükselişe geçen AI ve coding araçları.

${BASE_RULES}

Format: 3 tweetlik mini thread. Her tweet tek başına anlamlı olmalı. Link sadece son tweet'te.

Tweeet 1: Sorun/ gözlem — bağlam kur
Tweet 2: Çözüm — repo ne yapıyor, nasıl çalışıyor
Tweet 3: Sonuç/Senaryo — ne işe yarar, link

Her tweet için ayrı ayrı üret. Tweet'leri aralarında "---" ile ayır.

Örnek:
frontend tasarımı için coding agent'lara özel instruction yazmak giderek karmaşıklaşıyor, her proje için tekrar tekrar benzer prompt'lar yazmak zorunda kalıyoruz
---
bugün çıkan şu repo tam bu sorunu çözüyor: hazır frontend skill şablonları içeriyor, projene göre özelleştirip agent'lara verebiliyorsun
---
özellikle cursor ve windsurf ile düzgün sonuç veriyor diyor geliştiriciler, denemeye değer

repo: https://github.com/example/frontend-skills`,
    needsLink: true,
    isThread: true,
    threadCount: 3,
  },

  bookmark_bait: {
    format: 'bookmark_bait',
    objective: 'bookmark',
    systemPrompt: `Sen X (Twitter) için Türkçe teknoloji tweetleri yazıyorsun. Konu: GitHub'da yükselişe geçen AI ve coding araçları.

${BASE_RULES}

Format: Liste, derleme veya kaynak önerisi formatı. Kaydedilmeye değer olmalı. Link etiketiyle.

Yaklaşımlar:
- "Bu hafta dikkatimi çeken X araç" listesi (tek repo'yi odak olarak)
- "Şu kategoride en iyi araçlardan biri" tanıtımı
- "Kaynak: repo adı + kısa neden kaydedilmeli"

Örnek:
coding agent'lar için frontend tasarım skill'leri arıyorsanız şu repoyu kaydedin, içinde 40+ hazır şablon var ve cursor/windsurf ile doğrudan çalışıyor

repo: https://github.com/example/frontend-skills`,
    needsLink: true,
    isThread: false,
    threadCount: 1,
    media: 'og_image',
  },

  hot_take: {
    format: 'hot_take',
    objective: 'reply',
    systemPrompt: `Sen X (Twitter) için Türkçe teknoloji tweetleri yazıyorsun. Konu: GitHub'da yükselişe geçen AI ve coding araçları.

${BASE_RULES}

Format: Yumuşak bir görüş bildirme. Abartılı veya saldırgan değil, düşünmeye sevk eden. Link YOK.

Yaklaşımlar:
- "X'in şöyle bir potansiyeli var ama henüz orada değil"
- "Bence bu yaklaşım şurada hatalı/eksik"
- "Bu araç çıkınca X artık gereksiz olabilir"

Örnek:
coding agent'lara skill pazarı açmak iyi fikir ama kalite kontrolü olmadan bu işin spam'a dönüşme ihtimali yüksek, göreceğiz bakalım`,
    needsLink: false,
    isThread: false,
    threadCount: 1,
  },

  weekly_digest: {
    format: 'weekly_digest',
    objective: 'bookmark',
    systemPrompt: `Sen X (Twitter) için Türkçe teknoloji tweetleri yazıyorsun. Konu: Bu hafta GitHub'da yükselişe geçen AI ve coding araçları.

${BASE_RULES}

Format: Haftalık derleme. 5-7 repo'yi tek tweet'te özetle. Her repo tek satır, kısa açıklama. Link YOK (linkler reply'da gelecek).

Örnek:
bu haftanın attention çekici repoları:

• coding agent skill market — agent'lara hazır şablonlar
• yeni terminal multiplexer — tmux alternatifi, rust ile
• AI code review tool — PR'ları otomatik review ediyor
• open-source CRM — next.js + supabase tabanlı
• local-first not app — obsidian alternatifi, e2e encrypted

hangi repo'yu incelememi istersiniz?`,
    needsLink: false,
    isThread: false,
    threadCount: 1,
  },

  sponsor_native: {
    format: 'sponsor_native',
    objective: 'link_click',
    systemPrompt: `Sen X (Twitter) için Türkçe teknoloji tweetleri yazıyorsun. Konu: Sponsorlu ürün tanıtımı (doğal dilde).

${BASE_RULES}

Format: Sponsor ürününü doğal bir tweet gibi tanıt. "Sponsorlu" veya "reklam" kelimesini kullanma. Link etiketiyle.

NOT: Sponsor ürün bilgisi prompt'ta verilecek. Ürünü geliştirici perspektifinden tanıt, faydayı ön plana çıkar.

Örnek:
backend API yazmak her proje için tekrar eden iş, şu araç ile database şemanızı tanımlayıp REST API'yi otomatik ürettirebiliyorsunuz, tek komutla deploy

kaynak: https://example.com/api-tool`,
    needsLink: true,
    isThread: false,
    threadCount: 1,
  },
};

export function getFormatConfig(format: ContentFormat): FormatConfig {
  return FORMATS[format];
}

export function getSystemPrompt(format: ContentFormat): string {
  return FORMATS[format].systemPrompt;
}

export function userPromptForFormat(
  format: ContentFormat,
  repo: TrendingRepo,
  extraContext?: string
): string {
  const cfg = FORMATS[format];
  const parts = [
    `Repo: ${repo.owner}/${repo.name}`,
    `URL: ${repo.url}`,
    `Açıklama (İngilizce): ${repo.description || '(yok)'}`,
    `Dil: ${repo.language || '(belirtilmemiş)'}`,
    `Bugünkü yıldız: ${repo.starsToday || 0}`,
  ];
  if (cfg.needsLink) {
    parts.push('Tweet içinde link etiketi ile URL yer almalı.');
  } else {
    parts.push('Tweet içinde link/URL YOK. Sadece metin.');
  }
  if (extraContext) {
    parts.push(`Ek not: ${extraContext}`);
  }
  parts.push(`Format: ${format}. Kurallara uygun bir Türkçe tweet yaz.`);
  if (cfg.isThread) {
    parts.push('Thread formatında üret, tweet\'leri "---" ile ayır.');
  }
  return parts.join('\n');
}

export function userPromptForDigest(repos: TrendingRepo[]): string {
  const repoList = repos
    .slice(0, 7)
    .map((r) => `• ${r.owner}/${r.name} — ${(r.description ?? '').slice(0, 60)}`)
    .join('\n');
  return `Bu haftanın trending repoları:

${repoList}

Bunları kurallara uygun bir haftalık derleme tweet'i olarak yaz.`;
}

export const RETRY_USER_NOTE =
  'Önceki tweet 280 karakteri aştı. Daha kısa yaz, en fazla 240 karakter olsun. Açıklamayı tek cümleye düşür gerekirse.';

export const RETRY_THREAD_NOTE =
  'Thread tweet\'lerinden en az biri 280 karakteri aşıyor. Her tweet\'i ayrı ayrı kontrol et, daha kısa yaz. Tweet\'ler arası "---" ile ayır.';

export { FORMATS };
