// SAS 6.03 subset spoken by the SMIB (see docs/sas-egm-contract.md and
// esp/cms-auth-terminal/cyd_test/main/sas/sas_defs.h). The game is the EGM;
// the SMIB is the host/master.

// General polls (single byte, no CRC). 0x80|addr is the addressed general
// poll; plain 0x80 is tolerated for the pre-G1 firmware that alternates.
export const GENERAL_POLL_BASE = 0x80

// Long poll commands ([addr][cmd][body][crc16 lo][crc16 hi])
export const CMD_ENABLE_PLAY = 0x01
export const CMD_DISABLE_PLAY = 0x02
export const CMD_TOTAL_METERS = 0x19 // coin-in/out, drop, jackpot, games (4-byte BCD each)
export const CMD_CURRENT_CREDITS = 0x1a // 4-byte BCD
export const CMD_MACHINE_ID = 0x1f
export const CMD_ROM_SIGNATURE = 0x21
export const CMD_VERSION_SERIAL = 0x54
export const CMD_AFT_TRANSFER = 0x72
export const CMD_AFT_REGISTER = 0x73
export const CMD_AFT_LOCK = 0x74

// Exception codes (general-poll responses)
export const EXC_NONE = 0x00
export const EXC_DOOR_OPEN = 0x11
export const EXC_DOOR_CLOSED = 0x12
export const EXC_GENERAL_TILT = 0x20
export const EXC_HANDPAY_PENDING = 0x51
export const EXC_CASHOUT_BUTTON = 0x66
export const EXC_AFT_TRANSFER_COMPLETE = 0x69
export const EXC_HOST_CASHOUT_REQUEST = 0x6a
export const EXC_BUFFER_OVERFLOW = 0x70
export const EXC_GAME_STARTED = 0x7e
export const EXC_GAME_ENDED = 0x7f

// Exceptions that jump the queue (handpay + the AFT group)
export const PRIORITY_EXCEPTIONS = new Set([
  EXC_HANDPAY_PENDING,
  EXC_CASHOUT_BUTTON,
  EXC_AFT_TRANSFER_COMPLETE,
  EXC_HOST_CASHOUT_REQUEST,
  0x6b, 0x6c, 0x6d, 0x6e, 0x6f,
  EXC_BUFFER_OVERFLOW
])

// AFT transfer codes (byte 1 of the 0x72 body)
export const AFT_CODE_FULL = 0x00
export const AFT_CODE_INTERROGATE = 0xff

// AFT transfer types (byte 3 of the 0x72 body)
export const AFT_TYPE_TO_EGM = 0x00 // in-house cashable -> machine
export const AFT_TYPE_FROM_EGM = 0x80 // in-house cashable, machine -> host

// AFT transfer status (response byte)
export const AFT_STATUS_FULL_OK = 0x00
export const AFT_STATUS_PENDING = 0x40
export const AFT_STATUS_FAILED = 0x80 // >= 0x80 -> failed
export const AFT_STATUS_INSUFFICIENT = 0x81
export const AFT_STATUS_LOCK_REFUSED = 0x82
export const AFT_STATUS_EXCEEDS_LIMIT = 0x83

// AFT registration status (0x73 interrogate response)
export const AFT_REG_REGISTERED = 0x00
export const AFT_REG_READY = 0x01
export const AFT_REG_NOT_REG = 0x80

// 0x74 lock codes (request byte 0 of body)
export const LOCK_CODE_REQUEST = 0x00
export const LOCK_CODE_CANCEL = 0x80
export const LOCK_CODE_STATUS_ONLY = 0xff

// 0x74 lock status (response)
export const LOCK_STATUS_LOCKED = 0x00
export const LOCK_STATUS_PENDING = 0x40
export const LOCK_STATUS_NOT_LOCKED = 0xff

export const SAS_VERSION = '603'
