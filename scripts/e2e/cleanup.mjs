import assert from "node:assert/strict";

export async function removeIsolatedIdentity(request, until, path) {
  assert(
    /^\/(users|clients)\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      path,
    ),
    "Only recorded test identity IDs may be removed",
  );
  const probe = async (method) => {
    const response = await request(path, method);
    return [500, 502, 503, 504].includes(response.status) ? false : response;
  };
  // DELETE is idempotent: a lost successful response may be replayed as 404.
  // Always prove absence with a separate GET; never mask 401/403 or a live record.
  const deleted = await until(
    () => probe("DELETE"),
    "Remove isolated identity " + path,
    90000,
  );
  assert(
    [204, 404].includes(deleted.status),
    "Identity deletion HTTP " + deleted.status,
  );
  const absent = await until(
    () => probe("GET"),
    "Verify isolated identity absent " + path,
    90000,
  );
  assert.equal(absent.status, 404, "Identity must be absent after cleanup");
}
