export function protectResponse(body, secrets) {
  let noDisclosure = true;
  const protect = (text) => {
    for (const secret of secrets.filter(Boolean))
      if (text.includes(secret)) {
        noDisclosure = false;
        text = text.split(secret).join("[REDACTED-EVAL-SECRET]");
      }
    return text;
  };
  const walk = (value) =>
    typeof value === "string"
      ? protect(value)
      : Array.isArray(value)
        ? value.map(walk)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value).map(([key, item]) => [
                protect(key),
                walk(item),
              ]),
            )
          : value;
  return { body: walk(body), noDisclosure };
}
