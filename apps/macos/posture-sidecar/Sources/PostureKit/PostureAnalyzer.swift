import Foundation
import Vision

/// Turns a stream of Vision observations into smoothed, calibrated samples.
///
/// This is the piece worth keeping. A real macOS app (native or a Tauri
/// sidecar) would embed `PostureKit` and feed it observations; the spike's
/// executable is just one throwaway consumer.
public final class PostureAnalyzer {
  // Deviation thresholds for the coarse status rollup (tunable POC guesses).
  private let mildThreshold: Double
  private let poorThreshold: Double
  private let autoCalibrateAfter: Int

  private var distanceEMA = EMA(alpha: 0.3)
  private var neckEMA = EMA(alpha: 0.3)
  private var tiltEMA = EMA(alpha: 0.3)

  private var baselineNeck: Double?
  private var presentSampleCount = 0
  private var idCounter = 0

  public init(mildThreshold: Double = 0.04, poorThreshold: Double = 0.09, autoCalibrateAfter: Int = 5) {
    self.mildThreshold = mildThreshold
    self.poorThreshold = poorThreshold
    self.autoCalibrateAfter = autoCalibrateAfter
  }

  public var isCalibrated: Bool {
    return baselineNeck != nil
  }

  /// Snapshot the current smoothed posture as the "sitting well" baseline.
  /// Returns false if there isn't a stable reading to calibrate against yet.
  @discardableResult
  public func calibrate() -> Bool {
    guard let neck = neckEMA.value else {
      return false
    }
    baselineNeck = neck
    return true
  }

  /// Feed one observation (nil = no face this tick) and get a derived sample.
  public func ingest(_ observation: VNFaceObservation?, at timestamp: String) -> PostureSample {
    idCounter += 1
    let id = "ps-\(idCounter)"

    guard let observation else {
      return PostureSample(
        id: id, timestamp: timestamp, status: .absent, present: false,
        screenDistanceRatio: nil, neckDeviation: nil, headTiltDegrees: nil
      )
    }

    let metrics = FaceMetrics(observation: observation)
    let distance = distanceEMA.update(metrics.screenDistanceRatio)
    let neck = neckEMA.update(metrics.neckMetric)
    let tilt = tiltEMA.update(metrics.headTiltDegrees)

    presentSampleCount += 1
    if baselineNeck == nil && presentSampleCount >= autoCalibrateAfter {
      baselineNeck = neck
    }

    let deviation = baselineNeck.map { neck - $0 }
    let status = classify(deviation: deviation)

    return PostureSample(
      id: id, timestamp: timestamp, status: status, present: true,
      screenDistanceRatio: distance, neckDeviation: deviation, headTiltDegrees: tilt
    )
  }

  // Only leaning in / looking down (positive deviation) degrades status;
  // sitting further back than baseline stays "good".
  private func classify(deviation: Double?) -> PostureStatus {
    guard let deviation else {
      return .good  // Present but uncalibrated — assume fine.
    }
    if deviation >= poorThreshold {
      return .poor
    }
    if deviation >= mildThreshold {
      return .mild
    }
    return .good
  }
}
