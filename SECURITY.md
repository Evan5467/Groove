# Security notes

## How your data is protected
- Passphrase → PBKDF2-SHA256 (600,000 iterations) → key-encryption key → wraps a random 256-bit data key.
- Every record and file is sealed with AES-256-GCM using a fresh random IV. The record's id is bound in as authenticated data, so ciphertext cannot be swapped between records, and any tampering is detected.
- The data key is non-extractable (the app can use it but never read its bytes) and is dropped from memory, together with all decrypted records, when the app locks.
- Changing the passphrase re-wraps the data key only. It does not rewrite your data.
- 3+ wrong passphrases trigger an increasing delay that survives app restarts.
- Locks automatically when backgrounded (default 1 minute, adjustable) and after 5 idle minutes.
- Android: no OS backups of app data, no cleartext traffic, WebView debugging off, screenshots and recents thumbnail blocked.

## Checklist mapping
| Checklist item | In Tempo |
|---|---|
| Secrets / history | No keys in code (test-enforced). The optional AI key lives only inside the encrypted vault. `.gitignore` excludes keystores and `.env`. |
| Packages exist and are maintained | Few, well-known dependencies; Dependabot + `npm audit` in CI. |
| Debug off, no error details | Errors shown to you are short messages we wrote; no stack traces or responses are displayed. |
| CORS / network | Strict CSP: the only external host allowed is `api.anthropic.com`, used only if you enable AI. |
| Validate and sanitise all input | Files are identified by their bytes (PDF/JPG/PNG/WebP, ≤25 MB). Everything from OCR, AI, storage and backups is rebuilt through whitelisting sanitisers with size caps. |
| XSS / output escaping | UI is built with a DOM builder that only creates text nodes; markup-injecting attributes are refused. A test fails the build if `innerHTML`, `eval` or similar appears. |
| Authentication / authorisation | Passphrase lock with throttling; vault operations refuse to run while locked. Single-user app, so no roles. |
| Rate limits | AI calls are spaced ≥3 s apart; unlock attempts are throttled. |
| Logs | Nothing is logged (test-enforced). |
| Notifications | Scheduled locally; no push service. Text shows counts only unless you opt in to session names. Android may show text on the lock screen depending on your phone's notification privacy setting. Scheduled reminders stay on the phone while Tempo is locked. |
| Prompt injection | Scanned text is wrapped as untrusted material, the model has no tools, and its reply is parsed as JSON and rebuilt through a whitelist, never executed or rendered as HTML. |
| Permissions / least privilege | The app asks for no camera, contacts, location or broad storage access; files come in through the system picker. INTERNET is needed only for optional AI; notifications permission only for reminders. After a build, check the final list with `aapt dump permissions tempo-*.apk`. |
| Person approves what cannot be undone | Deleting material, erasing everything and restoring a backup all require confirmation; erase needs you to type ERASE. |
| Restore tested | Backups are validated and fully decrypted before any local data is touched; tests cover wrong passphrase, corruption and hostile files. |
| Someone who reads code has read it | CI runs the test suite and dependency audit on every push. Have a developer review before storing anything regulated. |

## Honest limits
- Not a penetration test and not legal advice. Do not use it for payments, health records or other regulated data without a proper review.
- Security depends on your passphrase. Someone who copies the encrypted files and has unlimited guessing time can try passphrases offline, so use a long phrase (4+ random words).
- A rooted or malware-infected phone can read memory while the app is unlocked.
- If you turn on AI structuring, the extracted text of that upload goes to Anthropic under your own account and key. Leave it off for material you do not want to leave the phone.
- Encrypted backups made before a passphrase change still need the old passphrase. Make a fresh backup after changing it.
- Reminders are stored by Android itself, outside the encrypted vault: with "Show session names" on, those names sit in Android's notification schedule. Leave it off for sensitive subjects.
- Exported backups are ciphertext, but treat them as private anyway.
