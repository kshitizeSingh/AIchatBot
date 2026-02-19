
export const retry = async (fn, { retries = 3, baseMs = 1000 } = {}) => {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries) throw err;
      const backoff = baseMs * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
      await new Promise((r) => setTimeout(r, backoff));
      attempt += 1;
    }
  }
};
