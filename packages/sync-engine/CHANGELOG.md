# @cuewise/sync-engine

## 0.3.0

### Minor Changes

- b215f72: Connect a new device by approving it from one you already have — no recovery code typing; a short code on both screens confirms it's really your device.

### Patch Changes

- 93c497f: Stop a quote or collection you edit from erasing one that synced in at the same moment, and stop the new tab showing a quote you hid or edited on another device.
- 7008a7b: Connecting a new device no longer reverts settings you chose on another device to their defaults.
- dc30188: Stop Cloud Sync asking the server about your recovery code every five minutes. The extension re-checked it on every background wake — around 288 requests a day — even though the only thing that reads the answer is a banner in the Cloud Sync settings panel. The check now runs when that panel asks for it, and the background one runs only if this device has actually lost its key, which is the case where the answer changes anything.
- 3587c5b: Stop an edit and an incoming sync landing at the same moment from erasing each other, for goals and reminders alike.
- 340e2a5: Device pairing now stops straight away if the other device's key arrives damaged, instead of waiting out the full ten minutes.
- Updated dependencies [93c497f]
- Updated dependencies [b215f72]
- Updated dependencies [2d84067]
- Updated dependencies [7008a7b]
- Updated dependencies [641ac48]
- Updated dependencies [3587c5b]
- Updated dependencies [67744a5]
- Updated dependencies [340e2a5]
  - @cuewise/storage@1.25.0
  - @cuewise/crypto@0.2.0
  - @cuewise/sync-client@0.2.0
  - @cuewise/shared@1.25.0

## 0.2.0

### Minor Changes

- 9c2e322: Cloud Sync is faster and less silent. Edits now reach your other devices in seconds rather than up to ten minutes, and an edit made while a sync was running is no longer dropped. The quick menu shows your account, when it last synced, and a sync button. Sync now warns you when an account has no recovery code or a sign-in has lost authorisation, instead of looking fine. And a setup that fails after your account has been created now hands you the recovery code it made rather than discarding it — without that code, the account it left behind could never be opened again.

### Patch Changes

- Updated dependencies [9c2e322]
  - @cuewise/sync-client@0.1.7

## 0.1.7

### Patch Changes

- Updated dependencies [b35aca6]
  - @cuewise/storage@1.22.0

## 0.1.6

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @cuewise/shared@1.21.0
  - @cuewise/storage@1.21.0
  - @cuewise/sync-client@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies [b96a7ae]
  - @cuewise/shared@1.20.0
  - @cuewise/storage@1.20.0
  - @cuewise/sync-client@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies [62e6a93]
- Updated dependencies [d5cd0b3]
  - @cuewise/shared@1.19.0
  - @cuewise/storage@1.19.0
  - @cuewise/sync-client@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies [0559dd2]
- Updated dependencies
- Updated dependencies [328ff4a]
  - @cuewise/shared@1.18.0
  - @cuewise/storage@1.18.0
  - @cuewise/sync-client@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies
  - @cuewise/shared@1.17.1
  - @cuewise/storage@1.17.1
  - @cuewise/sync-client@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [374d7a8]
- Updated dependencies [2169ac2]
  - @cuewise/shared@1.17.0
  - @cuewise/storage@1.17.0
  - @cuewise/sync-client@0.1.1
