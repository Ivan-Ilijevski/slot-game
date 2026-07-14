# SAS EGM wire contract — Shining Crown ⇄ SMIB

Source of truth for both sides of the link:
- **EGM (this repo)**: `shining-crown/src/lib/sas/` — the game answers as the slot machine.
- **Host (SMIB)**: `esp/cms-auth-terminal/cyd_test/main/sas/` — the ESP32 polls as the SAS host.
- Reference simulators: `tools/host_sim/sas_egm.py` (fake EGM), `tools/host_sim/cms_tcp_server.py`
  (fake CMS behind TCP). Golden vectors in `src/lib/sas/engine.test.ts` are generated from
  `sas_egm.py` and must stay in lockstep.

## Physical / framing layer

- USB-UART, **115200 baud, 8N1**. Open with **DTR/RTS low** (asserting them resets the CYD).
- Everything on the wire is mux-framed: `[0x7E][chan][len_lo][len_hi][payload][crc_lo][crc_hi]`,
  CRC-16/KERMIT over chan+len+payload, LSB first. No byte stuffing; parsers resync by scanning
  for 0x7E and validating chan/len/CRC.
- Channels: `0x01` SAS, `0x02` CMS JSON, `0x7F` SMIB logs.
- The game forwards channel 0x02 to the CMS server over TCP using the **same mux framing** on the
  TCP leg (see `cmsBridge.ts` / `cms_tcp_server.py`). Channel 0x7F is printed to the game console.

## SAS channel (payloads of chan 0x01)

EGM address: **0x01**. Amounts/meters: integer **cents (deni)**; 1 SAS credit = 0.01 MKD = 1 deni.
Denomination code reported in 0x1F: **0x01**.

### General poll
Host sends one byte `0x80|addr` = **0x81** (pre-G1 firmware alternates 0x80/0x81; the EGM answers
both). EGM replies one exception byte; `0x00` = no activity.

Exception codes used: 0x11/0x12 door, 0x20 tilt, 0x51 handpay pending, 0x66 cash-out button,
0x69 AFT complete, 0x6A host-cashout request, 0x70 buffer overflow, 0x7E game started,
0x7F game ended. Priority (jump the queue): 0x51, 0x66, 0x69, 0x6A–0x6F, 0x70.

### Long polls `[addr][cmd][body...][crc16 lo][crc16 hi]`

| Cmd | Request body | Response body (between `[addr][cmd]` and CRC) |
|-----|--------------|-----------------------------------------------|
| 0x19 | — | 5× BCD4: coin-in, coin-out, drop, jackpot, games played. Values mod 10^8. `drop` = voucher-in (coinless machine). |
| 0x1A | — | BCD4 current credits (mod 10^8) |
| 0x1F | — | gameId(2 ASCII) + additionalId(3 ASCII) + denom(1) + maxBet(1) + progGroup(1) + gameOptions(2) + paytableId(6 ASCII) + basePercent(4 ASCII) |
| 0x54 | — | len(1) + SAS version "603"(3 ASCII) + serial(ASCII ≤40) |
| 0x73 | len(1)+code(1): 0xFF interrogate | len(1) + regStatus(1: 0x01 ready) + asset(u32 LE) + regKey(20, zero) + posId(4, zero) |
| 0x72 | see AFT below | see AFT below |
| 0x74 | see lock below | see lock below |

**Implied ACK**: sending the next poll acknowledges the previous response. A **byte-identical
repeated long poll** means the host missed the response — the EGM resends the cached response
verbatim without re-executing the handler. **Busy**: the EGM may answer a long poll with just its
address byte; the host treats it as retry-same-poll (not a protocol error, not a link failure).

### AFT (0x72), pragmatic subset

Request body (after `[addr][0x72]`): `len(1) code(1) index(1) type(1) cashable(BCD5)
restricted(BCD5) nonrestricted(BCD5) flags(1) asset(u32 LE) regKey(20) txnLen(1) txn(ASCII ≤20)
expiration(BCD4) poolId(2) receiptLen(1) lockTimeout(2)`.
- `code`: 0x00 full transfer, 0xFF interrogate (body `len 0xFF index`).
- `type`: 0x00 in-house cashable → EGM, 0x80 in-house cashable EGM → host.
- Amounts always cents. From-EGM transfers move **all** credits (host reads 0x1A fresh first).

Response body: `len(1) bufferPos(1) status(1) receiptStatus(1) type(1) cashable(BCD5)
restricted(BCD5) nonrestricted(BCD5) flags(1) asset(u32 LE) txnLen(1) txn date(BCD4) time(BCD3)`.
- `status`: 0x00 complete, 0x40 pending, ≥0x80 failed (0x81 insufficient funds, 0x82 lock
  refused/not locked, 0x83 exceeds credit limit).
- Wait, the SMIB parses status at offset 4 of the full frame = response body byte 2 after len —
  layout matches `sas_egm.py:_aft_response` exactly; keep that byte order.

**Idempotency**: transaction IDs are ASCII ≤20 bytes and must differ from the previous
transaction. Re-sending an already-completed txn returns its final status without moving money
again; interrogate (0xFF) returns the current/last record. The EGM persists the in-flight and
last-completed transaction across restarts (`src/data/aftState.json`) and reconstructs a truthful
final status on boot.

On completion the EGM queues exception **0x69**; the host's next interrogate (or the implied-ACK
of the next poll) settles the exchange.

### Lock (0x74) — required before transfers (firmware gap G5)

Request body: `lockCode(1) condition(1) timeout(2, LE, 10 ms units)`.
- `lockCode`: 0x00 request lock, 0x80 cancel, 0xFF status query only.
- `condition`: bit flags for which transfers must be available (informational for this EGM).

Response body: `len(1) asset(u32 LE) lockStatus(1) availTransfers(1) hostCashoutStatus(1)
aftStatus(1) maxBufferIndex(1) cashable(BCD5) restricted(BCD5) nonrestricted(BCD5)`.
- `lockStatus`: 0x00 locked, 0x40 pending, 0xFF not locked.
- The EGM grants the lock unless a game/gamble action is mid-flight; the lock expires after
  `timeout` or on cancel. While locked, spins/gamble/cashout return HTTP 409 in the game.

### Host cashout flow (game → card)

1. Player presses cash-out in the game with the SAS link up and the full balance requested.
2. EGM queues exceptions **0x66** then **0x6A** and arms a window (default 8 s).
3. Host (SMIB, gap G7) reacts with 0x74 lock → 0x72 from-EGM full transfer (all credits).
4. On transfer completion the EGM debits the wallet, meters `aftOut`, queues 0x69 and resolves
   the cashout as `method: 'aft'`.
5. If no transfer starts within the window (no card session, link down, SMIB busy), the EGM
   atomically commits to the voucher path — from that point any late from-EGM transfer is
   refused (status ≥0x80) — and prints the voucher as before.

Partial-amount cashouts never use AFT (the host pulls everything); they go straight to voucher.

## CMS channel invariants (unchanged from firmware)

`debit_commit`, `debit_rollback`, `credit_req` are idempotent by `txn`; commit is retried forever
after AFT success; timeouts surface as `err_code:"timeout"`. The game does not interpret CMS
payloads — it only relays them.
