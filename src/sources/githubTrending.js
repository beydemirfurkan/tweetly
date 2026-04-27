const cheerio = require('cheerio');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function fetchTrending({ since = 'daily', language = '' } = {}) {
  const url = new URL('https://github.com/trending');
  if (language) url.pathname = `/trending/${language}`;
  url.searchParams.set('since', since);

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub Trending fetch başarısız: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const rows = [];

  $('article.Box-row').each((_, el) => {
    const $el = $(el);
    const $titleA = $el.find('h2 a').first();
    const href = ($titleA.attr('href') || '').trim();
    if (!href) return;
    const slug = href.replace(/^\//, '');
    const [owner, name] = slug.split('/');
    if (!owner || !name) return;

    const description = $el.find('p').first().text().trim();
    const language = $el.find('span[itemprop="programmingLanguage"]').first().text().trim();
    const starsTodayText = $el.find('span.d-inline-block.float-sm-right').first().text().trim();
    const starsToday = parseInt((starsTodayText.match(/[\d,]+/) || ['0'])[0].replace(/,/g, ''), 10) || 0;

    const totalStarsText = $el
      .find('a.Link--muted')
      .filter((_, a) => $(a).attr('href') === `${href}/stargazers`)
      .first()
      .text()
      .trim();
    const totalStars = parseInt((totalStarsText.match(/[\d,]+/) || ['0'])[0].replace(/,/g, ''), 10) || 0;

    rows.push({
      owner,
      name,
      slug,
      url: `https://github.com${href}`,
      description,
      language,
      starsToday,
      totalStars,
    });
  });

  return rows;
}

module.exports = { fetchTrending };
