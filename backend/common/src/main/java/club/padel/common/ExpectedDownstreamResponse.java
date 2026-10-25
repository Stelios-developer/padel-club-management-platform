package club.padel.common;

import feign.FeignException;
import java.util.function.Predicate;

/** Expected authorization/domain responses must not poison availability for other users. */
public final class ExpectedDownstreamResponse implements Predicate<Throwable> {
  @Override
  public boolean test(Throwable failure) {
    return failure instanceof io.github.resilience4j.bulkhead.BulkheadFullException
        || failure instanceof FeignException ex
            && ex.status() >= 400
            && ex.status() < 500
            && ex.status() != 429;
  }
}
