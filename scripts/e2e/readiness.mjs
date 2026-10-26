function gauge(metrics, metric, expectedLabels) {
  const values = [];
  for (const line of metrics.split("\n")) {
    const sample = line.match(/^([\w:]+)\{([^}]*)\}\s+(\S+)(?:\s|$)/);
    if (!sample || sample[1] !== metric) continue;
    const labels = Object.fromEntries(
      [...sample[2].matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
    );
    if (
      Object.entries(expectedLabels).every(
        ([key, value]) => labels[key] === value,
      )
    )
      values.push(Number(sample[3]));
  }
  return values.length === 1 ? values[0] : NaN;
}

export function dependencyRecovered(metrics, circuit) {
  // A successful request can itself trip CLOSED -> OPEN when the buffered
  // bootstrap failures reach minimumNumberOfCalls. Observe state AND history.
  return (
    gauge(metrics, "resilience4j_circuitbreaker_state", {
      name: circuit,
      state: "closed",
    }) === 1 &&
    gauge(metrics, "resilience4j_circuitbreaker_buffered_calls", {
      name: circuit,
      kind: "failed",
    }) === 0
  );
}

export async function recoveredRead(read, metrics, circuit) {
  const response = await read();
  if (response.status === 503) return false;
  // Unexpected authorization/domain responses reach the caller's assertion
  // immediately. Only successful bootstrap reads may await circuit recovery.
  if (response.status !== 200) return response;
  return dependencyRecovered(await metrics(), circuit) ? response : false;
}
