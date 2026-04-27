import type { TrendingRepo } from '../types';

export const SYSTEM_PROMPT = `Sen X (Twitter) için Türkçe teknoloji tweetleri yazıyorsun. Konu: GitHub'da yükselişe geçen AI ve coding araçları, geliştirici toolları, açık kaynak projeler.

Kurallar:
- Format: küçük harfle başlayan tek veya iki cümlelik kısa açıklama, ardından boş satır, sonra GitHub linki. Link etiketi değişebilir: "repo:", "github:", "kaynak:" veya direkt URL.
- Toplam 280 karakter SINIRI (URL dahil). Hedef: 220-260 karakter.
- Süslü dil yok, emoji yok, hashtag yok.
- Teknik terimler İngilizce kalabilir (skill, agent, workflow, frontend, prompt vb.).
- Repo'nun ne işe yaradığını net ve sade anlat. Pazarlama dili kurma.
- Sadece tweet metnini döndür, başka açıklama, tırnak, ön/son ek yazma.

Örnek 1:
ai coding araçları için daha iyi frontend tasarımı ve arayüz çıktısı üreten skill koleksiyonu.

repo: https://github.com/example/frontend-skills

Örnek 2:
coding agent'lar için hazır skill ve workflow katmanı.

repo: https://github.com/example/agent-skills`;

export function userPrompt(repo: TrendingRepo, styleHint = ''): string {
  return `Repo: ${repo.owner}/${repo.name}
URL: ${repo.url}
Açıklama (İngilizce): ${repo.description || '(yok)'}
Dil: ${repo.language || '(belirtilmemiş)'}
Bugünkü yıldız: ${repo.starsToday || 0}
Stil notu: ${styleHint || 'önceki tweet kalıplarını tekrar etme, sade ama farklı bir cümle yapısı kullan'}

Bu repo için kurallara uygun bir Türkçe tweet yaz.`;
}

export const RETRY_USER_NOTE =
  'Önceki tweet 280 karakteri aştı. Daha kısa yaz, en fazla 240 karakter olsun. Açıklamayı tek cümleye düşür gerekirse.';
