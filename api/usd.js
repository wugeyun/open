// Vercel Edge Function —— 带缓存
// 缓存策略：模块级 Map（5s TTL）+ Vercel CDN（s-maxage=5, stale-while-revalidate=10）
// 调试参数：?nocache=1 强制不走缓存；响应头 X-Cache 标识 HIT/MISS/BYPASS

export const config = { runtime: 'edge' };

const TICKERS = {
  btc: {
    name: 'BTC/USDT',
    sources: [
      { name: 'Binance',     url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
        extract: (d) => parseFloat(d.price) },
      { name: 'CoinGecko',   url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
        extract: (d) => parseFloat(d.bitcoin.usd) },
    ],
  },
  xau: {
    name: 'XAU/USD',
    sources: [
      { name: 'Gold-API',    url: 'https://api.gold-api.com/price/XAU',
        extract: (d) => parseFloat(d.price) },
      { name: 'Binance·PAXG', url: 'https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT',
        extract: (d) => parseFloat(d.price) },
    ],
  },
};

const CACHE_TTL_SEC = 5;
const MAX_CACHE_ENTRIES = 16;

// 进程内缓存：同一边缘节点的所有请求共享
// （不同节点各自独立一份，但 Vercel CDN 那一层会跨节点复用）
const cache = new Map();

async function fetchOne(symbol) {
  const t = TICKERS[symbol];
  for (const src of t.sources) {
    try {
      const r = await fetch(src.url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const price = src.extract(await r.json());
      if (!isFinite(price)) throw new Error('invalid price');
      return { symbol: t.name, price, source: src.name, updatedAt: new Date().toISOString(), error: null };
    } catch (e) {
      console.warn(`[${symbol}/${src.name}] ${e.message}`);
    }
  }
  return { symbol: t.name, price: null, source: null, updatedAt: new Date().toISOString(), error: 'all sources failed' };
}

function getSymbols(url) {
  const raw = url.searchParams.get('symbols');
  if (!raw) return ['btc', 'xau'];
  const allowed = ['btc', 'xau'];
  const list = raw.split(',').map(s => s.trim().toLowerCase()).filter(s => allowed.includes(s));
  return list.length ? list : ['btc', 'xau'];
}

function jsonResponse(body, cacheStatus) {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10',
      'X-Cache': cacheStatus,
    },
  });
}

export default async function handler(request) {
  const url = new URL(request.url);
  const symbols = getSymbols(url);
  const cacheKey = symbols.join(',');
  const bypassCache = url.searchParams.has('nocache');

  if (!bypassCache) {
    const entry = cache.get(cacheKey);
    if (entry && Date.now() - entry.at < CACHE_TTL_SEC * 1000) {
      return jsonResponse(entry.body, 'HIT');
    }
  }

  const results = await Promise.all(symbols.map(s => fetchOne(s)));
  const data = Object.fromEntries(results.map(r => [r.symbol.split('/')[0].toLowerCase(), r]));
  const body = JSON.stringify(data, null, 2);

  // 写入缓存，简单的 LRU：超过上限时丢最旧的
  cache.set(cacheKey, { at: Date.now(), body });
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }

  return jsonResponse(body, bypassCache ? 'BYPASS' : 'MISS');
}
