import { Download } from "lucide-react"
import { t } from "../../i18n"
import { config } from "../../lib/config"
import clientSource from "./native-client.mjs?raw"
import "./DevelopersPage.css"

const sections = [
  ["connect", "Connection"],
  ["authentication", "Signing and permissions"],
  ["rest", "REST API"],
  ["websocket", "WebSocket"],
  ["limits", "Rate limits"],
  ["example", "Executable example"],
] as const
const products = [
  "SPOT",
  "LINEAR_PERPETUAL",
  "INVERSE_PERPETUAL",
  "LINEAR_DELIVERY",
  "INVERSE_DELIVERY",
  "OPTION",
]
const endpoints = [
  ["GET", "/api/v1/time", "Public", "Server time in milliseconds"],
  ["GET", "/api/v1/gateway/instrument/list", "Public", "Instrument catalog and precision"],
  ["GET", "/api/v1/gateway/instrument/asset-scales", "Public", "Asset scales"],
  ["GET", "/api/v1/gateway/trading-market/orderbook", "Public", "Order book; symbol and depth"],
  ["GET", "/api/v1/gateway/account/balances", "READ", "Own balances"],
  ["GET", "/api/v1/gateway/trading/open", "READ", "Own open orders"],
  ["POST", "/api/v1/gateway/trading", "TRADE", "Place an order"],
  ["POST", "/api/v1/gateway/trading/cancel", "TRADE", "Cancel an order"],
  ["GET", "/api/v1/gateway/trading/commands/{commandId}", "READ", "Command receipt"],
] as const
const limits = [
  ["READ", "100 / 200", "50 / 100"],
  ["ORDER", "30 / 60", "15 / 30"],
  ["CANCEL", "30 / 100", "15 / 50"],
  ["CANCEL_ALL", "1 / 12", "1 / 6"],
  ["RECEIPT", "20 / 40", "10 / 20"],
  ["FUNDS", "2 / 5", "1 / 2"],
  ["SECURITY", "2 / 10", "1 / 5"],
  ["ADMIN", "30 / 60", "15 / 30"],
  ["WEBSOCKET", "20 / 512", "10 / 256"],
]

export function DevelopersPage() {
  const origin = config.apiBaseUrl || window.location.origin
  return (
    <div className="container section developers-page">
      <div className="page-heading">
        <div>
          <p className="muted">REST · WebSocket</p>
          <h1>{t("Open platform")}</h1>
          <p>{t("Connect to six product lines with one API Key and one gateway.")}</p>
        </div>
        <a className="button button-primary" href="/api">
          {t("Manage API keys")}
        </a>
      </div>
      <div className="developers-layout">
        <nav className="developers-toc" aria-label={t("Documentation sections")}>
          {sections.map(([id, title]) => (
            <a key={id} href={`#${id}`}>
              {t(title)}
            </a>
          ))}
        </nav>
        <div className="developers-content">
          <section id="connect">
            <h2>{t("Connection")}</h2>
            <dl>
              <dt>REST</dt>
              <dd>
                <code>{origin}</code>
              </dd>
              <dt>WebSocket</dt>
              <dd>
                <code>{config.wsBaseUrl}</code>
              </dd>
            </dl>
            <p>
              {t(
                "Use HTTPS and WSS in production. Credentials belong on your server, never in a browser bundle or URL. These documents are public; private calls require a valid Key.",
              )}
            </p>
            <p>
              {t(
                "Pass productLine in the signed query for native REST calls and in each WebSocket subscription. Select one of the following values; never reuse another product's instruments, balances or sequence baseline.",
              )}
            </p>
            <div className="developers-products">
              {products.map((product) => (
                <code key={product}>{product}</code>
              ))}
            </div>
            <p>
              {t(
                "Read the instrument catalog before trading. priceTicks and quantitySteps are integers; priceTickUnits, quantityStepUnits and asset scales determine their units. Do not assume every asset has 8 decimals. Preserve int64 IDs, sequences and amounts with an integer-safe JSON parser; never round them through JavaScript Number.",
              )}
            </p>
          </section>
          <section id="authentication">
            <h2>{t("Signing and permissions")}</h2>
            <p>
              {t(
                "Create a Key in API management after completing the required account and security verification. The Secret appears once. Store it securely; a lost Secret requires a new Key. Editing name, permissions or IP ranges and revoking a Key require security verification.",
              )}
            </p>
            <p>
              {t(
                "READ permits private queries and subscriptions. TRADE is required for placing and cancelling orders and own-account transfers. WITHDRAW is required for the supported withdrawal API and does not bypass withdrawal verification. TRADE and WITHDRAW require a non-empty IP/CIDR allowlist; /0 is rejected. A Key never grants administrator access or cross-user transfers.",
              )}
            </p>
            <p>
              {t(
                "For native private REST, send X-API-Key and query parameters timestamp, optional recvWindow (1–60000 ms; default 5000), and signature. The signature is lowercase hex HMAC-SHA256 using the original Secret UTF-8 bytes and the following text. Do not Base64-decode the Secret.",
              )}
            </p>
            <pre>
              <code>
                {
                  "UPPERCASE_METHOD\n/path/without/query\nsorted_form_encoded_query_without_signature\nhex_sha256_of_exact_body_bytes"
                }
              </code>
            </pre>
            <p>
              {t(
                "Sort decoded query parameter names lexicographically, retain repeated values in their original order, then form-encode UTF-8 names and values (space becomes +). timestamp, recvWindow and signature may occur only once. Hash the exact body bytes sent, or an empty body for GET. Do not change JSON whitespace after signing. Include productLine in the signed query and do not send a conflicting product header. Bearer and API Key authentication cannot be mixed.",
              )}
            </p>
            <p>
              {t(
                "Compatibility endpoints use X-MBX-APIKEY and HMAC over the original query followed directly by the original form body, excluding signature, preserving encoding and order. They do not use the native canonical text. Supported /api/v3, /fapi/v1, /dapi/v1 and /eapi/v1 routes cover a limited subset for spot, linear perpetual, inverse perpetual and options. Delivery products use native REST; this is not a complete compatibility API.",
              )}
            </p>
          </section>
          <section id="rest">
            <h2>{t("REST API")}</h2>
            <p>
              {t(
                "The table lists native entry points. Private identity comes from authentication, never X-User-Id. Use the authenticated userId where a request schema requires it. Public product routes also require an explicit productLine.",
              )}
            </p>
            <div className="developers-table">
              <table>
                <thead>
                  <tr>
                    <th>{t("Method")}</th>
                    <th>{t("Path")}</th>
                    <th>{t("Permission")}</th>
                    <th>{t("Purpose")}</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.map(([method, path, permission, purpose]) => (
                    <tr key={path}>
                      <td>{method}</td>
                      <td>
                        <code>{path}</code>
                      </td>
                      <td>{t(permission)}</td>
                      <td>{t(purpose)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              {t(
                "Order body example: replace the user, instrument, price and quantity using the current catalog and account mode. clientOrderId must identify one logical order; never assign a new ID merely because a response was lost.",
              )}
            </p>
            <pre>
              <code>
                {JSON.stringify(
                  {
                    userId: "<authenticated userId>",
                    clientOrderId: "strategy-20261029-001",
                    instrumentId: "<catalog instrumentId>",
                    side: "BUY",
                    orderType: "LIMIT",
                    timeInForce: "GTC",
                    priceTicks: 100,
                    quantitySteps: 1,
                    marginMode: "CROSS",
                    positionSide: "NET",
                    reduceOnly: false,
                    postOnly: false,
                  },
                  null,
                  2,
                )}
              </code>
            </pre>
            <p>
              {t(
                "A command may be accepted before its business outcome is known. Keep commandId and the returned receipt URL; poll the receipt and reconcile orders or transfers before submitting again. A timeout, disconnect or 5xx does not prove failure. A throttled receipt read must not mark the original command failed. Never automatically retry financial mutations.",
              )}
            </p>
          </section>
          <section id="websocket">
            <h2>WebSocket</h2>
            <p>
              {t(
                "Public subscriptions need no authentication. Send apiChallenge, sign the returned data.challenge, then authenticateApiKey on the same connection. The challenge expires after 60 seconds and is single-use; the proof timestamp window is 5 seconds. An authenticated Key session expires after 15 minutes. Reconnect and obtain a new challenge rather than reusing a proof.",
              )}
            </p>
            <pre>
              <code>{`{"op":"apiChallenge","id":"challenge"}\n\nHMAC-SHA256(Secret, "WS\\n/ws/v1\\n" + challenge + "\\n" + apiKey + "\\n" + timestamp)\n\n{"op":"authenticateApiKey","id":"auth","apiKey":"<Key>","timestamp":<milliseconds>,"signature":"<hex>"}\n{"op":"subscribe","id":"depth","channel":"depth","productLine":"SPOT","instrumentId":"<catalog instrumentId>"}\n{"op":"subscribe","id":"account","channel":"accountState","productLine":"SPOT"}\n{"op":"ping","id":"heartbeat"}`}</code>
            </pre>
            <p>
              {t(
                "Public channels: depth, trades, bookTicker, candles (also pass period), index, mark, funding and openInterest. Private channels: accountState, orders, triggerOrders, executionReports, positions, accountRisk and positionRisk. Availability follows the product. Private subscriptions bind to the authenticated user; API Keys cannot use C2C commands. Existing JWT clients continue using authenticate with token.",
              )}
            </p>
            <p>
              {t(
                "For depth, replace both sides with the first snapshot (up to 50 levels per side); deltas contain absolute quantities, zero removes a level. Check previousSequence before applying a delta. On a gap, unsubscribe and resubscribe only that depth stream and wait for a new snapshot. Keep sequence and private version values exact, discard older versions, and refresh private baselines after reconnect. Do not subscribe to matches.",
              )}
            </p>
            <p>
              {t(
                "Ping every 20 seconds to renew the connection lease. Revoked Keys, changed permissions/IP rules and frozen accounts invalidate private access on revalidation. On 1008, correct authentication before reconnecting. On 1013, wait with bounded exponential backoff and jitter; recreate subscriptions and baselines after reconnect. Slow consumers are disconnected when the bounded send queue or send timeout is exceeded.",
              )}
            </p>
          </section>
          <section id="limits">
            <h2>{t("Rate limits")}</h2>
            <p>
              {t(
                "Every request first consumes the real IP budget. Authenticated calls also consume shared user, Key and product budgets atomically across Gateway nodes. Bearer and compatibility aliases share the same user budget. Defaults below are refill units per second / burst capacity, not a capacity guarantee; operators can configure them.",
              )}
            </p>
            <div className="developers-table">
              <table>
                <thead>
                  <tr>
                    <th>{t("Operation")}</th>
                    <th>{t("User: rate / burst")}</th>
                    <th>{t("Key: rate / burst")}</th>
                  </tr>
                </thead>
                <tbody>
                  {limits.map(([group, user, key]) => (
                    <tr key={group}>
                      <td>{group}</td>
                      <td>{user}</td>
                      <td>{key}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              {t(
                "IP default: 300/s, burst 600. Product budgets per user: READ 60/120, ORDER 20/40, CANCEL 20/80. Each explicit batch item costs one unit. Reads with limit/depth cost one unit per 50 requested rows rounded up. Cancel-all is a separately limited job. New orders cannot consume the reserved cancel and receipt concurrency slots; IP exhaustion can still reject any request.",
              )}
            </p>
            <p>
              {t(
                "Login/security entry attempts also have an IP budget of 1/s, burst 5; normalized login identifiers have 5/minute, burst 5. Local concurrent requests default to 256 general, 64 cancel and 64 receipt. WebSocket defaults: 20 connections/IP, 10/user, 2000/node; new connections 1/s with burst 10; each socket accepts 10 messages/s with burst 512, and authenticated sockets additionally share user/Key message budgets.",
              )}
            </p>
            <pre>
              <code>{`HTTP 429\nRetry-After: 2\n{"code":"RATE_LIMITED","group":"ORDER","retryAfterSeconds":2}`}</code>
            </pre>
            <p>
              {t(
                "429 means quota exhausted; wait at least Retry-After seconds. REQUEST_EXCEEDS_RATE_BURST is 400: reduce batch size rather than retrying it unchanged. GATEWAY_BUSY and RATE_LIMIT_STORAGE_UNAVAILABLE are 503, distinct from a quota rejection. There is no silent bypass when the shared store fails. WebSocket errors include code and retryAfterSeconds; three consecutive rate violations close with 1013.",
              )}
            </p>
          </section>
          <section id="example">
            <h2>{t("Executable example")}</h2>
            <p>
              {t(
                "Download the Node.js 22+ example. Set API_BASE_URL, API_KEY, API_SECRET and PRODUCT_LINE locally; MODE=rest reads balances and MODE=ws authenticates and watches accountState for one minute. Keep your clock synchronized for WS proofs. The example prints financial JSON as raw text and performs no automatic retries.",
              )}
            </p>
            <a
              className="button button-outline"
              href={`data:text/javascript;charset=utf-8,${encodeURIComponent(clientSource)}`}
              download="native-client.mjs"
            >
              <Download size={16} aria-hidden="true" /> native-client.mjs
            </a>
            <details>
              <summary>{t("View source")}</summary>
              <pre>
                <code>{clientSource}</code>
              </pre>
            </details>
          </section>
        </div>
      </div>
    </div>
  )
}
