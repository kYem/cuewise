import AVFoundation
import Foundation
import IOKit.pwr_mgt
import PostureKit

// Headless posture sidecar for the Cuewise macOS app. Runs the reused PostureKit
// + CameraSession pipeline and speaks newline-delimited JSON over stdio so the
// Tauri app can drive it:
//   - stdout: one PostureSample JSON object per line
//   - stdin:  line commands — "calibrate" (snapshot the baseline) /
//             "sensitivity <strict|balanced|relaxed>" / "quit" (exit)
// No image is ever stored or emitted — only derived numbers.

let sampleInterval: TimeInterval = 2.0
let analyzer = PostureAnalyzer()
let isoFormatter = ISO8601DateFormatter()
let encoder = JSONEncoder()
let stdout = FileHandle.standardOutput
let stderr = FileHandle.standardError

// Held for the process lifetime so the capture session isn't deallocated.
var camera: CameraSession?

// Global because the C power callback below cannot capture context.
var powerRootPort: io_connect_t = 0

// IOMessage.h's kIOMessage* macros don't import into Swift — these are the
// canonical literals (sys_iokit | sub_iokit_common | code).
let messageCanSystemSleep: UInt32 = 0xE000_0270
let messageSystemWillSleep: UInt32 = 0xE000_0280
let messageSystemHasPoweredOn: UInt32 = 0xE000_0300

// Release the camera across system sleep and re-acquire it on wake, so the
// capture session never spans a sleep. Every CanSystemSleep/WillSleep message
// MUST be acknowledged via IOAllowPowerChange or the system delays sleeping.
func registerForSystemSleep() {
  var notifyPort: IONotificationPortRef?
  var notifier: io_object_t = 0
  let callback: IOServiceInterestCallback = { _, _, messageType, argument in
    switch messageType {
    case messageCanSystemSleep:
      IOAllowPowerChange(powerRootPort, Int(bitPattern: argument))
    case messageSystemWillSleep:
      camera?.stop()
      log("system sleeping — camera released")
      IOAllowPowerChange(powerRootPort, Int(bitPattern: argument))
    case messageSystemHasPoweredOn:
      camera?.resume()
      log("system woke — camera resumed")
    default:
      break
    }
  }
  powerRootPort = IORegisterForSystemPower(nil, &notifyPort, callback, &notifier)
  guard powerRootPort != 0, let notifyPort else {
    log("failed to register for system power notifications — camera will span sleep")
    return
  }
  IONotificationPortSetDispatchQueue(notifyPort, DispatchQueue.main)
}

func emit(_ sample: PostureSample) {
  do {
    var line = try encoder.encode(sample)
    line.append(0x0A) // newline-delimited JSON
    stdout.write(line)
  } catch {
    // A silent encode failure starves stdout and reads as a camera stall upstream.
    log("failed to encode sample: \(error)")
  }
}

func log(_ message: String) {
  stderr.write(Data("posture-sidecar: \(message)\n".utf8))
}

func startCapture() {
  let session = CameraSession(sampleInterval: sampleInterval) { observation in
    emit(analyzer.ingest(observation, at: isoFormatter.string(from: Date())))
  }
  do {
    try session.start()
    camera = session
  } catch {
    log("failed to start camera: \(error)")
    exit(1)
  }
}

// Read stdin commands on a background thread; the main thread runs the run loop
// that AVFoundation delivery and the permission prompt need.
func listenForCommands() {
  DispatchQueue.global(qos: .utility).async {
    while let line = readLine(strippingNewline: true) {
      let command = line.trimmingCharacters(in: .whitespaces)
      switch command {
      case "calibrate":
        let ok = analyzer.calibrate()
        log(ok ? "recalibrated to current posture" : "not enough data to calibrate yet")
      case let sensitivity where sensitivity.hasPrefix("sensitivity "):
        let raw = String(sensitivity.dropFirst("sensitivity ".count))
          .trimmingCharacters(in: .whitespaces)
        if let preset = SensitivityPreset(rawValue: raw) {
          analyzer.apply(preset)
          log("sensitivity set to \(raw)")
        } else {
          log("unknown sensitivity preset: \(raw)")
        }
      case "quit":
        camera?.stop()
        exit(0)
      default:
        break
      }
    }
    // stdin closed (the parent app exited) — shut down cleanly.
    camera?.stop()
    exit(0)
  }
}

AVCaptureDevice.requestAccess(for: .video) { granted in
  guard granted else {
    log("camera permission denied")
    exit(2)
  }
  DispatchQueue.main.async {
    startCapture()
  }
}

listenForCommands()
registerForSystemSleep()
RunLoop.main.run()
