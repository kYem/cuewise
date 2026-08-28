# @cuewise/sync-client

## 0.2.0

### Minor Changes

- b215f72: Connect a new device by approving it from one you already have — no recovery code typing; a short code on both screens confirms it's really your device.
- 641ac48: An account export now includes the wrapped key envelopes, so it is no longer permanently undecryptable. Previously it held ciphertext and no key — unreadable even by the person who exported it.

### Patch Changes

- 340e2a5: Device pairing now stops straight away if the other device's key arrives damaged, instead of waiting out the full ten minutes.
- Updated dependencies [b215f72]
- Updated dependencies [641ac48]
- Updated dependencies [67744a5]
- Updated dependencies [340e2a5]
  - @cuewise/crypto@0.2.0
  - @cuewise/shared@1.25.0

## 0.1.7

### Patch Changes

- 9c2e322: Cloud Sync is faster and less silent. Edits now reach your other devices in seconds rather than up to ten minutes, and an edit made while a sync was running is no longer dropped. The quick menu shows your account, when it last synced, and a sync button. Sync now warns you when an account has no recovery code or a sign-in has lost authorisation, instead of looking fine. And a setup that fails after your account has been created now hands you the recovery code it made rather than discarding it — without that code, the account it left behind could never be opened again.

## 0.1.6

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @cuewise/shared@1.21.0

## 0.1.5

### Patch Changes

- Updated dependencies [b96a7ae]
  - @cuewise/shared@1.20.0

## 0.1.4

### Patch Changes

- Updated dependencies [62e6a93]
- Updated dependencies [d5cd0b3]
  - @cuewise/shared@1.19.0

## 0.1.3

### Patch Changes

- Updated dependencies [0559dd2]
- Updated dependencies
- Updated dependencies [328ff4a]
  - @cuewise/shared@1.18.0

## 0.1.2

### Patch Changes

- Updated dependencies
  - @cuewise/shared@1.17.1

## 0.1.1

### Patch Changes

- Updated dependencies [374d7a8]
  - @cuewise/shared@1.17.0
