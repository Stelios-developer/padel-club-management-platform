package club.padel.common;

import feign.FeignException;
import io.github.resilience4j.bulkhead.BulkheadFullException;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import org.springframework.cloud.client.circuitbreaker.NoFallbackAvailableException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
public class ApiErrors {
  @ExceptionHandler(ApiException.class)
  ResponseEntity<ProblemDetail> domain(ApiException ex) {
    return problem(ex.status, ex.getMessage());
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<ProblemDetail> invalid(MethodArgumentNotValidException ex) {
    return problem(
        HttpStatus.BAD_REQUEST,
        ex.getBindingResult().getFieldErrors().stream()
            .map(e -> e.getField() + ": " + e.getDefaultMessage())
            .reduce((a, b) -> a + "; " + b)
            .orElse("Invalid input"));
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  ResponseEntity<ProblemDetail> duplicate() {
    return problem(
        HttpStatus.CONFLICT, "A record with these details already exists. Refresh and try again.");
  }

  @ExceptionHandler(FeignException.class)
  ResponseEntity<ProblemDetail> downstream(FeignException ex) {
    if (ex.status() == 401) return problem(HttpStatus.UNAUTHORIZED, "Please sign in again.");
    if (ex.status() == 404)
      return problem(HttpStatus.NOT_FOUND, "The requested member or booking was not found.");
    if (ex.status() == 403)
      return problem(HttpStatus.FORBIDDEN, "You cannot access this member or booking.");
    return problem(
        HttpStatus.SERVICE_UNAVAILABLE,
        "A required club service is unavailable. Please try again shortly.");
  }

  @ExceptionHandler({
    NoFallbackAvailableException.class,
    CallNotPermittedException.class,
    BulkheadFullException.class
  })
  ResponseEntity<ProblemDetail> protectedDependency(RuntimeException failure) {
    for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
      if (cause instanceof FeignException ex) return downstream(ex);
    }
    return problem(
        HttpStatus.SERVICE_UNAVAILABLE,
        "A required club service is unavailable. Please try again shortly.");
  }

  private ResponseEntity<ProblemDetail> problem(HttpStatus status, String message) {
    return ResponseEntity.status(status).body(ProblemDetail.forStatusAndDetail(status, message));
  }
}
