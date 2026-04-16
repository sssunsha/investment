// js/mdtfr/cache.js
// 后端缓存 helpers：通过 REST API 读写/删除指定日期的池缓存数据

async function cacheGet(date) {
  const res = await fetch(`/api/cache/pool/${date}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`读取缓存失败: ${res.status}`);
  return res.json();
}

async function cachePut(date, value) {
  const res = await fetch(`/api/cache/pool/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`写入缓存失败: ${res.status}`);
}

async function cacheDelete(date) {
  const res = await fetch(`/api/cache/pool/${date}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`删除缓存失败: ${res.status}`);
}

// 删除今日缓存
async function clearMdtfrCache() {
  const today = new Date().toISOString().slice(0, 10);
  await cacheDelete(today);
}

export { cacheGet, cachePut, cacheDelete, clearMdtfrCache };
