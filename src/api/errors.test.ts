import { describe, expect, it } from "vitest"
import { apiErrorMessage } from "./errors"

describe("public API errors", () => {
  it("uses structured codes ahead of internal exception messages", () => {
    expect(
      apiErrorMessage(
        { code: "LEVERAGE_UPDATE_BLOCKED", message: "java.lang.Exception: Aeron failed" },
        409,
      ),
    ).toBe("Close positions and cancel open orders before changing leverage.")
    expect(
      apiErrorMessage({ detail: "INVALID_COMMAND: Aeron order command rejected" }, 404),
    ).not.toMatch(/Aeron|INVALID_COMMAND|HTTP/)
  })
  it("also maps successful HTTP responses containing terminal order rejection codes", () => {
    expect(apiErrorMessage({ code: "INSUFFICIENT_AVAILABLE_BALANCE" }, 409)).toBe(
      "Insufficient available balance.",
    )
    expect(apiErrorMessage({ code: "REDUCE_ONLY_CAPACITY_EXCEEDED" }, 409)).toContain(
      "closing quantity",
    )
  })
  it.each([
    [{ message: "org.postgresql: password=secret at /opt/service" }, 500],
    [{ error: "RedisConnectionFailureException: 127.0.0.1:6379" }, 502],
    ["<html>nginx upstream connection refused</html>", 502],
    [{ detail: "UNKNOWN_INTERNAL_CODE: Aeron command failed" }, 400],
  ])("hides unrecognized internals: %j", (payload, status) => {
    expect(apiErrorMessage(payload, status as number)).not.toMatch(
      /secret|postgresql|Redis|6379|nginx|Aeron|UNKNOWN_INTERNAL_CODE|\/opt/,
    )
  })
  it("does not describe an unconfirmed mutation as rejected or tell the user to resubmit", () => {
    expect(apiErrorMessage({ code: "RESULT_UNKNOWN" }, 409)).toContain("before submitting again")
    expect(apiErrorMessage(null, 504)).toContain("not yet confirmed")
    expect(apiErrorMessage({ code: "REQUEST_NOT_ACCEPTED" }, 503)).toContain("was not accepted")
    expect(apiErrorMessage({ message: "SQL internal failure" }, 500, true)).toContain(
      "not yet confirmed",
    )
  })
  it("keeps authentication, permission and throttling actionable", () => {
    expect(apiErrorMessage(null, 401)).toContain("sign in")
    expect(apiErrorMessage(null, 403)).toContain("permission")
    expect(apiErrorMessage(null, 429)).toContain("wait")
  })
})
