// Snapshots belong to one signed-in actor. Versions guard late responses
// when a refresh, page change or logout overtakes a request.
export function createResourceStore(
  send,
  changed = () => {},
  unauthorized = () => {},
) {
  const entries = new Map();
  let generation = 0;
  const empty = () => ({
    status: "idle",
    data: null,
    error: null,
    updatedAt: null,
    pending: null,
    version: 0,
  });
  const get = (name) => {
    if (!entries.has(name)) entries.set(name, empty());
    return entries.get(name);
  };
  function clear(name) {
    if (name) {
      const entry = get(name);
      entry.pending?.abort();
      entries.set(name, { ...empty(), version: entry.version + 1 });
    } else {
      generation++;
      for (const entry of entries.values()) entry.pending?.abort();
      entries.clear();
    }
  }
  async function load(name, path) {
    const entry = get(name),
      scope = generation,
      version = ++entry.version;
    entry.pending?.abort();
    const controller = new AbortController();
    entry.pending = controller;
    entry.status = "loading";
    entry.error = null;
    changed(name, entry);
    try {
      const data = await send(path, { signal: controller.signal });
      if (
        scope !== generation ||
        get(name) !== entry ||
        entry.version !== version
      )
        return;
      entry.data = data;
      entry.updatedAt = Date.now();
      entry.status = "success";
    } catch (error) {
      if (
        scope !== generation ||
        get(name) !== entry ||
        entry.version !== version
      )
        return;
      if (error.status === 401) {
        clear();
        unauthorized();
        return;
      }
      if (error.status === 403 || error.status === 404) entry.data = null;
      entry.error = error;
      entry.status = "error";
    } finally {
      if (
        scope === generation &&
        get(name) === entry &&
        entry.version === version
      ) {
        entry.pending = null;
        changed(name, entry);
      }
    }
  }
  return { get, clear, load };
}
