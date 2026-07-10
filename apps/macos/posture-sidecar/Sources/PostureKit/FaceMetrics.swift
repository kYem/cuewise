import Foundation
import Vision

/// Raw, unsmoothed signals pulled from a single Vision face observation.
///
/// Everything here is what a laptop webcam can actually see. Spine / full-body
/// posture is deliberately absent: the camera is mounted high and close and
/// simply can't see it. We track "tech-neck" proxies instead.
struct FaceMetrics {
  let screenDistanceRatio: Double  // Normalized face bbox height (0..1); larger = closer
  let headTiltDegrees: Double  // Roll, in degrees
  let lookingDownNorm: Double?  // Pitch mapped to 0..1 (nil if Vision didn't supply pitch)

  init(observation: VNFaceObservation) {
    // boundingBox is normalized [0,1] with origin bottom-left.
    screenDistanceRatio = Double(observation.boundingBox.height)

    let rollRadians = observation.roll?.doubleValue ?? 0
    headTiltDegrees = rollRadians * 180.0 / .pi

    // pitch exists since macOS 12 but can still be nil; treat as optional.
    if let pitch = observation.pitch?.doubleValue {
      lookingDownNorm = max(0, min(1, (pitch + .pi / 2) / .pi))
    } else {
      lookingDownNorm = nil
    }
  }

  /// Blended "tech-neck" signal: leaning toward the screen, plus looking down
  /// when pitch is available. This is the value we track deviation on.
  var neckMetric: Double {
    guard let down = lookingDownNorm else {
      return screenDistanceRatio
    }
    return screenDistanceRatio * 0.7 + down * 0.3
  }
}
