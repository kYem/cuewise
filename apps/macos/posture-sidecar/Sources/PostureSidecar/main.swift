import AVFoundation
import Foundation
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

func emit(_ sample: PostureSample) {
  guard var line = try? encoder.encode(sample) else {
    return
  }
  line.append(0x0A) // newline-delimited JSON
  stdout.write(line)
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
RunLoop.main.run()
